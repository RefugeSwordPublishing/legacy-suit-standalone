-- Crew schedule assignments had the same double-submit issue as timecard adjustments: handleAddProject
-- guards against an existing entry by reading the query cache, but a rapid re-pick fires the second
-- create before the cache refetches, so a duplicate assignment slips through. A user can't meaningfully
-- be assigned the same project on the same day twice, so enforce that in the DB.

-- 1) Collapse existing duplicate assignments, keeping the earliest row of each set.
delete from public.crew_schedule_entries a
using public.crew_schedule_entries b
where a.ctid > b.ctid
  and a.user_id = b.user_id
  and a.scheduled_date = b.scheduled_date
  and a.project_id is not distinct from b.project_id;

-- 2) One assignment per user + day + project.
create unique index if not exists crew_schedule_entries_user_day_project_uniq
  on public.crew_schedule_entries (user_id, scheduled_date, project_id);
