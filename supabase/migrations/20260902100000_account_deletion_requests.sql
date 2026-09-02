-- Account deletion requests.
--
-- Google Play requires any app with account creation to offer an in-app way to request deletion
-- plus a public web URL. A B2B app cannot honor that by letting anyone delete themselves on the
-- spot: a company owner's account holds a tenant other people are still working in, and a crew
-- member's timecards are business records attached to completed jobs. So the app records a
-- request and a human works it, which is what Play asks for.
--
-- Deliberately NOT plan-gated. A lapsed tenant must still be able to ask for deletion, so this
-- table carries no pro_only or field_or_pro policy.

create table if not exists public.account_deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  user_id      uuid not null,
  email        text,
  full_name    text,
  role         text,
  is_owner     boolean not null default false,
  reason       text,
  status       text not null default 'open',
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  notes        text,
  constraint account_deletion_requests_status_check
    check (status in ('open', 'in_progress', 'completed', 'cancelled'))
);

create index if not exists account_deletion_requests_company_idx
  on public.account_deletion_requests (company_id, created_at desc);
create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests (status, created_at desc);

alter table public.account_deletion_requests enable row level security;

-- A person may raise a request for themselves, see it, and withdraw it. Nothing more: the request
-- is worked by a human with the service role, so tenants cannot mark their own request completed.
drop policy if exists own_insert on public.account_deletion_requests;
create policy own_insert on public.account_deletion_requests
  for insert to authenticated
  with check (user_id = auth.uid() and company_id = public.auth_company_id());

drop policy if exists own_select on public.account_deletion_requests;
create policy own_select on public.account_deletion_requests
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists own_cancel on public.account_deletion_requests;
create policy own_cancel on public.account_deletion_requests
  for update to authenticated
  using (user_id = auth.uid() and status = 'open')
  with check (user_id = auth.uid() and status in ('open', 'cancelled'));

-- Match the tenancy convention: company_id and user_id fill themselves in, so components never
-- handle either and an insert cannot be pointed at another tenant.
alter table public.account_deletion_requests
  alter column company_id set default public.auth_company_id();
alter table public.account_deletion_requests
  alter column user_id set default auth.uid();
