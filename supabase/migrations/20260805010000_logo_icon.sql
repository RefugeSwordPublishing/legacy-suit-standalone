-- Second per-tenant logo: an icon/mark (square or round) alongside the existing wide letterhead
-- logo (logo_url). Tenants upload both in the admin branding editor; documents can use the
-- letterhead for the header and the mark for compact spots.

alter table public.company_settings add column if not exists logo_icon_url text;

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
        'company_name', cs.company_name, 'logo_url', cs.logo_url, 'logo_icon_url', cs.logo_icon_url, 'tagline', cs.tagline,
        'address_line', cs.address_line, 'city_state_zip', cs.city_state_zip,
        'phone', cs.phone, 'email', cs.email, 'website', cs.website,
        'established_label', cs.established_label, 'brand_primary', cs.brand_primary, 'brand_accent', cs.brand_accent,
        'payment_schedule', cs.payment_schedule, 'estimate_terms', cs.estimate_terms
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
