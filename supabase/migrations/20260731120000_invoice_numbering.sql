-- Custom invoice numbering: per-project prefix + tenant-configurable format & start.
alter table public.projects add column if not exists invoice_prefix text;
alter table public.company_settings add column if not exists invoice_number_format text not null default '{prefix}_{seq:3}';
alter table public.company_settings add column if not exists invoice_seq_start integer not null default 1;

-- Ensure every company has a settings row so the format is readable immediately
-- (other columns fall back to their defaults).
insert into public.company_settings (company_id)
select id from public.companies
on conflict (company_id) do nothing;
