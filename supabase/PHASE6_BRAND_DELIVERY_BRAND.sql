-- ============================================================
-- PHASE6_BRAND_DELIVERY_BRAND.sql
-- ============================================================
-- Purpose
--   Lets the Branded Delivery page show the restaurant's name, logo and
--   brand colours BEFORE the customer picks an area. Until now that data
--   was only returned after routing, so the page looked generic.
--
-- What it adds
--   * ONE new read-only function: brand_delivery_brand(restaurant_id, brand_secret)
--     Returns { restaurant_name, logo_url, theme } for the same QR secret
--     that brand_delivery_areas() already accepts. Same secret check, same
--     error for a bad QR. Nothing else is read or changed.
--
-- Safety
--   * Idempotent (CREATE OR REPLACE, GRANT is repeatable).
--   * No table, column, policy or existing function is changed or dropped.
--   * Returns no PIN, admin key, service key or rider data.
--   * The theme value is the same data customer_bootstrap() already returns
--     to every QR-scanning customer.
--   * Wrapped in a transaction.
--
-- Prerequisites
--   * FINAL_PRODUCTION_2026_10_08.sql (provides sessions.qr_secret, sessions.theme,
--     sessions.logo_url and brand_delivery_areas).
--
-- Run: Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
-- If the app page shows neutral branding afterwards, this file has not run yet.
-- ============================================================

begin;

-- 0. PREFLIGHT
do $$
begin
  if to_regclass('public.sessions') is null then
    raise exception 'PREREQ_MISSING: sessions table not found';
  end if;
  if to_regprocedure('brand_delivery_areas(text,text)') is null then
    raise exception 'PREREQ_MISSING: run FINAL_PRODUCTION_2026_10_08.sql first (brand_delivery_areas not found)';
  end if;
end $$;

-- 1. BRAND READ (same QR secret rule as brand_delivery_areas)
create or replace function brand_delivery_brand(p_restaurant_id text, p_brand_secret text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s record;
begin
  select restaurant_name, logo_url, theme
    into s
    from sessions
   where restaurant_id = trim(p_restaurant_id)
     and qr_secret = trim(p_brand_secret)
     and is_active = true
   order by created_at desc
   limit 1;

  if not found then
    raise exception 'INVALID_DELIVERY_QR';
  end if;

  return jsonb_build_object(
    'restaurant_name', s.restaurant_name,
    'logo_url', s.logo_url,
    'theme', coalesce(s.theme, '{}'::jsonb)
  );
end $$;

-- 2. GRANTS (same pattern as brand_delivery_areas)
revoke all on function brand_delivery_brand(text, text) from public;
grant execute on function brand_delivery_brand(text, text) to authenticated;

-- 3. Reload API schema cache so the new function is callable immediately
notify pgrst, 'reload schema';

commit;

-- ============================================================
-- VERIFY (optional, run separately)
--   select brand_delivery_brand('<restaurant_id>', '<qr_secret>');
--   -- expect {"restaurant_name": "...", "logo_url": ..., "theme": {...}}
--   select brand_delivery_brand('<restaurant_id>', 'wrong');
--   -- expect error INVALID_DELIVERY_QR
--
-- ROLLBACK (commented out)
--   -- drop function if exists brand_delivery_brand(text, text);
--   -- The page falls back to neutral branding if the function is missing.
-- ============================================================
