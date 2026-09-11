-- Notify the office when a client approves an estimate or change order. The sign_* RPCs run as the
-- anon client on the public link, so they insert notifications SECURITY DEFINER for the tenant's
-- management (owner/admin/coo). Inserting into notifications also fires the existing web-push trigger,
-- so the office gets a push the moment a client signs.

create or replace function public.sign_estimate(p_id uuid, p_signed_by text, p_signed_at timestamptz)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_company uuid; v_num text; v_project text; v_pid uuid;
  p record;
begin
  update public.estimates
    set signed_by = p_signed_by, signed_at = p_signed_at, status = 'approved'
    where id = p_id
    returning company_id, estimate_number, project_name, project_id into v_company, v_num, v_project, v_pid;
  if v_company is null then return; end if;
  for p in
    select user_id from public.user_profiles
    where company_id = v_company and role in ('owner','admin','coo') and user_id is not null
  loop
    insert into public.notifications (company_id, user_id, type, title, message, project_id, project_name, read)
    values (v_company, p.user_id, 'estimate_approved', 'Estimate approved',
      coalesce(nullif(p_signed_by,''),'A client') || ' approved estimate ' || coalesce(v_num,'') ||
        case when v_project is not null and v_project <> '' then ' for ' || v_project else '' end || '.',
      v_pid, v_project, false);
  end loop;
end; $$;

create or replace function public.sign_change_order(p_id uuid, p_signed_by text, p_signed_at timestamptz)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_company uuid; v_num text; v_project text; v_pid uuid;
  p record;
begin
  update public.client_change_orders
    set signed_by = p_signed_by, signed_at = p_signed_at, status = 'approved'
    where id = p_id
    returning company_id, change_order_number, project_name, project_id into v_company, v_num, v_project, v_pid;
  if v_company is null then return; end if;
  for p in
    select user_id from public.user_profiles
    where company_id = v_company and role in ('owner','admin','coo') and user_id is not null
  loop
    insert into public.notifications (company_id, user_id, type, title, message, project_id, project_name, read)
    values (v_company, p.user_id, 'change_order_approved', 'Change order approved',
      coalesce(nullif(p_signed_by,''),'A client') || ' approved change order ' || coalesce(v_num,'') ||
        case when v_project is not null and v_project <> '' then ' for ' || v_project else '' end || '.',
      v_pid, v_project, false);
  end loop;
end; $$;

-- create or replace preserves the existing anon/authenticated grants from the e-sign migration.
