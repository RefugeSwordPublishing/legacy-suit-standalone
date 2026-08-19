-- Daily QuickBooks payment reconciliation. The quickbooks-webhook is unreliable (Intuit drops
-- deliveries), so this pulls paid-status for every outstanding pushed invoice once a day as a
-- backstop. Mirrors the push trigger's pattern: URL + shared secret come from private.app_config
-- (populated out-of-band, NEVER in this migration), so no secret is committed. Reuses the existing
-- push_secret, which equals PUSH_TRIGGER_SECRET (the same secret quickbooks-reconcile checks).

insert into private.app_config (key, value)
values ('reconcile_url', 'https://eojpqciokqpmzyneqzmm.supabase.co/functions/v1/quickbooks-reconcile')
on conflict (key) do update set value = excluded.value;

create or replace function private.run_qbo_reconcile()
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare _url text; _secret text;
begin
  select value into _url    from private.app_config where key = 'reconcile_url';
  select value into _secret from private.app_config where key = 'push_secret';
  if _url is null or _secret is null then
    return; -- not configured
  end if;
  perform net.http_post(
    url     := _url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-reconcile-secret', _secret),
    body    := '{}'::jsonb
  );
end;
$$;

-- Run daily at 08:00 UTC (~2-3am Central). Reschedule idempotently.
do $$ begin
  perform cron.unschedule('quickbooks-reconcile-daily');
exception when others then null; end $$;
select cron.schedule('quickbooks-reconcile-daily', '0 8 * * *', $$select private.run_qbo_reconcile();$$);
