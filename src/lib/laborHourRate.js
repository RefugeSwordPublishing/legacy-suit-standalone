import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/api/base44Client';

// The labor hour rate set in Estimate Settings. It converts labor dollars to hours: an estimate's
// labor total becomes a project's budget hours, and a subcontractor payment becomes the crew hours
// that sub took off the job.
//
// Stored on company_settings so every device and office user reads the same number. It used to
// live in each browser's localStorage; that value is still read as a fallback until an admin saves
// the rate once, so nobody's number silently resets.
const LEGACY_KEY = 'estimateLaborHourRate';
export const DEFAULT_LABOR_HOUR_RATE = 40;

function legacyRate() {
  try {
    const n = Number(localStorage.getItem(LEGACY_KEY));
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function fetchLaborHourRate() {
  try {
    const { data } = await supabase.from('company_settings').select('labor_hour_rate').maybeSingle();
    const n = Number(data?.labor_hour_rate);
    if (n > 0) return n;
  } catch { /* fall through */ }
  return legacyRate() ?? DEFAULT_LABOR_HOUR_RATE;
}

export function useLaborHourRate() {
  const [rate, setRate] = useState(() => legacyRate() ?? DEFAULT_LABOR_HOUR_RATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLaborHourRate().then((n) => { if (!cancelled) { setRate(n); setReady(true); } });
    return () => { cancelled = true; };
  }, []);

  // Company admins only (company_settings update policy). Returns an error message or null.
  const save = useCallback(async (value) => {
    const n = Number(value);
    if (!(n > 0)) return 'Enter a rate above zero.';
    const { data: row } = await supabase.from('company_settings').select('company_id').maybeSingle();
    if (!row?.company_id) return 'Company settings not found.';
    const { data, error } = await supabase.from('company_settings')
      .update({ labor_hour_rate: n }).eq('company_id', row.company_id).select('labor_hour_rate');
    if (error) return error.message;
    if (!data?.length) return 'Only a company admin can change the labor hour rate.';
    setRate(n);
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked */ }
    return null;
  }, []);

  return { rate, ready, save };
}
