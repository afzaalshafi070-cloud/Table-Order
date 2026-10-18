-- ============================================================
-- Counter Settings + Billing + Bill alert patch
-- Safe to run multiple times (IF NOT EXISTS / CREATE OR REPLACE)
-- Does NOT invent payment_records / saas_accounts tables.
-- Uses existing: restaurant_plans, payment_accounts, sessions, alerts
-- ============================================================

-- Allow 'bill' alert type from customer (Ask for Bill)
create or replace function customer_raise_alert(
  p_session_id uuid,
  p_table_id text,
  p_type text
)
returns alerts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row alerts%rowtype;
  v_count int;
begin
  if v_uid is null
     or not exists (
       select 1 from customer_access
       where session_id = p_session_id
         and table_id = trim(p_table_id)
         and user_id = v_uid
     )
  then
    raise exception 'Customer session expired';
  end if;

  if p_type not in ('water', 'waiter', 'bill') then
    raise exception 'Invalid alert';
  end if;

  select count(*) into v_count
  from alerts
  where session_id = p_session_id
    and table_id = trim(p_table_id)
    and created_at > now() - interval '60 seconds';

  if v_count >= 5 then
    raise exception 'RATE_LIMIT';
  end if;

  insert into alerts (session_id, table_id, type)
  values (p_session_id, trim(p_table_id), p_type)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function customer_raise_alert(uuid, text, text) from public;
grant execute on function customer_raise_alert(uuid, text, text) to authenticated;

-- ============================================================
-- staff_change_pin
-- Verifies current PIN + staff tab lease, updates pin_hash on
-- the active session (bcrypt). Never returns plaintext PIN.
-- ============================================================
create or replace function staff_change_pin(
  p_session_id uuid,
  p_tab_secret text,
  p_current_pin text,
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
  v_access staff_access%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if length(trim(coalesce(p_tab_secret, ''))) < 16 then
    raise exception 'Tab session missing';
  end if;

  if length(trim(coalesce(p_current_pin, ''))) < 4
     or length(trim(coalesce(p_new_pin, ''))) < 4
     or length(trim(coalesce(p_new_pin, ''))) > 32
  then
    raise exception 'Invalid PIN';
  end if;

  select * into v_session
  from sessions
  where id = p_session_id
    and is_active = true
  for update;

  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  -- Must hold staff lease for this session
  select * into v_access
  from staff_access
  where session_id = p_session_id
    and user_id = v_uid
    and tab_secret = p_tab_secret;

  if not found then
    raise exception 'NOT_AUTHORIZED';
  end if;

  if v_session.pin_hash is null
     or crypt(p_current_pin, v_session.pin_hash) <> v_session.pin_hash
  then
    raise exception 'INVALID_CURRENT_PIN';
  end if;

  update sessions
  set pin_hash = crypt(p_new_pin, gen_salt('bf', 10))
  where id = p_session_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function staff_change_pin(uuid, text, text, text) from public;
grant execute on function staff_change_pin(uuid, text, text, text) to authenticated;
