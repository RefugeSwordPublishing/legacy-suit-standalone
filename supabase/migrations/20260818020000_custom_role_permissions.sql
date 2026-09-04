-- Per-custom-role permission sets. Until now permission_settings was keyed by BASE role, so two
-- custom roles on the same tier (e.g. "Job Foreman" and "Lead Carpenter", both Manager) were forced
-- to share one permission set. This lets each custom role carry its own overrides on top of its
-- tier's defaults, enforced by the same auth_can() every sensitive-table RLS policy already calls.

alter table public.user_profiles
  add column if not exists custom_role_id uuid references public.custom_roles(id) on delete set null;

alter table public.permission_settings
  add column if not exists custom_role_id uuid references public.custom_roles(id) on delete cascade;

-- At most one override row per (company, custom role, feature). Base-tier rows keep custom_role_id null.
create unique index if not exists permission_settings_custom_role_uq
  on public.permission_settings (company_id, custom_role_id, feature)
  where custom_role_id is not null;

-- Backfill: link existing users to the custom role matching their base_role + label, so their
-- assigned role's overrides apply going forward. Unmatched users keep custom_role_id null (base tier).
update public.user_profiles up
   set custom_role_id = cr.id
  from public.custom_roles cr
 where up.custom_role_id is null
   and cr.company_id = up.company_id
   and cr.base_role = up.role
   and cr.label = up.role_label;

-- auth_can now resolves: per-custom-role override -> base-tier default -> deny. Fully backward
-- compatible: a user with no custom_role_id (or a role with no override rows) resolves exactly as
-- before. Owner + admin remain always-full.
create or replace function public.auth_can(p_feature text, p_write boolean)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_role text; v_company uuid; v_crid uuid; v_read boolean; v_write boolean;
begin
  select role, company_id, custom_role_id into v_role, v_company, v_crid
    from public.user_profiles where user_id = auth.uid() limit 1;
  if v_role is null then return false; end if;
  if v_role in ('owner','admin') then return true; end if;
  -- 1) per-custom-role override, if this role has one for the feature
  if v_crid is not null then
    select can_read, can_write into v_read, v_write
      from public.permission_settings
      where company_id = v_company and custom_role_id = v_crid and feature = p_feature limit 1;
    if found then
      return case when p_write then coalesce(v_write, false) else coalesce(v_read, false) end;
    end if;
  end if;
  -- 2) base-tier default
  select can_read, can_write into v_read, v_write
    from public.permission_settings
    where company_id = v_company and role = v_role and custom_role_id is null and feature = p_feature limit 1;
  if not found then return false; end if;
  return case when p_write then coalesce(v_write, false) else coalesce(v_read, false) end;
end $function$;
