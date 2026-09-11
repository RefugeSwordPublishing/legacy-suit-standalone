// QuickBooks Online OAuth connect flow, tenant-scoped.
// Ported from the Base44 quickbooksAuth function. Tokens are stored per company_id.
// Secrets (set via `supabase secrets set`): QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET,
// APP_PUBLIC_URL. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET') ?? '';
const APP_PUBLIC_URL = Deno.env.get('APP_PUBLIC_URL') ?? '';
const REDIRECT_URI = `${APP_PUBLIC_URL}/qbo-settings`;
const SCOPES = 'com.intuit.quickbooks.accounting';
const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';
// A sandbox company is a different host entirely, and the connection records which one it is.
const QBO_HOSTS: Record<string, string> = {
  production: 'https://quickbooks.api.intuit.com/v3/company',
  sandbox: 'https://sandbox-quickbooks.api.intuit.com/v3/company',
};
const qboBase = (env?: string) => QBO_HOSTS[env === 'sandbox' ? 'sandbox' : 'production'];
const SANDBOX_CLIENT_ID = Deno.env.get('QUICKBOOKS_SANDBOX_CLIENT_ID') ?? '';
const SANDBOX_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_SANDBOX_CLIENT_SECRET') ?? '';
const oauthCreds = (env?: string) =>
  env === 'sandbox' && SANDBOX_CLIENT_ID && SANDBOX_CLIENT_SECRET
    ? { id: SANDBOX_CLIENT_ID, secret: SANDBOX_CLIENT_SECRET }
    : { id: CLIENT_ID, secret: CLIENT_SECRET };
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Identify the caller and their company from the JWT.
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    const { data: mem } = await admin.from('memberships').select('company_id, role').eq('user_id', user.id).single();
    if (!mem) return json({ error: 'No company' }, { status: 403 });
    const companyId = mem.company_id;
    const isAdmin = ['owner', 'admin', 'coo'].includes(mem.role);

    const body = await req.json().catch(() => ({}));
    const { action, code, realm_id } = body;
    // Only a platform admin may connect a sandbox; everyone else is production.
    const { data: prof } = await admin.from('user_profiles').select('is_platform_admin').eq('user_id', user.id).maybeSingle();
    const environment = body.environment === 'sandbox' && prof?.is_platform_admin ? 'sandbox' : 'production';

    if (action === 'get_settings') {
      const { data } = await admin.from('qbo_integration_settings').select('*').eq('company_id', companyId).maybeSingle();
      return json({ settings: data });
    }

    if (action === 'exchange_code') {
      const { id: cid, secret: csec } = oauthCreds(environment);
      const creds = btoa(`${cid}:${csec}`);
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
      });
      const tokens = await tokenRes.json();
      if (!tokens.access_token) return json({ success: false, error: 'Token exchange failed', details: tokens }, { status: 400 });
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      let company_name = '', company_email = '';
      try {
        const ci = await fetch(
          `${qboBase(environment)}/${realm_id}/companyinfo/${realm_id}?minorversion=65`,
          { headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Accept': 'application/json' } });
        const cd = await ci.json();
        company_name = cd?.CompanyInfo?.CompanyName ?? '';
        company_email = cd?.CompanyInfo?.Email?.Address ?? '';
      } catch (_) { /* non-fatal */ }

      const { error: upErr } = await admin.from('qbo_integration_settings').upsert({
        company_id: companyId, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
        realm_id, token_expires_at: expiresAt, is_connected: true, company_name, company_email, environment,
      }, { onConflict: 'company_id' });
      if (upErr) return json({ success: false, error: upErr.message }, { status: 500 });
      return json({ success: true });
    }

    // Remaining actions require an admin.
    if (!isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

    if (action === 'get_redirect_uri') return json({ redirect_uri: REDIRECT_URI });

    if (action === 'get_auth_url') {
      const params = new URLSearchParams({ client_id: oauthCreds(environment).id, response_type: 'code', scope: SCOPES, redirect_uri: REDIRECT_URI, state: `qbo_auth:${environment}` });
      return json({ url: `${AUTH_BASE}?${params.toString()}` });
    }

    if (action === 'disconnect') {
      await admin.from('qbo_integration_settings')
        .update({ access_token: '', refresh_token: '', realm_id: '', is_connected: false })
        .eq('company_id', companyId);
      return json({ success: true });
    }

    if (action === 'update_settings') {
      const upd: Record<string, unknown> = {};
      for (const k of ['sync_invoices', 'sync_clients', 'sync_projects', 'auto_send', 'category_item_map']) {
        if (body[k] !== undefined) upd[k] = body[k];
      }
      if (Object.keys(upd).length) await admin.from('qbo_integration_settings').update(upd).eq('company_id', companyId);
      return json({ success: true });
    }

    if (action === 'clear_cache') {
      const { data: ccs } = await admin.from('cost_codes').select('id').eq('company_id', companyId);
      const { data: cls } = await admin.from('clients').select('id').eq('company_id', companyId);
      const { data: prj } = await admin.from('projects').select('id').eq('company_id', companyId).not('quickbooks_project_id', 'is', null);
      await admin.from('cost_codes').update({ quickbooks_item_id: null, quickbooks_item_name: null }).eq('company_id', companyId);
      await admin.from('clients').update({ quickbooks_customer_id: null }).eq('company_id', companyId);
      await admin.from('projects').update({ quickbooks_project_id: null }).eq('company_id', companyId);
      return json({ success: true, cost_codes_cleared: ccs?.length ?? 0, clients_cleared: cls?.length ?? 0, projects_cleared: prj?.length ?? 0 });
    }

    return json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
});
