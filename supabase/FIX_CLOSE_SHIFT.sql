-- ============================================================
-- FIX: Close Shift was blocked by RLS
-- sessions_staff_update requires is_staff_for_session() which
-- requires is_active=true, so setting is_active=false always
-- failed silently (0 rows). Shift stayed open on server.
-- ============================================================

-- 1. staff_close_shift: properly close the shift (security definer)
create or replace function staff_close_shift(
  p_session_id uuid,
  p_tab_secret text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_access staff_access%rowtype;
  v_session sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  -- Verify this user owns the staff lease for this session
  select * into v_access
  from staff_access
  where session_id = p_session_id
    and user_id = v_uid
    and tab_secret = p_tab_secret;

  if not found then
    -- Still try to close if they are staff on this session (any tab_secret match for same user)
    select * into v_access
    from staff_access
    where session_id = p_session_id
      and user_id = v_uid;
  end if;

  if not found then
    raise exception 'NOT_STAFF_FOR_SESSION';
  end if;

  select * into v_session from sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  -- Close the shift
  update sessions
  set is_active = false,
      closed_at = now(),
      last_seen_at = now()
  where id = p_session_id;

  -- Drop all staff leases for this session
  delete from staff_access where session_id = p_session_id;

  return jsonb_build_object('ok', true, 'session_id', p_session_id);
end;
$$;

revoke all on function staff_close_shift(uuid, text) from public;
grant execute on function staff_close_shift(uuid, text) to authenticated;

-- 2. Also harden staff_logout so it can close when needed
create or replace function staff_logout(p_session_id uuid, p_tab_secret text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from staff_access
  where session_id = p_session_id
    and user_id = auth.uid()
    and tab_secret = p_tab_secret;
  return found;
end;
$$;

revoke all on function staff_logout(uuid, text) from public;
grant execute on function staff_logout(uuid, text) to authenticated;
