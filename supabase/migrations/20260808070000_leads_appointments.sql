-- Platform CRM: leads (trial/contact requests) and appointments (walkthrough calls / meetings).
-- These are PLATFORM-level, not tenant data: only platform admins touch them, via the platform-admin
-- edge function (service role). RLS is enabled with NO policies, so normal anon/authenticated callers
-- get nothing; the service role bypasses RLS. Public lead capture goes through the submit-lead edge
-- function (also service role), so tenants never read each other's or the platform's CRM data.

create table if not exists public.leads (
  id                   uuid primary key default gen_random_uuid(),
  name                 text,
  company              text,
  email                text,
  phone                text,
  message              text,
  source               text default 'trial_form',
  status               text not null default 'new'
    constraint leads_status_check check (status in ('new','contacted','scheduled','won','lost')),
  notes                text,
  assigned_to          uuid,
  converted_company_id uuid references public.companies(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists leads_status_idx on public.leads (status, created_at desc);

create table if not exists public.appointments (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,
  start_at       timestamptz not null,
  end_at         timestamptz,
  appt_type      text not null default 'walkthrough'
    constraint appointments_type_check check (appt_type in ('walkthrough','call','demo','other')),
  status         text not null default 'scheduled'
    constraint appointments_status_check check (status in ('scheduled','completed','canceled','no_show')),
  lead_id        uuid references public.leads(id) on delete set null,
  contact_name   text,
  contact_email  text,
  contact_phone  text,
  location       text,
  assigned_to    uuid,
  assigned_to_name text,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists appointments_start_idx on public.appointments (start_at);
create index if not exists appointments_lead_idx on public.appointments (lead_id);

alter table public.leads        enable row level security;
alter table public.appointments enable row level security;
-- Intentionally no policies: platform-admin / submit-lead use the service role and bypass RLS.
