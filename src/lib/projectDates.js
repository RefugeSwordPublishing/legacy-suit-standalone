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

export const formatShortDate = (ymd) =>
  ymd ? parseISO(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
