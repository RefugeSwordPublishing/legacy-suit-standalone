-- Billing paywall: Field vs Pro, enforced at the database. A RESTRICTIVE policy on each Pro-only
-- table requires the tenant's plan = 'pro' (it ANDs with the existing permission policies, so we
-- don't rewrite those). Field tenants keep the core (projects, tasks, timecards, schedule, chat);
-- Pro unlocks estimates/invoices/clients/subcontractors/expenses/materials/QuickBooks. Plus
-- subscription-tracking columns for the Stripe sync.

alter table public.companies add column if not exists subscription_status text not null default 'active';
alter table public.companies add column if not exists stripe_customer_id text;
alter table public.companies add column if not exists stripe_subscription_id text;

create or replace function public.company_is_pro()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select plan = 'pro' from public.companies where id = public.auth_company_id()), false);
$$;
revoke execute on function public.company_is_pro() from public, anon;
grant  execute on function public.company_is_pro() to authenticated;

create policy pro_only on public.estimates            as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.estimate_templates   as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.catalog_items        as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.client_change_orders as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.invoices             as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.clients              as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.sub_contractors      as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.bid_requests         as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.bid_submissions      as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.sub_change_orders    as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.expenses             as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.materials            as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.cost_codes           as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
create policy pro_only on public.qbo_integration_settings as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
