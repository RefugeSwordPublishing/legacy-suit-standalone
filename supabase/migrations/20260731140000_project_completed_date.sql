-- Records when a project is marked completed, so the Schedule report can measure actual finish
-- against the planned end. Stamped by trigger on any write path (form edit, sync, API), and
-- cleared if a project is reopened. Existing completed projects are backfilled to their last
-- known activity (latest time entry) or target end date.

alter table public.projects add column if not exists completed_date date;

create or replace function public.stamp_project_completed()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed'
     and new.completed_date is null
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_date := current_date;
  elsif new.status <> 'completed' then
    new.completed_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_stamp_completed on public.projects;
create trigger projects_stamp_completed
  before insert or update on public.projects
  for each row execute function public.stamp_project_completed();

-- Backfill existing completed projects (best-effort finish date).
update public.projects p
set completed_date = coalesce(
  (select max(t.date) from public.time_entries t where t.project_id = p.id),
  p.target_end_date,
  (p.created_at)::date
)
where p.status = 'completed' and p.completed_date is null;
