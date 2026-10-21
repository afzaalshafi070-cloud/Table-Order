-- ============================================================================
-- PHASE 9: Admin "Add restaurant" in ONE step
-- ----------------------------------------------------------------------------
-- 1. Drops the old 8-argument admin_create_restaurant (from TABLE_ORDER file).
-- 2. Re-creates the 13-argument version used by AdminPanel.jsx.
--    If p_activation_code is empty, the SERVER generates a code and returns it.
--    So the admin no longer has to generate a code first.
-- 3. Makes sure every contact/address column exists on restaurant_plans.
-- Safe to re-run. Run AFTER PHASE7_ADMIN_FIXES.sql and PHASE8E (if used).
-- ============================================================================

alter table restaurant_plans add column if not exists contact_name text;
alter table restaurant_plans add column if not exists contact_phone text;
alter table restaurant_plans add column if not exists contact_email text;
alter table restaurant_plans add column if not exists address text;
alter table restaurant_plans add column if not exists city text;

drop function if exists admin_create_restaurant(text,text,text,text,int,text,text,text);

create or replace function admin_create_restaurant(
  p_admin_key text,
  p_restaurant_name text,
  p_pin text,
  p_plan_status text default 'trial',
  p_days int default 30,
  p_billing_cycle text default 'month',
  p_notes text default null,
  p_activation_code text default '',
  p_contact_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_address text default null,
  p_city text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_name text := trim(coalesce(p_restaurant_name,''));
  v_id text := btrim(lower(regexp_replace(coalesce(p_restaurant_name,''),'[^a-zA-Z0-9]+','-','g')),'-');
  v_status text := coalesce(nullif(trim(p_plan_status),''),'trial');
  v_cycle text := coalesce(nullif(trim(p_billing_cycle),''),'month');
  v_days int := greatest(coalesce(p_days,30),1);
  v_now timestamptz := now();
  v_code text := upper(trim(coalesce(p_activation_code,'')));
  v_code_row activation_codes%rowtype;
  v_plan restaurant_plans%rowtype;
begin
  perform _admin_assert(p_admin_key);

  if length(v_name) < 2 or length(v_id) < 2 then raise exception 'INVALID_NAME'; end if;
  if length(trim(coalesce(p_pin,''))) < 4 or length(trim(p_pin)) > 32 then raise exception 'INVALID_PIN'; end if;
  if v_status not in ('trial','active','complimentary') then raise exception 'INVALID_PLAN_STATUS'; end if;
  if v_cycle not in ('month','six_months','year') then raise exception 'INVALID_BILLING_CYCLE'; end if;
  if length(coalesce(p_contact_name,'')) > 120 or length(coalesce(p_contact_phone,'')) > 30
     or length(coalesce(p_contact_email,'')) > 160 or length(coalesce(p_address,'')) > 300
     or length(coalesce(p_city,'')) > 80 then
    raise exception 'FIELD_TOO_LONG';
  end if;
  if v_cycle='six_months' and v_status='active' then v_days := greatest(v_days,180); end if;
  if v_cycle='year' and v_status='active' then v_days := greatest(v_days,365); end if;

  if exists(select 1 from restaurant_plans where restaurant_id = v_id) then
    raise exception 'RESTAURANT_EXISTS';
  end if;

  -- Activation code: use the one typed by admin (if any), otherwise generate.
  if v_code = '' then
    loop
      v_code := 'TO-' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8));
      exit when not exists(select 1 from activation_codes where code = v_code);
    end loop;
    insert into activation_codes(code, is_used, is_revoked, restaurant_id, assigned_at)
    values(v_code, false, false, v_id, v_now);
  else
    select * into v_code_row from activation_codes where upper(trim(code)) = v_code for update;
    if not found then raise exception 'ACTIVATION_CODE_NOT_FOUND'; end if;
    if v_code_row.is_used or v_code_row.is_revoked then raise exception 'ACTIVATION_CODE_UNAVAILABLE'; end if;
    if v_code_row.restaurant_id is not null and v_code_row.restaurant_id <> v_id then
      raise exception 'ACTIVATION_CODE_ASSIGNED';
    end if;
    update activation_codes set restaurant_id = v_id, assigned_at = v_now where id = v_code_row.id;
  end if;

  insert into restaurant_plans(
    restaurant_id, restaurant_name, plan_status, trial_ends_at, paid_until,
    billing_cycle, activated_at, notes, activation_required, initial_pin_hash,
    contact_name, contact_phone, contact_email, address, city
  ) values(
    v_id, v_name, v_status,
    case when v_status='trial' then v_now+make_interval(days=>v_days) else null end,
    case when v_status='active' then v_now+make_interval(days=>v_days) else null end,
    v_cycle, v_now, nullif(trim(coalesce(p_notes,'')),''), true,
    crypt(trim(p_pin), gen_salt('bf',10)),
    nullif(trim(coalesce(p_contact_name,'')),''),
    nullif(trim(coalesce(p_contact_phone,'')),''),
    nullif(trim(coalesce(p_contact_email,'')),''),
    nullif(trim(coalesce(p_address,'')),''),
    nullif(trim(coalesce(p_city,'')),'')
  ) returning * into v_plan;

  insert into admin_audit_log(action_type, restaurant_id, result, details)
  values('create_restaurant', v_id, 'success', jsonb_build_object(
    'name', v_name, 'plan', v_status, 'billing_cycle', v_cycle, 'activation_code', v_code
  ));

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', v_id,
    'restaurant_name', v_name,
    'activation_code', v_code,
    'activation_required', true,
    'plan', to_jsonb(v_plan) - 'initial_pin_hash'
  );
exception when unique_violation then
  raise exception 'RESTAURANT_EXISTS';
end;
$$;

revoke all on function admin_create_restaurant(text,text,text,text,int,text,text,text,text,text,text,text,text) from public;
grant execute on function admin_create_restaurant(text,text,text,text,int,text,text,text,text,text,text,text,text) to authenticated;

-- VERIFY: expect one row with 13 args
-- select proname, pg_get_function_arguments(oid) from pg_proc where proname = 'admin_create_restaurant';
