// Provision a new GuildWright tenant (white-glove onboarding).
// Creates the company + owner user, wires the membership (auth_company_id reads memberships),
// seeds company_settings + default roles + expense categories, and emails the owner an invite
// link to set their password (via the Resend SMTP we configured on Supabase Auth).
//
// Usage:
//   node scripts/provision-tenant.mjs "Company Name" owner@email.com First Last [plan]
//   plan defaults to "field".
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const creds = readFileSync('C:/Dev/RefugeAndSword/_company/credentials.yaml', 'utf8');
const SERVICE_ROLE = creds.match(/service_role_key:\s*([^\s\n]+)/)[1].trim();
const URL = 'https://eojpqciokqpmzyneqzmm.supabase.co';
const REDIRECT = 'https://app.guildwright.app/reset-password';

const [, , companyName, ownerEmail, firstName = '', lastName = '', plan = 'field'] = process.argv;
if (!companyName || !ownerEmail) {
  console.error('Usage: node scripts/provision-tenant.mjs "Company Name" owner@email.com First Last [plan]');
  process.exit(1);
}

const admin = createClient(URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
const fullName = [firstName, lastName].filter(Boolean).join(' ');

const die = (label, error) => { if (error) { console.error(`FAILED at ${label}:`, error.message || error); process.exit(1); } };

(async () => {
  // 1. Company. Start a 14-day, no-card trial (full Pro access until it lapses).
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: company, error: cErr } = await admin
    .from('companies').insert({ name: companyName, plan, subscription_status: 'none', trial_ends_at: trialEndsAt }).select().single();
  die('create company', cErr);
  const companyId = company.id;
  console.log('company:', companyId, `(${companyName}, plan=${plan}, 14-day trial)`);

  // 2. Owner auth user + invite email (creates the user and emails the set-password link)
  const { data: invite, error: iErr } = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
    redirectTo: REDIRECT,
    data: { full_name: fullName },
  });
  die('invite owner', iErr);
  const userId = invite.user.id;
  console.log('owner user:', userId, `(${ownerEmail}) invite email sent`);

  // 3. Membership -- this is what auth_company_id() reads to scope the tenant
  die('membership', (await admin.from('memberships').insert({ user_id: userId, company_id: companyId, role: 'owner' })).error);

  // 4. User profile
  die('user_profile', (await admin.from('user_profiles').insert({
    user_id: userId, company_id: companyId, role: 'owner',
    email: ownerEmail, first_name: firstName, last_name: lastName, full_name: fullName,
  })).error);

  // 5. Company settings (own name; blanks so nothing leaks from another tenant)
  die('company_settings', (await admin.from('company_settings').insert({
    company_id: companyId, company_name: companyName,
    tagline: '', address_line: '', city_state_zip: '', phone: '', email: ownerEmail, website: '',
    established_label: '',
  })).error);

  // 6. Default roles
  die('custom_roles', (await admin.from('custom_roles').insert([
    { company_id: companyId, label: 'Admin', base_role: 'admin', pay_type: 'hourly', sort_order: 0 },
    { company_id: companyId, label: 'Site Manager', base_role: 'site_manager', pay_type: 'salary', sort_order: 1 },
    { company_id: companyId, label: 'Crew Member', base_role: 'crew_member', pay_type: 'hourly', sort_order: 2 },
  ])).error);

  // 7. Default expense categories
  die('expense_categories', (await admin.from('expense_categories').insert([
    { company_id: companyId, name: 'Materials', cost_bucket: 'materials', sort_order: 0 },
    { company_id: companyId, name: 'Subcontractor', cost_bucket: 'subcontractor', sort_order: 1 },
  ])).error);

  // 8. Default permission matrix (site_manager + crew_member); auth_can() reads this for RLS.
  const FEATS = ['projects','estimates','invoices','clients','tasks','materials','expenses','timecards','time_off','subcontractors','reports','phase_approvals','chat','client_requests','user_management'];
  const PERM_DEFAULTS = {
    coo: Object.fromEntries(FEATS.map(k => [k, [true, true]])),
    site_manager: { projects: [true, true], estimates: [false, false], invoices: [false, false], clients: [true, false], tasks: [true, true], materials: [true, true], expenses: [false, false], timecards: [true, true], time_off: [true, false], subcontractors: [false, false], reports: [false, false], phase_approvals: [true, true], chat: [true, true], client_requests: [false, false], user_management: [false, false] },
    crew_member: { projects: [true, false], estimates: [false, false], invoices: [false, false], clients: [false, false], tasks: [true, true], materials: [false, false], expenses: [false, false], timecards: [true, true], time_off: [true, true], subcontractors: [false, false], reports: [false, false], phase_approvals: [false, false], chat: [true, true], client_requests: [false, false], user_management: [false, false] },
  };
  const permRows = Object.entries(PERM_DEFAULTS).flatMap(([role, feats]) =>
    Object.entries(feats).map(([feature, [can_read, can_write]]) => ({ company_id: companyId, role, feature, can_read, can_write }))
  );
  die('permission_settings', (await admin.from('permission_settings').insert(permRows)).error);

  console.log('\nDONE. Next:');
  console.log(`  - ${ownerEmail} gets an invite email to set their password at ${REDIRECT}`);
  console.log('  - Have them sign in, then set their branding under Settings and invite their crew.');
})();
