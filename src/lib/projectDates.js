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

// Plan moving crew schedule entries by n weekdays. entries = every entry on the project, each
// { id, user_id, date } with date as yyyy-MM-dd; movable = the ids allowed to move (upcoming ones).
//
// One person has at most one entry per project per day, and a weekday shift is not one-to-one: a
// Saturday, a Sunday and the Friday before can all land on the same Monday. So one entry per person
// per target day moves, preferring one that started on a weekday, and an entry whose target is held
// by one that is staying (a past day, say) stays too. Repeats until nothing changes, because an
// entry that stays can block another. Returns moves in a safe order (latest first when moving
// later, earliest first when moving earlier) and the ids left where they were.
export function planCrewShift(entries, movable, n) {
  const key = (u, d) => `${u}|${d}`;
  const weekend = (d) => isWeekend(parseISO(d));
  const plan = entries.filter((e) => movable.has(e.id)).map((e) => ({ ...e, to: shiftWeekdays(e.date, n) }));
  const stay = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    const occupied = new Set(entries.filter((e) => !movable.has(e.id) || stay.has(e.id)).map((e) => key(e.user_id, e.date)));
    const claimed = new Set();
    const candidates = plan.filter((p) => !stay.has(p.id)).sort((a, b) => weekend(a.date) - weekend(b.date));
    for (const p of candidates) {
      const k = key(p.user_id, p.to);
      if (occupied.has(k) || claimed.has(k)) { stay.add(p.id); changed = true; break; }
      claimed.add(k);
    }
  }
  const moves = plan
    .filter((p) => !stay.has(p.id))
    .sort((a, b) => (n > 0 ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))
    .map((p) => ({ id: p.id, from: p.date, to: p.to }));
  return { moves, stay: [...stay] };
}

export const formatShortDate = (ymd) =>
  ymd ? parseISO(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
