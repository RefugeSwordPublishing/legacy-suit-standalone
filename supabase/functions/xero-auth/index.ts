// Xero OAuth connect flow, tenant-scoped. Mirrors quickbooks-auth. Tokens are stored per company_id.
// Xero returns a list of connected organizations after auth; we store the first and let the tenant
// switch via select_org. Access tokens live ~30 min and refresh tokens rotate on each refresh.
// Secrets: XERO_CLIENT_ID, XERO_CLIENT_SECRET, APP_PUBLIC_URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CLIENT_ID = Deno.env.get('XERO_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET') ?? '';
const APP_PUBLIC_URL = Deno.env.get('APP_PUBLIC_URL') ?? '';
const REDIRECT_URI = `${APP_PUBLIC_URL}/xero-settings`;
// Xero deprecated the broad `accounting.transactions` scope for apps created on/after 2026-03-02,
// splitting it into granular scopes. For invoice push we need accounting.invoices (create invoices),
// accounting.contacts (resolve/create the client), and accounting.settings (list revenue accounts,
// tax types, tracking categories). Requesting the old broad scope returns invalid_scope.
const SCOPES = 'openid profile email accounting.invoices accounting.contacts accounting.settings offline_access';
const AUTH_BASE = 'https://login.xero.com/identity/connect/authorize';
const TOKEN_URL = 'https://identity.xero.com/connect/token';
const CONNECTIONS_URL = 'https://api.xero.com/connections';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    const { data: mem } = await admin.from('memberships').select('company_id, role').eq('user_id', user.id).single();
    if (!mem) return json({ error: 'No company' }, { status: 403 });
    const companyId = mem.company_id;
    const isAdmin = ['owner', 'admin', 'coo'].includes(mem.role);

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === 'get_settings') {
      const { data } = await admin.from('xero_integration_settings').select('*').eq('company_id', companyId).maybeSingle();
      return json({ settings: data });
    }

    if (action === 'exchange_code') {
      const creds = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`);
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: body.code, redirect_uri: REDIRECT_URI }),
      });
      const tokens = await tokenRes.json();
      if (!tokens.access_token) return json({ success: false, error: 'Token exchange failed', details: tokens }, { status: 400 });
      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 1800) * 1000).toISOString();

      // Fetch the organizations this login connected.
      const connRes = await fetch(CONNECTIONS_URL, { headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Accept': 'application/json' } });
      const conns = await connRes.json().catch(() => []);
      const orgs = (Array.isArray(conns) ? conns : []).map((c: Record<string, unknown>) => ({ tenantId: c.tenantId, tenantName: c.tenantName }));
      const first = orgs[0] || {};

      const { error: upErr } = await admin.from('xero_integration_settings').upsert({
        company_id: companyId, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt, is_connected: true,
        tenant_id: first.tenantId ?? null, org_name: first.tenantName ?? null,
      }, { onConflict: 'company_id' });
      if (upErr) return json({ success: false, error: upErr.message }, { status: 500 });
      return json({ success: true, orgs });
    }

    // Remaining actions require an admin.
    if (!isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

    if (action === 'get_redirect_uri') return json({ redirect_uri: REDIRECT_URI });

    if (action === 'get_auth_url') {
      // Xero's authorize endpoint does not decode '+' to space in the scope param, so URLSearchParams'
      // default '+'-for-space encoding yields invalid_scope. Force space -> %20.
      const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', scope: SCOPES, redirect_uri: REDIRECT_URI, state: 'xero_auth' });
      return json({ url: `${AUTH_BASE}?${params.toString().replace(/\+/g, '%20')}` });
    }

    if (action === 'select_org') {
      if (!body.tenantId) return json({ error: 'tenantId is required' }, { status: 400 });
      await admin.from('xero_integration_settings')
        .update({ tenant_id: body.tenantId, org_name: body.orgName ?? null }).eq('company_id', companyId);
      return json({ success: true });
    }

    if (action === 'disconnect') {
      await admin.from('xero_integration_settings')
        .update({ access_token: '', refresh_token: '', tenant_id: '', is_connected: false }).eq('company_id', companyId);
      return json({ success: true });
    }

    if (action === 'update_settings') {
      const upd: Record<string, unknown> = {};
      for (const k of ['sync_invoices', 'auto_send', 'category_item_map', 'default_tax_type', 'tracking_category_id', 'tracking_category_name']) {
        if (body[k] !== undefined) upd[k] = body[k];
      }
      if (Object.keys(upd).length) await admin.from('xero_integration_settings').update(upd).eq('company_id', companyId);
      return json({ success: true });
    }

    if (action === 'clear_cache') {
      const { data: cls } = await admin.from('clients').select('id').eq('company_id', companyId).not('xero_contact_id', 'is', null);
      const { data: ccs } = await admin.from('cost_codes').select('id').eq('company_id', companyId).not('xero_account_code', 'is', null);
      await admin.from('clients').update({ xero_contact_id: null }).eq('company_id', companyId);
      await admin.from('cost_codes').update({ xero_account_code: null }).eq('company_id', companyId);
      await admin.from('projects').update({ xero_tracking_option: null }).eq('company_id', companyId);
      return json({ success: true, clients_cleared: cls?.length ?? 0, cost_codes_cleared: ccs?.length ?? 0 });
    }

    return json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
});
