-- Support tickets: in-app "Report an issue / Help" submissions. A tenant user files one (with the
-- page they were on + what happened); it surfaces in the platform admin portal's Support queue and
-- emails the admin team. Company-scoped like everything else; the platform admin reads across all
-- tenants via the platform-admin edge function (service role).
create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  user_id     uuid,
  user_email  text,
  user_name   text,
  page        text,
  category    text default 'bug',
  description text not null,
  status      text not null default 'open',
  created_at  timestamptz not null default now()
);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);

alter table public.support_tickets enable row level security;

-- Tenant users create + see their own company's tickets. Platform admin reads all via service role.
create policy support_tickets_insert on public.support_tickets
  for insert to authenticated
  with check (company_id = (select public.auth_company_id()));
create policy support_tickets_select on public.support_tickets
  for select to authenticated
  using (company_id = (select public.auth_company_id()));
