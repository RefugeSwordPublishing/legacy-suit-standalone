-- Per-tenant branding for client-facing docs (estimates, invoices, portal). Client-facing views
-- hardcoded Legacy Renovations, its address, phone, website and the base44 logo URLs. These fields
-- let each tenant supply their own; tenant 0 (Legacy) is seeded with its current values so nothing
-- changes for them. logo_url / brand_primary / brand_accent already existed.
alter table public.company_settings add column if not exists company_name text;
alter table public.company_settings add column if not exists tagline text;
alter table public.company_settings add column if not exists address_line text;
alter table public.company_settings add column if not exists city_state_zip text;
alter table public.company_settings add column if not exists phone text;
alter table public.company_settings add column if not exists email text;
alter table public.company_settings add column if not exists website text;
alter table public.company_settings add column if not exists established_label text;

update public.company_settings set
  company_name       = coalesce(company_name, 'Legacy Renovations'),
  tagline            = coalesce(tagline, 'Craftsmanship you can trust'),
  address_line       = coalesce(address_line, ''),
  city_state_zip     = coalesce(city_state_zip, 'Springfield, MO 65804'),
  phone              = coalesce(phone, '(417) 555-0182'),
  email              = coalesce(email, 'info@legacyrenovationssgf.com'),
  website            = coalesce(website, 'legacyrenovationssgf.com'),
  established_label   = coalesce(established_label, 'Est. 2015'),
  logo_url           = coalesce(logo_url, 'https://media.base44.com/images/public/69d4420172cf85cc1afabd4c/5a0ac84cb_LegacyRennovations_PrimaryLogo_Dark.png')
where company_id = '2b659a9d-64b9-4afb-97fc-0cdb3936f8d3';
