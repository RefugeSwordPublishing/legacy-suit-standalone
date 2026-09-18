-- Make COO a configurable role in the permissions matrix. Previously auth_can() treated
-- owner/admin/coo as always-full. Now only owner + admin are always-full (top admins); COO goes
-- through permission_settings like site_manager/crew_member. COO defaults are seeded to full so
-- behavior is unchanged until a tenant restricts it.
create or replace function public.auth_can(p_feature text, p_write boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_role text; v_company uuid; v_read boolean; v_write boolean;
begin
  select role, company_id into v_role, v_company from public.user_profiles where user_id = auth.uid() limit 1;
  if v_role is null then return false; end if;
  if v_role in ('owner','admin') then return true; end if;  -- owner + admin always full
  select can_read, can_write into v_read, v_write
    from public.permission_settings
    where company_id = v_company and role = v_role and feature = p_feature limit 1;
  if not found then return false; end if;
  return case when p_write then coalesce(v_write, false) else coalesce(v_read, false) end;
end $$;

-- Seed COO = full on every feature for every company (unchanged behavior, now toggleable).
insert into public.permission_settings (company_id, role, feature, can_read, can_write)
select c.id, 'coo', f.feature, true, true
from public.companies c
cross join (values
  ('projects'),('estimates'),('invoices'),('clients'),('tasks'),('materials'),('expenses'),
  ('timecards'),('time_off'),('subcontractors'),('reports'),('phase_approvals'),('chat'),
  ('client_requests'),('user_management')
) as f(feature)
where not exists (
  select 1 from public.permission_settings ps
  where ps.company_id = c.id and ps.role = 'coo' and ps.feature = f.feature
);
