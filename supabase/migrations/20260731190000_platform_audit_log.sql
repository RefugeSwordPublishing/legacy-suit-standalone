-- Platform audit log. Records sensitive platform-admin actions (notably support impersonation:
-- a platform admin signing into a tenant's account). Written only by the platform-admin edge
-- function with the service role; RLS is enabled with no policies so nothing else can read it.
create table if not exists public.platform_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_email   text,
  action        text not null,
  company_id    uuid,
  target_email  text,
  details       jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists platform_audit_log_created_idx on public.platform_audit_log (created_at desc);

alter table public.platform_audit_log enable row level security;
-- No policies: only the service role (edge function) may read/write.
