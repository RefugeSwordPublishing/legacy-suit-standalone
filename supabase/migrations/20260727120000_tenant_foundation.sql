-- ============================================================================
-- Migration 001: Multi-tenant foundation
-- Project: GuildWright  (Supabase project eojpqciokqpmzyneqzmm, Refuge & Sword)
-- Author:  Claude  2026-07-27
--
-- WHY: GuildWright is a multi-tenant product. Tenancy has to be in the schema
-- from the first migration, never retrofitted. This lays the tenant spine that
-- every domain table (migration 002+) hangs from:
--   * companies         one row per tenant, carries the billing plan
--   * company_settings   per-tenant preferences + branding
--   * memberships        which auth user belongs to which company, and their role
--   * auth_company_id()  the tenant of the current user (the isolation key)
--   * company_has()      entitlement gate (Field vs Pro), enforced server-side
--   * set_company_id()   trigger fn that auto-stamps company_id on domain inserts
--
-- Pattern reused from the Legacy RLS baseline:
--   * helper functions are SECURITY DEFINER so they read memberships as the table
--     owner and bypass RLS, which prevents infinite recursion in policies
--   * auth.uid() wrapped in (select ...) so it evaluates once per query, not per row
--   * EXECUTE revoked from anon/public, granted only to authenticated
--
-- Run in the Supabase SQL Editor (executes as postgres, the table owner).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tenant tables
-- ----------------------------------------------------------------------------

create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  plan       text not null default 'field',   -- 'field' | 'pro'  (entitlement level)
  created_at timestamptz not null default now(),
  constraint companies_plan_check check (plan in ('field','pro'))
);

-- Per-tenant preferences and branding. Basic branding (logo, colors) is allowed
-- on every tier; the gate on high-value features lives in company_has().
create table if not exists public.company_settings (
  company_id             uuid primary key references public.companies(id) on delete cascade,
  logo_url               text,
  brand_primary          text not null default '#30381E',
  brand_accent           text not null default '#C8974A',
  timezone               text not null default 'America/Chicago',
  breaks_enabled         boolean not null default true,
  auto_clockout_time     time   not null default '23:59',
  timecard_export_format text not null default 'csv',   -- 'csv' | 'sheets' | 'qbo'
  updated_at             timestamptz not null default now()
);

-- Membership: which user belongs to which company, and their role inside it.
-- v1 assumes one company per user; the composite PK keeps cross-company open
-- without a future migration (auth_company_id() would just take a selected one).
create table if not exists public.memberships (
  user_id    uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role       text not null default 'crew_member',  -- owner | admin | foreman | crew_member
  created_at timestamptz not null default now(),
  primary key (user_id, company_id),
  constraint memberships_role_check check (role in ('owner','admin','foreman','crew_member'))
);

create index if not exists memberships_company_idx on public.memberships (company_id);

-- ----------------------------------------------------------------------------
-- 2. Helper functions (SECURITY DEFINER, so they bypass RLS on memberships and
--    do not recurse when called from within a policy).
-- ----------------------------------------------------------------------------

-- The tenant of the current user. This is the isolation key every domain
-- policy compares against.
create or replace function public.auth_company_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select company_id from public.memberships
  where user_id = (select auth.uid())
  limit 1;
$$;

-- The role of the current user within their company.
create or replace function public.auth_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.memberships
  where user_id = (select auth.uid())
  limit 1;
$$;

-- Management inside the tenant: owner/admin manage the company; foreman and crew
-- do not. (Foreman-level grants are layered per-table in migration 002 where a
-- foreman needs to approve timecards but not change company settings.)
create or replace function public.is_company_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.auth_role() in ('owner','admin'), false);
$$;

-- Entitlement gate. Field plan gets the base feature set; Pro plan gets
-- everything. Call as company_has('estimates'), company_has('client_portal'),
-- etc. Enforced in RLS and edge functions, not just hidden in the UI.
create or replace function public.company_has(feature text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when (select plan from public.companies where id = public.auth_company_id()) = 'pro'
      then true
    else feature in ('timeclock','tasks','projects','crew','branding_basic')
  end;
$$;

-- Trigger function applied to domain tables in migration 002. Stamps
-- company_id = auth_company_id() on insert when the app did not set it, so
-- insert call sites do not each have to remember to pass company_id.
create or replace function public.set_company_id()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := public.auth_company_id();
  end if;
  return new;
end;
$$;

-- Only signed-in users may call these; they are SECURITY DEFINER, so keep
-- anon/public out explicitly.
revoke execute on function public.auth_company_id()    from public, anon;
revoke execute on function public.auth_role()          from public, anon;
revoke execute on function public.is_company_admin()   from public, anon;
revoke execute on function public.company_has(text)    from public, anon;
revoke execute on function public.set_company_id()     from public, anon;
grant  execute on function public.auth_company_id()    to authenticated;
grant  execute on function public.auth_role()          to authenticated;
grant  execute on function public.is_company_admin()   to authenticated;
grant  execute on function public.company_has(text)    to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Row Level Security on the foundation tables.
--    companies: read-only to members; writes (create tenant, change plan) are
--    service_role only, so a tenant admin cannot self-upgrade their own plan.
--    memberships + company_settings: readable by the tenant, writable by admins.
-- ----------------------------------------------------------------------------

alter table public.companies         enable row level security;
alter table public.company_settings  enable row level security;
alter table public.memberships       enable row level security;

-- companies: a member can see only their own company. No insert/update/delete
-- policy for authenticated, so those are denied by RLS and remain service_role
-- only (tenant provisioning and billing plan changes run server-side).
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated
  using (id = (select public.auth_company_id()));

-- memberships: members see their company roster; admins manage it, and only
-- within their own company (the with_check pins company_id to the caller's tenant).
drop policy if exists memberships_select on public.memberships;
create policy memberships_select on public.memberships
  for select to authenticated
  using (company_id = (select public.auth_company_id()));

drop policy if exists memberships_insert on public.memberships;
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));

drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships
  for update to authenticated
  using      ((select public.is_company_admin()) and company_id = (select public.auth_company_id()))
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));

drop policy if exists memberships_delete on public.memberships;
create policy memberships_delete on public.memberships
  for delete to authenticated
  using ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));

-- company_settings: readable by the tenant, writable by admins of that tenant.
drop policy if exists company_settings_select on public.company_settings;
create policy company_settings_select on public.company_settings
  for select to authenticated
  using (company_id = (select public.auth_company_id()));

drop policy if exists company_settings_insert on public.company_settings;
create policy company_settings_insert on public.company_settings
  for insert to authenticated
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));

drop policy if exists company_settings_update on public.company_settings;
create policy company_settings_update on public.company_settings
  for update to authenticated
  using      ((select public.is_company_admin()) and company_id = (select public.auth_company_id()))
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));

-- ----------------------------------------------------------------------------
-- 4. Provision tenant 0 (Legacy Renovations). Run AFTER Dustin signs up once,
--    so his auth user exists. Fill in the user id from auth.users, then run:
-- ----------------------------------------------------------------------------
-- with new_company as (
--   insert into public.companies (name, plan)
--   values ('Legacy Renovations', 'pro')
--   returning id
-- )
-- insert into public.memberships (user_id, company_id, role)
-- select '<DUSTIN_AUTH_USER_UUID>', id, 'owner' from new_company;
--
-- insert into public.company_settings (company_id)
-- select company_id from public.memberships
-- where user_id = '<DUSTIN_AUTH_USER_UUID>';

-- ----------------------------------------------------------------------------
-- 5. Post-apply verification (run manually)
-- ----------------------------------------------------------------------------
-- (A) Helpers exist and are locked to authenticated:
--   select proname from pg_proc where proname in
--     ('auth_company_id','auth_role','is_company_admin','company_has','set_company_id');
-- (B) RLS is on for all three foundation tables:
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in
--     ('companies','company_settings','memberships');

-- ============================================================================
-- ROLLBACK (break-glass; drops the foundation and everything depending on it)
-- ============================================================================
-- drop function if exists public.set_company_id()    cascade;
-- drop function if exists public.company_has(text)    cascade;
-- drop function if exists public.is_company_admin()   cascade;
-- drop function if exists public.auth_role()          cascade;
-- drop function if exists public.auth_company_id()    cascade;
-- drop table if exists public.memberships       cascade;
-- drop table if exists public.company_settings  cascade;
-- drop table if exists public.companies         cascade;
-- ============================================================================
