# Supabase schema & policies

GuildWright's Postgres schema lives in Supabase project **`eojpqciokqpmzyneqzmm`**
(Refuge & Sword org). It is multi-tenant: every table carries a `company_id` and is
protected by Row Level Security keyed on the `auth_company_id()` SECURITY DEFINER
helper. Tenant 0 is Legacy Renovations.

> Note: an earlier standalone attempt used a separate Supabase project
> (`zbruglzbapkuvrmvyzgz`, "legacy-suit"). That project is **deprecated** and not
> used by GuildWright at runtime. It is safe to delete once backed up.

## Migrations

Applied in filename order via the session pooler:

```bash
node scripts/db-apply.mjs supabase/migrations/<file>.sql
```

Current set:

- `20260727120000_tenant_foundation.sql` — companies, memberships, company_settings,
  `auth_company_id()`, `company_has()`, `set_company_id()`.
- `20260727130000_role_alignment.sql` — `is_company_admin()`, `is_company_manager()`.
- `20260727140000_field_domain.sql` — user_profiles, projects, time_entries,
  timecard_adjustments, cost_codes.
- `20260727160000_office_domain.sql` — the office entities ported from Base44
  (estimates, invoices, clients, expenses, notifications, chat_messages, etc.).
- `20260727170000_storage_realtime.sql` — `uploads` storage bucket + realtime on
  notifications.
- `20260729120000_esign_rpcs.sql` — public e-signature RPCs (anon-callable,
  SECURITY DEFINER).
- `20260729140000_push.sql` — Web Push subscriptions + triggers that fan out to the
  `send-push` edge function.

## Edge functions

`quickbooks-auth`, `quickbooks-sync`, `send-push` (deploy `--no-verify-jwt`), and
`invoke-llm` (JWT-verified; shared Anthropic key for receipt extraction). Deploy with:

```bash
npx supabase functions deploy <name> --project-ref eojpqciokqpmzyneqzmm
```
