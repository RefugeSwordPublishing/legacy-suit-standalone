// Seeds the "Timberline Renovations" demo tenant with realistic mock data for marketing
// screenshots. Comped to Pro (no trial banner). Owner is a real auth user (no email sent) so it
// can be impersonated from the admin portal. Aborts if the demo tenant already exists.
//
// Usage: node scripts/seed-demo-tenant.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const creds = readFileSync('C:/Dev/RefugeAndSword/_company/credentials.yaml', 'utf8');
const SERVICE_ROLE = creds.match(/service_role_key:\s*([^\s\n]+)/)[1].trim();
const admin = createClient('https://eojpqciokqpmzyneqzmm.supabase.co', SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

const NAME = 'Timberline Renovations';
const OWNER_EMAIL = 'dustystombo+timberline@gmail.com';
const die = (label, error) => { if (error) { console.error(`FAILED at ${label}:`, error.message || error); process.exit(1); } };
const ins = async (table, rows) => { const { error } = await admin.from(table).insert(rows); die(`insert ${table}`, error); };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const iso = (d) => d.toISOString();
const ymd = (d) => d.toISOString().slice(0, 10);

(async () => {
  const { data: existing } = await admin.from('companies').select('id').eq('name', NAME).maybeSingle();
  if (existing) { console.error(`"${NAME}" already exists (${existing.id}). Delete it first from the admin portal, then re-run.`); process.exit(1); }

  // 1. Company — comped Pro, no trial.
  const { data: company, error: cErr } = await admin.from('companies')
    .insert({ name: NAME, plan: 'pro', subscription_status: 'active', trial_ends_at: null }).select().single();
  die('company', cErr);
  const companyId = company.id;
  console.log('company:', companyId);

  // 2. Owner auth user (no email sent) + membership + profile.
  const { data: created, error: uErr } = await admin.auth.admin.createUser({
    email: OWNER_EMAIL, email_confirm: true, user_metadata: { full_name: 'Jordan Vale' },
  });
  die('owner user', uErr);
  const ownerId = created.user.id;
  await ins('memberships', { user_id: ownerId, company_id: companyId, role: 'owner' });
  await ins('user_profiles', { user_id: ownerId, company_id: companyId, role: 'owner', email: OWNER_EMAIL, first_name: 'Jordan', last_name: 'Vale', full_name: 'Jordan Vale', is_active: true });

  // 3. Company settings.
  await ins('company_settings', {
    company_id: companyId, company_name: NAME, tagline: 'Craftsmanship you can trust.',
    address_line: '740 Timber Line Rd', city_state_zip: 'Bend, OR 97701', phone: '(541) 555-0142',
    email: 'hello@timberlinereno.com', website: 'timberlinereno.com', established_label: 'Est. 2014',
    brand_primary: '#204634', brand_accent: '#C57229',
  });

  // 4. Roles, expense categories, permission matrix.
  await ins('custom_roles', [
    { company_id: companyId, label: 'Admin', base_role: 'admin', pay_type: 'salary', sort_order: 0 },
    { company_id: companyId, label: 'Site Manager', base_role: 'site_manager', pay_type: 'salary', sort_order: 1 },
    { company_id: companyId, label: 'Carpenter', base_role: 'crew_member', pay_type: 'hourly', sort_order: 2 },
  ]);
  await ins('expense_categories', [
    { company_id: companyId, name: 'Materials', cost_bucket: 'materials', sort_order: 0 },
    { company_id: companyId, name: 'Subcontractor', cost_bucket: 'subcontractor', sort_order: 1 },
  ]);
  const FEATS = ['projects','estimates','invoices','clients','tasks','materials','expenses','timecards','time_off','subcontractors','reports','phase_approvals','chat','client_requests','user_management'];
  const PERM = {
    coo: Object.fromEntries(FEATS.map(k => [k, [true, true]])),
    site_manager: { projects:[true,true], estimates:[false,false], invoices:[false,false], clients:[true,false], tasks:[true,true], materials:[true,true], expenses:[false,false], timecards:[true,true], time_off:[true,false], subcontractors:[false,false], reports:[false,false], phase_approvals:[true,true], chat:[true,true], client_requests:[false,false], user_management:[false,false] },
    crew_member: { projects:[true,false], estimates:[false,false], invoices:[false,false], clients:[false,false], tasks:[true,true], materials:[false,false], expenses:[false,false], timecards:[true,true], time_off:[true,true], subcontractors:[false,false], reports:[false,false], phase_approvals:[false,false], chat:[true,true], client_requests:[false,false], user_management:[false,false] },
  };
  await ins('permission_settings', Object.entries(PERM).flatMap(([role, feats]) =>
    Object.entries(feats).map(([feature, [can_read, can_write]]) => ({ company_id: companyId, role, feature, can_read, can_write }))));

  // 5. Crew — user_profiles.user_id FKs to auth.users, so create real (email-confirmed, no email
  // sent) auth users for each.
  const crewDefs = [
    { first: 'Marcus', last: 'Bell', role: 'site_manager', label: 'Site Manager', wage: 38 },
    { first: 'Diego', last: 'Ramirez', role: 'crew_member', label: 'Carpenter', wage: 28 },
    { first: 'Tyler', last: 'Nguyen', role: 'crew_member', label: 'Carpenter', wage: 26 },
    { first: 'Sam', last: 'Whitfield', role: 'crew_member', label: 'Carpenter', wage: 24 },
  ];
  const crew = [];
  for (const c of crewDefs) {
    const email = `${c.first.toLowerCase()}@timberlinereno.com`;
    const { data: cu, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: `${c.first} ${c.last}` } });
    die(`crew user ${c.first}`, error);
    crew.push({ ...c, id: cu.user.id, email });
  }
  await ins('user_profiles', crew.map(c => ({
    user_id: c.id, company_id: companyId, role: c.role, role_label: c.label,
    email: c.email, first_name: c.first, last_name: c.last,
    full_name: `${c.first} ${c.last}`, is_active: true, pay_type: 'hourly', hourly_wage: c.wage,
  })));
  await ins('memberships', crew.map(c => ({ user_id: c.id, company_id: companyId, role: c.role })));
  await ins('pay_rates', crew.map(c => ({
    company_id: companyId, user_id: c.id, pay_type: 'hourly', amount: c.wage, rate_period: 'hour', effective_date: ymd(daysAgo(180)),
  })));

  // 6. Clients.
  const clients = [
    { id: randomUUID(), name: 'The Hendersons', contact_name: 'Beth Henderson', email: 'beth.h@example.com', phone: '(541) 555-0188', billing_address: '1420 Birchwood Ave', city: 'Bend', state: 'OR', zip: '97701', status: 'active' },
    { id: randomUUID(), name: 'Maple Grove HOA', contact_name: 'Robert Cole', email: 'rcole@maplegrove.example', phone: '(541) 555-0219', billing_address: '88 Summit Ridge', city: 'Bend', state: 'OR', zip: '97702', status: 'active' },
    { id: randomUUID(), name: 'Rachel Kim', contact_name: 'Rachel Kim', email: 'rachel.kim@example.com', phone: '(541) 555-0177', billing_address: '205 Cedar Court', city: 'Redmond', state: 'OR', zip: '97756', status: 'active' },
  ];
  await ins('clients', clients.map(c => ({ ...c, company_id: companyId })));

  // 7. Cost codes + catalog.
  await ins('cost_codes', [
    ['1001','Labor'],['2001','Materials'],['3001','Subcontractors'],['4001','Equipment'],['5001','Permits & Fees'],
  ].map(([code, name]) => ({ company_id: companyId, code, name, is_active: true })));
  await ins('catalog_items', [
    { name: 'Framing labor', unit: 'LF', unit_cost: 8.5, category: 'labor' },
    { name: 'Drywall install', unit: 'SF', unit_cost: 2.25, category: 'materials' },
    { name: 'Interior paint', unit: 'SF', unit_cost: 1.15, category: 'materials' },
    { name: 'Cabinet install', unit: 'EA', unit_cost: 145, category: 'labor' },
    { name: 'Tile flooring', unit: 'SF', unit_cost: 6.75, category: 'materials' },
    { name: 'Electrical rough-in', unit: 'EA', unit_cost: 210, category: 'subcontractor' },
  ].map(c => ({ ...c, company_id: companyId })));

  // 8. Projects.
  const P = {
    birch: randomUUID(), summit: randomUUID(), cedar: randomUUID(), lake: randomUUID(),
  };
  await ins('projects', [
    { id: P.birch, company_id: companyId, name: '1420 Birchwood Ave', address: '1420 Birchwood Ave, Bend, OR 97701', client_name: 'The Hendersons', status: 'active', phase: 'Rough-in', start_date: ymd(daysAgo(24)), target_end_date: ymd(daysAgo(-18)), budget: 68500, invoice_prefix: '1420Birchwood', site_manager_id: crew[0].id, color: '#8a5a2b' },
    { id: P.summit, company_id: companyId, name: '88 Summit Ridge', address: '88 Summit Ridge, Bend, OR 97702', client_name: 'Maple Grove HOA', status: 'active', phase: 'Framing', start_date: ymd(daysAgo(12)), target_end_date: ymd(daysAgo(-40)), budget: 142000, invoice_prefix: '88Summit', site_manager_id: crew[0].id, color: '#3f6f52' },
    { id: P.cedar, company_id: companyId, name: '205 Cedar Court', address: '205 Cedar Court, Redmond, OR 97756', client_name: 'Rachel Kim', status: 'completed', phase: 'Complete', start_date: ymd(daysAgo(70)), target_end_date: ymd(daysAgo(10)), completed_date: ymd(daysAgo(8)), budget: 24800, invoice_prefix: '205Cedar', site_manager_id: crew[0].id, color: '#6b6862' },
    { id: P.lake, company_id: companyId, name: '12 Lakeview Dr', address: '12 Lakeview Dr, Bend, OR 97703', client_name: 'The Hendersons', status: 'planning', phase: 'Estimating', budget: 96000, invoice_prefix: '12Lakeview', color: '#4a6d8c' },
  ]);

  // 9. Estimate (detailed, sent) for Birchwood.
  const line = (desc, cat, code, qty, cost, markup, unit) => {
    const base = qty * cost; const lt = base * (1 + markup / 100);
    return { id: randomUUID(), description: desc, category: cat, cost_code: code, quantity: qty, unit_cost: cost, markup_pct: markup, unit, line_total: Math.round(lt * 100) / 100 };
  };
  const sections = [
    { id: randomUUID(), name: 'Demolition', line_items: [ line('Demo existing kitchen', 'labor', '1001', 24, 45, 10, 'HR'), line('Dumpster & haul-off', 'materials', '2001', 1, 650, 12, 'LS') ] },
    { id: randomUUID(), name: 'Framing & Drywall', line_items: [ line('Framing labor', 'labor', '1001', 180, 8.5, 15, 'LF'), line('Drywall install', 'materials', '2001', 640, 2.25, 12, 'SF') ] },
    { id: randomUUID(), name: 'Electrical', line_items: [ line('Electrical rough-in', 'subcontractor', '3001', 1, 3200, 10, 'LS') ] },
    { id: randomUUID(), name: 'Finishes', line_items: [ line('Cabinet install', 'labor', '1001', 14, 145, 15, 'EA'), line('Tile flooring', 'materials', '2001', 220, 6.75, 12, 'SF'), line('Interior paint', 'materials', '2001', 1200, 1.15, 15, 'SF') ] },
  ];
  const allLines = sections.flatMap(s => s.line_items);
  const subtotal = allLines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
  const withMarkup = allLines.reduce((s, l) => s + l.line_total, 0);
  const gc = Math.round(withMarkup * 0.13 * 100) / 100;
  const grand = Math.round((withMarkup + gc) * 100) / 100;
  const estId = randomUUID();
  await ins('estimates', {
    id: estId, company_id: companyId, title: 'Kitchen Remodel — Full Renovation', status: 'sent',
    client_id: clients[0].id, client_name: 'The Hendersons', client_email: clients[0].email,
    project_id: P.birch, project_name: '1420 Birchwood Ave', estimate_number: 'EST-0001',
    client_intro: 'Thank you for the opportunity to bid your kitchen remodel. Below is the detailed scope and pricing.',
    gc_fee_enabled: true, gc_fee_pct: 13, gc_fee_label: 'GC / Project Management Fee',
    sections, subtotal: Math.round(subtotal * 100) / 100, total_markup: Math.round((withMarkup - subtotal) * 100) / 100, grand_total: grand,
  });
  // A second estimate in draft.
  await ins('estimates', {
    id: randomUUID(), company_id: companyId, title: 'Deck + Rear Addition', status: 'draft',
    client_id: clients[0].id, client_name: 'The Hendersons', project_id: P.lake, project_name: '12 Lakeview Dr',
    estimate_number: 'EST-0002', gc_fee_enabled: true, gc_fee_pct: 13, sections: [], grand_total: 0,
  });

  // 10. Invoices.
  const invLine = (name, qty, cost, code) => ({ id: randomUUID(), name, quantity: qty, unit_cost: cost, cost_code: code, category: 'labor', line_total: Math.round(qty * cost * 100) / 100 });
  const inv1Lines = [ invLine('Demolition & prep', 1, 1780, '1001'), invLine('Framing & drywall', 1, 4200, '2001'), invLine('Electrical rough-in', 1, 3520, '3001') ];
  const inv1Total = inv1Lines.reduce((s, l) => s + l.line_total, 0);
  await ins('invoices', {
    company_id: companyId, invoice_number: '1420Birchwood_001', client_id: clients[0].id, client_name: 'The Hendersons',
    project_id: P.birch, project_name: '1420 Birchwood Ave', status: 'sent', billing_mode: 'itemized',
    issue_date: ymd(daysAgo(6)), due_date: ymd(daysAgo(-9)), line_items: inv1Lines,
    subtotal: inv1Total, grand_total: inv1Total,
  });
  const inv2Lines = [ invLine('Bathroom remodel — labor', 1, 9800, '1001'), invLine('Materials & fixtures', 1, 6400, '2001') ];
  const inv2Total = inv2Lines.reduce((s, l) => s + l.line_total, 0);
  await ins('invoices', {
    company_id: companyId, invoice_number: '205Cedar_001', client_id: clients[2].id, client_name: 'Rachel Kim',
    project_id: P.cedar, project_name: '205 Cedar Court', status: 'paid', billing_mode: 'itemized',
    issue_date: ymd(daysAgo(20)), due_date: ymd(daysAgo(5)), line_items: inv2Lines,
    subtotal: inv2Total, grand_total: inv2Total,
  });

  // 11. Tasks.
  const task = (proj, title, status, priority, who) => ({ company_id: companyId, project_id: proj, title, status, priority, assigned_to: who });
  await ins('tasks', [
    task(P.birch, 'Set base cabinets', 'in_progress', 'high', 'Diego Ramirez'),
    task(P.birch, 'Rough-in kitchen electrical', 'completed', 'high', 'Marcus Bell'),
    task(P.birch, 'Order countertop template', 'pending', 'medium', 'Marcus Bell'),
    task(P.summit, 'Frame second-floor walls', 'in_progress', 'high', 'Tyler Nguyen'),
    task(P.summit, 'Window delivery walkthrough', 'pending', 'medium', 'Marcus Bell'),
    task(P.summit, 'Sheathing + house wrap', 'pending', 'low', 'Sam Whitfield'),
    task(P.lake, 'Site measure for addition', 'pending', 'medium', 'Marcus Bell'),
  ]);

  // 12. Timecards — crew on active projects, last 5 business days.
  const entries = [];
  for (let d = 1; d <= 7; d++) {
    const day = daysAgo(d);
    if (day.getDay() === 0 || day.getDay() === 6) continue; // skip weekends
    for (const [ci, proj, pname] of [[crew[1], P.birch, '1420 Birchwood Ave'], [crew[2], P.summit, '88 Summit Ridge'], [crew[3], P.summit, '88 Summit Ridge']]) {
      const start = new Date(day); start.setHours(7, 0, 0, 0);
      const end = new Date(day); end.setHours(15, 30, 0, 0);
      entries.push({
        company_id: companyId, user_id: ci.id, user_name: `${ci.first} ${ci.last}`, user_role: ci.role,
        project_id: proj, project_name: pname, clock_in: iso(start), clock_out: iso(end),
        duration_minutes: 510, date: ymd(day), location_verified: true, location_overridden: false, status: 'clocked_out',
      });
    }
  }
  await ins('time_entries', entries);

  // 13. Materials.
  await ins('materials', [
    { company_id: companyId, project_id: P.birch, name: 'Shaker cabinet set', quantity: 14, unit: 'EA', status: 'delivered', supplier: 'Cascade Cabinetry', estimated_cost: 6800, priority: 'high' },
    { company_id: companyId, project_id: P.birch, name: 'Quartz countertop', quantity: 42, unit: 'SF', status: 'needed', supplier: 'Stoneworks', estimated_cost: 2900, priority: 'high' },
    { company_id: companyId, project_id: P.summit, name: '2x6 framing lumber', quantity: 320, unit: 'EA', status: 'delivered', supplier: 'Bend Lumber Co', estimated_cost: 3100, priority: 'medium' },
    { company_id: companyId, project_id: P.summit, name: 'House wrap', quantity: 6, unit: 'ROLL', status: 'in_cart', supplier: 'Bend Lumber Co', estimated_cost: 540, priority: 'low' },
  ]);

  // 14. Crew schedule — this week.
  const sched = [];
  for (let d = 0; d < 5; d++) {
    const day = daysAgo(-d); if (day.getDay() === 0 || day.getDay() === 6) continue;
    sched.push({ company_id: companyId, user_id: crew[1].id, user_name: 'Diego Ramirez', user_role: 'crew_member', project_id: P.birch, scheduled_date: ymd(day) });
    sched.push({ company_id: companyId, user_id: crew[2].id, user_name: 'Tyler Nguyen', user_role: 'crew_member', project_id: P.summit, scheduled_date: ymd(day) });
    sched.push({ company_id: companyId, user_id: crew[3].id, user_name: 'Sam Whitfield', user_role: 'crew_member', project_id: P.summit, scheduled_date: ymd(day) });
  }
  await ins('crew_schedule_entries', sched);

  console.log(`\nDONE. "${NAME}" seeded (Pro). Impersonate it from the admin portal → "Log in as owner" to screenshot.`);
})();
