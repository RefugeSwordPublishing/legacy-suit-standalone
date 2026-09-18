-- Web Push infrastructure: per-device subscriptions + DB triggers that fan out
-- every notification / team-chat message to the send-push edge function via pg_net.

create extension if not exists pg_net;

-- Per-device push subscriptions (one user can have several: phone, desktop, tablet).
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_sub_select on public.push_subscriptions;
drop policy if exists push_sub_insert on public.push_subscriptions;
drop policy if exists push_sub_delete on public.push_subscriptions;

create policy push_sub_select on public.push_subscriptions for select
  using (user_id = (select auth.uid()));
create policy push_sub_insert on public.push_subscriptions for insert
  with check (user_id = (select auth.uid()) and company_id = public.auth_company_id());
create policy push_sub_delete on public.push_subscriptions for delete
  using (user_id = (select auth.uid()));

revoke all on public.push_subscriptions from anon;

-- Private config the triggers read (edge function URL + shared secret). Never exposed to clients.
create schema if not exists private;
create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
revoke all on private.app_config from anon, authenticated;

-- Helper: POST a push job to the send-push edge function. No-op until configured.
create or replace function private.enqueue_push(_user_ids uuid[], _title text, _body text, _url text, _tag text)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
declare
  _fn_url text;
  _secret text;
begin
  if _user_ids is null or array_length(_user_ids, 1) is null then
    return;
  end if;
  select value into _fn_url from private.app_config where key = 'send_push_url';
  select value into _secret from private.app_config where key = 'push_secret';
  if _fn_url is null then
    return; -- not configured yet
  end if;
  perform net.http_post(
    url     := _fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(_secret, '')),
    body    := jsonb_build_object(
      'user_ids', to_jsonb(_user_ids),
      'title',    _title,
      'body',     _body,
      'url',      _url,
      'tag',      _tag
    )
  );
end;
$$;

-- Trigger: every notification insert -> push to its recipient.
create or replace function public.on_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if NEW.user_id is not null then
    perform private.enqueue_push(
      array[NEW.user_id],
      coalesce(NEW.title, 'GuildWright'),
      coalesce(NEW.message, ''),
      '/notifications',
      coalesce(NEW.type, 'notification')
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notification_push on public.notifications;
create trigger trg_notification_push after insert on public.notifications
  for each row execute function public.on_notification_push();

-- Trigger: team chat message -> push to all company members except the sender.
create or replace function public.on_chat_message_push()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  _recipients uuid[];
begin
  select array_agg(m.user_id) into _recipients
  from public.memberships m
  where m.company_id = NEW.company_id
    and m.user_id is distinct from NEW.sender_id;
  perform private.enqueue_push(
    _recipients,
    coalesce(NEW.sender_name, 'Team message'),
    coalesce(NEW.message, ''),
    '/chat',
    'chat:' || coalesce(NEW.channel, 'general')
  );
  return NEW;
end;
$$;

drop trigger if exists trg_chat_message_push on public.chat_messages;
create trigger trg_chat_message_push after insert on public.chat_messages
  for each row execute function public.on_chat_message_push();
