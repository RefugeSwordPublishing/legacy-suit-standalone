-- Invoice due dates were saved one day early: the form parsed the issue date as UTC midnight, the
-- previous evening in US time, before adding the term's days (fixed in InvoiceFormDialog). Correct
-- only rows carrying exactly that signature, due = issue + term days - 1, so a due date someone set
-- on purpose is left alone.
with terms(term, days) as (
  values ('due_on_receipt', 0), ('net_10', 10), ('net_15', 15), ('net_30', 30)
)
update public.invoices i
set due_date = (i.issue_date::date + t.days)
from terms t
where t.term = i.payment_terms
  and i.issue_date is not null
  and i.due_date is not null
  and i.due_date::date = i.issue_date::date + t.days - 1;
