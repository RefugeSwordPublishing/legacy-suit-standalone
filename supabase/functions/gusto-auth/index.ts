// Gusto OAuth connect flow, tenant-scoped. Mirrors xero-auth. Tokens stored per company_id.
// After auth we read /v1/me to find the connected Gusto company and store the first one.
// Access tokens live ~2h; refresh tokens rotate (invalid after one use), so store the new one.
// Secrets: GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET, APP_PUBLIC_URL, GUSTO_ENV ('demo' | 'production').
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CLIENT_ID = Deno.env.get('GUSTO_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GUSTO_CLIENT_SECRET') ?? '';
const APP_PUBLIC_URL = Deno.env.get('APP_PUBLIC_URL') ?? '';
const ENV = (Deno.env.get('GUSTO_ENV') ?? 'demo').toLowerCase();
const HOST = ENV === 'production' ? 'https://api.gusto.com' : 'https://api.gusto-demo.com';
const REDIRECT_URI = `${APP_PUBLIC_URL}/gusto-settings`;
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
      const { data } = await admin.from('gusto_integration_settings').select('*').eq('company_id', companyId).maybeSingle();
      return json({ settings: data, env: ENV });
    }

    if (action === 'exchange_code') {
      const tokenRes = await fetch(`${HOST}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          code: body.code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI,
        }),
      });
      const tokens = await tokenRes.json();
      if (!tokens.access_token) return json({ success: false, error: 'Token exchange failed', details: tokens }, { status: 400 });
      const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 7200) * 1000).toISOString();

      // Find the connected company via the current user's roles.
      const meRes = await fetch(`${HOST}/v1/me`, { headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Accept': 'application/json' } });
      const me = await meRes.json().catch(() => ({}));
      // Roles carry the companies this token can act on (payroll_admin most commonly).
      let companies: Array<Record<string, unknown>> = [];
      const roles = me?.roles || {};
      for (const r of Object.values(roles) as Array<Record<string, unknown>>) {
        if (Array.isArray(r?.companies)) companies = companies.concat(r.companies as Array<Record<string, unknown>>);
      }
      const first = companies[0] || {};

      const { error: upErr } = await admin.from('gusto_integration_settings').upsert({
        company_id: companyId, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt, is_connected: true,
        gusto_company_uuid: (first.uuid as string) ?? null, gusto_company_name: (first.name as string) ?? null,
      }, { onConflict: 'company_id' });
      if (upErr) return json({ success: false, error: upErr.message }, { status: 500 });
      return json({ success: true, company_name: first.name ?? null });
    }

    if (!isAdmin) return json({ error: 'Forbidden' }, { status: 403 });

    if (action === 'get_redirect_uri') return json({ redirect_uri: REDIRECT_URI, env: ENV });

    if (action === 'get_auth_url') {
      const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT_URI });
      return json({ url: `${HOST}/oauth/authorize?${params.toString()}` });
    }

    // Demo bridge: Gusto's Partner Managed demo companies expose an access + refresh token directly
    // in the developer portal, so there is no interactive OAuth login for them. Paste those tokens to
    // connect a demo company. Disabled in production (real companies must use the OAuth flow).
    if (action === 'set_demo_tokens') {
      if (ENV === 'production') return json({ error: 'Not available in production' }, { status: 403 });
      const { access_token, refresh_token, company_uuid, company_name } = body;
      if (!refresh_token || !company_uuid) return json({ error: 'Refresh token and company UUID are required.' }, { status: 400 });
      // Trust a pasted access token first (Gusto refresh tokens are single-use, so don't burn one up
      // front). If none was pasted, expire immediately so the first sync refreshes. The sync also
      // refreshes-and-retries on a 401, so a near-expiry access token still recovers.
      const expiresAt = access_token
        ? new Date(Date.now() + 90 * 60000).toISOString()
        : new Date(Date.now() - 60000).toISOString();
      const { error } = await admin.from('gusto_integration_settings').upsert({
        company_id: companyId,
        access_token: access_token || '',
        refresh_token,
        token_expires_at: expiresAt,
        gusto_company_uuid: company_uuid,
        gusto_company_name: company_name || 'Demo company',
        is_connected: true,
      }, { onConflict: 'company_id' });
      if (error) return json({ success: false, error: error.message }, { status: 500 });
      return json({ success: true, company_name: company_name || 'Demo company' });
    }

    if (action === 'disconnect') {
      await admin.from('gusto_integration_settings')
        .update({ access_token: '', refresh_token: '', is_connected: false }).eq('company_id', companyId);
      return json({ success: true });
    }

    if (action === 'update_settings') {
      const upd: Record<string, unknown> = {};
      for (const k of ['auto_map']) if (body[k] !== undefined) upd[k] = body[k];
      if (Object.keys(upd).length) await admin.from('gusto_integration_settings').update(upd).eq('company_id', companyId);
      return json({ success: true });
    }

    return json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
});
