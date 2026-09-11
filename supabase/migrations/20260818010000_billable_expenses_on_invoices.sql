-- Billable expenses can be imported onto an invoice as line items (#7). Track which invoice billed
-- an expense so it can be marked billed on save and, critically, returned to unbilled if that
-- invoice is later deleted (#8) — enforced by a DB trigger so it holds no matter how the delete
-- happens (UI, QBO webhook, admin console).

alter table public.expenses
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

alter table public.invoices
  add column if not exists imported_expense_ids text[];

-- On invoice delete, release any expenses it billed so they can be invoiced again.
create or replace function public.reset_expenses_on_invoice_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.expenses
     set billed = false, invoice_id = null
   where invoice_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_reset_expenses_on_invoice_delete on public.invoices;
create trigger trg_reset_expenses_on_invoice_delete
  before delete on public.invoices
  for each row execute function public.reset_expenses_on_invoice_delete();
