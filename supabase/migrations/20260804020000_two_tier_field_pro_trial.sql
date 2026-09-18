-- Two paid tiers + a 14-day, no-card trial.
--   Free floor (no active subscription): projects + timecards only.
--   Field: core collaboration (tasks, schedule, chat, goals, phase approvals, client requests) plus
--          estimates, estimate templates, catalog, and the client directory.
--   Pro:   everything, incl. invoices, change orders, subcontractors, expenses, materials, cost codes,
--          expense categories, QuickBooks, reports.
-- Access is computed live in company_access_level(): a paid subscription honors its plan; an
-- app-managed trial (trial_ends_at in the future, no card) grants full Pro until it lapses; after
-- that the tenant falls to the free floor. No cron needed - RLS re-evaluates on every query.

alter table public.companies add column if not exists trial_ends_at timestamptz;

create or replace function public.company_access_level()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when c.subscription_status in ('active','trialing','past_due') then c.plan
      when c.trial_ends_at is not null and now() < c.trial_ends_at then 'pro'
      else 'none'
    end
    from public.companies c
    where c.id = public.auth_company_id()
  ), 'none');
$$;
revoke execute on function public.company_access_level() from public, anon;
grant  execute on function public.company_access_level() to authenticated;

-- Redefined to use the access level (paid plan OR active trial), not the raw plan column.
create or replace function public.company_is_pro()
returns boolean language sql stable security definer set search_path = public as $$
  select public.company_access_level() = 'pro';
$$;

create or replace function public.company_has_field()
returns boolean language sql stable security definer set search_path = public as $$
  select public.company_access_level() in ('field','pro');
$$;
revoke execute on function public.company_has_field() from public, anon;
grant  execute on function public.company_has_field() to authenticated;

-- Estimates + clients + catalog drop from Pro-only down to the Field tier.
drop policy if exists pro_only on public.estimates;
drop policy if exists pro_only on public.estimate_templates;
drop policy if exists pro_only on public.catalog_items;
drop policy if exists pro_only on public.clients;

-- Field-or-Pro gate (company_has_field()).
drop policy if exists field_or_pro on public.estimates;
create policy field_or_pro on public.estimates               as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.estimate_templates;
create policy field_or_pro on public.estimate_templates      as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.catalog_items;
create policy field_or_pro on public.catalog_items           as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.clients;
create policy field_or_pro on public.clients                 as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.tasks;
create policy field_or_pro on public.tasks                   as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.task_templates;
create policy field_or_pro on public.task_templates          as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.crew_schedule_entries;
create policy field_or_pro on public.crew_schedule_entries   as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.chat_messages;
create policy field_or_pro on public.chat_messages           as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.daily_goals;
create policy field_or_pro on public.daily_goals             as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.phase_approval_requests;
create policy field_or_pro on public.phase_approval_requests as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());
drop policy if exists field_or_pro on public.client_requests;
create policy field_or_pro on public.client_requests         as restrictive for all to authenticated using (public.company_has_field()) with check (public.company_has_field());

-- Expense categories belong to the Pro expenses feature.
drop policy if exists pro_only on public.expense_categories;
create policy pro_only on public.expense_categories          as restrictive for all to authenticated using (public.company_is_pro()) with check (public.company_is_pro());
