// Applies a .sql file to the GuildWright Supabase DB via the session pooler.
// Usage: node scripts/db-apply.mjs supabase/migrations/<file>.sql
//   or:  node scripts/db-apply.mjs -e "select 1"   (run inline SQL)
import { Client } from 'pg';
import { readFileSync } from 'fs';

const creds = readFileSync('C:/Dev/RefugeAndSword/_company/credentials.yaml', 'utf8');
const password = creds.match(/guildwright:[\s\S]*?db_password:\s*'?([^'\n]+?)'?\s*\n/)[1].trim();

const arg = process.argv[2];
const sql = arg === '-e' ? process.argv[3] : readFileSync(arg, 'utf8');

const client = new Client({
  host: 'aws-1-us-west-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.eojpqciokqpmzyneqzmm',
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const res = await client.query(sql);
  if (Array.isArray(res)) {
    const last = res[res.length - 1];
    if (last?.rows?.length) console.table(last.rows);
  } else if (res?.rows?.length) {
    console.table(res.rows);
  }
  console.log('OK', arg === '-e' ? '(inline)' : arg);
} catch (e) {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
