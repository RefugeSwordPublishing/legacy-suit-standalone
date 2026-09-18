-- Tasks can now be assigned to MULTIPLE people. Add an assignees array; keep the legacy single
-- assigned_to in sync (= first assignee) for older readers. Backfill existing single assignments.
alter table public.tasks add column if not exists assignees text[];

update public.tasks
   set assignees = array[assigned_to]
 where (assignees is null or cardinality(assignees) = 0)
   and assigned_to is not null and assigned_to <> '' and assigned_to <> 'unassigned';
