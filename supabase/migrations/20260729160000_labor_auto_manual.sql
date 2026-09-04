-- Freeze existing labor lines as Manual (labor_auto=false), preserving their current
-- dollar values. The app now treats an "Auto" labor line as always equal to the live
-- sum of material per-unit labor (or $0 if none carry one). Historical estimates stored
-- flat labor amounts flagged "Auto"; without this they would recompute to $0 on the next
-- edit. New estimates use the clean model (derived = Auto, hand-entered = Manual).
update public.estimates e
set sections = coalesce((
  select jsonb_agg(
    sec || jsonb_build_object('line_items', coalesce((
      select jsonb_agg(
        case when li->>'category' = 'labor'
          then li || '{"labor_auto": false}'::jsonb
          else li
        end
      )
      from jsonb_array_elements(coalesce(sec->'line_items', '[]'::jsonb)) li
    ), '[]'::jsonb))
  )
  from jsonb_array_elements(e.sections) sec
), e.sections)
where e.sections is not null
  and jsonb_typeof(e.sections) = 'array'
  and jsonb_path_exists(e.sections, '$[*].line_items[*] ? (@.category == "labor")');
