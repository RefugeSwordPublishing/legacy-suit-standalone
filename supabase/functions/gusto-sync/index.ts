// Gusto sync: list employees + unprocessed payrolls, and push computed regular/overtime hours onto
// an unprocessed payroll. Mirrors the token handling of xero-sync (rotating refresh token, ~2h life).
// Pushing merges into the hours Gusto already returns for the payroll, only setting the named
// "Regular Hours" / "Overtime" lines, so nothing else on the payroll is overwritten.
// Secrets: GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET, GUSTO_ENV ('demo' | 'production').
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CLIENT_ID = Deno.env.get('GUSTO_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GUSTO_CLIENT_SECRET') ?? '';
const ENV = (Deno.env.get('GUSTO_ENV') ?? 'demo').toLowerCase();
const HOST = ENV === 'production' ? 'https://api.gusto.com' : 'https://api.gusto-demo.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// deno-lint-ignore no-explicit-any
async function refreshToken(admin: any, s: any) {
  const res = await fetch(`${HOST}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: s.refresh_token }),
  });
  const t = await res.json();
  if (!t.access_token) throw new Error('Failed to refresh Gusto token');
  const expiresAt = new Date(Date.now() + (t.expires_in ?? 7200) * 1000).toISOString();
  // Gusto rotates the refresh token: store the new one.
  await admin.from('gusto_integration_settings').update({
    access_token: t.access_token, refresh_token: t.refresh_token || s.refresh_token, token_expires_at: expiresAt,
  }).eq('id', s.id);
  return t.access_token as string;
}
// deno-lint-ignore no-explicit-any
async function validToken(admin: any, s: any) {
  if (!s.token_expires_at || new Date(s.token_expires_at) <= new Date(Date.now() + 120000)) return await refreshToken(admin, s);
  return s.access_token as string;
}
async function gusto(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(typeof data === 'string' ? data : JSON.stringify(data)) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    const { data: mem } = await admin.from('memberships').select('company_id').eq('user_id', user.id).single();
    if (!mem) return json({ error: 'No company' }, { status: 403 });
    const companyId = mem.company_id;

    const body = await req.json().catch(() => ({}));
    const { action } = body;

    const { data: settings } = await admin.from('gusto_integration_settings').select('*').eq('company_id', companyId).maybeSingle();
    if (!settings?.is_connected) return json({ error: 'Gusto is not connected' }, { status: 400 });
    if (!settings.gusto_company_uuid) return json({ error: 'No Gusto company linked' }, { status: 400 });

    let token: string;
    try { token = await validToken(admin, settings); }
    catch (err) { return json({ error: 'Failed to refresh Gusto token', details: (err as Error).message }, { status: 401 }); }
    const co = settings.gusto_company_uuid;

    // Call Gusto with the current token; on a 401 (access token expired between the clock check and
    // now), refresh once and retry. Keeps demo tokens robust without burning the refresh token early.
    let refreshedOnce = false;
    // deno-lint-ignore no-explicit-any
    const api = async (m: string, p: string, b?: unknown): Promise<any> => {
      try { return await gusto(m, p, token, b); }
      catch (e) {
        const status = (e as Error & { status?: number }).status;
        if (status === 401 && !refreshedOnce) {
          refreshedOnce = true;
          token = await refreshToken(admin, settings);
          return await gusto(m, p, token, b);
        }
        throw e;
      }
    };

    if (action === 'list_employees') {
      const r = await api('GET', `/v1/companies/${co}/employees`);
      // deno-lint-ignore no-explicit-any
      const employees = (Array.isArray(r) ? r : []).map((e: any) => ({
        uuid: e.uuid, name: [e.first_name, e.last_name].filter(Boolean).join(' '),
      }));
      return json({ employees });
    }

    if (action === 'list_open_payrolls') {
      const r = await api('GET', `/v1/companies/${co}/payrolls?processing_statuses=unprocessed&payroll_types=regular`);
      // deno-lint-ignore no-explicit-any
      const payrolls = (Array.isArray(r) ? r : []).map((p: any) => ({
        uuid: p.payroll_uuid || p.uuid,
        startDate: p.pay_period?.start_date, endDate: p.pay_period?.end_date, checkDate: p.check_date,
      }));
      return json({ payrolls });
    }

    if (action === 'push_hours') {
      const payrollId = body.payrollId;
      const hours = Array.isArray(body.hours) ? body.hours : [];
      if (!payrollId) return json({ error: 'payrollId is required' }, { status: 400 });
      if (!hours.length) return json({ error: 'No hours to push' }, { status: 400 });

      // Map employee -> requested hours.
      const want = new Map<string, { regular: number; overtime: number }>();
      for (const h of hours) if (h.employeeUuid) want.set(h.employeeUuid, { regular: Number(h.regular) || 0, overtime: Number(h.overtime) || 0 });

      // A payroll must be "prepared" before its editable employee_compensations (with versions and
      // the hourly_compensations structure) are returned. Prepare, then update those hours.
      const payroll = await api('PUT', `/v1/companies/${co}/payrolls/${payrollId}/prepare`);
      const comps = payroll?.employee_compensations || [];
      if (!Array.isArray(comps) || !comps.length) return json({ error: 'This payroll has no employee compensations to update. Is it an unprocessed regular payroll?' }, { status: 400 });

      const updated: unknown[] = [];
      let matched = 0;
      for (const ec of comps) {
        const target = want.get(ec.employee_uuid);
        if (!target) continue;
        matched++;
        const hourly = (ec.hourly_compensations || []).map((hc: Record<string, unknown>) => {
          const name = String(hc.name || '');
          if (name === 'Regular Hours') return { ...hc, hours: target.regular.toFixed(3) };
          if (name === 'Overtime') return { ...hc, hours: target.overtime.toFixed(3) };
          return hc;
        });
        updated.push({ employee_uuid: ec.employee_uuid, version: ec.version, fixed_compensations: ec.fixed_compensations || [], hourly_compensations: hourly });
      }
      if (!matched) return json({ error: 'None of the mapped employees are on this payroll. Check the employee mapping.' }, { status: 400 });

      await api('PUT', `/v1/companies/${co}/payrolls/${payrollId}`, { employee_compensations: updated });
      await admin.from('gusto_integration_settings').update({ last_sync_at: new Date().toISOString() }).eq('company_id', companyId);
      return json({ updated: matched });
    }

    return json({ error: `Unsupported action: ${action}` }, { status: 400 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
});
