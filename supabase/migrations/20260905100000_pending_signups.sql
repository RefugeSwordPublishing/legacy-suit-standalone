-- Self-service signup.
--
-- A public endpoint that creates companies is a spam magnet, and every tenant granted a trial is a
-- real row with real storage behind it. So signup does NOT create a company. It creates the auth
-- user and parks the company details here; the tenant is provisioned only after the person confirms
-- their email address and signs in. No confirmation, no tenant, nothing to clean up.
--
-- Also the rate-limit ledger: the signup function counts recent rows per IP before accepting
-- another.

create table if not exists public.pending_signups (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique,
  email          text not null,
  company_name   text not null,
  first_name     text,
  last_name      text,
  signup_ip      text,
  created_at     timestamptz not null default now(),
  provisioned_at timestamptz,
  company_id     uuid references public.companies(id) on delete set null
);

create index if not exists pending_signups_ip_idx on public.pending_signups (signup_ip, created_at desc);
create index if not exists pending_signups_unclaimed_idx on public.pending_signups (created_at) where provisioned_at is null;

-- Service role only. The signup and provisioning functions are the only things that touch this,
-- and a row here is not yet attached to any tenant, so there is no tenant to scope it to.
alter table public.pending_signups enable row level security;
