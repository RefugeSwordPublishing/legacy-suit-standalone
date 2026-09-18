-- Pay rate history: point-in-time pay records so reports stay accurate across raises/deductions.
-- Each row is an effective-dated rate for a user. The rate in force on any date is the row with
-- the greatest effective_date <= that date. Amount + rate_period cover hourly and salaried
-- (weekly / monthly / yearly) pay. Only owner/admin/coo (is_company_admin) may read or write pay.

create table if not exists public.pay_rates (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  user_id        uuid not null,
  pay_type       text not null default 'hourly',   -- 'hourly' | 'salary'
  amount         numeric not null default 0,
  rate_period    text not null default 'hour',      -- 'hour' | 'week' | 'month' | 'year'
  effective_date date not null,
  note           text,
  created_by     uuid,
  created_at     timestamptz not null default now()
);

create index if not exists pay_rates_user_effective_idx
  on public.pay_rates (company_id, user_id, effective_date desc);

alter table public.pay_rates enable row level security;

create policy pay_rates_select on public.pay_rates
  for select to authenticated
  using ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));
create policy pay_rates_insert on public.pay_rates
  for insert to authenticated
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));
create policy pay_rates_update on public.pay_rates
  for update to authenticated
  using      ((select public.is_company_admin()) and company_id = (select public.auth_company_id()))
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));
create policy pay_rates_delete on public.pay_rates
  for delete to authenticated
  using ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));
