-- Payroll export configuration, per tenant.
-- The timecard report can export approved (clocked-out) hours as a payroll-ready CSV.
-- Preset controls the column layout for a given payroll provider; overtime mode controls
-- how regular vs overtime hours are split; week start defines the 7-day workweek boundary
-- used for weekly-40 overtime. payroll_id on a profile is the worker's id in the payroll
-- system (file number for ADP, employee id for Paychex), left blank when unused.

alter table public.company_settings
  add column if not exists payroll_export_preset  text    not null default 'generic',
  add column if not exists payroll_overtime_mode  text    not null default 'weekly_40',
  add column if not exists payroll_week_start      smallint not null default 0,
  add column if not exists payroll_include_pay     boolean not null default false;

-- Guard the enumerated values without blocking future presets: keep it permissive but sane.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_payroll_preset_check'
  ) then
    alter table public.company_settings
      add constraint company_settings_payroll_preset_check
      check (payroll_export_preset in ('generic','gusto','adp','paychex','quickbooks'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'company_settings_payroll_ot_check'
  ) then
    alter table public.company_settings
      add constraint company_settings_payroll_ot_check
      check (payroll_overtime_mode in ('none','weekly_40','daily_8'));
  end if;
end $$;

alter table public.user_profiles
  add column if not exists payroll_id text;
