// Pay-rate helpers. A pay rate is effective-dated; the rate in force on a date is the
// most recent row whose effective_date <= that date. Amount + rate_period cover hourly and
// salaried (weekly / monthly / yearly) pay. Reports normalize to monthly or hourly as needed.

export const RATE_PERIODS = [
  { value: 'hour', label: 'per hour', salary: false },
  { value: 'week', label: 'per week', salary: true },
  { value: 'month', label: 'per month', salary: true },
  { value: 'year', label: 'per year', salary: true },
];

export const SALARY_PERIODS = RATE_PERIODS.filter(p => p.salary);
export const periodLabel = (v) => RATE_PERIODS.find(p => p.value === v)?.label || v;

// Monthly-equivalent dollars for a salaried rate. Hourly returns 0 (not a fixed overhead).
export function monthlyAmount(rate) {
  if (!rate || !rate.amount) return 0;
  switch (rate.rate_period) {
    case 'week': return (rate.amount * 52) / 12;
    case 'month': return rate.amount;
    case 'year': return rate.amount / 12;
    default: return 0;
  }
}

// Hourly dollars for an hourly rate; 0 for salaried.
export function hourlyAmount(rate) {
  if (!rate || rate.rate_period !== 'hour') return 0;
  return rate.amount || 0;
}

const byEffectiveDesc = (a, b) => (a.effective_date < b.effective_date ? 1 : a.effective_date > b.effective_date ? -1 : 0);

// The rate effective on/before a YYYY-MM-DD date string (or null).
export function rateOnDate(rates, dateStr) {
  if (!rates || !rates.length || !dateStr) return null;
  const applicable = rates.filter(r => r.effective_date && r.effective_date <= dateStr).sort(byEffectiveDesc);
  return applicable[0] || null;
}

// The rate effective during a YYYY-MM month (evaluated at month end).
export function rateForMonth(rates, monthKey) {
  return rateOnDate(rates, `${monthKey}-31`);
}

// Build a user_id -> sorted-rate-list map. Users with no history are seeded from their
// profile (legacy hourly_wage / annual_salary) with a far-past effective date so they always apply.
export function ratesByUser(userProfiles = [], payRates = []) {
  const map = {};
  payRates.forEach(r => { (map[r.user_id] ||= []).push(r); });
  Object.values(map).forEach(list => list.sort(byEffectiveDesc));
  userProfiles.forEach(u => {
    if (!map[u.user_id]) {
      const seed = u.pay_type === 'salary'
        ? { pay_type: 'salary', amount: u.annual_salary || 0, rate_period: 'year' }
        : { pay_type: 'hourly', amount: u.hourly_wage || 0, rate_period: 'hour' };
      map[u.user_id] = [{ ...seed, effective_date: '1900-01-01' }];
    }
  });
  return map;
}
