-- Error logs are for us (the platform), not tenants. Previously a tenant's own owner/admin/coo could
-- read their company's error_logs; restrict SELECT to platform admins so tenants never see them.
-- INSERT stays open to authenticated (the client logger keeps recording, company_id defaults in).
-- The admin portal reads these via the platform-admin edge function (service role, bypasses RLS).

create or replace function public.auth_is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from public.user_profiles where user_id = auth.uid() limit 1), false);
$$;
revoke execute on function public.auth_is_platform_admin() from public, anon;
grant  execute on function public.auth_is_platform_admin() to authenticated;

drop policy if exists error_logs_select on public.error_logs;
create policy error_logs_select on public.error_logs
  for select to authenticated
  using (public.auth_is_platform_admin());
