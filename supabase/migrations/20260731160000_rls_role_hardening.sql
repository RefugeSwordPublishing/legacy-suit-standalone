-- Phase 2 RLS hardening. Until now every authenticated user in a tenant could read/write every
-- table in that tenant (permissions were UI-only). This adds role awareness at the database:
--   * the CLIENT role is scoped to only their assigned projects (projects, tasks, client_requests)
--     and is blocked entirely from financial/internal tables;
--   * expense edits/deletes are limited to managers.
-- Clients reach estimates/change orders through the existing SECURITY DEFINER public RPCs, not
-- these tables, so excluding them here does not affect the signing flow. A client must be assigned
-- the project (user_profiles.assigned_project_ids) to see it — the old client_name auto-match only
-- ever affected the UI, never DB access.

-- ---- Role helpers (SECURITY DEFINER so they bypass RLS on user_profiles, no recursion) ----
create or replace function public.auth_company_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.user_profiles where user_id = auth.uid() limit 1;
$$;
revoke execute on function public.auth_company_role() from public, anon;
grant execute on function public.auth_company_role() to authenticated;

create or replace function public.auth_assigned_project_ids()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(assigned_project_ids, '{}') from public.user_profiles where user_id = auth.uid() limit 1;
$$;
revoke execute on function public.auth_assigned_project_ids() from public, anon;
grant execute on function public.auth_assigned_project_ids() to authenticated;

-- ---- Sensitive/internal tables: staff only, no client access (replace sole tenant_all) ----
do $$
declare t text;
  staff_tables text[] := array[
    'estimates','estimate_templates','invoices','clients','catalog_items',
    'bid_requests','bid_submissions','client_change_orders','sub_change_orders','sub_contractors',
    'chat_messages','crew_schedule_entries','daily_goals','time_off_requests',
    'phase_approval_requests','project_files','materials','task_templates'
  ];
begin
  foreach t in array staff_tables loop
    execute format('drop policy if exists tenant_all on public.%I', t);
    execute format(
      $p$create policy tenant_staff on public.%I for all to authenticated
           using (company_id = (select public.auth_company_id()) and coalesce(public.auth_company_role(),'') <> 'client')
           with check (company_id = (select public.auth_company_id()) and coalesce(public.auth_company_role(),'') <> 'client')$p$, t);
  end loop;
end $$;

-- ---- projects: clients see only their assigned projects (keep manager-write) ----
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (company_id = (select public.auth_company_id())
         and (coalesce(public.auth_company_role(),'') <> 'client'
              or id::text = any(public.auth_assigned_project_ids())));

-- ---- tasks: clients read only their projects' tasks; only staff write ----
drop policy if exists tenant_all on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using (company_id = (select public.auth_company_id())
         and (coalesce(public.auth_company_role(),'') <> 'client'
              or project_id::text = any(public.auth_assigned_project_ids())));
create policy tasks_write on public.tasks for all to authenticated
  using (company_id = (select public.auth_company_id()) and coalesce(public.auth_company_role(),'') <> 'client')
  with check (company_id = (select public.auth_company_id()) and coalesce(public.auth_company_role(),'') <> 'client');

-- ---- client_requests: clients scoped to their projects; staff action; admins delete ----
drop policy if exists tenant_all on public.client_requests;
create policy cr_select on public.client_requests for select to authenticated
  using (company_id = (select public.auth_company_id())
         and (coalesce(public.auth_company_role(),'') <> 'client'
              or project_id::text = any(public.auth_assigned_project_ids())));
create policy cr_insert on public.client_requests for insert to authenticated
  with check (company_id = (select public.auth_company_id())
              and (coalesce(public.auth_company_role(),'') <> 'client'
                   or project_id::text = any(public.auth_assigned_project_ids())));
create policy cr_update on public.client_requests for update to authenticated
  using (company_id = (select public.auth_company_id()) and coalesce(public.auth_company_role(),'') <> 'client')
  with check (company_id = (select public.auth_company_id()) and coalesce(public.auth_company_role(),'') <> 'client');
create policy cr_delete on public.client_requests for delete to authenticated
  using (company_id = (select public.auth_company_id()) and (select public.is_company_admin()));

-- ---- expenses: non-client read/create; manager-only edit/delete ----
drop policy if exists tenant_all on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using (company_id = (select public.auth_company_id()) and coalesce(public.auth_company_role(),'') <> 'client');
create policy expenses_new on public.expenses for insert to authenticated
  with check (company_id = (select public.auth_company_id()) and coalesce(public.auth_company_role(),'') <> 'client');
create policy expenses_edit on public.expenses for update to authenticated
  using (company_id = (select public.auth_company_id()) and (select public.is_company_manager()))
  with check (company_id = (select public.auth_company_id()) and (select public.is_company_manager()));
create policy expenses_remove on public.expenses for delete to authenticated
  using (company_id = (select public.auth_company_id()) and (select public.is_company_manager()));
