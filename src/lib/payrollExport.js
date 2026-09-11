// Payroll export: turn clocked-out time entries into a payroll-ready CSV.
//
// Two shapes come out of here:
//   computePayroll(entries, opts) -> one row per employee with regular/overtime hours split
//   buildSummaryCsv(rows, opts)   -> that summary as CSV in a provider's column layout
//   buildDetailCsv(entries, opts) -> one row per entry, for records and generic import
//
// Overtime is split three ways: none (all regular), weekly_40 (over 40 in a workweek),
// or daily_8 (over 8 in a day). Providers compute pay themselves, so pay columns are
// generic-only and optional. duration_minutes already has break time subtracted.

import { parseISO, startOfWeek, format } from 'date-fns';

export const PAYROLL_PRESETS = [
  { key: 'generic', label: 'Generic', note: 'Employee, ID, hours, and optional pay. A safe default for any system.' },
  { key: 'gusto', label: 'Gusto', note: 'First and last name with regular and overtime hours. Gusto matches by name.' },
  { key: 'adp', label: 'ADP', note: 'File number (Employee ID) with regular and overtime hours.' },
  { key: 'paychex', label: 'Paychex', note: 'Employee ID and name with regular and overtime hours.' },
  { key: 'quickbooks', label: 'QuickBooks', note: 'Employee with regular and overtime hours for QuickBooks Payroll.' },
];

export const OVERTIME_MODES = [
  { key: 'weekly_40', label: 'Weekly over 40', note: 'Federal standard. Hours past 40 in a workweek are overtime.' },
  { key: 'daily_8', label: 'Daily over 8', note: 'Hours past 8 in a single day are overtime.' },
  { key: 'none', label: 'No overtime split', note: 'All hours reported as regular.' },
];

export const presetLabel = (key) => (PAYROLL_PRESETS.find(p => p.key === key)?.label) || 'Generic';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const minsToHours = (m) => round2((m || 0) / 60);

// One employee's regular / overtime split for the period.
export function computePayroll(entries, { overtimeMode = 'weekly_40', weekStart = 0 } = {}) {
  const byUser = new Map();
  for (const e of entries) {
    if (!byUser.has(e.user_id)) byUser.set(e.user_id, { userId: e.user_id, userName: e.user_name || '', entries: [] });
    byUser.get(e.user_id).entries.push(e);
  }

  const rows = [];
  for (const { userId, userName, entries: es } of byUser.values()) {
    let regularMin = 0;
    let otMin = 0;

    if (overtimeMode === 'daily_8') {
      const byDay = new Map();
      for (const e of es) byDay.set(e.date, (byDay.get(e.date) || 0) + (e.duration_minutes || 0));
      for (const dayMin of byDay.values()) {
        const cap = 8 * 60;
        regularMin += Math.min(dayMin, cap);
        otMin += Math.max(0, dayMin - cap);
      }
    } else if (overtimeMode === 'weekly_40') {
      const byWeek = new Map();
      for (const e of es) {
        const wk = format(startOfWeek(parseISO(e.date), { weekStartsOn: weekStart }), 'yyyy-MM-dd');
        byWeek.set(wk, (byWeek.get(wk) || 0) + (e.duration_minutes || 0));
      }
      for (const weekMin of byWeek.values()) {
        const cap = 40 * 60;
        regularMin += Math.min(weekMin, cap);
        otMin += Math.max(0, weekMin - cap);
      }
    } else {
      for (const e of es) regularMin += (e.duration_minutes || 0);
    }

    rows.push({
      userId,
      userName,
      regularHours: minsToHours(regularMin),
      overtimeHours: minsToHours(otMin),
      totalHours: minsToHours(regularMin + otMin),
    });
  }

  rows.sort((a, b) => a.userName.localeCompare(b.userName));
  return rows;
}

// RFC-4180-ish escaping: quote a field that holds a comma, quote, or newline.
function esc(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (rows) => rows.map(r => r.map(esc).join(',')).join('\r\n') + '\r\n';

function splitName(full) {
  const parts = (full || '').trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// Summary CSV, one row per employee, columns chosen by preset.
export function buildSummaryCsv(payrollRows, {
  preset = 'generic',
  includePay = false,
  profilesById = {},
  ratesByUser = {},
} = {}) {
  const idOf = (r) => profilesById[r.userId]?.payroll_id || '';
  const rateOf = (r) => Number(ratesByUser[r.userId] || 0);
  const grossOf = (r) => round2(r.regularHours * rateOf(r) + r.overtimeHours * rateOf(r) * 1.5);

  let header;
  let line;

  switch (preset) {
    case 'gusto':
      header = ['First Name', 'Last Name', 'Regular Hours', 'Overtime Hours'];
      line = (r) => { const n = splitName(r.userName); return [n.first, n.last, r.regularHours, r.overtimeHours]; };
      break;
    case 'adp':
      header = ['Employee ID', 'Employee Name', 'Regular Hours', 'Overtime Hours'];
      line = (r) => [idOf(r), r.userName, r.regularHours, r.overtimeHours];
      break;
    case 'paychex':
      header = ['Employee ID', 'Employee Name', 'Regular Hours', 'Overtime Hours'];
      line = (r) => [idOf(r), r.userName, r.regularHours, r.overtimeHours];
      break;
    case 'quickbooks':
      header = ['Employee', 'Regular Hours', 'Overtime Hours'];
      line = (r) => [r.userName, r.regularHours, r.overtimeHours];
      break;
    case 'generic':
    default:
      header = ['Employee', 'Employee ID', 'Regular Hours', 'Overtime Hours', 'Total Hours'];
      if (includePay) header = header.concat(['Hourly Rate', 'Gross Pay']);
      line = (r) => {
        const base = [r.userName, idOf(r), r.regularHours, r.overtimeHours, r.totalHours];
        return includePay ? base.concat([round2(rateOf(r)), grossOf(r)]) : base;
      };
      break;
  }

  return toCsv([header, ...payrollRows.map(line)]);
}

// Detailed CSV, one row per time entry, for records or a generic import.
export function buildDetailCsv(entries, { profilesById = {} } = {}) {
  const fmtTime = (iso) => {
    if (!iso) return '';
    try { return format(new Date(iso), 'yyyy-MM-dd HH:mm'); } catch { return ''; }
  };
  const breakMin = (e) => {
    if (!e.break_start || !e.break_end) return 0;
    return Math.max(0, Math.round((new Date(e.break_end) - new Date(e.break_start)) / 60000));
  };
  const header = ['Date', 'Employee', 'Employee ID', 'Project', 'Clock In', 'Clock Out', 'Break (min)', 'Hours', 'Location'];
  const sorted = [...entries].sort((a, b) => (a.date === b.date ? (a.user_name || '').localeCompare(b.user_name || '') : a.date.localeCompare(b.date)));
  const rows = sorted.map(e => [
    e.date,
    e.user_name || '',
    profilesById[e.user_id]?.payroll_id || '',
    e.project_name || '',
    fmtTime(e.clock_in),
    fmtTime(e.clock_out),
    breakMin(e),
    minsToHours(e.duration_minutes),
    e.location_verified ? 'Verified' : e.location_overridden ? 'Manual' : '',
  ]);
  return toCsv([header, ...rows]);
}

// Trigger a browser download of CSV text.
export function downloadCsv(filename, csv) {
  // Prepend a UTF-8 BOM so Excel opens accented names correctly.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
