-- Xero accounting integration, mirroring the QuickBooks setup. A tenant connects Xero instead of
-- QBO; the app pushes invoices to it. Key Xero differences vs QBO: no sub-customers (projects go to
-- a Tracking Category), lines carry an account/item code + tax type, and tokens rotate on refresh.

create table if not exists public.xero_integration_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  is_connected boolean not null default false,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  tenant_id text,                 -- Xero organization id (sent as the Xero-tenant-id header)
  org_name text,
  sync_invoices boolean not null default true,
  auto_send boolean not null default false,
  category_item_map jsonb not null default '{}'::jsonb,   -- category/cost code -> { accountCode | itemCode, name }
  default_tax_type text not null default 'NONE',
  tracking_category_id text,      -- the "Project" tracking category, if configured
  tracking_category_name text not null default 'Project',
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.xero_integration_settings enable row level security;

create policy xero_admin on public.xero_integration_settings for all to authenticated
  using ((select is_company_admin()) and company_id = (select auth_company_id()))
  with check ((select is_company_admin()) and company_id = (select auth_company_id()));

create policy pro_only on public.xero_integration_settings as restrictive for all to authenticated
  using (public.company_is_pro()) with check (public.company_is_pro());

-- Id caches (parallel to the quickbooks_* columns).
alter table public.clients   add column if not exists xero_contact_id text;
alter table public.invoices  add column if not exists xero_invoice_id text;
alter table public.invoices  add column if not exists xero_invoice_url text;
alter table public.cost_codes add column if not exists xero_account_code text;
alter table public.projects  add column if not exists xero_tracking_option text;
