// QuickBooks webhook receiver. Intuit calls this (no Supabase JWT) whenever entities change in a
// connected company. We verify the intuit-signature, and for any changed Invoice we fetch it from
// QBO; if its Balance is 0 (paid), we flip the matching GuildWright invoice to 'paid'. This closes
// the loop: build invoice in GuildWright -> push to QBO -> client pays in QBO -> status syncs back.
//
// Deploy with --no-verify-jwt. Requires env QUICKBOOKS_WEBHOOK_VERIFIER (the Intuit app's webhook
// verifier token), plus the QUICKBOOKS_CLIENT_ID/SECRET already used by quickbooks-sync.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET') ?? '';
const VERIFIER = Deno.env.get('QUICKBOOKS_WEBHOOK_VERIFIER') ?? '';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
// A sandbox company is a different host entirely, and the connection records which one it is.
const QBO_HOSTS: Record<string, string> = {
  production: 'https://quickbooks.api.intuit.com/v3/company',
  sandbox: 'https://sandbox-quickbooks.api.intuit.com/v3/company',
};
const qboBase = (env?: string) => QBO_HOSTS[env === 'sandbox' ? 'sandbox' : 'production'];

// Sandbox companies authenticate with the app's Development keys. Fall back to the production
// pair when the sandbox secrets are not set, so nothing changes until they are configured.
const SANDBOX_CLIENT_ID = Deno.env.get('QUICKBOOKS_SANDBOX_CLIENT_ID') ?? '';
const SANDBOX_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_SANDBOX_CLIENT_SECRET') ?? '';
const oauthCreds = (env?: string) =>
  env === 'sandbox' && SANDBOX_CLIENT_ID && SANDBOX_CLIENT_SECRET
    ? { id: SANDBOX_CLIENT_ID, secret: SANDBOX_CLIENT_SECRET }
    : { id: CLIENT_ID, secret: CLIENT_SECRET };
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// deno-lint-ignore no-explicit-any
async function refreshAccessToken(admin: any, settings: any) {
  const { id, secret } = oauthCreds(settings.environment);
  const credentials = btoa(`${id}:${secret}`);
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

async function qboGet(path: string, token: string, realmId: string, env?: string) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${qboBase(env)}/${realmId}${path}${sep}minorversion=65`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

// Verify Intuit's HMAC-SHA256 signature (base64) of the raw body using the verifier token.
async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  if (!VERIFIER || !signature) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(VERIFIER),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok'); // Intuit sends a GET/validation ping sometimes

  const rawBody = await req.text();
  const signature = req.headers.get('intuit-signature') ?? '';
  if (!(await verifySignature(rawBody, signature))) {
    return new Response('invalid signature', { status: 401 });
  }

  // Respond fast; do the work but always 200 so Intuit doesn't retry-storm.
  try {
    const payload = JSON.parse(rawBody || '{}');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    for (const note of payload.eventNotifications ?? []) {
      const realmId = note.realmId;
      const entities = note.dataChangeEvent?.entities ?? [];
      const invoiceIds = entities.filter((e: any) => e.name === 'Invoice').map((e: any) => String(e.id));
      if (invoiceIds.length === 0) continue;

      const { data: settings } = await admin
        .from('qbo_integration_settings').select('*').eq('realm_id', realmId).maybeSingle();
      if (!settings?.is_connected) continue;

      let token: string;
      try { token = await getValidToken(admin, settings); }
      catch { continue; }

      for (const id of invoiceIds) {
        try {
          const inv = (await qboGet(`/invoice/${id}`, token, realmId, settings.environment))?.Invoice;
          if (!inv) continue;
          const balance = Number(inv.Balance ?? 0);
          const total = Number(inv.TotalAmt ?? 0);
          const status = balance <= 0 && total > 0 ? 'paid' : null;
          if (status) {
            await admin.from('invoices')
              .update({ status })
              .eq('company_id', settings.company_id)
              .eq('quickbooks_invoice_id', id);
          }
        } catch (_e) { /* skip this invoice, keep going */ }
      }
    }
  } catch (_e) { /* swallow; still 200 */ }

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
});
