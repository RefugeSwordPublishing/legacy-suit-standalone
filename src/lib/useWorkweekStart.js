import { useEffect, useState } from 'react';
import { supabase } from '@/api/base44Client';

// The day a tenant's workweek begins, 0 for Sunday through 6 for Saturday.
//
// One setting, read everywhere a week is drawn or totalled: the timecard week navigator, the Gusto
// hours export, and the overtime buckets on the payroll report. It used to be hardcoded to Monday
// on the Timecards page while the report honoured the setting, so a tenant on any other day got a
// Gusto CSV split on a boundary they never chose, with no sign anything was wrong.
//
// Defaults to Monday while loading. `ready` says whether the tenant's real value has arrived, so
// callers can realign a displayed week without fighting a user who has already navigated.
export function useWorkweekStart() {
  const [weekStartsOn, setWeekStartsOn] = useState(1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.from('company_settings').select('payroll_week_start').maybeSingle();
        if (cancelled) return;
        const v = Number(data?.payroll_week_start);
        if (Number.isInteger(v) && v >= 0 && v <= 6) setWeekStartsOn(v);
      } catch {
        /* keep the default; a payroll page should still render */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { weekStartsOn, ready };
}
