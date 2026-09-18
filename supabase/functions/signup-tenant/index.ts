// Self-service tenant signup, in two halves.
//
//   start    (no auth) Parks the company details against an account the client has just created
//                      with supabase.auth.signUp, which is what sends the confirmation email.
//                      Deliberately does NOT create a company: a public endpoint that provisions
//                      tenants is a spam magnet, and every tenant carries a Pro trial.
//   provision (JWT)    Called by the app after the person confirms and signs in. Verifies the
//                      email is confirmed, then builds the tenant. No confirmation, no tenant.
//
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, both injected by Supabase.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Signups allowed from one address per window. Generous for a real office behind one NAT, tight
// enough that scripted abuse hits a wall quickly.
const RATE_LIMIT = 5;
const RATE_WINDOW_MIN = 60;
const TRIAL_DAYS = 14;

const FEATS = ['projects', 'estimates', 'invoices', 'clients', 'tasks', 'materials', 'expenses', 'timecards', 'time_off', 'subcontractors', 'reports', 'phase_approvals', 'chat', 'client_requests', 'user_management'];
const PERM_DEFAULTS: Record<string, Record<string, [boolean, boolean]>> = {
  coo: Object.fromEntries(FEATS.map((k) => [k, [true, true] as [boolean, boolean]])),
  site_manager: {
    projects: [true, true], estimates: [false, false], invoices: [false, false], clients: [true, false],
    tasks: [true, true], materials: [true, true], expenses: [false, false], timecards: [true, true],
    time_off: [true, false], subcontractors: [false, false], reports: [false, false],
    phase_approvals: [true, true], chat: [true, true], client_requests: [false, false], user_management: [false, false],
  },
  crew_member: {
    projects: [true, false], estimates: [false, false], invoices: [false, false], clients: [false, false],
    tasks: [true, true], materials: [false, false], expenses: [false, false], timecards: [true, true],
    time_off: [true, true], subcontractors: [false, false], reports: [false, false],
    phase_approvals: [false, false], chat: [true, true], client_requests: [false, false], user_management: [false, false],
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action === 'provision' ? 'provision' : 'start';

    // ---------------------------------------------------------------- start
    if (action === 'start') {
      // The client has already called supabase.auth.signUp, so Supabase has created the account and
      // sent its own confirmation mail. This only records what company to build once they confirm.
      const userId = String(body.userId || '').trim();
      const companyName = String(body.companyName || '').trim();
      const firstName = String(body.firstName || '').trim();
      const lastName = String(body.lastName || '').trim();
      if (!userId) return json({ error: 'Missing account reference.' }, { status: 400 });
      if (!companyName || companyName.length < 2) return json({ error: 'Enter your company name.' }, { status: 400 });

      const { data: got, error: gErr } = await admin.auth.admin.getUserById(userId);
      const account = got?.user;
      if (gErr || !account) return json({ error: 'Account not found.' }, { status: 404 });

      // Only a freshly created, still unconfirmed account can have company details attached. That
      // stops anyone posting another person's user id to rename their pending company.
      if (account.email_confirmed_at) return json({ error: 'That account is already confirmed.' }, { status: 400 });
      const ageMs = Date.now() - new Date(account.created_at).getTime();
      if (ageMs > 15 * 60 * 1000) return json({ error: 'Signup expired. Start again.' }, { status: 400 });

      const { data: already } = await admin.from('pending_signups').select('id').eq('user_id', userId).maybeSingle();
      if (already) return json({ ok: true, email: account.email });

      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const since = new Date(Date.now() - RATE_WINDOW_MIN * 60 * 1000).toISOString();
      const { count } = await admin.from('pending_signups')
        .select('id', { count: 'exact', head: true }).eq('signup_ip', ip).gte('created_at', since);
      if ((count ?? 0) >= RATE_LIMIT) {
        return json({ error: 'Too many signups from this network. Try again later, or contact support.' }, { status: 429 });
      }

      const { error: insErr } = await admin.from('pending_signups').insert({
        user_id: userId, email: account.email, company_name: companyName,
        first_name: firstName || null, last_name: lastName || null, signup_ip: ip,
      });
      if (insErr) return json({ error: insErr.message }, { status: 400 });

      return json({ ok: true, email: account.email });
    }

    // ------------------------------------------------------------ provision
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.email_confirmed_at) return json({ error: 'Confirm your email address first.' }, { status: 403 });

    // Already in a company? Nothing to do. Keeps this safe to call on every login.
    const { data: existing } = await admin.from('memberships').select('company_id').eq('user_id', user.id).maybeSingle();
    if (existing) return json({ ok: true, company_id: existing.company_id, created: false });

    const { data: pending } = await admin.from('pending_signups').select('*').eq('user_id', user.id).maybeSingle();
    if (!pending) return json({ error: 'No signup found for this account.' }, { status: 404 });
    if (pending.provisioned_at && pending.company_id) {
      return json({ ok: true, company_id: pending.company_id, created: false });
    }

    const fail = (label: string, error: unknown) =>
      json({ error: `Failed at ${label}: ${(error as Error)?.message || error}` }, { status: 400 });

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: company, error: cErr } = await admin.from('companies')
      .insert({ name: pending.company_name, plan: 'field', subscription_status: 'none', trial_ends_at: trialEndsAt })
      .select().single();
    if (cErr) return fail('create company', cErr);
    const companyId = company.id;

    const fullName = [pending.first_name, pending.last_name].filter(Boolean).join(' ');
    const permRows = Object.entries(PERM_DEFAULTS).flatMap(([role, feats]) =>
      Object.entries(feats).map(([feature, [can_read, can_write]]) => ({ company_id: companyId, role, feature, can_read, can_write })));

    const steps: Array<[string, Promise<{ error: unknown }>]> = [
      ['permission_settings', admin.from('permission_settings').insert(permRows)],
      ['membership', admin.from('memberships').insert({ user_id: user.id, company_id: companyId, role: 'owner' })],
      ['user_profile', admin.from('user_profiles').insert({
        user_id: user.id, company_id: companyId, role: 'owner', email: pending.email,
        first_name: pending.first_name, last_name: pending.last_name, full_name: fullName, is_active: true,
      })],
      ['company_settings', admin.from('company_settings').insert({
        company_id: companyId, company_name: pending.company_name,
        tagline: '', address_line: '', city_state_zip: '', phone: '', email: pending.email, website: '', established_label: '',
      })],
      ['custom_roles', admin.from('custom_roles').insert([
        { company_id: companyId, label: 'Admin', base_role: 'admin', pay_type: 'hourly', sort_order: 0 },
        { company_id: companyId, label: 'Site Manager', base_role: 'site_manager', pay_type: 'salary', sort_order: 1 },
        { company_id: companyId, label: 'Crew Member', base_role: 'crew_member', pay_type: 'hourly', sort_order: 2 },
      ])],
      ['expense_categories', admin.from('expense_categories').insert([
        { company_id: companyId, name: 'Materials', cost_bucket: 'materials', sort_order: 0 },
        { company_id: companyId, name: 'Subcontractor', cost_bucket: 'subcontractor', sort_order: 1 },
      ])],
    ];
    for (const [label, pr] of steps) {
      const { error } = await pr;
      if (error) return fail(label, error);
    }

    await admin.from('pending_signups')
      .update({ provisioned_at: new Date().toISOString(), company_id: companyId })
      .eq('user_id', user.id);

    return json({ ok: true, company_id: companyId, created: true });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
});
