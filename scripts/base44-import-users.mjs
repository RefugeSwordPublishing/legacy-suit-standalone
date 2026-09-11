// Second pass: provision the Base44 crew as GuildWright accounts, then import the
// user-linked data (timecards, schedules, notifications, chat) remapped to them.
// Usage: node scripts/base44-import-users.mjs
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { readFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';

const creds = readFileSync('C:/Dev/RefugeAndSword/_company/credentials.yaml', 'utf8');
const pick = (re) => creds.match(re)[1].trim();
const dbPassword = pick(/guildwright:[\s\S]*?db_password:\s*'?([^'\n]+?)'?\s*\n/);
const serviceKey = pick(/guildwright:[\s\S]*?service_role_key:\s*['"]?([^\s'"]+)/);

const URL = 'https://eojpqciokqpmzyneqzmm.supabase.co';
const TENANT0 = '2b659a9d-64b9-4afb-97fc-0cdb3936f8d3';
const DUSTIN_BASE44_EMAIL = 'simplyflippin@gmail.com';
const DUSTIN_UID = 'd9d7b4f1-b312-434e-9382-3ef8bdc0780a';

const admin = createClient(URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const pg = new Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: 'postgres.eojpqciokqpmzyneqzmm', password: dbPassword, database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await pg.connect();

const isObjId = (v) => typeof v === 'string' && /^[0-9a-f]{24}$/.test(v);
const toUuid = (v) => { if (!isObjId(v)) return null; const h = v + '00000000'; return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`; };

async function findUserByEmail(email) {
  for (let page = 1; page <= 5; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const u = data?.users?.find(x => (x.email || '').toLowerCase() === email.toLowerCase());
    if (u) return u.id;
    if (!data?.users?.length || data.users.length < 200) break;
  }
  return null;
}

// ---- 1. Provision users, build map base44_user_id -> guildwright uid ----
const profiles = JSON.parse(readFileSync('base44-export/UserProfile.json', 'utf8'));
const userMap = {};
for (const p of profiles) {
  const email = p.email;
  let uid;
  if (email === DUSTIN_BASE44_EMAIL) {
    uid = DUSTIN_UID; // existing owner
    await pg.query(`update public.user_profiles set first_name=$2, last_name=$3, full_name=$4 where user_id=$1`,
      [uid, p.first_name || 'Dustin', p.last_name || 'Stomboly', p.full_name || 'Dustin Stomboly']);
    console.log(`Dustin -> existing owner ${uid}`);
  } else {
    const pw = randomBytes(12).toString('base64') + 'Aa1!';
    const { data, error } = await admin.auth.admin.createUser({
      email, password: pw, email_confirm: true,
      user_metadata: { full_name: [p.first_name, p.last_name].filter(Boolean).join(' ') },
    });
    if (error) {
      uid = await findUserByEmail(email);
      console.log(`${email}: exists -> ${uid}`);
    } else {
      uid = data.user.id;
      console.log(`${email}: created -> ${uid} (role ${p.role})`);
    }
    if (uid) {
      await pg.query(`insert into public.memberships (user_id, company_id, role) values ($1,$2,$3)
                      on conflict (user_id, company_id) do nothing`, [uid, TENANT0, p.role]);
      await pg.query(
        `insert into public.user_profiles (id, company_id, user_id, role, first_name, last_name, full_name, email, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true) on conflict (user_id) do nothing`,
        [toUuid(p.id), TENANT0, uid, p.role, p.first_name || null, p.last_name || null,
         p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' '), email]);
    }
  }
  if (uid && p.user_id) userMap[p.user_id] = uid;
}

// ---- 2. Import user-linked tables, remapping user fields ----
const FK_FIELDS = new Set(['client_id','project_id','estimate_id','bid_request_id','bid_submission_id','sub_contractor_id','cost_code_id','task_id','time_entry_id','schedule_entry_id']);
const FK_TO_TABLE = { project_id:'projects', task_id:'tasks', time_entry_id:'time_entries', schedule_entry_id:'crew_schedule_entries', client_id:'clients' };
const USER_FIELDS = new Set(['user_id', 'sender_id']);
const ID_ARRAY_FIELDS = new Set(['task_ids', 'sub_contractor_ids', 'imported_bid_ids', 'assigned_project_ids']);
const NULL_FIELDS = new Set(['site_manager_id']);

const PLAN = [
  ['TimeEntry','time_entries', true], ['TimecardAdjustment','timecard_adjustments', true],
  ['CrewScheduleEntry','crew_schedule_entries', false], ['DailyGoal','daily_goals', false],
  ['TimeOffRequest','time_off_requests', false], ['Notification','notifications', false],
  ['ChatMessage','chat_messages', false],
];

for (const [entity, table, userRequired] of PLAN) {
  const file = `base44-export/${entity}.json`;
  if (!existsSync(file)) { console.log(`${table}: (no file)`); continue; }
  const records = JSON.parse(readFileSync(file, 'utf8'));
  const cols = (await pg.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1`, [table])).rows;
  const colNames = cols.map(c => c.column_name);
  const typeOf = Object.fromEntries(cols.map(c => [c.column_name, c]));
  const parentSets = {};
  for (const c of colNames) if (FK_FIELDS.has(c) && FK_TO_TABLE[c]) {
    parentSets[c] = new Set((await pg.query(`select id::text from public.${FK_TO_TABLE[c]}`)).rows.map(x => x.id));
  }
  const text = `insert into public.${table} (${colNames.map(c=>`"${c}"`).join(',')}) values (${colNames.map((_,i)=>`$${i+1}`).join(',')}) on conflict (id) do nothing`;

  let ok = 0, skip = 0, fail = 0; const errs = new Set();
  for (const r of records) {
    if (userRequired && !userMap[r.user_id]) { skip++; continue; }
    const values = colNames.map(col => {
      if (col === 'company_id') return TENANT0;
      if (col === 'id') return toUuid(r.id);
      if (col === 'created_at') return r.created_date || null;
      if (USER_FIELDS.has(col)) return userMap[r[col]] || null;
      if (NULL_FIELDS.has(col)) return null;
      if (FK_FIELDS.has(col)) { const u = toUuid(r[col]); const pt = FK_TO_TABLE[col]; return (u && (!pt || parentSets[col]?.has(u))) ? u : null; }
      let v = r[col];
      if (v === undefined || v === '') v = null;
      if (ID_ARRAY_FIELDS.has(col) && Array.isArray(v)) return v.map(toUuid).filter(Boolean);
      if (v != null && typeOf[col].data_type === 'jsonb') return JSON.stringify(v);
      if (v != null && typeOf[col].data_type === 'ARRAY') return Array.isArray(v) ? v : [v];
      return v;
    });
    try { await pg.query(text, values); ok++; }
    catch (e) { fail++; errs.add(e.message.split('\n')[0]); }
  }
  console.log(`${table}: ${ok}/${records.length}` + (skip?` (${skip} skipped: unmapped user)`:'') + (fail?` (${fail} failed: ${[...errs][0]})`:''));
}

await pg.end();
console.log('\ndone.');
