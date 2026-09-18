-- QBO push refinements:
--  * auto_send: when false (default), pushing an invoice creates it in QuickBooks as a draft and
--    does NOT email the client or mark the GuildWright invoice 'sent'. Tenants who want the old
--    behavior (push = send) flip this on.
--  * category_item_map: Schedule-of-Values invoices roll up to estimate categories
--    (materials/labor/subcontractor/other), which carry no cost code, so the cost-code -> QBO item
--    map can't reach them and every line fell to the generic fallback item. This maps each category
--    to a QBO Product/Service so SOV line items land on the right item.

alter table public.qbo_integration_settings
  add column if not exists auto_send boolean not null default false;

alter table public.qbo_integration_settings
  add column if not exists category_item_map jsonb not null default '{}'::jsonb;
