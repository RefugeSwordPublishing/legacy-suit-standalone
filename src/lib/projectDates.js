import { addDays, format, isWeekend, parseISO } from 'date-fns';

// Add n weekdays (skipping Saturday and Sunday) to a date.
export function addWeekdays(start, n) {
  let date = new Date(start);
  let added = 0;
  while (added < n) {
    date = addDays(date, 1);
    if (!isWeekend(date)) added++;
  }
  return date;
}

// A project's end date from its start and timeframe. 'days' counts weekdays and 'weeks' calendar
// weeks, both inclusive of the start day. Returns yyyy-MM-dd, or '' when either input is missing.
export function calcEndDate(startDate, durationValue, durationUnit) {
  if (!startDate || !durationValue || durationValue <= 0) return '';
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  const end = durationUnit === 'weeks'
    ? addDays(start, durationValue * 7 - 1)
    : addWeekdays(start, durationValue - 1);
  // format() keeps the local calendar date; toISOString() would convert to UTC first.
  return format(end, 'yyyy-MM-dd');
}

// Signed count of weekdays from one date to another: moving Fri to the next Mon is 1, Mon to the
// previous Fri is -1. Used to reschedule a project by work days rather than calendar days.
export function weekdaysBetween(from, to) {
  const a = typeof from === 'string' ? parseISO(from) : from;
  const b = typeof to === 'string' ? parseISO(to) : to;
  const dir = b > a ? 1 : -1;
  let n = 0;
  for (let d = a; format(d, 'yyyy-MM-dd') !== format(b, 'yyyy-MM-dd'); ) {
    d = addDays(d, dir);
    // Count the weekday we land on going forward, or the one we leave going back.
    if (!isWeekend(dir > 0 ? d : addDays(d, 1))) n += dir;
  }
  return n;
}

// Move a yyyy-MM-dd date by n weekdays (negative moves back). Never lands on a weekend unless n is 0.
export function shiftWeekdays(ymd, n) {
  if (!ymd || !n) return ymd;
  const dir = n > 0 ? 1 : -1;
  let d = parseISO(ymd);
  let left = Math.abs(n);
  while (left > 0) {
    d = addDays(d, dir);
    if (!isWeekend(d)) left--;
  }
  return format(d, 'yyyy-MM-dd');
}

export const formatShortDate = (ymd) =>
  ymd ? parseISO(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
