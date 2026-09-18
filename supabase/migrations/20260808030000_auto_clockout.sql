-- Auto clock-out: close time entries left open past the tenant's cutoff (default 11:59 PM local),
-- file a pending correction, and notify the office. Ports the legacy Base44 midnightClockOut to a
-- Supabase pg_cron job, made multi-tenant: each company closes at its own timezone + auto_clockout_time.
-- Runs every 15 minutes; an entry is only closed once its work date's local cutoff has passed, so
-- active workers during the day are untouched and stragglers from prior days get swept up.

create extension if not exists pg_cron;

create or replace function public.auto_clock_out_open_entries()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e record;
  v_cutoff timestamptz;
  v_duration integer;
  v_closed integer := 0;
  p record;
begin
  for e in
    select te.*, coalesce(cs.timezone, 'America/Chicago') as tz,
           coalesce(cs.auto_clockout_time, time '23:59') as cutoff_time
    from public.time_entries te
    join public.company_settings cs on cs.company_id = te.company_id
    where te.status in ('clocked_in', 'on_break')
  loop
    -- Tenant-local cutoff datetime for this entry's work date, as an absolute timestamptz.
    v_cutoff := (e.date::text || ' ' || e.cutoff_time::text)::timestamp at time zone e.tz;
    -- Only close once that day's cutoff has actually passed.
    if v_cutoff > now() then
      continue;
    end if;

    v_duration := greatest(0, floor(extract(epoch from (v_cutoff - e.clock_in)) / 60)::int);
    if e.break_start is not null and e.break_end is not null then
      v_duration := greatest(0, v_duration - floor(extract(epoch from (e.break_end - e.break_start)) / 60)::int);
    end if;

    update public.time_entries
      set clock_out = v_cutoff,
          duration_minutes = v_duration,
          status = 'clocked_out',
          notes = coalesce(notes || ' ', '') || '[Auto clocked out at ' || to_char(e.cutoff_time, 'HH12:MI AM') || ', requires correction]'
      where id = e.id;

    insert into public.timecard_adjustments
      (company_id, time_entry_id, user_id, user_name, project_id, project_name, date,
       original_clock_in, original_clock_out, requested_clock_in, requested_clock_out, reason, status)
    values
      (e.company_id, e.id, e.user_id, e.user_name, e.project_id, e.project_name, e.date,
       e.clock_in, v_cutoff, e.clock_in, v_cutoff,
       'AUTO: ' || coalesce(e.user_name, 'A worker') || ' did not clock out on ' || e.date::text ||
         '. System set clock-out to ' || to_char(e.cutoff_time, 'HH12:MI AM') || '. Please correct the actual clock-out time.',
       'pending');

    for p in
      select user_id from public.user_profiles
      where company_id = e.company_id and role in ('owner', 'admin', 'coo') and user_id is not null
    loop
      insert into public.notifications (company_id, user_id, type, title, message, project_id, project_name, read)
      values (e.company_id, p.user_id, 'timecard_auto_clockout', 'Auto Clock-Out: Correction Needed',
        coalesce(e.user_name, 'A worker') || ' did not clock out from ' || coalesce(e.project_name, 'a job') ||
          ' on ' || e.date::text || '. System set clock-out to ' || to_char(e.cutoff_time, 'HH12:MI AM') || '. Please review and correct.',
        e.project_id, e.project_name, false);
    end loop;

    v_closed := v_closed + 1;
  end loop;

  return v_closed;
end;
$$;

revoke execute on function public.auto_clock_out_open_entries() from anon, authenticated;

-- (Re)schedule the job idempotently.
do $$
begin
  perform cron.unschedule('auto-clock-out');
exception when others then
  null;
end $$;

select cron.schedule('auto-clock-out', '*/15 * * * *', $$select public.auto_clock_out_open_entries();$$);
