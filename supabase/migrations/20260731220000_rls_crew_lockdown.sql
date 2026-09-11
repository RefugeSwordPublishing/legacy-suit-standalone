-- RLS depth: financial/office tables were open to every non-client role (crew + site managers
-- included). Lock them to company admins (owner/admin/coo) to match the UI, which only shows
-- estimates/invoices/clients/subcontractors to those roles. Crew keep their operational tables
-- (tasks, materials, schedule, timecards, chat) untouched.

-- ---- Admin-only financial/office tables (replace tenant_staff with is_company_admin) ----
do $$
declare t text;
  admin_tables text[] := array[
    'estimates','estimate_templates','invoices','clients','catalog_items',
    'bid_requests','bid_submissions','client_change_orders','sub_change_orders','sub_contractors'
  ];
begin
  foreach t in array admin_tables loop
    execute format('drop policy if exists tenant_staff on public.%I', t);
    execute format(
      $p$create policy tenant_admin on public.%I for all to authenticated
           using ((select public.is_company_admin()) and company_id = (select public.auth_company_id()))
           with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()))$p$, t);
  end loop;
end $$;

-- ---- Expenses: reads limited to managers (crew can still submit a receipt, not browse the book) ----
drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using ((select public.is_company_manager()) and company_id = (select public.auth_company_id()));
