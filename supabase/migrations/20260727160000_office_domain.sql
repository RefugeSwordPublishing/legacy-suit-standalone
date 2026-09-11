-- ============================================================================
-- Migration 004: Office / full domain schema (tenant-aware), matched to the
-- Base44 entity definitions (the running app's real contract).
-- Supersedes the earlier draft built from the stale standalone dump.
--
-- Every table: company_id uuid not null default auth_company_id() + tenant RLS.
-- ============================================================================

-- Reconcile the Field tables with the Base44 UserProfile shape.
alter table public.user_profiles add column if not exists full_name text;
alter table public.user_profiles add column if not exists phone text;

-- ---- Independent ----
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  name text not null, contact_name text, email text, phone text,
  billing_address text, city text, state text, zip text, notes text,
  status text default 'active', quickbooks_client_id text, quickbooks_customer_id text,
  created_at timestamptz default now()
);
create table if not exists public.sub_contractors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  business_name text, contact_name text, email text, phone text, billing_address text,
  contractor_types text[], notes text, created_at timestamptz default now()
);

-- ---- Catalog / tasks ----
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  name text not null, description text, category text default 'materials',
  cost_code_id uuid references public.cost_codes(id), unit text, unit_cost numeric default 0,
  default_quantity numeric default 1, default_markup numeric default 0, notes text,
  is_active boolean default true, created_at timestamptz default now()
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id), title text not null, assigned_to text, assignees text[],
  priority text default 'medium', status text default 'pending', due_date date, notes text,
  photo_urls text[], subtasks jsonb default '[]'::jsonb, phase text,
  is_sub_contractor_task boolean default false, sub_contractor_id uuid, sub_contractor_name text,
  bid_request_id uuid, eta_start date, eta_end date, created_at timestamptz default now()
);
create table if not exists public.task_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  name text not null, description text, phase text, tasks jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id), name text, file_url text, file_type text,
  category text default 'general', uploaded_by text, created_at timestamptz default now()
);
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id), task_id uuid references public.tasks(id),
  name text not null, quantity numeric, unit text, priority text default 'medium',
  status text default 'needed', supplier text, estimated_cost numeric, notes text,
  created_at timestamptz default now()
);

-- ---- Estimates / change orders / invoices / expenses ----
create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  title text, status text default 'draft', client_id uuid references public.clients(id),
  client_name text, client_email text, project_id uuid references public.projects(id), project_name text,
  notes text, estimate_number text, scope_of_work jsonb default '[]'::jsonb,
  gc_fee_enabled boolean default false, gc_fee_pct numeric default 10,
  gc_fee_label text default 'GC / Project Management Fee',
  column_settings jsonb default '{"show_qty": true, "show_unit": true, "show_line_total": true}'::jsonb,
  category_markups jsonb default '{"labor": 15, "other": 0, "materials": 20, "subcontractor": 10}'::jsonb,
  sections jsonb default '[]'::jsonb, subtotal numeric default 0, total_markup numeric default 0,
  grand_total numeric default 0, signed_by text, signed_at timestamptz, created_at timestamptz default now()
);
create table if not exists public.estimate_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  name text not null, description text, is_rapid_estimate boolean default false,
  category_markups jsonb default '{"labor": 15, "other": 0, "materials": 20, "subcontractor": 10}'::jsonb,
  sections jsonb default '[]'::jsonb, gc_fee_enabled boolean default true, gc_fee_pct numeric default 13,
  created_at timestamptz default now()
);
create table if not exists public.client_change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  change_order_number text, title text, status text default 'draft',
  estimate_id uuid references public.estimates(id), estimate_number text,
  project_id uuid references public.projects(id), project_name text,
  client_id uuid references public.clients(id), client_name text, client_email text,
  date_issued date, valid_through date, scope_of_work text, sections jsonb default '[]'::jsonb,
  gc_fee_enabled boolean default true, gc_fee_pct numeric default 13, gc_fee_label text,
  original_estimate_total numeric, change_order_total numeric, new_contract_total numeric,
  signed_by text, signed_at timestamptz, sign_ip text, notes text, created_at timestamptz default now()
);
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  invoice_number text, client_id uuid references public.clients(id), client_name text, client_email text,
  project_id uuid references public.projects(id), project_name text, status text default 'draft',
  issue_date date, due_date date, payment_terms text default 'net_30', billing_mode text default 'line_items',
  line_items jsonb default '[]'::jsonb, sov_entries jsonb default '[]'::jsonb, co_sov_entries jsonb default '[]'::jsonb,
  imported_bid_ids text[], subtotal numeric default 0, total_markup numeric default 0, grand_total numeric default 0,
  notes text, quickbooks_invoice_id text, quickbooks_invoice_url text, created_at timestamptz default now()
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id), project_name text, receipt_image text, receipt_url text,
  expense_category text default 'materials', cost_code_id uuid references public.cost_codes(id), cost_code text,
  vendor text, date date, total_amount numeric default 0, description text,
  billable boolean default true, billed boolean default false, billing_mode text default 'individual',
  line_items jsonb default '[]'::jsonb, notes text, created_at timestamptz default now()
);

-- ---- Scheduling / requests / subs / bids ----
create table if not exists public.crew_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id), user_name text, user_role text,
  project_id uuid references public.projects(id), scheduled_date date, notes text, created_at timestamptz default now()
);
create table if not exists public.daily_goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  schedule_entry_id uuid, user_id uuid references auth.users(id), user_name text,
  project_id uuid references public.projects(id), project_name text, scheduled_date date,
  task_ids text[], task_titles text[], set_by text, status text default 'active', created_at timestamptz default now()
);
create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id), user_name text, user_role text, start_date date, end_date date,
  reason text, status text default 'pending', reviewed_by text, decline_reason text, created_at timestamptz default now()
);
create table if not exists public.phase_approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id), project_name text, current_phase text,
  requested_by_id text, requested_by_name text, status text default 'pending', reviewed_by text, notes text,
  created_at timestamptz default now()
);
create table if not exists public.bid_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  request_type text default 'bid', project_id uuid references public.projects(id), project_name text,
  project_address text, title text, description text, budget numeric, scope_of_work jsonb default '[]'::jsonb,
  photo_urls text[], file_urls text[], file_names text[], sub_contractor_ids text[],
  eta_window_start date, eta_window_end date, status text default 'draft',
  awarded_to_id text, awarded_to_name text, created_by_name text, created_at timestamptz default now()
);
create table if not exists public.bid_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  bid_request_id uuid references public.bid_requests(id), sub_contractor_id uuid references public.sub_contractors(id),
  sub_contractor_name text, sub_contractor_email text, bid_amount numeric,
  estimated_start_date date, estimated_end_date date, notes text, status text default 'submitted',
  paid_amount numeric default 0, payments jsonb default '[]'::jsonb,
  work_completed_at timestamptz, paid_at timestamptz, created_at timestamptz default now()
);
create table if not exists public.sub_change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  bid_request_id uuid references public.bid_requests(id), bid_submission_id uuid references public.bid_submissions(id),
  sub_contractor_name text, project_name text, description text, amount numeric, status text default 'pending',
  created_by_name text, created_at timestamptz default now()
);
create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  project_id uuid references public.projects(id), title text not null, description text, photo_urls text[],
  status text default 'open', assigned_to text, task_id uuid, submitted_by text, decline_reason text,
  created_at timestamptz default now()
);

-- ---- Comms + settings ----
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id), type text default 'material_added', title text, message text,
  project_id uuid references public.projects(id), project_name text, read boolean default false,
  created_at timestamptz default now()
);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  channel text, sender_id uuid references auth.users(id), sender_name text, sender_role text, message text,
  created_at timestamptz default now()
);
create table if not exists public.permission_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  role text not null, feature text not null, can_read boolean default false, can_write boolean default false
);
create table if not exists public.qbo_integration_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.auth_company_id() references public.companies(id) on delete cascade,
  is_connected boolean default false, access_token text, refresh_token text, token_expires_at timestamptz,
  realm_id text, sync_invoices boolean default true, sync_clients boolean default true,
  sync_projects boolean default false, last_sync_at timestamptz
);
create unique index if not exists qbo_one_per_company on public.qbo_integration_settings (company_id);
create index if not exists clients_company_idx on public.clients (company_id);
create index if not exists estimates_company_idx on public.estimates (company_id);
create index if not exists tasks_company_idx on public.tasks (company_id);

-- ---- RLS ----
do $$
declare
  t text;
  standard text[] := array[
    'clients','sub_contractors','catalog_items','tasks','task_templates','project_files','materials',
    'estimates','estimate_templates','client_change_orders','invoices','expenses','crew_schedule_entries',
    'daily_goals','time_off_requests','phase_approval_requests','bid_requests','bid_submissions',
    'sub_change_orders','client_requests','chat_messages'
  ];
begin
  foreach t in array standard loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_all on public.%I', t);
    execute format(
      $p$create policy tenant_all on public.%I for all to authenticated
           using (company_id = (select public.auth_company_id()))
           with check (company_id = (select public.auth_company_id()))$p$, t);
  end loop;
end $$;

alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (company_id = (select public.auth_company_id())
         and (user_id = (select auth.uid()) or (select public.is_company_manager())));
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (company_id = (select public.auth_company_id()));
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (company_id = (select public.auth_company_id()) and user_id = (select auth.uid()))
  with check (company_id = (select public.auth_company_id()));

alter table public.permission_settings enable row level security;
drop policy if exists ps_select on public.permission_settings;
create policy ps_select on public.permission_settings for select to authenticated
  using (company_id = (select public.auth_company_id()));
drop policy if exists ps_write on public.permission_settings;
create policy ps_write on public.permission_settings for all to authenticated
  using ((select public.is_company_admin()) and company_id = (select public.auth_company_id()))
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));

alter table public.qbo_integration_settings enable row level security;
drop policy if exists qbo_admin on public.qbo_integration_settings;
create policy qbo_admin on public.qbo_integration_settings for all to authenticated
  using ((select public.is_company_admin()) and company_id = (select public.auth_company_id()))
  with check ((select public.is_company_admin()) and company_id = (select public.auth_company_id()));
