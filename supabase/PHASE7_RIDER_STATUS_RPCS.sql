-- ============================================================
-- PHASE 7 — Rider status RPCs (PICKING_UP, OUT_FOR_DELIVERY)
-- Run once in Supabase SQL Editor. Idempotent.
-- Adds one rider RPC that moves an assigned order through:
--   ACCEPTED -> PICKING_UP -> OUT_FOR_DELIVERY
-- Then the existing rider_portal_mark_delivered finishes it.
-- Status values already exist in the riders/orders/history check constraints
-- (PHASE1_RIDER_FOUNDATION.sql), so no constraint change is needed.
-- ============================================================

begin;

-- Preflight: stop early if the rider foundation is missing
do $$
begin
  if to_regclass('public.orders') is null
     or to_regclass('public.riders') is null
     or to_regclass('public.rider_portal_sessions') is null
     or to_regclass('public.rider_assignment_history') is null then
    raise exception 'PHASE7_PREFLIGHT: rider tables are missing. Run PHASE1_RIDER_FOUNDATION.sql first.';
  end if;
end $$;

create or replace function rider_portal_set_order_status(
  p_portal_token text,
  p_order_id uuid,
  p_status text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  ps rider_portal_sessions%rowtype;
  o orders%rowtype;
  v_status text := upper(trim(coalesce(p_status, '')));
  thash text := encode(digest(trim(p_portal_token), 'sha256'), 'hex');
begin
  select * into ps
  from rider_portal_sessions
  where token_hash = thash
    and auth_user_id = auth.uid()
    and revoked_at is null
    and last_seen_at > now() - interval '30 days';
  if not found then raise exception 'RIDER_SESSION_EXPIRED'; end if;

  if v_status not in ('PICKING_UP', 'OUT_FOR_DELIVERY') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into o
  from orders
  where id = p_order_id and assigned_rider_id = ps.rider_id
  for update;
  if not found then raise exception 'ORDER_NOT_ASSIGNED_TO_YOU'; end if;

  -- Same status again: success, nothing to change (safe on double tap / retry)
  if o.assignment_status = v_status then
    return jsonb_build_object('ok', true, 'order_id', o.id, 'assignment_status', v_status, 'unchanged', true);
  end if;

  -- Allowed moves only
  if not (
       (v_status = 'PICKING_UP' and o.assignment_status = 'ACCEPTED')
    or (v_status = 'OUT_FOR_DELIVERY' and o.assignment_status in ('ACCEPTED', 'PICKING_UP'))
  ) then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;

  update orders
     set assignment_status = v_status,
         updated_at = now()
   where id = o.id;

  update riders
     set duty_status = v_status,
         last_seen_at = now(),
         updated_at = now()
   where id = ps.rider_id;

  update rider_assignment_history
     set status = v_status
   where order_id = o.id
     and rider_id = ps.rider_id
     and status not in ('DELIVERED', 'CANCELLED');

  update rider_portal_sessions set last_seen_at = now() where id = ps.id;

  return jsonb_build_object('ok', true, 'order_id', o.id, 'assignment_status', v_status);
end;
$$;

revoke all on function rider_portal_set_order_status(text, uuid, text) from public;
grant execute on function rider_portal_set_order_status(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- VERIFY (optional, run separately, read-only):
--   select proname from pg_proc where proname = 'rider_portal_set_order_status';
--   -> should return 1 row.
--
-- ROLLBACK (only if you must undo):
--   drop function if exists rider_portal_set_order_status(text, uuid, text);
--   notify pgrst, 'reload schema';
-- ============================================================
