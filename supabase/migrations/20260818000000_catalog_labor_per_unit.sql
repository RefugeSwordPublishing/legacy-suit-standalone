-- Catalog items can carry a per-unit labor rate for material items, so adding a material to an
-- estimate also seeds its labor (the estimate builder already auto-sums material labor into a labor
-- line). Before this, labor_cost_per_unit lived only on estimate line items and had to be re-typed.
alter table public.catalog_items
  add column if not exists labor_cost_per_unit numeric default 0;
