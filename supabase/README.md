# Supabase schema & policies

This project's Postgres schema lives in Supabase project `zbruglzbapkuvrmvyzgz`.
Until now none of it was version-controlled. Migrations added here are the start
of fixing that.

## migrations/20260720120000_enable_rls_baseline.sql

Turns on Row Level Security across the database. Before this, RLS was disabled on
~27 public tables, meaning the public anon key (shipped in the browser bundle)
could read and write every table. This is the deploy gate.

### What it does (Phase 1: the secure floor)

- Enables RLS on every base table in `public`.
- Adds three helper functions: `current_app_role()`, `is_internal()`, `is_management()`.
- Gives internal staff (owner, admin, coo, site_manager, crew_member, employee)
  full read/write on operational tables.
- Denies `client` role and anonymous callers everywhere by default.
- Restricts sensitive tables explicitly: `user_profiles` and `permission_settings`
  (management-only writes), `qbo_integration_settings` (management-only, holds
  OAuth tokens), `notifications` (per-user).

### How to apply

1. Open the Supabase dashboard for project `zbruglzbapkuvrmvyzgz`.
2. SQL Editor -> paste the full contents of the migration file -> Run.
   (Run it here so it executes as `postgres`, the table owner. The helper
   functions rely on owner RLS-bypass to avoid recursion.)
3. Run the two verification queries at the bottom of the file. The first must
   return zero rows (no table left without RLS). The second lists tables that
   are locked (RLS on, no policy) -- confirm none of them are tables this app
   actually uses. The app currently queries: bid_requests, bid_submissions,
   catalog_items, client_change_orders, clients, cost_codes, estimates, expenses,
   projects, sub_change_orders, sub_contractors, time_entries, time_off_requests,
   timecard_adjustments, user_profiles.
4. Smoke-test the app signed in as an internal user: list/create/edit on Clients,
   Projects, Estimates, Timecards. Everything should still work.
5. If anything breaks, the rollback block is at the bottom of the migration file.

### Known interaction

User invites (`UsersPage`) call `auth.admin.inviteUserByEmail` from the browser.
That already fails (needs the service_role key). It must move to a Server Action /
route handler using the service_role key, which bypasses RLS. Do not put the
service_role key in any `NEXT_PUBLIC_*` variable.

### Phase 2 (not done yet -- tracked on the TaskBoard)

- Per-role least privilege mirroring the runtime `PermissionSettings` matrix
  (site_manager / crew_member feature-level read vs write).
- Client Portal row scoping: a `client` user sees only their own project's data
  (projects/estimates/invoices/change-orders where `client_id` matches their
  `user_profiles.client_id`).
- Per-project scoping via `assigned_project_ids` for site managers / crew.
- Consider a custom access-token hook to embed `role` as a JWT claim, so policies
  read the claim instead of querying `user_profiles` on every row.
