// QuickBooks payment reconciliation. Webhooks can be missed (endpoint briefly down, Intuit stops
// retrying, network blip), leaving a paid QBO invoice still "sent" in GuildWright. This pulls the
// current balance for every outstanding pushed invoice and flips it to 'paid' when QBO shows it
// settled — the backstop the webhook alone can't guarantee.
//
// Two modes:
//  - User (button): Authorization: Bearer <user jwt>. Reconciles the caller's company (management only).
//  - Service (cron): header x-reconcile-secret == PUSH_TRIGGER_SECRET. Reconciles all connected
//    companies (or body.company_id). Deploy with --no-verify-jwt.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET') ?? '';
const RECONCILE_SECRET = Deno.env.get('PUSH_TRIGGER_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QBO_BASE = 'https://quickbooks.api.intuit.com/v3/company';
// A paid invoice can carry a sub-cent residual from per-line rounding; treat <= 1 cent as settled.
const PAID_TOLERANCE = 0.01;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reconcile-secret',
};

// deno-lint-ignore no-explicit-any
async function refreshAccessToken(admin: any, settings: any) {
  const credentials = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: settings.refresh_token }),
  });
  const tokens = await res.json();
  if (!tokens.access_token) throw new Error('Failed to refresh token');
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await admin.from('qbo_integration_settings').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || settings.refresh_token,
    token_expires_at: expiresAt,
  }).eq('id', settings.id);
  return tokens.access_token as string;
}

// deno-lint-ignore no-explicit-any
async function getValidToken(admin: any, settings: any) {
  if (!settings.token_expires_at || new Date(settings.token_expires_at) <= new Date(Date.now() + 60000)) {
    return await refreshAccessToken(admin, settings);
  }
  return settings.access_token as string;
}

async function qboGet(path: string, token: string, realmId: string) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${QBO_BASE}/${realmId}${path}${sep}minorversion=65`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// deno-lint-ignore no-explicit-any
async function reconcileCompany(admin: any, settings: any) {
  if (!settings?.is_connected) return { company_id: settings.company_id, skipped: 'not connected' };
  let token: string;
  try { token = await getValidToken(admin, settings); }
  catch (e) { return { company_id: settings.company_id, error: `token refresh failed: ${(e as Error).message}` }; }

  const { data: invoices } = await admin
    .from('invoices')
    .select('id, invoice_number, quickbooks_invoice_id, status')
    .eq('company_id', settings.company_id)
    .not('quickbooks_invoice_id', 'is', null)
    .neq('status', 'paid')
    .neq('status', 'void');

  const markedPaid: string[] = [];
  for (const inv of invoices ?? []) {
    try {
      const qbo = (await qboGet(`/invoice/${inv.quickbooks_invoice_id}`, token, settings.realm_id))?.Invoice;
      if (!qbo) continue;
      const balance = Number(qbo.Balance ?? 0);
      const total = Number(qbo.TotalAmt ?? 0);
      if (total > 0 && balance <= PAID_TOLERANCE) {
        await admin.from('invoices').update({ status: 'paid' }).eq('id', inv.id);
        markedPaid.push(inv.invoice_number || inv.id);
      }
    } catch (_e) { /* skip this invoice, keep going */ }
  }
  return { company_id: settings.company_id, checked: invoices?.length ?? 0, marked_paid: markedPaid };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const body = await req.json().catch(() => ({}));

  // Service / cron mode: reconcile all connected companies (or one, via body.company_id).
  const svcSecret = req.headers.get('x-reconcile-secret') ?? '';
  if (svcSecret && RECONCILE_SECRET && svcSecret === RECONCILE_SECRET) {
    let q = admin.from('qbo_integration_settings').select('*').eq('is_connected', true);
    if (body.company_id) q = q.eq('company_id', body.company_id);
    const { data: all } = await q;
    const results = [];
    for (const s of all ?? []) results.push(await reconcileCompany(admin, s));
    return json({ mode: 'service', companies: results.length, results });
  }

  // User mode: reconcile the caller's company (management only).
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await admin.from('user_profiles').select('company_id, role').eq('user_id', user.id).maybeSingle();
  if (!profile) return json({ error: 'No company' }, { status: 403 });
  if (!['owner', 'admin', 'coo'].includes(profile.role)) return json({ error: 'Not permitted' }, { status: 403 });
  const { data: settings } = await admin.from('qbo_integration_settings').select('*').eq('company_id', profile.company_id).maybeSingle();
  if (!settings?.is_connected) return json({ error: 'QuickBooks is not connected.' }, { status: 400 });
  const result = await reconcileCompany(admin, settings);
  if (result.error) return json({ error: `Couldn't reach QuickBooks: ${result.error}. You may need to reconnect.` }, { status: 502 });
  return json({ mode: 'user', ...result });
});
