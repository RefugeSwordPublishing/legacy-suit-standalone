import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SPREADSHEET_ID = '1nhoVEUMilvwLdlcJd0kgrKd9HK9K4cWFkIsUNVikvGo';
const OVERTIME_THRESHOLD_HOURS = 40;
const OVERTIME_MULTIPLIER = 1.5;
const TZ = 'America/Chicago';

// --- Helpers ---

function getWeekRange(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  const day = date.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(date);
  mon.setDate(date.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { weekStart: mon, weekEnd: sun };
}

function fmtTabName(weekStart, weekEnd) {
  const pad = n => String(n).padStart(2, '0');
  const s = `${pad(weekStart.getMonth() + 1)}.${pad(weekStart.getDate())}`;
  const e = `${pad(weekEnd.getMonth() + 1)}.${pad(weekEnd.getDate())}`;
  return `${s}-${e}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

function fmtTime(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
}

function minutesToHHMM(mins) {
  if (!mins && mins !== 0) return '0:00';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

// --- Rebuild a week tab in the "Time Activity Report" format ---
async function rebuildWeekTab(accessToken, weekStart, weekEnd, weekEntries, profileMap) {
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const tabName = fmtTabName(weekStart, weekEnd);
  const dateRangeStr = `${fmtDate(weekStartStr)} - ${fmtDate(weekEndStr)}`;

  const metaRows = [
    ['', '', '', '', '', 'Time Activity Report', '', ''],
    ['Date Range:', dateRangeStr, '', '', '', '', '', ''],
    ['Project Status:', 'Active', '', '', '', '', '', ''],
    [],
    [],
  ];

  // Group entries by employee name (preserve insertion order for consistent ordering)
  const employeeMap = {};
  for (const e of weekEntries) {
    const name = e.user_name || e.user_id;
    if (!employeeMap[name]) employeeMap[name] = [];
    employeeMap[name].push(e);
  }

  const allRows = [...metaRows];
  let grandTotalMins = 0;
  let grandTotalPay = 0;

  for (const [empName, entries] of Object.entries(employeeMap)) {
    entries.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.clock_in || '') < (b.clock_in || '') ? -1 : 1;
    });

    const profile = profileMap[entries[0]?.user_id] || null;
    const hourlyWage = profile?.hourly_wage || 0;
    const hasWage = hourlyWage > 0;

    // Column headers, no Service Ticket # / Service Ticket / Task Notes
    const colHeaders = [
      'Timecard Date', 'Project', 'Cost Code', 'Start', 'Finish', 'Total Hours',
      ...(hasWage ? ['Wage Rate $', 'Total $'] : [])
    ];

    allRows.push([`Employee: ${empName}`]);
    allRows.push(colHeaders);

    let empTotalMins = 0;
    let empTotalPay = 0;
    let runningMins = 0;

    for (const entry of entries) {
      const entryMins = entry.duration_minutes || 0;
      const entryHours = entryMins / 60;
      const prevHours = runningMins / 60;

      let regularHours = entryHours;
      let overtimeHours = 0;

      if (prevHours >= OVERTIME_THRESHOLD_HOURS) {
        regularHours = 0;
        overtimeHours = entryHours;
      } else if (prevHours + entryHours > OVERTIME_THRESHOLD_HOURS) {
        regularHours = OVERTIME_THRESHOLD_HOURS - prevHours;
        overtimeHours = entryHours - regularHours;
      }

      const regularPay = regularHours * hourlyWage;
      const overtimePay = overtimeHours * hourlyWage * OVERTIME_MULTIPLIER;
      const entryTotalPay = regularPay + overtimePay;

      runningMins += entryMins;
      empTotalMins += entryMins;
      empTotalPay += entryTotalPay;

      const row = [
        fmtDate(entry.date),
        entry.project_name || '',
        'Standard Labor',
        fmtTime(entry.clock_in),
        fmtTime(entry.clock_out),
        minutesToHHMM(entryMins),
        ...(hasWage ? [hourlyWage, parseFloat(entryTotalPay.toFixed(4))] : [])
      ];
      allRows.push(row);
    }

    const totalRow = [
      'Total', '', '', '', '',
      minutesToHHMM(empTotalMins),
      ...(hasWage ? ['', parseFloat(empTotalPay.toFixed(4))] : [])
    ];
    allRows.push(totalRow);
    allRows.push([]);

    grandTotalMins += empTotalMins;
    grandTotalPay += empTotalPay;
  }

  allRows.push([]);
  allRows.push(['Total', '', '', '', '', minutesToHHMM(grandTotalMins), '', parseFloat(grandTotalPay.toFixed(4))]);

  return { tabName, allRows };
}

// --- Generate Gusto CSV for a given week ---
function buildGustoCsv(weekEntries, profileMap) {
  // Group by employee, accumulate regular + overtime hours
  const empMap = {};

  // First, sort all entries by date so OT is accumulated in order
  const sorted = [...weekEntries].sort((a, b) => a.date < b.date ? -1 : 1);

  for (const entry of sorted) {
    const uid = entry.user_id;
    if (!empMap[uid]) {
      const profile = profileMap[uid];
      const nameParts = (entry.user_name || '').split(' ');
      empMap[uid] = {
        last_name: profile?.last_name || nameParts.slice(1).join(' ') || '',
        first_name: profile?.first_name || nameParts[0] || '',
        runningMins: 0,
        regularMins: 0,
        overtimeMins: 0,
      };
    }

    const emp = empMap[uid];
    const entryMins = entry.duration_minutes || 0;
    const entryHours = entryMins / 60;
    const prevHours = emp.runningMins / 60;

    let regularHours = entryHours;
    let overtimeHours = 0;

    if (prevHours >= OVERTIME_THRESHOLD_HOURS) {
      regularHours = 0;
      overtimeHours = entryHours;
    } else if (prevHours + entryHours > OVERTIME_THRESHOLD_HOURS) {
      regularHours = OVERTIME_THRESHOLD_HOURS - prevHours;
      overtimeHours = entryHours - regularHours;
    }

    emp.runningMins += entryMins;
    emp.regularMins += Math.round(regularHours * 60 * 10000) / 10000;
    emp.overtimeMins += Math.round(overtimeHours * 60 * 10000) / 10000;
  }

  const header = 'last_name,first_name,ssn,title,regular_hours,overtime_hours,double_overtime_hours,bonus,commission,paycheck_tips,cash_tips,correction_payment,reimbursement,personal_note';

  const rows = Object.values(empMap).map(emp => {
    const regularHours = parseFloat((emp.regularMins / 60).toFixed(4)).toFixed(4);
    const overtimeHours = parseFloat((emp.overtimeMins / 60).toFixed(4)).toFixed(4);
    return `${emp.last_name},${emp.first_name},,,${regularHours},${overtimeHours},0,0,0,0,0,0,0,`;
  });

  return [header, ...rows].join('\n');
}

// --- Main handler ---
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    // MODE: Export Gusto CSV for a week
    if (payload.mode === 'gusto_csv') {
      const { weekStartStr, weekEndStr } = payload;
      if (!weekStartStr || !weekEndStr) {
        return Response.json({ error: 'weekStartStr and weekEndStr required' }, { status: 400 });
      }

      const allEntries = await base44.asServiceRole.entities.TimeEntry.filter({ status: 'clocked_out' });
      const allProfiles = await base44.asServiceRole.entities.UserProfile.list();
      const profileMap = Object.fromEntries(allProfiles.map(p => [p.user_id, p]));

      const crewMemberIds = new Set(allProfiles.filter(p => p.role === 'crew_member').map(p => p.user_id));
      const weekEntries = allEntries.filter(e => e.date >= weekStartStr && e.date <= weekEndStr && crewMemberIds.has(e.user_id));

      const csv = buildGustoCsv(weekEntries, profileMap);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="gusto_${weekStartStr}_${weekEndStr}.csv"`
        }
      });
    }

    // MODE: Sync timecard entry to Google Sheets (default)
    const entry = payload.data || payload.entry;
    if (!entry) {
      return Response.json({ error: 'No entry data provided' }, { status: 400 });
    }

    if (entry.status !== 'clocked_out' || !entry.clock_out) {
      return Response.json({ skipped: true, reason: 'Entry not yet clocked out' });
    }

    const { weekStart, weekEnd } = getWeekRange(entry.date);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const allEntries = await base44.asServiceRole.entities.TimeEntry.filter({ status: 'clocked_out' });
    const weekEntries = allEntries.filter(e => e.date >= weekStartStr && e.date <= weekEndStr);

    const allProfiles = await base44.asServiceRole.entities.UserProfile.list();
    const profileMap = Object.fromEntries(allProfiles.map(p => [p.user_id, p]));

    const { tabName, allRows } = await rebuildWeekTab(null, weekStart, weekEnd, weekEntries, profileMap);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');

    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const meta = await metaRes.json();
    const sheets = meta.sheets || [];
    const existingSheet = sheets.find(s => s.properties.title === tabName);

    if (!existingSheet) {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tabName } } }] })
      });
    } else {
      const sheetId = existingSheet.properties.sheetId;
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ updateCells: { range: { sheetId }, fields: 'userEnteredValue' } }]
        })
      });
    }

    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(tabName + '!A1')}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: allRows })
      }
    );

    if (!writeRes.ok) {
      const err = await writeRes.text();
      return Response.json({ error: 'Failed to write sheet', details: err }, { status: 500 });
    }

    return Response.json({
      success: true,
      tab: tabName,
      employee: entry.user_name || entry.user_id,
      date: entry.date,
      rowsWritten: allRows.length
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});