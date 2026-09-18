-- QuickBooks sandbox support.
--
-- An Intuit sandbox company is not reachable at the production API host and does not accept the
-- app's Production keys: it lives at sandbox-quickbooks.api.intuit.com and authenticates with the
-- Development keys. So a connection has to record which environment it belongs to, and every call
-- made on that connection has to follow it.
--
-- Existing rows are production, which is what they already were. Tenants never see this; the
-- sandbox option is offered only to platform admins, for recording demos and for testing changes
-- to the invoice push without touching a real client's books.

alter table public.qbo_integration_settings
  add column if not exists environment text not null default 'production';

alter table public.qbo_integration_settings
  drop constraint if exists qbo_integration_settings_environment_check;

alter table public.qbo_integration_settings
  add constraint qbo_integration_settings_environment_check
  check (environment in ('production', 'sandbox'));
