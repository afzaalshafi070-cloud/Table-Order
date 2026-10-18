-- ============================================================
-- TRIAL / PLAN MIGRATION (safe add-on — does NOT delete data)
--
-- Rules:
-- 1. New restaurant → 30-day free trial
-- 2. Trial/plan expired → staff login blocked (data kept forever)
-- 3. plan_status = 'complimentary' → always free (admin only, hidden from UI)
-- 4. Only YOU delete data manually — expiry never deletes anything
--
-- Admin helpers at bottom of this file.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- restaurant_plans
-- ------------------------------------------------------------
create table if not exists restaurant_plans (
  restaurant_id text primary key,
  restaurant_name text,
  plan_status text not null default 'trial'
    check (plan_status in ('trial', 'active', 'expired', 'complimentary')),
  trial_ends_at timestamptz,
  paid_until timestamptz,
  activated_at timestamptz not null default now(),
  notes text,
  updated_at timestamptz not null default now()
);

alter table restaurant_plans enable row level security;

-- Browser must never read/write plans directly
drop policy if exists restaurant_plans_deny_all on restaurant_plans;
create policy restaurant_plans_deny_all on restaurant_plans
  for all to authenticated, anon using (false) with check (false);

-- ------------------------------------------------------------
-- Helper: ensure plan row + enforce access
-- Returns nothing; raises PLAN_EXPIRED when blocked.
-- complimentary / active (paid_until future) / trial (not ended) → OK
-- ------------------------------------------------------------
create or replace function ensure_restaurant_plan_access(
  p_restaurant_id text,
  p_restaurant_name text default null
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_plan restaurant_plans%rowtype;
  v_now timestamptz := now();
begin
  select * into v_plan from restaurant_plans where restaurant_id = p_restaurant_id for update;

  if not found then
    insert into restaurant_plans (restaurant_id, restaurant_name, plan_status, trial_ends_at, activated_at)
    values (
      p_restaurant_id,
      nullif(trim(coalesce(p_restaurant_name, '')), ''),
      'trial',
      v_now + interval '30 days',
      v_now
    )
    returning * into v_plan;
  end if;

  -- Lifetime free (hidden from restaurant UI)
  if v_plan.plan_status = 'complimentary' then
    return;
  end if;

  -- Paid active
  if v_plan.plan_status = 'active' and (v_plan.paid_until is null or v_plan.paid_until > v_now) then
    return;
  end if;

  -- Trial still valid
  if v_plan.plan_status = 'trial' and v_plan.trial_ends_at is not null and v_plan.trial_ends_at > v_now then
    return;
  end if;

  -- Mark expired if needed (data untouched)
  if v_plan.plan_status <> 'expired' then
    update restaurant_plans
      set plan_status = 'expired', updated_at = v_now
      where restaurant_id = p_restaurant_id;
  end if;

  raise exception 'PLAN_EXPIRED';
end;
$$;

revoke all on function ensure_restaurant_plan_access(text, text) from public;
-- Only called from other SECURITY DEFINER functions

-- ------------------------------------------------------------
-- Patch staff_login: plan check (after auth, before business logic)
-- We replace the whole function to keep one source of truth.
-- ------------------------------------------------------------
create or replace function staff_login(
  p_restaurant_name text,
  p_pin text,
  p_activation_code text default '',
  p_tab_secret text default '',
  p_silent boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id text := lower(trim(regexp_replace(coalesce(p_restaurant_name,''), '[^a-zA-Z0-9]+', '-', 'g')));
  v_active sessions%rowtype;
  v_old sessions%rowtype;
  v_access staff_access%rowtype;
  v_new sessions%rowtype;
  v_code activation_codes%rowtype;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_pin,''))) < 4 or length(trim(coalesce(p_pin,''))) > 32 then raise exception 'Invalid PIN'; end if;
  if length(v_restaurant_id) < 2 or length(v_restaurant_id) > 80 then raise exception 'Invalid restaurant name'; end if;
  if length(trim(coalesce(p_tab_secret,''))) < 16 then raise exception 'Tab session missing'; end if;

  -- Plan / trial gate (never deletes data)
  perform ensure_restaurant_plan_access(v_restaurant_id, p_restaurant_name);

  select * into v_active from sessions where restaurant_id = v_restaurant_id and is_active = true for update;

  if found then
    if v_active.pin_hash is null or crypt(p_pin, v_active.pin_hash) <> v_active.pin_hash then
      raise exception 'INVALID_PIN';
    end if;
    select * into v_access from staff_access where session_id = v_active.id;
    if found and v_access.user_id = v_uid and v_access.tab_secret = p_tab_secret then
      update staff_access set last_seen_at = v_now where session_id = v_active.id;
      update sessions set last_seen_at = v_now where id = v_active.id;
      return jsonb_build_object('ok', true, 'session', to_jsonb(v_active) - 'pin_hash', 'resumed', true);
    end if;

    if p_silent then
      return jsonb_build_object('ok', false, 'code', 'SILENT_RESUME_FAILED');
    end if;

    if found and v_access.last_seen_at > v_now - interval '45 seconds' then
      raise exception 'RESTAURANT_ALREADY_ACTIVE';
    end if;

    update staff_access
      set user_id = v_uid, tab_secret = p_tab_secret, last_seen_at = v_now
      where session_id = v_active.id;
    if not found then
      insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_active.id,v_uid,p_tab_secret,v_now);
    end if;
    update sessions set last_seen_at = v_now where id = v_active.id;
    select * into v_active from sessions where id = v_active.id;
    return jsonb_build_object('ok', true, 'session', to_jsonb(v_active) - 'pin_hash', 'resumed', true);
  end if;

  -- Existing restaurant, new shift
  select * into v_old
  from sessions
  where restaurant_id = v_restaurant_id
  order by created_at desc
  limit 1;

  if found then
    if v_old.pin_hash is null or crypt(p_pin, v_old.pin_hash) <> v_old.pin_hash then
      raise exception 'INVALID_PIN';
    end if;

    insert into sessions(
      restaurant_id, restaurant_name, pin_hash, qr_secret, rider_secret,
      is_active, shift_started_at, last_seen_at, logo_url, theme, tax_percent, tax_label
    )
    values(
      v_restaurant_id, trim(p_restaurant_name), v_old.pin_hash,
      coalesce(nullif(trim(v_old.qr_secret),''), encode(gen_random_bytes(16),'hex')),
      coalesce(nullif(trim(v_old.rider_secret),''), encode(gen_random_bytes(24),'hex')),
      true, v_now, v_now, v_old.logo_url, coalesce(v_old.theme,'{}'::jsonb),
      coalesce(v_old.tax_percent,0), coalesce(nullif(v_old.tax_label,''),'Tax')
    )
    returning * into v_new;

    insert into staff_access(session_id,user_id,tab_secret,last_seen_at)
    values(v_new.id,v_uid,p_tab_secret,v_now);

    insert into menu_items(session_id,category,name,price,description,image_url,is_available,sort_order)
    select v_new.id,category,name,price,description,image_url,is_available,sort_order
    from menu_items where session_id = v_old.id;

    return jsonb_build_object('ok', true, 'session', to_jsonb(v_new) - 'pin_hash', 'new_shift', true);
  end if;

  -- Brand new restaurant — activation code required; trial row already ensured above
  select * into v_code
  from activation_codes
  where upper(trim(code)) = upper(trim(coalesce(p_activation_code,'')))
    and is_used = false
  for update;
  if not found then raise exception 'INVALID_ACTIVATION_CODE'; end if;

  insert into sessions(
    restaurant_id, restaurant_name, pin_hash, qr_secret, rider_secret,
    is_active, shift_started_at, last_seen_at, tax_percent, tax_label
  )
  values(
    v_restaurant_id, trim(p_restaurant_name), crypt(p_pin, gen_salt('bf', 10)),
    encode(gen_random_bytes(16),'hex'), encode(gen_random_bytes(24),'hex'),
    true, v_now, v_now, 0, 'Tax'
  )
  returning * into v_new;

  update activation_codes set is_used = true, used_by = v_restaurant_id where id = v_code.id;
  insert into staff_access(session_id,user_id,tab_secret,last_seen_at)
  values(v_new.id,v_uid,p_tab_secret,v_now);

  update restaurant_plans
    set restaurant_name = trim(p_restaurant_name), updated_at = v_now
    where restaurant_id = v_restaurant_id;

  return jsonb_build_object('ok', true, 'session', to_jsonb(v_new) - 'pin_hash', 'new_restaurant', true);
exception
  when unique_violation then
    raise exception 'RESTAURANT_ALREADY_ACTIVE';
end;
$$;

-- Resume: also respect plan (so expired cannot stay open forever via refresh)
create or replace function staff_resume(p_tab_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_access staff_access%rowtype;
  v_session sessions%rowtype;
begin
  if v_uid is null or length(trim(coalesce(p_tab_secret,''))) < 16 then
    return jsonb_build_object('ok', false);
  end if;
  select * into v_access from staff_access where user_id = v_uid and tab_secret = p_tab_secret limit 1;
  if not found then return jsonb_build_object('ok', false); end if;
  select * into v_session from sessions where id = v_access.session_id and is_active = true;
  if not found then
    delete from staff_access where id = v_access.id;
    return jsonb_build_object('ok', false);
  end if;

  begin
    perform ensure_restaurant_plan_access(v_session.restaurant_id, v_session.restaurant_name);
  exception
    when others then
      if SQLERRM like '%PLAN_EXPIRED%' then
        return jsonb_build_object('ok', false, 'code', 'PLAN_EXPIRED');
      end if;
      return jsonb_build_object('ok', false);
  end;

  update staff_access set last_seen_at = now() where id = v_access.id;
  update sessions set last_seen_at = now() where id = v_session.id;
  select * into v_session from sessions where id = v_session.id;
  return jsonb_build_object('ok', true, 'session', to_jsonb(v_session) - 'pin_hash');
end;
$$;

revoke all on function staff_login(text,text,text,text,boolean) from public;
revoke all on function staff_resume(text) from public;
grant execute on function staff_login(text,text,text,text,boolean) to authenticated;
grant execute on function staff_resume(text) to authenticated;

-- ============================================================
-- ADMIN HELPERS (run manually in SQL Editor — never expose in app)
-- ============================================================
--
-- 1) Lifetime free (hidden — restaurant sees normal app):
--    UPDATE restaurant_plans
--    SET plan_status = 'complimentary', updated_at = now()
--    WHERE restaurant_id = 'tumara-restaurant';
--
-- 2) Extend trial +30 days:
--    UPDATE restaurant_plans
--    SET plan_status = 'trial',
--        trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + interval '30 days',
--        updated_at = now()
--    WHERE restaurant_id = 'tumara-restaurant';
--
-- 3) Mark paid for 30 days:
--    UPDATE restaurant_plans
--    SET plan_status = 'active',
--        paid_until = now() + interval '30 days',
--        updated_at = now()
--    WHERE restaurant_id = 'tumara-restaurant';
--
-- 4) Force expired (login block, data kept):
--    UPDATE restaurant_plans
--    SET plan_status = 'expired', updated_at = now()
--    WHERE restaurant_id = 'tumara-restaurant';
--
-- 5) List all plans:
--    SELECT * FROM restaurant_plans ORDER BY activated_at DESC;
--
-- restaurant_id = lowercase name with spaces → hyphens
-- e.g. "Tumara restaurant" → "tumara-restaurant"
-- ============================================================
