-- Per-tenant white-glove branding. Reuse the existing company_settings branding columns
-- (brand_primary, brand_accent, logo_url) that already drive client-facing docs, and add the two
-- new app-theme levers: a font pairing key and a default theme. Editing these in the admin portal
-- now brands BOTH the in-app UI and the client documents from one place. company_settings is
-- readable by every member (company_settings_select), so the whole tenant themes consistently.
alter table public.company_settings drop column if exists branding;
alter table public.company_settings add column if not exists brand_font text;
alter table public.company_settings add column if not exists brand_theme text;
