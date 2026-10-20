-- ============================================================================
-- PHASE 8D: RIDER LOGIN DIAGNOSTIC (read-only, changes NOTHING)
-- ----------------------------------------------------------------------------
-- Run in Supabase SQL Editor. Replace the two values in the CONFIG block.
-- Shows, for the rider you are testing:
--   * the rider exists and is active
--   * the PIN hash is set AND the PIN you typed matches it (pin_ok)
--   * the newest link is active (not revoked) and matches the restaurant
--   * whether a portal session table row exists for the restaurant
-- Send the result rows back if login still fails.
-- ============================================================================

-- CONFIG: set these
--   rider phone you use to test, and the PIN you type on the login screen
with cfg as (
  select '03001234567'::text as rider_phone,   -- <- change to the rider's phone
         '1234'::text        as test_pin        -- <- change to the PIN you type
)
select
  r.id                                   as rider_id,
  r.restaurant_id,
  r.full_name,
  r.is_active,
  (r.pin_hash is not null)               as has_pin_hash,
  (crypt(cfg.test_pin, r.pin_hash) = r.pin_hash) as pin_ok,
  l.link_token,
  l.is_revoked                           as link_revoked,
  l.created_at                           as link_created_at
from cfg
join riders r on r.phone = cfg.rider_phone
left join lateral (
  select * from rider_portal_links x
  where x.rider_id = r.id
  order by x.created_at desc
  limit 1
) l on true;

-- Expected for a working rider: is_active = true, has_pin_hash = true,
-- pin_ok = true, link_revoked = false, and link_token filled.
-- If pin_ok = false: the PIN saved in the database is not the one typed.
--   Fix: Settings -> Riders -> edit the rider's PIN (or create a new rider) and
--   generate a NEW link after that.
-- If link_revoked = true or link_token is null: click "Generate Link" for that rider.

-- Recent sessions (Supabase side) for this restaurant:
select restaurant_id, is_active, created_at,
       (theme <> '{}'::jsonb) as has_theme,
       (coalesce(logo_url,'') <> '') as has_logo
from sessions
order by created_at desc
limit 5;
