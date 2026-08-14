// Platform (super) admin operations: list tenants and create new ones. Reaches across tenants
// with the service role, so it enforces its own gate: the caller's JWT must belong to a
// user_profiles row with is_platform_admin = true. Not a tenant feature; powers the IT portal.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REDIRECT = 'https://app.guildwright.app/reset-password';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (d: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(d), { ...init, headers: { ...CORS, 'Content-Type': 'application/json' } });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

  // Gate: caller must be a platform admin.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: { user } } = await admin.auth.getUser(jwt);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
  const { data: prof } = await admin.from('user_profiles').select('is_platform_admin').eq('user_id', user.id).maybeSingle();
  if (!prof?.is_platform_admin) return json({ error: 'Not a platform admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'list_tenants') {
    const { data: companies, error } = await admin
      .from('companies').select('id, name, plan, subscription_status, trial_ends_at, created_at').order('created_at', { ascending: true });
    if (error) return json({ error: error.message }, { status: 400 });
    const { data: profiles } = await admin.from('user_profiles').select('company_id, role, email, full_name');
    // Error counts per tenant, so the list can flag tenants that need attention.
    const { data: errRows } = await admin.from('error_logs').select('company_id');
    const errCount: Record<string, number> = {};
    (errRows || []).forEach((e: { company_id: string }) => { if (e.company_id) errCount[e.company_id] = (errCount[e.company_id] || 0) + 1; });
    const tenants = (companies || []).map(c => {
      const members = (profiles || []).filter(p => p.company_id === c.id);
      const owner = members.find(m => m.role === 'owner');
      // Effective access level (mirrors company_access_level()): trial grants Pro until it lapses.
      const active = ['active', 'trialing', 'past_due'].includes(c.subscription_status);
      const onTrial = !active && c.trial_ends_at && new Date(c.trial_ends_at).getTime() > Date.now();
      const access = active ? c.plan : (onTrial ? 'pro' : 'none');
      return {
        id: c.id, name: c.name, plan: c.plan, created_at: c.created_at,
        subscription_status: c.subscription_status, trial_ends_at: c.trial_ends_at,
        access_level: access, on_trial: !!onTrial,
        owner_email: owner?.email || null, owner_name: owner?.full_name || null,
        user_count: members.length,
        error_count: errCount[c.id] || 0,
      };
    });
    return json({ tenants });
  }

  if (action === 'create_tenant') {
    const companyName = (body.companyName || '').trim();
    const ownerEmail = (body.ownerEmail || '').trim().toLowerCase();
    const firstName = (body.firstName || '').trim();
    const lastName = (body.lastName || '').trim();
    const plan = body.plan === 'pro' ? 'pro' : 'field';
    if (!companyName || !ownerEmail) return json({ error: 'Company name and owner email are required.' }, { status: 400 });

    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const fail = (label: string, error: unknown) =>
      json({ error: `Failed at ${label}: ${(error as Error)?.message || error}` }, { status: 400 });

    // 1. Company. New tenants start on a 14-day, no-card trial (full Pro access via
    // company_access_level()); subscription_status 'none' so they fall to the free floor if the
    // trial lapses without subscribing.
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: company, error: cErr } = await admin
      .from('companies').insert({ name: companyName, plan, subscription_status: 'none', trial_ends_at: trialEndsAt }).select().single();
    if (cErr) return fail('create company', cErr);
    const companyId = company.id;

    // 2. Owner user + invite email (set-password link via Resend)
    const { data: invite, error: iErr } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
      redirectTo: REDIRECT, data: { full_name: fullName },
    });
    if (iErr) {
      // Roll back the company so a retry with a fixed email is clean.
      await admin.from('companies').delete().eq('id', companyId);
      return fail('invite owner', iErr);
    }
    const userId = invite.user.id;

    // Default permission matrix for site_manager + crew_member (mirrors usePermissions ROLE_DEFAULTS;
    // auth_can() reads this so the Permissions page enforces at the DB). owner/admin/coo are always full.
    const FEATS = ['projects','estimates','invoices','clients','tasks','materials','expenses','timecards','time_off','subcontractors','reports','phase_approvals','chat','client_requests','user_management'];
    const PERM_DEFAULTS: Record<string, Record<string, [boolean, boolean]>> = {
      coo: Object.fromEntries(FEATS.map(k => [k, [true, true] as [boolean, boolean]])),
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
    const permRows = Object.entries(PERM_DEFAULTS).flatMap(([role, feats]) =>
      Object.entries(feats).map(([feature, [can_read, can_write]]) => ({ company_id: companyId, role, feature, can_read, can_write }))
    );

    // 3-8. Membership (auth_company_id reads this), profile, settings, roles, categories, permissions
    const steps: Array<[string, Promise<{ error: unknown }>]> = [
      ['permission_settings', admin.from('permission_settings').insert(permRows)],
      ['membership', admin.from('memberships').insert({ user_id: userId, company_id: companyId, role: 'owner' })],
      ['user_profile', admin.from('user_profiles').insert({
        user_id: userId, company_id: companyId, role: 'owner',
        email: ownerEmail, first_name: firstName, last_name: lastName, full_name: fullName,
      })],
      ['company_settings', admin.from('company_settings').insert({
        company_id: companyId, company_name: companyName,
        tagline: '', address_line: '', city_state_zip: '', phone: '', email: ownerEmail, website: '', established_label: '',
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
    for (const [label, p] of steps) {
      const { error } = await p;
      if (error) return fail(label, error);
    }

    // If this tenant came from a lead, mark it won and link the company.
    if (body.leadId) {
      await admin.from('leads').update({ status: 'won', converted_company_id: companyId, updated_at: new Date().toISOString() }).eq('id', body.leadId);
    }

    return json({ tenant: { id: companyId, name: companyName, plan, owner_email: ownerEmail } });
  }

  // Read-only tenant snapshot for support: their settings, users, roles, categories, plan.
  if (action === 'tenant_detail') {
    const companyId = body.companyId;
    if (!companyId) return json({ error: 'companyId is required' }, { status: 400 });
    const cnt = (t: string) => admin.from(t).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
    const [company, settings, users, roles, cats, errors, qbo, xero, gusto, costCodes, payRates, projects] = await Promise.all([
      admin.from('companies').select('*').eq('id', companyId).maybeSingle(),
      admin.from('company_settings').select('*').eq('company_id', companyId).maybeSingle(),
      admin.from('user_profiles').select('email, full_name, role, role_label, is_active').eq('company_id', companyId),
      admin.from('custom_roles').select('label, base_role, pay_type').eq('company_id', companyId).order('sort_order'),
      admin.from('expense_categories').select('name, cost_bucket').eq('company_id', companyId).order('sort_order'),
      admin.from('error_logs').select('id, source, message, url, details, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50),
      admin.from('qbo_integration_settings').select('*').eq('company_id', companyId).maybeSingle(),
      admin.from('xero_integration_settings').select('*').eq('company_id', companyId).maybeSingle(),
      admin.from('gusto_integration_settings').select('*').eq('company_id', companyId).maybeSingle(),
      cnt('cost_codes'), cnt('pay_rates'), cnt('projects'),
    ]);

    // Connection health: the per-tenant OAuth integrations that vary and can need re-auth.
    // deno-lint-ignore no-explicit-any
    const mapKeys = (m: any) => (m && typeof m === 'object') ? Object.keys(m).length : 0;
    // deno-lint-ignore no-explicit-any
    const conn = (name: string, s: any, orgFields: string[]) => {
      if (!s) return { name, connected: false, org: null, lastSync: null, hasMapping: null };
      const org = orgFields.map(f => s[f]).find(Boolean) || null;
      return { name, connected: s.is_connected === true, org, lastSync: s.last_sync_at || null,
        hasMapping: s.category_item_map !== undefined ? mapKeys(s.category_item_map) > 0 : null };
    };
    const connections = [
      conn('QuickBooks', qbo.data, ['company_name', 'org_name', 'realm_id']),
      conn('Xero', xero.data, ['org_name']),
      conn('Gusto', gusto.data, ['gusto_company_name']),
    ];

    // Guided diagnostics: readiness gaps that quietly produce bad output.
    const s = settings.data || {};
    const errCount = (errors.data || []).length;
    const activeAcct = (qbo.data?.is_connected && qbo.data) || (xero.data?.is_connected && xero.data) || null;
    const diagnostics = [
      { label: 'Cost codes', status: (costCodes.count || 0) > 0 ? 'ok' : 'warn',
        detail: (costCodes.count || 0) > 0 ? `${costCodes.count} defined` : 'None set. Estimates and accounting mapping rely on cost codes.' },
      { label: 'Pay rates / wages', status: (payRates.count || 0) > 0 ? 'ok' : 'warn',
        detail: (payRates.count || 0) > 0 ? `${payRates.count} on file` : 'No wages entered. Labor cost, profitability, and payroll will be blank.' },
      { label: 'Expense categories', status: (cats.data || []).length > 0 ? 'ok' : 'warn',
        detail: (cats.data || []).length > 0 ? `${(cats.data || []).length} defined` : 'None. Crew cannot categorize expenses.' },
      { label: 'Projects', status: (projects.count || 0) > 0 ? 'ok' : 'info',
        detail: `${projects.count || 0} total` },
      ...(activeAcct ? [{ label: 'Accounting mapping', status: mapKeys(activeAcct.category_item_map) > 0 ? 'ok' : 'warn',
        detail: mapKeys(activeAcct.category_item_map) > 0 ? 'Categories mapped to accounts' : 'Connected but no category mapping. Invoice lines fall back to one account.' }] : []),
      { label: 'Recent errors', status: errCount >= 10 ? 'warn' : 'ok', detail: `${errCount}${errCount >= 50 ? '+' : ''} in the last 50 logged` },
      { label: 'Client-facing logo', status: s.logo_url ? 'ok' : 'info',
        detail: s.logo_url ? 'Set' : 'No letterhead logo. Documents render with text only.' },
    ];

    return json({
      company: company.data, settings: settings.data,
      users: users.data || [], roles: roles.data || [], categories: cats.data || [],
      errors: errors.data || [],
      connections, diagnostics,
    });
  }

  // Guided repair: safe, self-contained fixes an admin can trigger for a tenant.
  //  clear_contact_cache: forget the synced QuickBooks/Xero contact ids so the next invoice push
  //  re-resolves them. Fixes an invoice pointed at a wrong or duplicate accounting contact.
  if (action === 'repair') {
    const companyId = body.companyId;
    const kind = body.kind;
    if (!companyId) return json({ error: 'companyId is required' }, { status: 400 });
    if (kind === 'clear_contact_cache') {
      await admin.from('clients').update({ quickbooks_customer_id: null, xero_contact_id: null }).eq('company_id', companyId);
      await admin.from('platform_audit_log').insert({
        actor_user_id: user.id, actor_email: user.email, action: 'repair:clear_contact_cache', company_id: companyId,
      });
      return json({ ok: true, message: 'Accounting contact cache cleared. The next push re-resolves each client.' });
    }
    return json({ error: 'Unknown repair' }, { status: 400 });
  }

  // Change a tenant's plan (Field <-> Pro). This is the billing lever: company_is_pro() reads
  // companies.plan, so the DB paywall flips the moment this is set. Audited.
  if (action === 'set_plan') {
    const companyId = body.companyId;
    const plan = body.plan === 'pro' ? 'pro' : 'field';
    if (!companyId) return json({ error: 'companyId is required' }, { status: 400 });
    // A manual plan grant is a comp: mark the subscription active so company_access_level() honors
    // it (otherwise the plan column alone grants nothing).
    const { error } = await admin.from('companies').update({ plan, subscription_status: 'active' }).eq('id', companyId);
    if (error) return json({ error: error.message }, { status: 400 });
    await admin.from('platform_audit_log').insert({
      actor_user_id: user.id, actor_email: user.email, action: 'set_plan',
      company_id: companyId, target_email: `plan:${plan}`,
    });
    return json({ ok: true, plan });
  }

  // Permanently delete a tenant. The most destructive action in the portal, so it requires:
  //  (1) a platform admin (checked above), (2) the caller to type the tenant's exact name, and
  //  (3) the tenant to NOT contain a platform admin (protects tenant 0 / the mothership). All
  //  tenant data cascade-deletes from the company row; the auth users are removed separately.
  if (action === 'delete_tenant') {
    const companyId = body.companyId;
    const confirmName = String(body.confirmName || '').trim();
    if (!companyId) return json({ error: 'companyId is required' }, { status: 400 });
    const { data: company } = await admin.from('companies').select('id, name').eq('id', companyId).maybeSingle();
    if (!company) return json({ error: 'Company not found' }, { status: 404 });
    if (confirmName !== company.name) return json({ error: 'The name you typed does not match the tenant name.' }, { status: 400 });

    const { data: members } = await admin.from('user_profiles').select('user_id, is_platform_admin').eq('company_id', companyId);
    if ((members || []).some((m: { is_platform_admin: boolean }) => m.is_platform_admin)) {
      return json({ error: 'This tenant contains a platform admin and cannot be deleted.' }, { status: 400 });
    }
    const userIds = (members || []).map((m: { user_id: string }) => m.user_id).filter(Boolean);

    // Audit first (company_id has no FK to companies, so this survives the delete).
    await admin.from('platform_audit_log').insert({
      actor_user_id: user.id, actor_email: user.email, action: 'delete_tenant',
      company_id: companyId, target_email: company.name,
    });

    const { error: delErr } = await admin.from('companies').delete().eq('id', companyId);
    if (delErr) return json({ error: delErr.message }, { status: 400 });
    // Auth users aren't cascaded by the company FK; remove them so their emails free up.
    for (const uid of userIds) { try { await admin.auth.admin.deleteUser(uid); } catch (_) { /* best effort */ } }

    return json({ ok: true });
  }

  // White-glove branding: save a tenant's brand settings (colors, font, theme, logo url). These
  // columns also drive the client-facing docs, so one edit brands the app and the documents.
  if (action === 'update_branding') {
    const companyId = body.companyId;
    const b = body.branding && typeof body.branding === 'object' ? body.branding : {};
    if (!companyId) return json({ error: 'companyId is required' }, { status: 400 });
    const norm = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const upd = {
      brand_primary: norm(b.primary),
      brand_accent: norm(b.accent),
      logo_url: norm(b.logo_url),
      logo_icon_url: norm(b.logo_icon_url),
      brand_font: norm(b.font),
      brand_theme: (b.default_theme === 'light' || b.default_theme === 'dark') ? b.default_theme : null,
    };
    const { error } = await admin.from('company_settings').update(upd).eq('company_id', companyId);
    if (error) return json({ error: error.message }, { status: 400 });
    return json({ ok: true, branding: upd });
  }

  // Upload a tenant logo (data URL) to the public 'uploads' bucket and return its URL.
  if (action === 'upload_logo') {
    const companyId = body.companyId;
    const dataUrl: string = body.dataUrl || '';
    if (!companyId || !dataUrl.startsWith('data:')) return json({ error: 'companyId and a data URL are required' }, { status: 400 });
    const comma = dataUrl.indexOf(',');
    const meta = dataUrl.slice(5, comma); // e.g. image/png;base64
    const contentType = meta.split(';')[0] || 'image/png';
    const ext = contentType.includes('svg') ? 'svg' : contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
    const bytes = Uint8Array.from(atob(dataUrl.slice(comma + 1)), (c) => c.charCodeAt(0));
    if (bytes.length > 2 * 1024 * 1024) return json({ error: 'Logo must be under 2MB.' }, { status: 400 });
    const path = `branding/${companyId}-${Date.now()}.${ext}`;
    const { error: upErr } = await admin.storage.from('uploads').upload(path, bytes, { contentType, upsert: true });
    if (upErr) return json({ error: upErr.message }, { status: 400 });
    const { data } = admin.storage.from('uploads').getPublicUrl(path);
    return json({ url: data.publicUrl });
  }

  // Support queue: tenant-submitted issue reports across all tenants.
  if (action === 'list_tickets') {
    const { data: tickets } = await admin
      .from('support_tickets').select('*').order('created_at', { ascending: false }).limit(200);
    const { data: companies } = await admin.from('companies').select('id, name');
    const nameById = Object.fromEntries((companies || []).map(c => [c.id, c.name]));
    return json({ tickets: (tickets || []).map(t => ({ ...t, company_name: nameById[t.company_id] || '-' })) });
  }
  if (action === 'resolve_ticket') {
    if (!body.ticketId) return json({ error: 'ticketId is required' }, { status: 400 });
    const { error } = await admin.from('support_tickets')
      .update({ status: body.status === 'open' ? 'open' : 'resolved' }).eq('id', body.ticketId);
    if (error) return json({ error: error.message }, { status: 400 });
    return json({ ok: true });
  }

  // Support impersonation: issue a one-time owner sign-in link so a platform admin can enter the
  // tenant's portal to help. Gated to platform admins (checked above) and every use is audited.
  if (action === 'impersonate') {
    const companyId = body.companyId;
    if (!companyId) return json({ error: 'companyId is required' }, { status: 400 });
    const { data: owner } = await admin
      .from('user_profiles').select('email, full_name')
      .eq('company_id', companyId).eq('role', 'owner').limit(1).maybeSingle();
    if (!owner?.email) return json({ error: 'No owner account found for that company.' }, { status: 400 });

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: owner.email,
      options: { redirectTo: 'https://app.guildwright.app/' },
    });
    if (error) return json({ error: error.message }, { status: 400 });

    await admin.from('platform_audit_log').insert({
      actor_user_id: user.id, actor_email: user.email, action: 'impersonate',
      company_id: companyId, target_email: owner.email,
    });

    return json({ link: data.properties?.action_link, owner_email: owner.email, owner_name: owner.full_name });
  }

  // ── Leads pipeline ─────────────────────────────────────────────────────────
  if (action === 'list_leads') {
    const { data: leads } = await admin.from('leads').select('*').order('created_at', { ascending: false }).limit(500);
    return json({ leads: leads || [] });
  }
  if (action === 'update_lead') {
    if (!body.leadId) return json({ error: 'leadId is required' }, { status: 400 });
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of ['status', 'notes', 'name', 'company', 'email', 'phone']) if (body[k] !== undefined) upd[k] = body[k];
    const { error } = await admin.from('leads').update(upd).eq('id', body.leadId);
    if (error) return json({ error: error.message }, { status: 400 });
    return json({ ok: true });
  }
  if (action === 'delete_lead') {
    if (!body.leadId) return json({ error: 'leadId is required' }, { status: 400 });
    await admin.from('leads').delete().eq('id', body.leadId);
    return json({ ok: true });
  }

  // ── Appointments (walkthrough calls / meetings) ────────────────────────────
  if (action === 'list_appointments') {
    let q = admin.from('appointments').select('*').order('start_at', { ascending: true });
    if (body.from) q = q.gte('start_at', body.from);
    if (body.to) q = q.lte('start_at', body.to);
    const { data } = await q.limit(1000);
    return json({ appointments: data || [] });
  }
  if (action === 'upsert_appointment') {
    const a = body.appointment || {};
    if (!a.title || !a.start_at) return json({ error: 'Title and start time are required.' }, { status: 400 });
    const row: Record<string, unknown> = {
      title: a.title, description: a.description ?? null,
      start_at: a.start_at, end_at: a.end_at ?? null,
      appt_type: a.appt_type || 'walkthrough', status: a.status || 'scheduled',
      lead_id: a.lead_id ?? null,
      contact_name: a.contact_name ?? null, contact_email: a.contact_email ?? null, contact_phone: a.contact_phone ?? null,
      location: a.location ?? null,
      assigned_to: a.assigned_to ?? user.id, assigned_to_name: a.assigned_to_name ?? user.email,
      updated_at: new Date().toISOString(),
    };
    if (a.id) {
      const { error } = await admin.from('appointments').update(row).eq('id', a.id);
      if (error) return json({ error: error.message }, { status: 400 });
      // Keep the linked lead in the scheduled state.
      if (a.lead_id) await admin.from('leads').update({ status: 'scheduled', updated_at: new Date().toISOString() }).eq('id', a.lead_id).eq('status', 'new');
      return json({ ok: true, id: a.id });
    }
    row.created_by = user.id;
    const { data, error } = await admin.from('appointments').insert(row).select('id').single();
    if (error) return json({ error: error.message }, { status: 400 });
    if (a.lead_id) await admin.from('leads').update({ status: 'scheduled', updated_at: new Date().toISOString() }).eq('id', a.lead_id).in('status', ['new', 'contacted']);
    return json({ ok: true, id: data.id });
  }
  if (action === 'delete_appointment') {
    if (!body.appointmentId) return json({ error: 'appointmentId is required' }, { status: 400 });
    await admin.from('appointments').delete().eq('id', body.appointmentId);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, { status: 400 });
});
