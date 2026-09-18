-- Timecard adjustment requests were arriving 5-12 times per submission: the dialog closed only
-- after the insert resolved, so rapid mobile taps each fired a full create. The client now guards
-- against that, but add a DB-level backstop so no code path can create duplicate pending requests.

-- 1) Collapse existing duplicate groups, keeping the earliest row of each identical set.
delete from public.timecard_adjustments a
using public.timecard_adjustments b
where a.ctid > b.ctid
  and a.time_entry_id = b.time_entry_id
  and a.status = b.status
  and a.requested_clock_in is not distinct from b.requested_clock_in
  and a.requested_clock_out is not distinct from b.requested_clock_out;

-- 2) Block a second *pending* request for the same entry + requested times. A later resubmission
--    after a decline is still allowed (that older row is no longer 'pending').
create unique index if not exists timecard_adjustments_pending_uniq
  on public.timecard_adjustments (time_entry_id, requested_clock_in, requested_clock_out)
  where status = 'pending';
