-- Onboarding sandbox: a new tenant can load a set of clearly-labeled example records (a client, a
-- project, and an estimate) to learn the flow, then remove them in one click. Everything seeded is
-- tagged is_sample so the removal deletes exactly the example data and never real records.
alter table public.clients   add column if not exists is_sample boolean not null default false;
alter table public.projects  add column if not exists is_sample boolean not null default false;
alter table public.estimates add column if not exists is_sample boolean not null default false;
