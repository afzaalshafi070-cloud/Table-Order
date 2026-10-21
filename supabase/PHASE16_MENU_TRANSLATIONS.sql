-- ============================================================================
-- PHASE 16: Menu item translations + keep them when a new shift starts
-- ----------------------------------------------------------------------------
-- 1) menu_items.translations stores the owner's translated item names, e.g.
--    {"ur": {"name": "چکن بریانی"}, "ar": {"name": "برياني دجاج"}}.
-- 2) staff_login (copied from PHASE14) now copies translations to the new
--    shift. Only the copy line changed. Everything else is identical.
-- Safe to re-run.
-- ============================================================================

alter table menu_items add column if not exists translations jsonb not null default '{}'::jsonb;

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
    insert into menu_items(session_id,category,name,price,description,image_url,is_available,sort_order,translations)
      select v_new.id,category,name,price,description,image_url,is_available,sort_order,translations
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

-- VERIFY 1: column exists
select column_name, data_type from information_schema.columns
where table_name = 'menu_items' and column_name = 'translations';

-- VERIFY 2: staff_login copies translations (should print 1 row)
select count(*) as copies_translations from pg_proc
where proname = 'staff_login' and prosrc ilike '%translations%';
