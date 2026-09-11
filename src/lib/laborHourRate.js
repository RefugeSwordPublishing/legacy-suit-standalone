// The labor hour rate set in Estimate Settings. It converts labor dollars to hours: an estimate's
// labor total becomes a project's budget hours, and a subcontractor payment becomes the crew hours
// that sub took off the job. Stored per browser, so a device that never opened Estimate Settings
// reads the default.
export const LABOR_HOUR_RATE_KEY = 'estimateLaborHourRate';
export const DEFAULT_LABOR_HOUR_RATE = 40;

export function readLaborHourRate() {
  try {
    const n = Number(localStorage.getItem(LABOR_HOUR_RATE_KEY));
    return n > 0 ? n : DEFAULT_LABOR_HOUR_RATE;
  } catch {
    return DEFAULT_LABOR_HOUR_RATE;
  }
}

export function saveLaborHourRate(rate) {
  try { localStorage.setItem(LABOR_HOUR_RATE_KEY, String(rate)); } catch { /* storage blocked */ }
}
