-- ============================================================================
-- PHASE 8C: Public brand for the Rider LOGIN screen
-- ----------------------------------------------------------------------------
-- Adds rider_public_brand(restaurant_id): returns ONLY restaurant name, logo and
-- theme (same source as rider_brand_session). No PIN check, no rider data.
-- Needed so the rider login page shows the restaurant brand before sign-in.
-- Safe to re-run. Run AFTER PHASE8_RIDER_BRAND_LOOKUP.sql (v2) and, if v1 was ever
-- run, PHASE8B_ROLLBACK_RIDER_LOGIN.sql.
--
-- VERIFY:
--   select rider_public_brand('burger-blaster');   -- expect {"ok": true, ...}
-- ============================================================================

create or replace function rider_public_brand(p_restaurant_id text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare s sessions%rowtype;
begin
  select * into s from rider_brand_session(trim(p_restaurant_id));
  if not found or s.id is null then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'restaurant_id', s.restaurant_id,
    'restaurant_name', s.restaurant_name,
    'logo_url', s.logo_url,
    'theme', coalesce(s.theme, '{}'::jsonb)
  );
end $$;

grant execute on function rider_public_brand(text) to anon, authenticated;
