-- Archived: a project that is finished and closed out. Completed projects stay in the pickers
-- (expenses, bids, material requests, missed punches) because costs keep landing after the work
-- ends: a final supplier invoice, a warranty callback. Archiving is the step that says nothing more
-- will be charged to it, and takes it out of those pickers. Reports and history still include it.
alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check
  check (status in ('planning', 'active', 'on_hold', 'completed', 'archived'));
