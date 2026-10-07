-- ============================================================
-- IMMEDIATE FIX: overloaded rider_set_duty_status
-- ============================================================
-- Error you saw:
--   Could not choose the best candidate function between:
--   public.rider_set_duty_status(p_rider_id => uuid, p_duty_status => text),
--   public.rider_set_duty_status(p_rider_id => uuid, p_duty_status => text, p_device_token => text)
--
-- Run this in Supabase SQL Editor. Safe to re-run.
-- The rider portal no longer calls this function (it uses rider_portal_set_duty).
-- This just removes the ambiguity so any leftover callers also work.
-- ============================================================

drop function if exists public.rider_set_duty_status(uuid, text, text);
drop function if exists public.rider_set_duty_status(uuid, text);

create or replace function public.rider_set_duty_status(p_rider_id uuid, p_duty_status text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_duty_status not in ('OFF_DUTY', 'AVAILABLE') then
    raise exception 'INVALID_DUTY_STATUS';
  end if;
  update riders
  set duty_status = p_duty_status,
      last_available_at = case when p_duty_status = 'AVAILABLE' then now() else last_available_at end,
      last_seen_at = now(),
      updated_at = now()
  where id = p_rider_id
    and is_active = true
    and duty_status in ('OFF_DUTY', 'AVAILABLE');
  return found;
end;
$$;

revoke all on function public.rider_set_duty_status(uuid, text) from public;
grant execute on function public.rider_set_duty_status(uuid, text) to authenticated;
