-- Deleting a project was blocked: every child FK used NO ACTION, so a project with any task,
-- estimate, invoice, expense, daily goal, schedule entry, file, request, bid, or notification could
-- not be deleted (the delete threw a FK violation, which the UI swallowed -> project stayed).
-- Repoint the FKs: operational data CASCADEs with the project; financial + record tables SET NULL
-- so they survive as standalone records. time_entries already SET NULL.

-- CASCADE: operational data that belongs to the project and should go with it.
alter table public.tasks drop constraint tasks_project_id_fkey;
alter table public.tasks add constraint tasks_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.project_files drop constraint project_files_project_id_fkey;
alter table public.project_files add constraint project_files_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.materials drop constraint materials_project_id_fkey;
alter table public.materials add constraint materials_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.crew_schedule_entries drop constraint crew_schedule_entries_project_id_fkey;
alter table public.crew_schedule_entries add constraint crew_schedule_entries_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.daily_goals drop constraint daily_goals_project_id_fkey;
alter table public.daily_goals add constraint daily_goals_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.phase_approval_requests drop constraint phase_approval_requests_project_id_fkey;
alter table public.phase_approval_requests add constraint phase_approval_requests_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

alter table public.client_requests drop constraint client_requests_project_id_fkey;
alter table public.client_requests add constraint client_requests_project_id_fkey foreign key (project_id) references public.projects(id) on delete cascade;

-- SET NULL: financial + records survive the project delete (unlinked, not destroyed).
alter table public.estimates drop constraint estimates_project_id_fkey;
alter table public.estimates add constraint estimates_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null;

alter table public.invoices drop constraint invoices_project_id_fkey;
alter table public.invoices add constraint invoices_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null;

alter table public.expenses drop constraint expenses_project_id_fkey;
alter table public.expenses add constraint expenses_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null;

alter table public.client_change_orders drop constraint client_change_orders_project_id_fkey;
alter table public.client_change_orders add constraint client_change_orders_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null;

alter table public.bid_requests drop constraint bid_requests_project_id_fkey;
alter table public.bid_requests add constraint bid_requests_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null;

alter table public.notifications drop constraint notifications_project_id_fkey;
alter table public.notifications add constraint notifications_project_id_fkey foreign key (project_id) references public.projects(id) on delete set null;
