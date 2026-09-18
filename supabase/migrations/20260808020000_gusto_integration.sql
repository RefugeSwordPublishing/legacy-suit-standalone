-- Gusto payroll integration, per tenant. The first direct provider sync (past CSV export).
-- A tenant connects their Gusto company by OAuth, maps each worker to a Gusto employee, then pushes
-- computed regular/overtime hours onto an unprocessed Gusto payroll. Tokens live ~2h and the refresh
-- token rotates on every refresh (invalid after one use), so the new one must be stored each time.
-- Demo vs production host is driven by the GUSTO_ENV secret on the edge functions.

create table if not exists public.gusto_integration_settings (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null unique default public.auth_company_id() references public.companies(id) on delete cascade,
  access_token        text,
  refresh_token       text,
  token_expires_at    timestamptz,
  gusto_company_uuid  text,
  gusto_company_name  text,
  is_connected        boolean not null default false,
  auto_map            boolean not null default true,
  last_sync_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists gusto_settings_company_idx on public.gusto_integration_settings (company_id);
create index if not exists gusto_settings_gusto_company_idx on public.gusto_integration_settings (gusto_company_uuid);

alter table public.gusto_integration_settings enable row level security;

-- Admins of the owning tenant read and write their own row.
drop policy if exists gusto_admin on public.gusto_integration_settings;
create policy gusto_admin on public.gusto_integration_settings
  for all using (public.is_company_admin() and company_id = public.auth_company_id())
  with check (public.is_company_admin() and company_id = public.auth_company_id());

-- Pro-only, enforced at the row level like the other paid integrations.
drop policy if exists pro_only on public.gusto_integration_settings;
create policy pro_only on public.gusto_integration_settings
  as restrictive for all using (public.company_is_pro()) with check (public.company_is_pro());

-- The worker's Gusto employee id, set when mapping employees.
alter table public.user_profiles add column if not exists gusto_employee_uuid text;
