-- Lock down the public change-order view the same way as estimates. The previous
-- get_public_change_order was SELECT * and leaked per-item unit_cost/markup and the
-- internal `notes` field to anon callers. Return a client-safe jsonb whitelist.
drop function if exists public.get_public_change_order(uuid);

create or replace function public.get_public_change_order(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id',                      c.id,
    'change_order_number',     c.change_order_number,
    'title',                   c.title,
    'status',                  c.status,
    'client_name',             c.client_name,
    'client_email',            c.client_email,
    'project_name',            c.project_name,
    'date_issued',             c.date_issued,
    'valid_through',           c.valid_through,
    'scope_of_work',           c.scope_of_work,
    'original_estimate_total', c.original_estimate_total,
    'change_order_total',      c.change_order_total,
    'new_contract_total',      c.new_contract_total,
    'signed_by',               c.signed_by,
    'signed_at',               c.signed_at,
    'created_at',              c.created_at,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',    sec->>'id',
        'name',  sec->>'name',
        'title', sec->>'title',
        'line_items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'description',       li->>'description',
            'item_description',  li->>'item_description',
            'client_description', li->>'client_description',
            'unit',              li->>'unit',
            'quantity',          li->'quantity',
            'line_total',        li->'line_total'
          ))
          from jsonb_array_elements(coalesce(sec->'line_items', sec->'items', '[]'::jsonb)) li
        ), '[]'::jsonb)
      ))
      from jsonb_array_elements(coalesce(c.sections, '[]'::jsonb)) sec
    ), '[]'::jsonb)
  )
  from public.client_change_orders c
  where c.id = p_id;
$$;

revoke execute on function public.get_public_change_order(uuid) from public;
grant  execute on function public.get_public_change_order(uuid) to anon, authenticated;
