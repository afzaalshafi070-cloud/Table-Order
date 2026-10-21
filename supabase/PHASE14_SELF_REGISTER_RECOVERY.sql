-- ============================================================================
-- PHASE 14: Self-register restaurant + recovery code + new-device check
-- ----------------------------------------------------------------------------
-- 1. restaurant_plans: registered_via ('admin' | 'self'), recovery_hash.
-- 2. normalize_phone(): "03001234567", "+923001234567", "923001234567" are one number.
-- 3. self_register_restaurant(): one call creates the restaurant (trial 14 days,
--    paid choice noted for the Subscription flow), returns an AUTO activation
--    code (used for the first login) and a RECOVERY code (shown once, used on a
--    new device). Blocks: same name, similar name (pg_trgm >= 0.6), same phone,
--    more than 2 restaurants from one device.
-- 4. staff_login(): a self-registered restaurant on a new device must send the
--    recovery code, otherwise NEW_DEVICE_RECOVERY_CODE_REQUIRED.
-- Run AFTER PHASE13. Safe to re-run.
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

alter table restaurant_plans add column if not exists registered_via text not null default 'admin';
alter table restaurant_plans add column if not exists recovery_hash text;

create or replace function normalize_phone(p text)
returns text
language sql immutable
as $$
  select case
    when d like '00%' then substr(d, 3)
    when d like '0%'  then '92' || substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p,''), '[^0-9]', '', 'g') as d) x;
$$;

create or replace function self_register_restaurant(
  p_name text,
  p_pin text,
  p_phone text,
  p_plan text default 'trial',
  p_city text default null,
  p_device_token text default ''
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_name text := trim(coalesce(p_name,''));
  v_id text := btrim(lower(regexp_replace(trim(coalesce(p_name,'')),'[^a-zA-Z0-9]+','-','g')),'-');
  v_phone text := normalize_phone(p_phone);
  v_kind text := case when p_plan = 'paid' then 'paid' else 'trial' end;
  v_now timestamptz := now();
  v_code text;
  v_recovery text;
  v_device text := case when length(trim(coalesce(p_device_token,''))) >= 16
                        then encode(digest(trim(p_device_token),'sha256'),'hex') end;
  v_device_count int;
begin
  if length(v_name) < 2 or length(v_name) > 80 or length(v_id) < 2 then raise exception 'INVALID_NAME'; end if;
  if length(trim(coalesce(p_pin,''))) < 4 or length(trim(p_pin)) > 6 then raise exception 'INVALID_PIN'; end if;
  if length(v_phone) < 10 or length(v_phone) > 15 then raise exception 'INVALID_PHONE'; end if;

  if exists(select 1 from restaurant_plans where restaurant_id = v_id) then raise exception 'RESTAURANT_EXISTS'; end if;
  if exists(select 1 from restaurant_plans where normalize_phone(contact_phone) = v_phone) then raise exception 'PHONE_ALREADY_REGISTERED'; end if;
  if exists(
    select 1 from restaurant_plans
    where extensions.similarity(btrim(lower(regexp_replace(coalesce(restaurant_name,''),'[^a-zA-Z0-9]+','-','g')),'-'), v_id) >= 0.6
  ) then raise exception 'NAME_TOO_SIMILAR'; end if;
  if v_device is not null then
    select count(*) into v_device_count from restaurant_plans where device_hash = v_device;
    if v_device_count >= 2 then raise exception 'DEVICE_LIMIT'; end if;
  end if;

  v_code := 'TO-' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8));
  v_recovery := 'RC-' || upper(substr(encode(gen_random_bytes(6),'hex'),1,12));

  insert into restaurant_plans(
    restaurant_id, restaurant_name, plan_status, trial_ends_at, billing_cycle, activated_at,
    activation_required, initial_pin_hash, contact_phone, city, registered_via, recovery_hash,
    device_hash, notes
  ) values(
    v_id, v_name, 'trial', v_now + make_interval(days => 14), 'month', v_now,
    true, crypt(trim(p_pin), gen_salt('bf',10)), trim(p_phone), nullif(trim(coalesce(p_city,'')),''),
    'self', encode(digest(v_recovery,'sha256'),'hex'), v_device,
    case when v_kind = 'paid' then 'Paid plan chosen at registration: payment via Subscription screen' end
  );

  insert into activation_codes(code, is_used, is_revoked, restaurant_id, assigned_at)
  values(v_code, false, false, v_id, v_now);

  insert into admin_audit_log(action_type, restaurant_id, result, details)
  values('self_register', v_id, 'success', jsonb_build_object('plan', v_kind, 'phone_last4', right(v_phone,4)));

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', v_id,
    'restaurant_name', v_name,
    'plan', v_kind,
    'activation_code', v_code,
    'recovery_code', v_recovery
  );
exception when unique_violation then
  raise exception 'RESTAURANT_EXISTS';
end;
$$;

revoke all on function self_register_restaurant(text,text,text,text,text,text) from public;
grant execute on function self_register_restaurant(text,text,text,text,text,text) to anon, authenticated;

-- ---------------- staff_login (PHASE13 version + new-device check) ----------------
create or replace function staff_login(
  p_restaurant_name text,
  p_pin text,
  p_activation_code text default '',
  p_tab_secret text default '',
  p_silent boolean default false,
  p_device_token text default ''
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_slug text := btrim(lower(regexp_replace(coalesce(p_restaurant_name,''), '[^a-zA-Z0-9]+', '-', 'g')), '-');
  v_restaurant_id text;
  v_active sessions%rowtype;
  v_old sessions%rowtype;
  v_new sessions%rowtype;
  v_access staff_access%rowtype;
  v_code activation_codes%rowtype;
  v_plan restaurant_plans%rowtype;
  v_plan_json jsonb;
  v_pay jsonb;
  v_now timestamptz := now();
  v_device_hash text := case when length(trim(coalesce(p_device_token,''))) >= 16
                             then encode(digest(trim(p_device_token),'sha256'),'hex') end;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_pin,''))) < 4 or length(trim(coalesce(p_pin,''))) > 32 then raise exception 'INVALID_PIN'; end if;
  if length(v_slug) < 2 or length(v_slug) > 80 then raise exception 'INVALID_RESTAURANT'; end if;
  if length(trim(coalesce(p_tab_secret,''))) < 16 then raise exception 'Tab session missing'; end if;

  -- 1) Plan lookup: exact id first, then normalised name.
  select * into v_plan from restaurant_plans where restaurant_id = v_slug;
  if not found then
    select * into v_plan from restaurant_plans
    where btrim(lower(regexp_replace(coalesce(restaurant_name,''), '[^a-zA-Z0-9]+', '-', 'g')), '-') = v_slug
    order by created_at desc
    limit 1;
  end if;
  if not found then raise exception 'RESTAURANT_NOT_PROVISIONED'; end if;
  v_restaurant_id := v_plan.restaurant_id;

  v_plan_json := ensure_restaurant_plan_access(v_restaurant_id, p_restaurant_name);
  select * into v_plan from restaurant_plans where restaurant_id = v_restaurant_id;
  v_pay := list_active_payment_accounts();

  -- 1b) Self-registered restaurant on a NEW device: recovery code is required.
  --     (First activation uses the auto activation code, so it is skipped here.)
  if v_plan.registered_via = 'self' and v_plan.activation_required = false
     and (v_device_hash is null or v_plan.device_hash is distinct from v_device_hash) then
    if v_plan.recovery_hash is null
       or encode(digest(upper(trim(coalesce(p_activation_code,''))),'sha256'),'hex') <> v_plan.recovery_hash then
      raise exception 'NEW_DEVICE_RECOVERY_CODE_REQUIRED';
    end if;
  end if;

  -- 2) A session is already live for this restaurant: PIN + resume or takeover rule.
  select * into v_active from sessions
  where restaurant_id = v_restaurant_id and is_active = true
  order by created_at desc limit 1 for update;
  if found then
    if v_active.pin_hash is null or crypt(p_pin, v_active.pin_hash) <> v_active.pin_hash then raise exception 'INVALID_PIN'; end if;
    select * into v_access from staff_access where session_id = v_active.id;
    if found and v_access.user_id = v_uid and v_access.tab_secret = p_tab_secret then
      update staff_access set last_seen_at = v_now where session_id = v_active.id;
      update sessions set last_seen_at = v_now where id = v_active.id;
      if v_device_hash is not null then update restaurant_plans set device_hash = v_device_hash where restaurant_id = v_restaurant_id; end if;
      return jsonb_build_object('ok',true,'session',to_jsonb(v_active)-'pin_hash','resumed',true,'plan',v_plan_json,'payment_accounts',v_pay);
    end if;
    if p_silent then return jsonb_build_object('ok',false,'code','SILENT_RESUME_FAILED'); end if;
    if found and v_access.last_seen_at > v_now - interval '45 seconds' then raise exception 'RESTAURANT_ALREADY_ACTIVE'; end if;
    update staff_access set user_id = v_uid, tab_secret = p_tab_secret, last_seen_at = v_now where session_id = v_active.id;
    if not found then insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_active.id,v_uid,p_tab_secret,v_now); end if;
    update sessions set last_seen_at = v_now where id = v_active.id;
    select * into v_active from sessions where id = v_active.id;
    if v_device_hash is not null then update restaurant_plans set device_hash = v_device_hash where restaurant_id = v_restaurant_id; end if;
    return jsonb_build_object('ok',true,'session',to_jsonb(v_active)-'pin_hash','resumed',true,'plan',v_plan_json,'payment_accounts',v_pay);
  end if;

  -- 3) Earlier shift existed: new shift with the same PIN (no code needed).
  select * into v_old from sessions where restaurant_id = v_restaurant_id order by created_at desc limit 1;
  if found then
    if v_old.pin_hash is null or crypt(p_pin, v_old.pin_hash) <> v_old.pin_hash then raise exception 'INVALID_PIN'; end if;
    insert into sessions(
      restaurant_id,restaurant_name,pin_hash,qr_secret,rider_secret,is_active,
      shift_started_at,last_seen_at,logo_url,theme,tax_percent,tax_label
    ) values(
      v_restaurant_id, v_plan.restaurant_name, v_old.pin_hash,
      coalesce(nullif(trim(v_old.qr_secret),''), encode(gen_random_bytes(16),'hex')),
      coalesce(nullif(trim(v_old.rider_secret),''), encode(gen_random_bytes(24),'hex')),
      true, v_now, v_now, v_old.logo_url, coalesce(v_old.theme,'{}'::jsonb),
      coalesce(v_old.tax_percent,0), coalesce(nullif(v_old.tax_label,''),'Tax')
    ) returning * into v_new;
    insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_new.id,v_uid,p_tab_secret,v_now);
    insert into menu_items(session_id,category,name,price,description,image_url,is_available,sort_order)
      select v_new.id,category,name,price,description,image_url,is_available,sort_order
      from menu_items where session_id = v_old.id;
    begin
      insert into delivery_areas(session_id,name,charge) select v_new.id,name,charge from delivery_areas where session_id = v_old.id;
    exception when others then null;
    end;
    begin
      insert into deals(session_id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order)
        select v_new.id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order
        from deals where session_id = v_old.id;
    exception when others then null;
    end;
    if v_device_hash is not null then update restaurant_plans set device_hash = v_device_hash where restaurant_id = v_restaurant_id; end if;
    return jsonb_build_object('ok',true,'session',to_jsonb(v_new)-'pin_hash','new_shift',true,'plan',v_plan_json,'payment_accounts',v_pay);
  end if;

  -- 4) First ever login for an admin-provisioned restaurant: activation code is required.
  if length(trim(coalesce(p_activation_code,''))) < 4 then raise exception 'INVALID_ACTIVATION_CODE'; end if;
  select * into v_code from activation_codes
  where upper(trim(code)) = upper(trim(p_activation_code))
    and is_used = false
    and coalesce(is_revoked,false) = false
    and (restaurant_id is null or restaurant_id = v_restaurant_id)
  for update;
  if not found then raise exception 'INVALID_ACTIVATION_CODE'; end if;
  if v_plan.initial_pin_hash is null or crypt(p_pin, v_plan.initial_pin_hash) <> v_plan.initial_pin_hash then raise exception 'INVALID_PIN'; end if;

  insert into sessions(
    restaurant_id,restaurant_name,pin_hash,qr_secret,rider_secret,is_active,
    shift_started_at,last_seen_at,tax_percent,tax_label
  ) values(
    v_restaurant_id, v_plan.restaurant_name, v_plan.initial_pin_hash,
    encode(gen_random_bytes(16),'hex'), encode(gen_random_bytes(24),'hex'),
    true, v_now, v_now, 0, 'Tax'
  ) returning * into v_new;

  update activation_codes set is_used = true, used_by = v_restaurant_id, used_at = v_now where id = v_code.id;

  update restaurant_plans
  set activation_required = false, initial_pin_hash = null, device_hash = coalesce(v_device_hash, device_hash), updated_at = v_now
  where restaurant_id = v_restaurant_id;

  insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_new.id,v_uid,p_tab_secret,v_now);

  return jsonb_build_object('ok',true,'session',to_jsonb(v_new)-'pin_hash','new_restaurant',true,'plan',v_plan_json,'payment_accounts',v_pay);
exception when unique_violation then
  raise exception 'RESTAURANT_ALREADY_ACTIVE';
end;
$$;

revoke all on function staff_login(text,text,text,text,boolean,text) from public;
grant execute on function staff_login(text,text,text,text,boolean,text) to authenticated;

-- VERIFY
-- select proname from pg_proc where proname in ('self_register_restaurant','staff_login','normalize_phone');  -- 3 rows
-- select normalize_phone('0300-1234567');   -- expect 923001234567
