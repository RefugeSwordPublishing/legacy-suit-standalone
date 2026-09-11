-- ============================================================================
-- Migration 005: E-signature RPCs for the client-facing estimate / change-order
-- pages. The client opens an unguessable link (uuid) while logged out, so these
-- run SECURITY DEFINER (bypass RLS) and are granted to anon. Reading or signing
-- requires knowing the record's uuid, the same "unlisted link" model Base44 used.
-- ============================================================================

create or replace function public.get_public_estimate(p_id uuid)
returns public.estimates
language sql stable security definer set search_path = public as $$
  select * from public.estimates where id = p_id;
$$;

create or replace function public.get_public_change_order(p_id uuid)
returns public.client_change_orders
language sql stable security definer set search_path = public as $$
  select * from public.client_change_orders where id = p_id;
$$;

create or replace function public.sign_estimate(p_id uuid, p_signed_by text, p_signed_at timestamptz)
returns void
language sql volatile security definer set search_path = public as $$
  update public.estimates
  set signed_by = p_signed_by, signed_at = p_signed_at, status = 'approved'
  where id = p_id;
$$;

create or replace function public.sign_change_order(p_id uuid, p_signed_by text, p_signed_at timestamptz)
returns void
language sql volatile security definer set search_path = public as $$
  update public.client_change_orders
  set signed_by = p_signed_by, signed_at = p_signed_at, status = 'approved'
  where id = p_id;
$$;

revoke execute on function public.get_public_estimate(uuid)                      from public;
revoke execute on function public.get_public_change_order(uuid)                  from public;
revoke execute on function public.sign_estimate(uuid, text, timestamptz)         from public;
revoke execute on function public.sign_change_order(uuid, text, timestamptz)     from public;
grant  execute on function public.get_public_estimate(uuid)                      to anon, authenticated;
grant  execute on function public.get_public_change_order(uuid)                  to anon, authenticated;
grant  execute on function public.sign_estimate(uuid, text, timestamptz)         to anon, authenticated;
grant  execute on function public.sign_change_order(uuid, text, timestamptz)     to anon, authenticated;
