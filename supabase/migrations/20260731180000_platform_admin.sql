-- Platform (super) admin: a user who operates GuildWright itself, above any single tenant.
-- Gates the IT / admin portal (create tenants, cross-tenant view). Distinct from a tenant's
-- own "owner" role. Enforced server-side in the platform-admin edge function, never via RLS
-- (it deliberately reaches across tenants using the service role).
alter table public.user_profiles add column if not exists is_platform_admin boolean not null default false;

update public.user_profiles set is_platform_admin = true
where lower(email) = 'dustin@legacyrenovationssgf.com';
