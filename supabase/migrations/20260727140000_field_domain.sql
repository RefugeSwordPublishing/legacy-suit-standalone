-- ============================================================================
-- Migration 003: Field-tier domain schema (tenant-aware)
-- Project: GuildWright (eojpqciokqpmzyneqzmm)
--
-- The tables the login -> dashboard -> timecards -> clock flow uses, recreated
-- with tenancy baked in. Every table carries:
--   company_id uuid not null default public.auth_company_id()
-- so an authenticated insert auto-scopes to the caller's tenant (the JWT carries
-- auth.uid(); the default resolves the company). Column defaults are applied
-- before the RLS WITH CHECK, so the check always sees the scoped company_id.
-- NOTE: in the SQL editor there is no auth.uid(), so the default is NULL there;
-- any seed/provisioning insert run in the editor must set company_id explicitly.
--
-- RLS shape:
--   projects/cost_codes : all members read; managers write
--   time_entries/adjust : crew see + touch their own; managers see + manage all
--   user_profiles       : self + managers read (protects hourly_wage); admins write
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_profiles : per-tenant profile + app-facing role copy
-- ----------------------------------------------------------------------------
create table if not exists public.user_profiles (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  user_id              uuid references auth.users(id) on delete set null,
  role                 text not null default 'crew_member',
  first_name           text,
  last_name            text,
  email                text,
  hourly_wage          numeric,
  assigned_project_ids text[] not null default '{}',
  is_active            boolean not null default true,
  notify_task_assigned boolean not null default false,
  client_id            uuid,
  theme                text default 'light',
  created_at           timestamptz not null default now(),
  constraint user_profiles_role_check
    check (role in ('owner','admin','coo','site_manager','crew_member','employee','client'))
);
create index if not exists user_profiles_company_idx on public.user_profiles (company_id);
create unique index if not exists user_profiles_user_uidx on public.user_profiles (user_id);

-- ----------------------------------------------------------------------------
-- projects
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  name                  text not null,
  address               text,
  client_name           text,
  status                text not null default 'planning'
    constraint projects_status_check check (status in ('planning','active','on_hold','completed')),
  phase                 text,
  phase_since           date,
  start_date            date,
  target_end_date       date,
  duration_value        numeric,
  duration_unit         text default 'days',
  budget                numeric,
  budget_hours          numeric,
  notes                 text,
  site_manager_id       uuid,
  color                 text default '#3B82F6',
  quickbooks_project_id text,
  created_at            timestamptz not null default now()
);
create index if not exists projects_company_idx on public.projects (company_id);

-- ----------------------------------------------------------------------------
-- time_entries
-- ----------------------------------------------------------------------------
create table if not exists public.time_entries (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  user_id             uuid not null,
  user_name           text,
  user_role           text,
  project_id          uuid references public.projects(id) on delete set null,
  project_name        text,
  clock_in            timestamptz not null,
  clock_out           timestamptz,
  break_start         timestamptz,
  break_end           timestamptz,
  duration_minutes    numeric,
  date                date not null,
  clock_in_lat        numeric,
  clock_in_lng        numeric,
  location_verified   boolean not null default false,
  location_overridden boolean not null default false,
  manually_clocked_by text,
  status              text not null default 'clocked_in'
    constraint time_entries_status_check check (status in ('clocked_in','on_break','clocked_out')),
  notes               text,
  created_at          timestamptz not null default now()
);
create index if not exists time_entries_company_idx on public.time_entries (company_id);
create index if not exists time_entries_user_date_idx on public.time_entries (user_id, date);

-- ----------------------------------------------------------------------------
-- timecard_adjustments
-- ----------------------------------------------------------------------------
create table if not exists public.timecard_adjustments (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  time_entry_id       uuid references public.time_entries(id) on delete cascade,
  user_id             uuid not null,
  user_name           text,
  project_id          uuid,
  project_name        text,
  date                date,
  original_clock_in   timestamptz,
  original_clock_out  timestamptz,
  requested_clock_in  timestamptz,
  requested_clock_out timestamptz,
  reason              text,
  status              text not null default 'pending'
    constraint timecard_adjustments_status_check check (status in ('pending','approved','declined')),
  reviewed_by         text,
  review_notes        text,
  created_at          timestamptz not null default now()
);
create index if not exists timecard_adjustments_company_idx on public.timecard_adjustments (company_id);

-- ----------------------------------------------------------------------------
-- cost_codes
-- ----------------------------------------------------------------------------
create table if not exists public.cost_codes (
  id                           uuid primary key default gen_random_uuid(),
  company_id                   uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  code                         text not null,
  name                         text not null,
  description                  text,
  category                     text,
  is_active                    boolean not null default true,
  quickbooks_item_id           text,
  quickbooks_item_name         text,
  quickbooks_income_account_id text,
  quickbooks_income_account_name text,
  created_at                   timestamptz not null default now()
);
create index if not exists cost_codes_company_idx on public.cost_codes (company_id);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.user_profiles        enable row level security;
alter table public.projects             enable row level security;
alter table public.time_entries         enable row level security;
alter table public.timecard_adjustments enable row level security;
alter table public.cost_codes           enable row level security;

-- user_profiles: self + managers read; admins write.
create policy user_profiles_select on public.user_profiles
  for select to authenticated
  using (company_id = (select public.auth_company_id())
         and (user_id = (select auth.uid()) or (select public.is_company_manager())));
create policy user_profiles_insert on public.user_profiles
  for insert to authenticated
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));
create policy user_profiles_update on public.user_profiles
  for update to authenticated
  using      ((select public.is_company_admin()) and company_id = (select public.auth_company_id()))
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));
create policy user_profiles_delete on public.user_profiles
  for delete to authenticated
  using ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));

-- projects: all members read; managers write.
create policy projects_select on public.projects
  for select to authenticated
  using (company_id = (select public.auth_company_id()));
create policy projects_write on public.projects
  for all to authenticated
  using      ((select public.is_company_manager()) and company_id = (select public.auth_company_id()))
  with check ((select public.is_company_manager()) and company_id = (select public.auth_company_id()));

-- time_entries: crew see + touch their own; managers see + manage all.
create policy time_entries_select on public.time_entries
  for select to authenticated
  using (company_id = (select public.auth_company_id())
         and (user_id = (select auth.uid()) or (select public.is_company_manager())));
create policy time_entries_insert on public.time_entries
  for insert to authenticated
  with check (company_id = (select public.auth_company_id())
              and (user_id = (select auth.uid()) or (select public.is_company_manager())));
create policy time_entries_update on public.time_entries
  for update to authenticated
  using (company_id = (select public.auth_company_id())
         and (user_id = (select auth.uid()) or (select public.is_company_manager())))
  with check (company_id = (select public.auth_company_id())
              and (user_id = (select auth.uid()) or (select public.is_company_manager())));
create policy time_entries_delete on public.time_entries
  for delete to authenticated
  using ((select public.is_company_manager()) and company_id = (select public.auth_company_id()));

-- timecard_adjustments: crew see + request their own; managers approve/decline.
create policy timecard_adjustments_select on public.timecard_adjustments
  for select to authenticated
  using (company_id = (select public.auth_company_id())
         and (user_id = (select auth.uid()) or (select public.is_company_manager())));
create policy timecard_adjustments_insert on public.timecard_adjustments
  for insert to authenticated
  with check (company_id = (select public.auth_company_id())
              and (user_id = (select auth.uid()) or (select public.is_company_manager())));
create policy timecard_adjustments_update on public.timecard_adjustments
  for update to authenticated
  using      ((select public.is_company_manager()) and company_id = (select public.auth_company_id()))
  with check ((select public.is_company_manager()) and company_id = (select public.auth_company_id()));
create policy timecard_adjustments_delete on public.timecard_adjustments
  for delete to authenticated
  using ((select public.is_company_manager()) and company_id = (select public.auth_company_id()));

-- cost_codes: all members read; managers write.
create policy cost_codes_select on public.cost_codes
  for select to authenticated
  using (company_id = (select public.auth_company_id()));
create policy cost_codes_write on public.cost_codes
  for all to authenticated
  using      ((select public.is_company_manager()) and company_id = (select public.auth_company_id()))
  with check ((select public.is_company_manager()) and company_id = (select public.auth_company_id()));
