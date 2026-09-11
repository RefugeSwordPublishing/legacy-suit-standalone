-- ============================================================================
-- Migration 002: Role vocabulary alignment
-- Project: GuildWright (eojpqciokqpmzyneqzmm)
--
-- WHY: the existing app reads roles as owner/admin/coo/site_manager/crew_member/
-- employee/client. Migration 001 used a cleaner 4-role set. Rather than rewrite
-- role checks across the whole app, GuildWright adopts the app's vocabulary.
-- memberships.role stays the authority for RLS; user_profiles.role (migration 003)
-- is the app-facing copy, kept in sync by user-management writes.
--
-- is_company_admin  -> owner/admin/coo   (manage company + settings; matches isHighRole)
-- is_company_manager-> + site_manager    (approve timecards, manual clock-in, manage crew)
-- ============================================================================

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('owner','admin','coo','site_manager','crew_member','employee','client'));

create or replace function public.is_company_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('owner','admin','coo'), false);
$$;

create or replace function public.is_company_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('owner','admin','coo','site_manager'), false);
$$;

revoke execute on function public.is_company_manager() from public, anon;
grant  execute on function public.is_company_manager() to authenticated;
