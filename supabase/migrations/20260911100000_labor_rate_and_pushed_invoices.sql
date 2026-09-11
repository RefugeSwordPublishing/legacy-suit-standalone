-- Two small fixes.
--
-- 1. The labor hour rate moves onto company_settings. It lived in each browser's localStorage, so a
--    phone that never opened Estimate Settings read the $40 default while the office used whatever
--    it had typed. It converts labor dollars to hours in two places (budget hours on a project made
--    from an estimate, and the hours a subcontractor payment takes off a job), so every device and
--    every office user needs the same number. Null means "not set yet"; the app reads 40.
alter table public.company_settings add column if not exists labor_hour_rate numeric
  check (labor_hour_rate is null or labor_hour_rate > 0);

-- 2. An invoice pushed to QuickBooks or Xero is issued: it has a number there and sits in accounts
--    receivable. The list's push button left these as draft, which also hid a pushed Schedule of
--    Values invoice from the "already billed" totals on the next one. Pushes now mark the invoice
--    sent; this catches the ones pushed before that.
update public.invoices set status = 'sent'
where coalesce(status, 'draft') = 'draft'
  and (quickbooks_invoice_id is not null or xero_invoice_id is not null);
