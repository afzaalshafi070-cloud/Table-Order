-- ============================================================================
-- PHASE 10: Order timer, promo popup, Served -> Billing Pending -> Paid
-- ----------------------------------------------------------------------------
-- orders:   prep_minutes, prep_ready_at (timer), paid_at (billing closed)
-- sessions: active_promo_text, active_promo_image_url (one active promo)
-- RPC:      customer_active_promo(p_session_id) -> public, read-only
-- Safe to re-run. Run AFTER PHASE9.
-- ============================================================================

alter table orders add column if not exists prep_minutes int;
alter table orders add column if not exists prep_ready_at timestamptz;
alter table orders add column if not exists paid_at timestamptz;

alter table sessions add column if not exists active_promo_text text;
alter table sessions add column if not exists active_promo_image_url text;
alter table sessions add column if not exists active_promo_updated_at timestamptz;

create or replace function customer_active_promo(p_session_id uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
        'text', nullif(trim(coalesce(s.active_promo_text,'')),''),
        'image_url', nullif(trim(coalesce(s.active_promo_image_url,'')),''),
        'updated_at', s.active_promo_updated_at
      )
     from sessions s where s.id = p_session_id),
    jsonb_build_object('text', null, 'image_url', null)
  );
$$;

revoke all on function customer_active_promo(uuid) from public;
grant execute on function customer_active_promo(uuid) to anon, authenticated;

-- VERIFY
-- select customer_active_promo('<your-session-uuid>');
