// Enriches the Timberline demo tenant: adds project expenses (so job-costing margins look realistic)
// and a full current-week crew schedule (so the schedule board isn't empty). Idempotent-ish: it
// clears the demo's schedule + seeded expenses first, then re-seeds.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const creds = readFileSync('C:/Dev/RefugeAndSword/_company/credentials.yaml', 'utf8');
const SR = creds.match(/service_role_key:\s*([^\s\n]+)/)[1].trim();
const admin = createClient('https://eojpqciokqpmzyneqzmm.supabase.co', SR, { auth: { persistSession: false } });
const die = (l, e) => { if (e) { console.error('FAILED', l, e.message || e); process.exit(1); } };
const ymd = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

(async () => {
  const { data: co } = await admin.from('companies').select('id').eq('name', 'Timberline Renovations').maybeSingle();
  if (!co) { console.error('Timberline not found'); process.exit(1); }
  const companyId = co.id;

  const { data: projects } = await admin.from('projects').select('id, name').eq('company_id', companyId);
  const { data: crew } = await admin.from('user_profiles').select('user_id, full_name, role').eq('company_id', companyId);
  const P = Object.fromEntries((projects || []).map(p => [p.name, p.id]));
  const person = (name) => (crew || []).find(c => c.full_name === name);

  // ── Expenses ── realistic materials + subcontractor costs per project.
  await admin.from('expenses').delete().eq('company_id', companyId);
  const exp = (proj, category, vendor, amount, daysBack, desc) => ({
    company_id: companyId, project_id: P[proj], project_name: proj, expense_category: category,
    vendor, total_amount: amount, date: ymd(daysAgo(daysBack)), description: desc, billable: true, billed: false,
  });
  await admin.from('expenses').insert([
    // 205 Cedar Court (completed) - near-full actuals => healthy final margin.
    exp('205 Cedar Court', 'Materials', 'Stoneworks', 4800, 30, 'Tile & shower fixtures'),
    exp('205 Cedar Court', 'Materials', 'Cascade Supply', 5200, 26, 'Vanity, quartz top & glass'),
    exp('205 Cedar Court', 'Subcontractor', 'Ace Plumbing', 4000, 28, 'Bathroom plumbing'),
    exp('205 Cedar Court', 'Subcontractor', 'Precision Tile', 3500, 22, 'Tile setting'),
    // 1420 Birchwood (active, rough-in).
    exp('1420 Birchwood Ave', 'Materials', 'Bend Lumber Co', 3100, 12, 'Lumber & drywall'),
    exp('1420 Birchwood Ave', 'Materials', 'Cascade Cabinetry', 2000, 8, 'Cabinet deposit'),
    exp('1420 Birchwood Ave', 'Subcontractor', 'Volt Electric', 3200, 5, 'Electrical rough-in'),
    // 88 Summit Ridge (active, framing - early stage).
    exp('88 Summit Ridge', 'Materials', 'Bend Lumber Co', 8500, 9, 'Framing lumber package'),
    exp('88 Summit Ridge', 'Materials', 'ClearView Windows', 5500, 4, 'Window order deposit'),
    exp('88 Summit Ridge', 'Subcontractor', 'DigRight Excavation', 6000, 11, 'Site excavation & grading'),
  ].map(e => ({ ...e, id: randomUUID() })).map(({ id, ...e }) => ({ id, ...e })));
  console.log('expenses seeded');

  // ── Crew schedule ── fill Mon-Fri of the current week.
  await admin.from('crew_schedule_entries').delete().eq('company_id', companyId);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // this week's Monday
  const rows = [];
  const assign = (name, proj, dayOffset) => {
    const pr = person(name);
    const day = new Date(monday); day.setDate(monday.getDate() + dayOffset);
    if (pr && P[proj]) rows.push({
      company_id: companyId, user_id: pr.user_id, user_name: name, user_role: pr.role,
      project_id: P[proj], scheduled_date: ymd(day),
    });
  };
  for (let i = 0; i < 5; i++) {
    assign('Diego Ramirez', '1420 Birchwood Ave', i);
    assign('Tyler Nguyen', '88 Summit Ridge', i);
    assign('Sam Whitfield', '88 Summit Ridge', i);
    // Site manager splits time across both jobs.
    assign('Marcus Bell', i % 2 === 0 ? '1420 Birchwood Ave' : '88 Summit Ridge', i);
  }
  die('schedule', (await admin.from('crew_schedule_entries').insert(rows)).error);
  console.log(`schedule seeded (${rows.length} assignments across the week)`);
  console.log('DONE. Re-capture reports.png and schedule.png.');
})();
