# Build brief — crew-clock

Paste this in to start the build session. It captures the decisions already made
and the ones to resolve live.

## Where this stands
- **This is a potential product**, sold to multiple contractors, not a one-off favor.
  The first contractor is **pilot customer #1 / design partner**.
- **Core is field time-clocking** (clock in/out, GPS/job verification, offline-tolerant),
  with light projects, materials, and expenses layered on.
- **Codebase route (fork the Legacy standalone vs fresh build) is deferred** to this
  session. Decide it on one test: which reaches a tenant-aware foundation fastest.

## The one non-negotiable: multi-tenant from day one
Because this is a product, the data model must be tenant-aware from the first
migration. Retrofitting tenancy later is a rewrite (the Legacy suite has no tenant
concept, which is exactly the trap to avoid). Every table carries `company_id`, and
RLS isolates each tenant.

Two multi-tenant models on Supabase:
- **Project-per-customer** (one Supabase project each): dead-simple isolation, but N
  deploys / N migrations / N bills. Fine for 1–3 pilots, painful past that.
- **Shared project, `company_id` + RLS**: one DB, one deploy, near-zero marginal cost
  per customer. This is the actual SaaS shape. **Use this**, with the pilot as tenant #1.

## Starter data model + tenant RLS (sketch)
Same RLS pattern just applied to Legacy, pointed at tenant isolation instead of role.

```sql
-- Tenants
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Auth user <-> company + role (one company per user for v1)
create table memberships (
  user_id    uuid not null references auth.users(id),
  company_id uuid not null references companies(id),
  role       text not null default 'crew_member', -- owner/admin/foreman/crew_member
  primary key (user_id, company_id)
);

-- Tenant helper: SECURITY DEFINER so it bypasses RLS (no recursion);
-- auth.uid() wrapped in a select so it evaluates once per query.
create function public.auth_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select company_id from public.memberships
  where user_id = (select auth.uid()) limit 1;
$$;
revoke execute on function public.auth_company_id() from public, anon;
grant  execute on function public.auth_company_id() to authenticated;

-- Every domain table carries:  company_id uuid not null references companies(id)
-- Tenant-isolation policy template (layer role checks on top where needed):
-- create policy tenant_isolation on public.<table>
--   for all to authenticated
--   using      (company_id = (select public.auth_company_id()))
--   with check (company_id = (select public.auth_company_id()));
```

Role rules (owner/admin can manage, crew clocks themselves) sit **inside** the tenant,
same helper-function approach as Legacy's `is_management()`.

## Platform
Field-first time-clocking wants reliable GPS/geofencing, offline clock-in on dead-signal
sites, and clock-out push reminders. That favors a native wrap (Capacitor), which the
other apps here already use (`jobshot`, `prep-provide`, `thats-so-random` all ship an
`android/` Capacitor build). Web companion for the office is optional and cheap.

## v1 scope discipline (resist rebuilding all of Legacy)
Ship the wedge: **time-clocking that's clearly better than his current spreadsheet**,
plus just enough job tagging to attribute hours. Defer PM depth, materials, expenses,
estimates, invoicing, and QuickBooks to later releases. Leave a hook for billing
(Stripe) but do not build it for the pilot.

## Cost picture (shared-project SaaS route)
- Supabase: free tier for the pilot; ~$25/mo Pro when you want daily backups/headroom.
  One project covers your first several customers.
- Apple App Store: $99/yr, only if iOS (TestFlight covers crew installs without review).
- Google Play: $25 one-time, or sideload the APK for a single crew.
- Marginal cost per new contractor: near zero until real scale.

## Open questions to resolve in the session
1. Fork the Legacy standalone or fresh build? (Judge by fastest path to tenant-aware.)
2. One company per user, or do some people work across companies? (Affects `memberships`.)
3. Native only, or native + office web from day one?
4. Which time-clock specifics are hard requirements (geofence, offline, OT rules)?
   Pull these from the discovery questionnaire before deciding the schema.
