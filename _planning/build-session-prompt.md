# Build-session starter prompt

Start the build session **in `C:\Dev\RefugeAndSword\apps\crew-clock`** so it loads
the company + this app's context and can read the planning docs. Then paste the
prompt below.

---

We're starting the actual build of **crew-clock** (working name), a mobile-first
time-clocking app for construction crews with light project management, materials,
and expense tracking. Read `_planning/build-brief.md` and
`_planning/discovery-questionnaire.md` in this folder first, then this repo's setup.

Key context and decisions already made:

- **This is a product, not a one-off.** It will be sold to multiple contractors. The
  first contractor is pilot customer #1 / design partner. Design for many tenants.
- **Multi-tenant from day one is non-negotiable.** Single shared Supabase project;
  every table carries `company_id`; RLS isolates each tenant. Do not build
  single-tenant "for now." The starter data model (companies, memberships,
  `auth_company_id()` helper, tenant-isolation policy template) is in the build brief.
- **Reuse the RLS pattern we just shipped on the Legacy suite** (SECURITY DEFINER
  helper functions, `(select auth.uid())` wrapping, execute revoked from anon/public).
  That migration lives at `legacy-renovations/standalone/supabase/migrations/`.
- **Field-first platform:** plan for a Capacitor native build (reliable GPS/geofence,
  offline clock-in, clock-out push reminders). Other apps here already ship an
  `android/` Capacitor build to copy from.
- **v1 scope discipline:** ship time-clocking that clearly beats the contractor's
  current spreadsheet, plus just enough job tagging to attribute hours. Defer PM depth,
  materials, expenses, estimates, invoicing, and QuickBooks. Leave a hook for Stripe
  billing but don't build it.

First moves for this session:

1. Confirm the discovery answers (I'll paste the contractor's responses, or we'll
   proceed on assumptions and flag them).
2. Decide **fork the Legacy standalone vs fresh build**, judged on the fastest path to
   a tenant-aware foundation. Do a quick read of how tenant-hostile the standalone's
   queries are before deciding.
3. Scaffold the multi-tenant foundation: `companies`, `memberships`, the
   `auth_company_id()` helper, and the tenant-isolation RLS template on a first table.
4. Then build the time-clock MVP against that foundation.

Open questions to resolve early (see the build brief): one company per user or cross-
company users; native-only or native + office web; and which time-clock specifics
(geofence, offline, overtime rules) are hard requirements.
