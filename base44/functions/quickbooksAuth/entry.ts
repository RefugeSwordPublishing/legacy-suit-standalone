import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
};

function secureJson(data, init = {}) {
  return Response.json(data, {
    ...init,
    headers: { ...(init.headers || {}), ...SECURITY_HEADERS },
  });
}

const QBO_CLIENT_ID = Deno.env.get('QUICKBOOKS_CLIENT_ID');
const QBO_CLIENT_SECRET = Deno.env.get('QUICKBOOKS_CLIENT_SECRET');
const APP_PUBLIC_URL = Deno.env.get('APP_PUBLIC_URL') || '';
const REDIRECT_URI = `${APP_PUBLIC_URL}/qbo-settings`;
const SCOPES = 'com.intuit.quickbooks.accounting';
const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    console.log('QBO_CLIENT_ID set:', !!QBO_CLIENT_ID);
    console.log('QBO_CLIENT_SECRET set:', !!QBO_CLIENT_SECRET);
    console.log('APP_PUBLIC_URL:', APP_PUBLIC_URL);
    console.log('REDIRECT_URI:', REDIRECT_URI);

    const body = await req.json().catch(() => ({}));
    const { action, code, realm_id } = body;

    // Public (any logged-in user): load settings and exchange OAuth code
    if (action === 'get_settings') {
      const existing = await base44.asServiceRole.entities.QBOIntegrationSettings.list();
      return secureJson({ settings: existing[0] || null });
    }

    if (action === 'exchange_code') {
      const credentials = btoa(`${QBO_CLIENT_ID}:${QBO_CLIENT_SECRET}`);
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
      const tokens = await tokenRes.json();
      if (!tokens.access_token) {
        return secureJson({ success: false, error: 'Token exchange failed', details: tokens }, { status: 400 });
      }
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // Fetch company info from QBO
      let company_name = '';
      let company_email = '';
      try {
        const companyRes = await fetch(
          `https://quickbooks.api.intuit.com/v3/company/${realm_id}/companyinfo/${realm_id}?minorversion=65`,
          { headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Accept': 'application/json' } }
        );
        const companyData = await companyRes.json();
        company_name = companyData?.CompanyInfo?.CompanyName || '';
        company_email = companyData?.CompanyInfo?.Email?.Address || '';
      } catch (_) { /* non-fatal */ }

      const existing = await base44.asServiceRole.entities.QBOIntegrationSettings.list();
      const payload = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        realm_id,
        token_expires_at: expiresAt,
        is_connected: true,
        company_name,
        company_email,
      };
      if (existing.length > 0) {
        await base44.asServiceRole.entities.QBOIntegrationSettings.update(existing[0].id, payload);
      } else {
        await base44.asServiceRole.entities.QBOIntegrationSettings.create({ ...payload, sync_invoices: true, sync_clients: true, sync_projects: true });
      }
      return secureJson({ success: true });
    }

    // All remaining actions require admin role
    const user = await base44.auth.me();
    if (!user || (user.role !== 'admin' && user.role !== 'owner')) {
      return secureJson({ error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'get_redirect_uri') {
      return secureJson({ redirect_uri: REDIRECT_URI });
    }

    if (action === 'get_auth_url') {
      console.log('Redirect URI:', REDIRECT_URI);
      const params = new URLSearchParams({
        client_id: QBO_CLIENT_ID,
        response_type: 'code',
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        state: 'qbo_auth',
      });
      console.log('Auth URL:', `${AUTH_BASE}?${params.toString()}`);
      return secureJson({ url: `${AUTH_BASE}?${params.toString()}` });
    }

    if (action === 'disconnect') {
      const existing = await base44.asServiceRole.entities.QBOIntegrationSettings.list();
      if (existing.length > 0) {
        await base44.asServiceRole.entities.QBOIntegrationSettings.update(existing[0].id, {
          access_token: '',
          refresh_token: '',
          realm_id: '',
          is_connected: false,
        });
      }
      return secureJson({ success: true });
    }

    if (action === 'update_settings') {
      const existing = await base44.asServiceRole.entities.QBOIntegrationSettings.list();
      const { sync_invoices, sync_clients, sync_projects } = body;
      const update = {};
      if (sync_invoices !== undefined) update.sync_invoices = sync_invoices;
      if (sync_clients !== undefined) update.sync_clients = sync_clients;
      if (sync_projects !== undefined) update.sync_projects = sync_projects;
      if (existing.length > 0) {
        await base44.asServiceRole.entities.QBOIntegrationSettings.update(existing[0].id, update);
      }
      return secureJson({ success: true });
    }

    if (action === 'clear_cache') {
      const [allCostCodes, allClients] = await Promise.all([
        base44.asServiceRole.entities.CostCode.list(),
        base44.asServiceRole.entities.Client.list(),
      ]);
      await Promise.all([
        ...allCostCodes.map(cc =>
          base44.asServiceRole.entities.CostCode.update(cc.id, { quickbooks_item_id: '', quickbooks_item_name: '' })
        ),
        ...allClients.map(c =>
          base44.asServiceRole.entities.Client.update(c.id, { quickbooks_customer_id: '' })
        ),
      ]);
      console.log(`clear_cache: cleared ${allCostCodes.length} cost codes, ${allClients.length} clients`);
      return secureJson({ success: true, cost_codes_cleared: allCostCodes.length, clients_cleared: allClients.length });
    }

    return secureJson({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    console.error('quickbooksAuth error:', error);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});