-- Add per-tenant branding to the public (unauthenticated) estimate + change-order RPCs so those
-- client-facing pages can render the tenant's own company name/logo/contact instead of hardcoded
-- Legacy branding. Branding is pulled from company_settings for the record's company_id.

create or replace function public.get_public_estimate(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
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
    'branding', (
      select jsonb_build_object(
        'company_name', cs.company_name, 'logo_url', cs.logo_url, 'tagline', cs.tagline,
        'address_line', cs.address_line, 'city_state_zip', cs.city_state_zip,
        'phone', cs.phone, 'email', cs.email, 'website', cs.website,
        'established_label', cs.established_label, 'brand_primary', cs.brand_primary, 'brand_accent', cs.brand_accent
      ) from public.company_settings cs where cs.company_id = e.company_id
    ),
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
            'quantity',         li->'quantity',
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
$function$;

create or replace function public.get_public_change_order(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public'
as $function$
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
    'branding', (
      select jsonb_build_object(
        'company_name', cs.company_name, 'logo_url', cs.logo_url, 'tagline', cs.tagline,
        'address_line', cs.address_line, 'city_state_zip', cs.city_state_zip,
        'phone', cs.phone, 'email', cs.email, 'website', cs.website,
        'established_label', cs.established_label, 'brand_primary', cs.brand_primary, 'brand_accent', cs.brand_accent
      ) from public.company_settings cs where cs.company_id = c.company_id
    ),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',    sec->>'id',
        'name',  sec->>'name',
        'title', sec->>'title',
        'line_items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'description',        li->>'description',
            'item_description',   li->>'item_description',
            'client_description', li->>'client_description',
            'unit',               li->>'unit',
            'quantity',           li->'quantity',
            'line_total',         li->'line_total'
          ))
          from jsonb_array_elements(coalesce(sec->'line_items', sec->'items', '[]'::jsonb)) li
        ), '[]'::jsonb)
      ))
      from jsonb_array_elements(coalesce(c.sections, '[]'::jsonb)) sec
    ), '[]'::jsonb)
  )
  from public.client_change_orders c
  where c.id = p_id;
$function$;
