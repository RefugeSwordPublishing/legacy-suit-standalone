-- Make the Permissions matrix real: RLS enforces permission_settings for site_manager and
-- crew_member on the sensitive tables. Owner/admin/coo are always full (never lockable out;
-- they can always fix the matrix). Defaults are seeded so behavior only changes on a toggle.

-- ---- permission helper: does the caller's role have read/write on a feature? ----
create or replace function public.auth_can(p_feature text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_role text; v_company uuid; v_read boolean; v_write boolean;
begin
  select role, company_id into v_role, v_company from public.user_profiles where user_id = auth.uid() limit 1;
  if v_role is null then return false; end if;
  if v_role in ('owner','admin','coo') then return true; end if;
  select can_read, can_write into v_read, v_write
    from public.permission_settings
    where company_id = v_company and role = v_role and feature = p_feature limit 1;
  if not found then return false; end if;
  return case when p_write then coalesce(v_write, false) else coalesce(v_read, false) end;
end $$;
revoke execute on function public.auth_can(text, boolean) from public, anon;
grant  execute on function public.auth_can(text, boolean) to authenticated;

-- ---- seed current defaults for every company (site_manager + crew_member) ----
insert into public.permission_settings (company_id, role, feature, can_read, can_write)
select c.id, d.role, d.feature, d.can_read, d.can_write
from public.companies c
cross join (values
  ('site_manager','projects',true,true),   ('site_manager','estimates',false,false),
  ('site_manager','invoices',false,false), ('site_manager','clients',true,false),
  ('site_manager','tasks',true,true),      ('site_manager','materials',true,true),
  ('site_manager','expenses',false,false), ('site_manager','timecards',true,true),
  ('site_manager','time_off',true,false),  ('site_manager','subcontractors',false,false),
  ('site_manager','reports',false,false),  ('site_manager','phase_approvals',true,true),
  ('site_manager','chat',true,true),       ('site_manager','client_requests',false,false),
  ('site_manager','user_management',false,false),
  ('crew_member','projects',true,false),   ('crew_member','estimates',false,false),
  ('crew_member','invoices',false,false),  ('crew_member','clients',false,false),
  ('crew_member','tasks',true,true),       ('crew_member','materials',false,false),
  ('crew_member','expenses',false,false),  ('crew_member','timecards',true,true),
  ('crew_member','time_off',true,true),    ('crew_member','subcontractors',false,false),
  ('crew_member','reports',false,false),   ('crew_member','phase_approvals',false,false),
  ('crew_member','chat',true,true),        ('crew_member','client_requests',false,false),
  ('crew_member','user_management',false,false)
) as d(role, feature, can_read, can_write)
where not exists (
  select 1 from public.permission_settings ps
  where ps.company_id = c.id and ps.role = d.role and ps.feature = d.feature
);

-- ---- drop prior policies on the sensitive tables ----
drop policy if exists tenant_admin on public.estimates;
drop policy if exists tenant_admin on public.estimate_templates;
drop policy if exists tenant_admin on public.catalog_items;
drop policy if exists tenant_admin on public.client_change_orders;
drop policy if exists tenant_admin on public.invoices;
drop policy if exists tenant_admin on public.clients;
drop policy if exists tenant_admin on public.sub_contractors;
drop policy if exists tenant_admin on public.bid_requests;
drop policy if exists tenant_admin on public.bid_submissions;
drop policy if exists tenant_admin on public.sub_change_orders;
drop policy if exists expenses_read   on public.expenses;
drop policy if exists expenses_new    on public.expenses;
drop policy if exists expenses_edit   on public.expenses;
drop policy if exists expenses_remove on public.expenses;

-- ---- feature: estimates (estimates, estimate_templates, catalog_items, client_change_orders) ----
create policy estimates_sel on public.estimates for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', false));
create policy estimates_ins on public.estimates for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));
create policy estimates_upd on public.estimates for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));
create policy estimates_del on public.estimates for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));

create policy estimate_templates_sel on public.estimate_templates for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', false));
create policy estimate_templates_ins on public.estimate_templates for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));
create policy estimate_templates_upd on public.estimate_templates for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));
create policy estimate_templates_del on public.estimate_templates for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));

create policy catalog_items_sel on public.catalog_items for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', false));
create policy catalog_items_ins on public.catalog_items for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));
create policy catalog_items_upd on public.catalog_items for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));
create policy catalog_items_del on public.catalog_items for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));

create policy client_change_orders_sel on public.client_change_orders for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', false));
create policy client_change_orders_ins on public.client_change_orders for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));
create policy client_change_orders_upd on public.client_change_orders for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));
create policy client_change_orders_del on public.client_change_orders for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('estimates', true));

-- ---- feature: invoices ----
create policy invoices_sel on public.invoices for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('invoices', false));
create policy invoices_ins on public.invoices for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('invoices', true));
create policy invoices_upd on public.invoices for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('invoices', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('invoices', true));
create policy invoices_del on public.invoices for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('invoices', true));

-- ---- feature: clients ----
create policy clients_sel on public.clients for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('clients', false));
create policy clients_ins on public.clients for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('clients', true));
create policy clients_upd on public.clients for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('clients', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('clients', true));
create policy clients_del on public.clients for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('clients', true));

-- ---- feature: subcontractors (sub_contractors, bid_requests, bid_submissions, sub_change_orders) ----
create policy sub_contractors_sel on public.sub_contractors for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', false));
create policy sub_contractors_ins on public.sub_contractors for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));
create policy sub_contractors_upd on public.sub_contractors for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));
create policy sub_contractors_del on public.sub_contractors for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));

create policy bid_requests_sel on public.bid_requests for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', false));
create policy bid_requests_ins on public.bid_requests for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));
create policy bid_requests_upd on public.bid_requests for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));
create policy bid_requests_del on public.bid_requests for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));

create policy bid_submissions_sel on public.bid_submissions for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', false));
create policy bid_submissions_ins on public.bid_submissions for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));
create policy bid_submissions_upd on public.bid_submissions for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));
create policy bid_submissions_del on public.bid_submissions for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));

create policy sub_change_orders_sel on public.sub_change_orders for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', false));
create policy sub_change_orders_ins on public.sub_change_orders for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));
create policy sub_change_orders_upd on public.sub_change_orders for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));
create policy sub_change_orders_del on public.sub_change_orders for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('subcontractors', true));

-- ---- feature: expenses ----
create policy expenses_sel on public.expenses for select to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('expenses', false));
create policy expenses_ins on public.expenses for insert to authenticated with check (company_id = (select public.auth_company_id()) and public.auth_can('expenses', true));
create policy expenses_upd on public.expenses for update to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('expenses', true)) with check (company_id = (select public.auth_company_id()) and public.auth_can('expenses', true));
create policy expenses_del on public.expenses for delete to authenticated using (company_id = (select public.auth_company_id()) and public.auth_can('expenses', true));
