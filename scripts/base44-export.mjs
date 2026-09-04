// Exports all Base44 entity data to local JSON (one file per entity).
// Uses the Base44 REST API directly (the SDK hangs in Node; plain fetch works).
// Reads the Base44 access token from credentials.yaml (base44.access_token).
// Usage: node scripts/base44-export.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const creds = readFileSync('C:/Dev/RefugeAndSword/_company/credentials.yaml', 'utf8');
const tokenMatch = creds.match(/base44:[\s\S]*?access_token:\s*['"]?([^\s'"]+)/);
if (!tokenMatch) {
  console.error('No base44.access_token found in credentials.yaml');
  process.exit(1);
}
const token = tokenMatch[1].trim();
const APP_ID = '69d4420172cf85cc1afabd4c';
const BASE = `https://base44.app/api/apps/${APP_ID}/entities`;

const ENTITIES = [
  'Project', 'Client', 'Estimate', 'EstimateTemplate', 'ClientChangeOrder', 'ChangeOrder',
  'Invoice', 'Expense', 'Material', 'SubContractor', 'BidRequest', 'BidSubmission',
  'Task', 'TaskTemplate', 'CostCode', 'CatalogItem', 'ProjectFile', 'CrewScheduleEntry',
  'DailyGoal', 'TimeOffRequest', 'PhaseApprovalRequest', 'ClientRequest', 'Notification',
  'ChatMessage', 'TimeEntry', 'TimecardAdjustment', 'UserProfile',
];

mkdirSync('base44-export', { recursive: true });

for (const e of ENTITIES) {
  try {
    const res = await fetch(`${BASE}/${e}?limit=100000`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) { console.log(`${e}: HTTP ${res.status}`); continue; }
    const rows = await res.json();
    const arr = Array.isArray(rows) ? rows : (rows.items || rows.data || []);
    writeFileSync(`base44-export/${e}.json`, JSON.stringify(arr, null, 2));
    console.log(`${e}: ${arr.length}`);
  } catch (err) {
    console.log(`${e}: ERROR ${err?.message || err}`);
  }
}
console.log('done -> apps/guildwright/base44-export/');
