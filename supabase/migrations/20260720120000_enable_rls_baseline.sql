-- ============================================================================
-- Migration: Enable Row Level Security baseline (Phase 1)
-- Project: legacy-suit-standalone  (Supabase project zbruglzbapkuvrmvyzgz)
-- Author:  Claude (audit remediation) -- 2026-07-20
--
-- WHY: The Supabase Advisor reported ~27 CRITICAL "RLS Disabled in Public"
-- findings. With RLS off, the public anon key (shipped in the browser bundle)
-- is a full read/write master key to every table. This migration flips the
-- database from "open to the world" to "authenticated internal staff only".
--
-- This version is idempotent and converges to the correct state regardless of
-- any partial/leftover state. It also:
--   * drops the pre-existing Base44 leftover policies on user_profiles and
--     qbo_integration_settings (qbo_admin_only / authenticated_write /
--     authenticated_read), which were more permissive than intended and
--     collided with the policies below.
--   * wraps auth/helper calls in (select ...) so they run once per query, not
--     per row (clears the "Auth RLS Initialization Plan" advisor warning).
--   * avoids overlapping FOR ALL + FOR SELECT policies on the same table
--     (clears the "Multiple Permissive Policies" advisor warning).
--
-- SCOPE (Phase 1): internal staff full R/W on operational tables; client role
-- and anon denied; sensitive tables restricted. Per-role least privilege and
-- client-portal row scoping are Phase 2 (see supabase/README.md).
--
-- Run in the Supabase SQL Editor (executes as postgres, the table owner).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Role helper functions
--    SECURITY DEFINER so they read user_profiles as the table owner and thus
--    bypass RLS on user_profiles (prevents infinite recursion in policies).
-- ----------------------------------------------------------------------------

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.user_profiles
  where user_id::text = (select auth.uid())::text
  limit 1;
$$;

create or replace function public.is_internal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_app_role() in
      ('owner','admin','coo','site_manager','crew_member','employee'),
    false
  );
$$;

create or replace function public.is_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_app_role() in ('owner','admin','coo'),
    false
  );
$$;

-- Only signed-in users need these; keep anon/public out (they are SECURITY
-- DEFINER, so restrict execution to the authenticated role explicitly).
revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_internal()      from public, anon;
revoke execute on function public.is_management()     from public, anon;
grant  execute on function public.current_app_role() to authenticated;
grant  execute on function public.is_internal()      to authenticated;
grant  execute on function public.is_management()     to authenticated;

-- ----------------------------------------------------------------------------
-- 1b. Drop pre-existing Base44 leftover policies (safe if they don't exist).
-- ----------------------------------------------------------------------------

drop policy if exists qbo_admin_only    on public.qbo_integration_settings;
drop policy if exists authenticated_write on public.user_profiles;
drop policy if exists authenticated_read  on public.user_profiles;

-- ----------------------------------------------------------------------------
-- 2. Enable RLS on every public base table, and apply the "internal staff full
--    access" policy to all NON-sensitive tables. Sensitive tables get explicit
--    policies in section 3.
-- ----------------------------------------------------------------------------

do $$
declare
  r record;
  sensitive text[] := array[
    'user_profiles',
    'permission_settings',
    'qbo_integration_settings',
    'notifications'
  ];
  skip text[] := array['spatial_ref_sys','schema_migrations'];
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename <> all(skip)
      and tablename not like 'pg\_%'
  loop
    begin
      execute format('alter table public.%I enable row level security', r.tablename);
    exception when others then
      raise notice 'Skipping enable RLS on %: %', r.tablename, sqlerrm;
      continue;
    end;

    if r.tablename <> all(sensitive) then
      execute format('drop policy if exists internal_all on public.%I', r.tablename);
      execute format(
        $p$create policy internal_all on public.%I
             for all
             to authenticated
             using ((select public.is_internal()))
             with check ((select public.is_internal()))$p$,
        r.tablename
      );
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Sensitive tables -- explicit policies (one policy per command, so nothing
--    overlaps; all auth/helper calls wrapped in (select ...)).
-- ----------------------------------------------------------------------------

-- user_profiles: internal staff read all; a user may read their own row.
-- Writes management-only. (Invites must run server-side with the service_role
-- key, which bypasses RLS; do NOT call inviteUserByEmail from the browser.)
drop policy if exists up_select on public.user_profiles;
create policy up_select on public.user_profiles
  for select to authenticated
  using ((select public.is_internal()) or user_id::text = (select auth.uid())::text);

drop policy if exists up_insert on public.user_profiles;
create policy up_insert on public.user_profiles
  for insert to authenticated
  with check ((select public.is_management()));

drop policy if exists up_update on public.user_profiles;
create policy up_update on public.user_profiles
  for update to authenticated
  using ((select public.is_management()))
  with check ((select public.is_management()));

drop policy if exists up_delete on public.user_profiles;
create policy up_delete on public.user_profiles
  for delete to authenticated
  using ((select public.is_management()));

-- permission_settings: readable by internal staff; writable by management only.
-- Split into per-command policies so the write policy does not overlap select.
drop policy if exists ps_select on public.permission_settings;
create policy ps_select on public.permission_settings
  for select to authenticated
  using ((select public.is_internal()));

drop policy if exists ps_write on public.permission_settings;  -- old FOR ALL name
drop policy if exists ps_insert on public.permission_settings;
create policy ps_insert on public.permission_settings
  for insert to authenticated
  with check ((select public.is_management()));

drop policy if exists ps_update on public.permission_settings;
create policy ps_update on public.permission_settings
  for update to authenticated
  using ((select public.is_management()))
  with check ((select public.is_management()));

drop policy if exists ps_delete on public.permission_settings;
create policy ps_delete on public.permission_settings
  for delete to authenticated
  using ((select public.is_management()));

-- qbo_integration_settings: holds OAuth tokens. Management only, all commands.
-- Single FOR ALL policy, no other policy on the table -> no overlap.
drop policy if exists qbo_all on public.qbo_integration_settings;
create policy qbo_all on public.qbo_integration_settings
  for all to authenticated
  using ((select public.is_management()))
  with check ((select public.is_management()));

-- notifications: a user sees/mutates only their own; any internal actor may
-- create a notification addressed to another user.
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select to authenticated
  using (user_id::text = (select auth.uid())::text or (select public.is_management()));

drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications
  for insert to authenticated
  with check ((select public.is_internal()));

drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications
  for update to authenticated
  using (user_id::text = (select auth.uid())::text or (select public.is_management()))
  with check (user_id::text = (select auth.uid())::text or (select public.is_management()));

drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications
  for delete to authenticated
  using (user_id::text = (select auth.uid())::text or (select public.is_management()));

-- ----------------------------------------------------------------------------
-- 4. Post-apply verification (run manually; both should return zero rows)
-- ----------------------------------------------------------------------------
-- (A) Any public base table still WITHOUT RLS:
--   select tablename from pg_tables t
--   where schemaname='public' and not rowsecurity
--     and tablename <> all(array['spatial_ref_sys','schema_migrations'])
--     and tablename not like 'pg\_%';
--
-- (B) Any table with RLS on but NO policy (locked out -- expected only for
--     tables you have not built features for yet):
--   select t.tablename from pg_tables t
--   left join pg_policies p
--     on p.schemaname=t.schemaname and p.tablename=t.tablename
--   where t.schemaname='public' and t.rowsecurity and p.policyname is null;

-- ============================================================================
-- ROLLBACK (paste into the SQL editor to undo this migration)
-- NOTE: disabling RLS does NOT drop policies, and the policies below depend on
-- the helper functions -- so the functions must be dropped with CASCADE (which
-- also removes every policy that references them). Drop functions first.
-- WARNING: this returns every table to world-readable/writable. Break-glass only.
-- ============================================================================
-- drop function if exists public.is_management()    cascade;
-- drop function if exists public.is_internal()      cascade;
-- drop function if exists public.current_app_role() cascade;
--
-- do $$
-- declare r record;
-- begin
--   for r in select tablename from pg_tables where schemaname='public' loop
--     begin execute format('alter table public.%I disable row level security', r.tablename);
--     exception when others then null; end;
--   end loop;
-- end $$;
-- ============================================================================
