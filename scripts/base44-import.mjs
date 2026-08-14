// Loads exported Base44 JSON (apps/guildwright/base44-export/*.json) into GuildWright
// as tenant zero. Business records only; user/timecard data comes after crew provisioning.
//
// ID strategy: Base44 ids are 24-hex ObjectIds. We deterministically map each to a UUID
// (id + '00000000', formatted 8-4-4-4-12) and apply the SAME map to every foreign key,
// so relationships stay intact. created_date -> created_at. User-ref fields nulled.
//
// Usage: node scripts/base44-import.mjs
import { Client } from 'pg';
import { readFileSync, existsSync } from 'fs';

const creds = readFileSync('C:/Dev/RefugeAndSword/_company/credentials.yaml', 'utf8');
const password = creds.match(/guildwright:[\s\S]*?db_password:\s*'?([^'\n]+?)'?\s*\n/)[1].trim();
const TENANT0 = '2b659a9d-64b9-4afb-97fc-0cdb3936f8d3';

const FK_FIELDS = new Set([
  'client_id', 'project_id', 'estimate_id', 'bid_request_id', 'bid_submission_id',
  'sub_contractor_id', 'cost_code_id', 'task_id', 'time_entry_id', 'schedule_entry_id',
]);
const NULL_FIELDS = new Set(['site_manager_id', 'user_id', 'sender_id']); // user refs, resolve later
const FK_TO_TABLE = {
  client_id: 'clients', project_id: 'projects', estimate_id: 'estimates',
  bid_request_id: 'bid_requests', bid_submission_id: 'bid_submissions',
  sub_contractor_id: 'sub_contractors', cost_code_id: 'cost_codes', task_id: 'tasks',
};
const ID_ARRAY_FIELDS = new Set(['sub_contractor_ids', 'imported_bid_ids', 'assigned_project_ids', 'task_ids']);
const DROP_FIELDS = new Set(['updated_date', 'created_by', 'created_by_id', 'is_sample', 'created_date']);

// [Entity file, table] in FK-dependency order.
const PLAN = [
  ['Client', 'clients'], ['SubContractor', 'sub_contractors'], ['CostCode', 'cost_codes'],
  ['Project', 'projects'], ['CatalogItem', 'catalog_items'], ['Task', 'tasks'],
  ['Estimate', 'estimates'], ['EstimateTemplate', 'estimate_templates'], ['Invoice', 'invoices'],
  ['Expense', 'expenses'], ['ProjectFile', 'project_files'], ['TaskTemplate', 'task_templates'],
  ['BidRequest', 'bid_requests'], ['Material', 'materials'], ['ClientChangeOrder', 'client_change_orders'],
  ['BidSubmission', 'bid_submissions'], ['ChangeOrder', 'sub_change_orders'], ['ClientRequest', 'client_requests'],
];

const isObjId = (v) => typeof v === 'string' && /^[0-9a-f]{24}$/.test(v);
function toUuid(v) {
  if (!isObjId(v)) return null;
  const h = v + '00000000';
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const client = new Client({
  host: 'aws-1-us-west-2.pooler.supabase.com', port: 5432,
  user: 'postgres.eojpqciokqpmzyneqzmm', password, database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await client.connect();

async function columnsFor(table) {
  const { rows } = await client.query(
    `select column_name, data_type, udt_name from information_schema.columns
     where table_schema='public' and table_name=$1`, [table]);
  return rows; // [{column_name, data_type, udt_name}]
}

let grand = 0;
for (const [entity, table] of PLAN) {
  const file = `base44-export/${entity}.json`;
  if (!existsSync(file)) { console.log(`${table}: (no export file)`); continue; }
  const records = JSON.parse(readFileSync(file, 'utf8'));
  if (!records.length) { console.log(`${table}: 0`); continue; }

  const cols = await columnsFor(table);
  const colNames = cols.map(c => c.column_name);
  const typeOf = Object.fromEntries(cols.map(c => [c.column_name, c]));

  // Load valid parent ids so orphaned foreign keys can be nulled instead of failing.
  const parentSets = {};
  for (const c of colNames) {
    if (FK_FIELDS.has(c) && FK_TO_TABLE[c]) {
      const { rows } = await client.query(`select id::text from public.${FK_TO_TABLE[c]}`);
      parentSets[c] = new Set(rows.map(x => x.id));
    }
  }

  const placeholders = colNames.map((_, i) => `$${i + 1}`).join(', ');
  const text = `insert into public.${table} (${colNames.map(c => `"${c}"`).join(', ')})
                values (${placeholders}) on conflict (id) do nothing`;

  let ok = 0, fail = 0; const errs = new Set();
  for (const r of records) {
    const values = colNames.map(col => {
      if (col === 'company_id') return TENANT0;
      if (col === 'id') return toUuid(r.id);
      if (col === 'created_at') return r.created_date || null;
      if (NULL_FIELDS.has(col)) return null;
      if (FK_FIELDS.has(col)) {
        const u = toUuid(r[col]);
        const pt = FK_TO_TABLE[col];
        return (u && (!pt || parentSets[col]?.has(u))) ? u : null;
      }
      let v = r[col];
      if (v === undefined || v === '') v = null;
      if (ID_ARRAY_FIELDS.has(col) && Array.isArray(v)) return v.map(toUuid).filter(Boolean);
      const t = typeOf[col];
      if (v != null && t.data_type === 'jsonb') return JSON.stringify(v);
      if (v != null && t.data_type === 'ARRAY') return Array.isArray(v) ? v : [v];
      return v;
    });
    try { await client.query(text, values); ok++; }
    catch (e) { fail++; errs.add(e.message.split('\n')[0]); }
  }
  grand += ok;
  console.log(`${table}: ${ok}/${records.length}` + (fail ? ` (${fail} failed: ${[...errs].slice(0,2).join('; ')})` : ''));
}
console.log(`\nTOTAL imported: ${grand}`);
await client.end();
