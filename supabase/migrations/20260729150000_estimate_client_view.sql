-- ============================================================================
-- Estimate client-safe view + client intro field.
--   1. Add estimates.client_intro (client-facing paragraph, separate from the
--      internal `notes` field which must never reach the client).
--   2. Replace get_public_estimate to return ONLY a whitelist of client-safe
--      fields as jsonb. The previous SELECT * leaked per-item unit_cost,
--      markup_pct, labor_cost_per_unit and category_markups to anon callers.
-- ============================================================================

alter table public.estimates add column if not exists client_intro text;

-- Return type changes from the estimates rowtype to jsonb, so drop the old one first.
drop function if exists public.get_public_estimate(uuid);

create or replace function public.get_public_estimate(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',             e.id,
    'estimate_number', e.estimate_number,
    'title',          e.title,
    'status',         e.status,
    'client_name',    e.client_name,
    'project_name',   e.project_name,
    'client_intro',   e.client_intro,
    'scope_of_work',  e.scope_of_work,
    'gc_fee_enabled', e.gc_fee_enabled,
    'gc_fee_pct',     e.gc_fee_pct,
    'gc_fee_label',   e.gc_fee_label,
    'grand_total',    e.grand_total,
    'signed_by',      e.signed_by,
    'signed_at',      e.signed_at,
    'created_at',     e.created_at,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',   sec->>'id',
        'name', sec->>'name',
        'line_items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'description',      li->>'description',
            'cost_code',        li->>'cost_code',
            'item_description', li->>'item_description',
            'unit',             li->>'unit',
            'quantity',         li->'quantity',   -- arrow keeps JSON number type
            'line_total',       li->'line_total'
          ))
          from jsonb_array_elements(coalesce(sec->'line_items', '[]'::jsonb)) li
        ), '[]'::jsonb)
      ))
      from jsonb_array_elements(coalesce(e.sections, '[]'::jsonb)) sec
    ), '[]'::jsonb)
  )
  from public.estimates e
  where e.id = p_id;
$$;

revoke execute on function public.get_public_estimate(uuid) from public;
grant  execute on function public.get_public_estimate(uuid) to anon, authenticated;
