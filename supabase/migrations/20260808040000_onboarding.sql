-- Onboarding: a dashboard setup checklist for new tenants. This flag lets an owner dismiss it once
-- they are set up (or would rather not see it), independent of whether every item is complete.
alter table public.company_settings
  add column if not exists onboarding_dismissed boolean not null default false;
