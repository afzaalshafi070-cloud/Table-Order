-- ============================================================
-- ADMIN PANEL v2 — full control (no daily SQL needed)
-- AFTER RUN (once):
--   UPDATE app_settings SET value = 'YOUR-LONG-SECRET' WHERE key = 'admin_key';
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value)
values ('admin_key', 'CHANGE-ME-TO-A-LONG-SECRET')
on conflict (key) do nothing;
alter table app_settings enable row level security;
drop policy if exists app_settings_deny on app_settings;
create policy app_settings_deny on app_settings
  for all to authenticated, anon using (false) with check (false);

create table if not exists restaurant_plans (
  restaurant_id text primary key,
  restaurant_name text,
  plan_status text not null default 'trial',
  trial_ends_at timestamptz,
  paid_until timestamptz,
  activated_at timestamptz not null default now(),
  notes text,
  updated_at timestamptz not null default now()
);
alter table restaurant_plans add column if not exists billing_cycle text default 'month';
alter table restaurant_plans add column if not exists grace_ends_at timestamptz;
alter table restaurant_plans add column if not exists sold_out_at timestamptz;
alter table restaurant_plans enable row level security;
drop policy if exists restaurant_plans_deny_all on restaurant_plans;
create policy restaurant_plans_deny_all on restaurant_plans
  for all to authenticated, anon using (false) with check (false);

create table if not exists payment_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  bank_name text not null,
  account_title text not null,
  account_number text not null,
  iban text,
  country text default 'PK',
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table payment_accounts enable row level security;
drop policy if exists payment_accounts_deny on payment_accounts;
create policy payment_accounts_deny on payment_accounts
  for all to authenticated, anon using (false) with check (false);

create or replace function _admin_assert(p_key text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v text;
begin
  select value into v from app_settings where key = 'admin_key';
  if v is null or length(trim(v)) < 8 then raise exception 'ADMIN_NOT_CONFIGURED'; end if;
  if trim(coalesce(p_key,'')) <> trim(v) then raise exception 'ADMIN_UNAUTHORIZED'; end if;
end;
$$;
revoke all on function _admin_assert(text) from public;

create or replace function ensure_restaurant_plan_access(
  p_restaurant_id text,
  p_restaurant_name text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_plan restaurant_plans%rowtype;
  v_now timestamptz := now();
  v_due timestamptz;
begin
  select * into v_plan from restaurant_plans where restaurant_id = p_restaurant_id for update;
  if not found then
    insert into restaurant_plans (restaurant_id, restaurant_name, plan_status, trial_ends_at, billing_cycle, activated_at)
    values (p_restaurant_id, nullif(trim(coalesce(p_restaurant_name,'')), ''), 'trial', v_now + interval '30 days', 'month', v_now)
    returning * into v_plan;
  end if;
  if v_plan.plan_status = 'complimentary' then
    return jsonb_build_object('access','ok','status','complimentary','payment_due',false);
  end if;
  if v_plan.plan_status in ('sold_out','expired') then raise exception 'PLAN_SOLD_OUT'; end if;
  if v_plan.plan_status = 'trial' then v_due := v_plan.trial_ends_at; else v_due := v_plan.paid_until; end if;
  if v_due is not null and v_due > v_now then
    return jsonb_build_object('access','ok','status', v_plan.plan_status,'payment_due', false,'due_at', v_due,'billing_cycle', coalesce(v_plan.billing_cycle,'month'));
  end if;
  if v_plan.grace_ends_at is null then
    update restaurant_plans set plan_status = 'overdue', grace_ends_at = coalesce(v_due, v_now) + interval '10 days', updated_at = v_now
    where restaurant_id = p_restaurant_id returning * into v_plan;
  elsif v_plan.plan_status <> 'overdue' and v_plan.grace_ends_at > v_now then
    update restaurant_plans set plan_status = 'overdue', updated_at = v_now where restaurant_id = p_restaurant_id returning * into v_plan;
  end if;
  if v_plan.grace_ends_at is not null and v_plan.grace_ends_at > v_now then
    return jsonb_build_object('access','grace','status','overdue','payment_due', true,'grace_ends_at', v_plan.grace_ends_at,'due_at', v_due,'billing_cycle', coalesce(v_plan.billing_cycle,'month'));
  end if;
  update restaurant_plans set plan_status = 'sold_out', sold_out_at = coalesce(sold_out_at, v_now), updated_at = v_now
  where restaurant_id = p_restaurant_id;
  raise exception 'PLAN_SOLD_OUT';
end;
$$;

create or replace function list_active_payment_accounts()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return (select coalesce(jsonb_agg(to_jsonb(p) order by sort_order, created_at), '[]'::jsonb) from payment_accounts p where is_active = true);
end;
$$;
revoke all on function list_active_payment_accounts() from public;
grant execute on function list_active_payment_accounts() to authenticated;

create or replace function staff_login(
  p_restaurant_name text, p_pin text, p_activation_code text default '',
  p_tab_secret text default '', p_silent boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id text := lower(trim(regexp_replace(coalesce(p_restaurant_name,''), '[^a-zA-Z0-9]+', '-', 'g')));
  v_active sessions%rowtype; v_old sessions%rowtype; v_access staff_access%rowtype; v_new sessions%rowtype;
  v_code activation_codes%rowtype; v_now timestamptz := now(); v_plan jsonb; v_pay jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_pin,''))) < 4 or length(trim(coalesce(p_pin,''))) > 32 then raise exception 'Invalid PIN'; end if;
  if length(v_restaurant_id) < 2 or length(v_restaurant_id) > 80 then raise exception 'Invalid restaurant name'; end if;
  if length(trim(coalesce(p_tab_secret,''))) < 16 then raise exception 'Tab session missing'; end if;
  v_plan := ensure_restaurant_plan_access(v_restaurant_id, p_restaurant_name);
  v_pay := list_active_payment_accounts();
  select * into v_active from sessions where restaurant_id = v_restaurant_id and is_active = true for update;
  if found then
    if v_active.pin_hash is null or crypt(p_pin, v_active.pin_hash) <> v_active.pin_hash then raise exception 'INVALID_PIN'; end if;
    select * into v_access from staff_access where session_id = v_active.id;
    if found and v_access.user_id = v_uid and v_access.tab_secret = p_tab_secret then
      update staff_access set last_seen_at = v_now where session_id = v_active.id;
      update sessions set last_seen_at = v_now where id = v_active.id;
      return jsonb_build_object('ok', true, 'session', to_jsonb(v_active) - 'pin_hash', 'resumed', true, 'plan', v_plan, 'payment_accounts', v_pay);
    end if;
    if p_silent then return jsonb_build_object('ok', false, 'code', 'SILENT_RESUME_FAILED'); end if;
    if found and v_access.last_seen_at > v_now - interval '45 seconds' then raise exception 'RESTAURANT_ALREADY_ACTIVE'; end if;
    update staff_access set user_id = v_uid, tab_secret = p_tab_secret, last_seen_at = v_now where session_id = v_active.id;
    if not found then insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_active.id,v_uid,p_tab_secret,v_now); end if;
    update sessions set last_seen_at = v_now where id = v_active.id;
    select * into v_active from sessions where id = v_active.id;
    return jsonb_build_object('ok', true, 'session', to_jsonb(v_active) - 'pin_hash', 'resumed', true, 'plan', v_plan, 'payment_accounts', v_pay);
  end if;
  select * into v_old from sessions where restaurant_id = v_restaurant_id order by created_at desc limit 1;
  if found then
    if v_old.pin_hash is null or crypt(p_pin, v_old.pin_hash) <> v_old.pin_hash then raise exception 'INVALID_PIN'; end if;
    insert into sessions(restaurant_id, restaurant_name, pin_hash, qr_secret, rider_secret, is_active, shift_started_at, last_seen_at, logo_url, theme, tax_percent, tax_label)
    values(v_restaurant_id, trim(p_restaurant_name), v_old.pin_hash,
      coalesce(nullif(trim(v_old.qr_secret),''), encode(gen_random_bytes(16),'hex')),
      coalesce(nullif(trim(v_old.rider_secret),''), encode(gen_random_bytes(24),'hex')),
      true, v_now, v_now, v_old.logo_url, coalesce(v_old.theme,'{}'::jsonb), coalesce(v_old.tax_percent,0), coalesce(nullif(v_old.tax_label,''),'Tax'))
    returning * into v_new;
    insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_new.id,v_uid,p_tab_secret,v_now);
    insert into menu_items(session_id,category,name,price,description,image_url,is_available,sort_order)
      select v_new.id,category,name,price,description,image_url,is_available,sort_order from menu_items where session_id = v_old.id;
    begin
      insert into deals(session_id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order)
        select v_new.id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order from deals where session_id = v_old.id;
    exception when others then null;
    end;
    return jsonb_build_object('ok', true, 'session', to_jsonb(v_new) - 'pin_hash', 'new_shift', true, 'plan', v_plan, 'payment_accounts', v_pay);
  end if;
  select * into v_code from activation_codes where upper(trim(code)) = upper(trim(coalesce(p_activation_code,''))) and is_used = false for update;
  if not found then raise exception 'INVALID_ACTIVATION_CODE'; end if;
  insert into sessions(restaurant_id, restaurant_name, pin_hash, qr_secret, rider_secret, is_active, shift_started_at, last_seen_at, tax_percent, tax_label)
  values(v_restaurant_id, trim(p_restaurant_name), crypt(p_pin, gen_salt('bf', 10)), encode(gen_random_bytes(16),'hex'), encode(gen_random_bytes(24),'hex'), true, v_now, v_now, 0, 'Tax')
  returning * into v_new;
  update activation_codes set is_used = true, used_by = v_restaurant_id where id = v_code.id;
  insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_new.id,v_uid,p_tab_secret,v_now);
  update restaurant_plans set restaurant_name = trim(p_restaurant_name), updated_at = v_now where restaurant_id = v_restaurant_id;
  return jsonb_build_object('ok', true, 'session', to_jsonb(v_new) - 'pin_hash', 'new_restaurant', true, 'plan', v_plan, 'payment_accounts', v_pay);
exception when unique_violation then raise exception 'RESTAURANT_ALREADY_ACTIVE';
end;
$$;

create or replace function staff_resume(p_tab_secret text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_uid uuid := auth.uid(); v_access staff_access%rowtype; v_session sessions%rowtype; v_plan jsonb; v_pay jsonb;
begin
  if v_uid is null or length(trim(coalesce(p_tab_secret,''))) < 16 then return jsonb_build_object('ok', false); end if;
  select * into v_access from staff_access where user_id = v_uid and tab_secret = p_tab_secret limit 1;
  if not found then return jsonb_build_object('ok', false); end if;
  select * into v_session from sessions where id = v_access.session_id and is_active = true;
  if not found then delete from staff_access where id = v_access.id; return jsonb_build_object('ok', false); end if;
  begin
    v_plan := ensure_restaurant_plan_access(v_session.restaurant_id, v_session.restaurant_name);
  exception when others then
    if SQLERRM like '%PLAN_SOLD_OUT%' or SQLERRM like '%PLAN_EXPIRED%' then return jsonb_build_object('ok', false, 'code', 'PLAN_SOLD_OUT'); end if;
    return jsonb_build_object('ok', false);
  end;
  v_pay := list_active_payment_accounts();
  update staff_access set last_seen_at = now() where id = v_access.id;
  update sessions set last_seen_at = now() where id = v_session.id;
  select * into v_session from sessions where id = v_session.id;
  return jsonb_build_object('ok', true, 'session', to_jsonb(v_session) - 'pin_hash', 'plan', v_plan, 'payment_accounts', v_pay);
end;
$$;

create or replace function admin_list_restaurants(p_admin_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  update restaurant_plans p set
    plan_status = case
      when plan_status = 'complimentary' then plan_status
      when plan_status in ('sold_out','expired') then 'sold_out'
      when coalesce(paid_until, trial_ends_at) is not null and coalesce(paid_until, trial_ends_at) < now()
        and coalesce(grace_ends_at, coalesce(paid_until, trial_ends_at) + interval '10 days') < now() then 'sold_out'
      when coalesce(paid_until, trial_ends_at) is not null and coalesce(paid_until, trial_ends_at) < now() then 'overdue'
      else plan_status end,
    grace_ends_at = case
      when plan_status = 'complimentary' then grace_ends_at
      when coalesce(paid_until, trial_ends_at) < now() and grace_ends_at is null
        then coalesce(paid_until, trial_ends_at) + interval '10 days' else grace_ends_at end,
    sold_out_at = case
      when plan_status not in ('sold_out','expired','complimentary')
        and coalesce(grace_ends_at, coalesce(paid_until, trial_ends_at) + interval '10 days') < now()
        and coalesce(paid_until, trial_ends_at) < now() then coalesce(sold_out_at, now()) else sold_out_at end,
    updated_at = now()
  where plan_status not in ('complimentary');
  return (
    select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.activated_at desc), '[]'::jsonb) from (
      select p.*,
        (select count(*)::int from sessions s where s.restaurant_id = p.restaurant_id) as session_count,
        (select count(*)::int from orders o join sessions s on s.id = o.session_id where s.restaurant_id = p.restaurant_id) as order_count,
        (select coalesce(sum(o.total),0)::numeric from orders o join sessions s on s.id = o.session_id where s.restaurant_id = p.restaurant_id) as lifetime_revenue
      from restaurant_plans p
    ) t
  );
end;
$$;

create or replace function admin_update_plan(
  p_admin_key text, p_restaurant_id text, p_action text,
  p_days int default 30, p_notes text default null, p_billing_cycle text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id text := lower(trim(p_restaurant_id)); v_now timestamptz := now();
  v_days int := greatest(coalesce(p_days, 30), 1); v_cycle text := coalesce(nullif(trim(p_billing_cycle),''), 'month');
begin
  perform _admin_assert(p_admin_key);
  if not exists (select 1 from restaurant_plans where restaurant_id = v_id) then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if p_action = 'mark_paid' then
    if v_cycle = 'year' then v_days := greatest(v_days, 365); end if;
    update restaurant_plans set plan_status = 'active', billing_cycle = v_cycle,
      paid_until = greatest(coalesce(paid_until, v_now), v_now) + make_interval(days => v_days),
      grace_ends_at = null, sold_out_at = null, updated_at = v_now where restaurant_id = v_id;
  elsif p_action = 'extend_trial' then
    update restaurant_plans set plan_status = 'trial',
      trial_ends_at = greatest(coalesce(trial_ends_at, v_now), v_now) + make_interval(days => v_days),
      grace_ends_at = null, sold_out_at = null, updated_at = v_now where restaurant_id = v_id;
  elsif p_action = 'complimentary' then
    update restaurant_plans set plan_status = 'complimentary', grace_ends_at = null, sold_out_at = null, updated_at = v_now where restaurant_id = v_id;
  elsif p_action in ('expire','sold_out') then
    update restaurant_plans set plan_status = 'sold_out', sold_out_at = coalesce(sold_out_at, v_now), updated_at = v_now where restaurant_id = v_id;
  elsif p_action = 'set_notes' then
    update restaurant_plans set notes = p_notes, updated_at = v_now where restaurant_id = v_id;
  else raise exception 'INVALID_ACTION';
  end if;
  return (select to_jsonb(p) from restaurant_plans p where restaurant_id = v_id);
end;
$$;

create or replace function admin_upsert_restaurant(
  p_admin_key text, p_restaurant_name text, p_plan_status text default 'trial',
  p_days int default 30, p_notes text default null, p_billing_cycle text default 'month'
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id text := lower(trim(regexp_replace(coalesce(p_restaurant_name,''), '[^a-zA-Z0-9]+', '-', 'g')));
  v_now timestamptz := now(); v_status text := coalesce(nullif(trim(p_plan_status),''), 'trial');
  v_days int := greatest(coalesce(p_days, 30), 1); v_cycle text := coalesce(nullif(trim(p_billing_cycle),''), 'month');
begin
  perform _admin_assert(p_admin_key);
  if length(v_id) < 2 then raise exception 'INVALID_NAME'; end if;
  if v_cycle = 'year' and v_status = 'active' then v_days := greatest(v_days, 365); end if;
  insert into restaurant_plans (restaurant_id, restaurant_name, plan_status, trial_ends_at, paid_until, billing_cycle, activated_at, notes)
  values (v_id, trim(p_restaurant_name), v_status,
    case when v_status = 'trial' then v_now + make_interval(days => v_days) else null end,
    case when v_status = 'active' then v_now + make_interval(days => v_days) else null end,
    v_cycle, v_now, p_notes)
  on conflict (restaurant_id) do update set
    restaurant_name = excluded.restaurant_name, plan_status = excluded.plan_status,
    trial_ends_at = coalesce(excluded.trial_ends_at, restaurant_plans.trial_ends_at),
    paid_until = coalesce(excluded.paid_until, restaurant_plans.paid_until),
    billing_cycle = excluded.billing_cycle, notes = coalesce(excluded.notes, restaurant_plans.notes),
    grace_ends_at = null, sold_out_at = null, updated_at = v_now;
  return (select to_jsonb(p) from restaurant_plans p where restaurant_id = v_id);
end;
$$;

create or replace function admin_delete_restaurant(p_admin_key text, p_restaurant_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id text := lower(trim(p_restaurant_id)); v_sessions uuid[];
begin
  perform _admin_assert(p_admin_key);
  select array_agg(id) into v_sessions from sessions where restaurant_id = v_id;
  if v_sessions is not null then
    delete from staff_access where session_id = any(v_sessions);
    begin delete from customer_access where session_id = any(v_sessions); exception when undefined_table then null; end;
    begin delete from rider_access where session_id = any(v_sessions); exception when undefined_table then null; end;
    delete from alerts where session_id = any(v_sessions);
    delete from orders where session_id = any(v_sessions);
    begin delete from deals where session_id = any(v_sessions); exception when undefined_table then null; end;
    begin delete from delivery_areas where session_id = any(v_sessions); exception when undefined_table then null; end;
    delete from menu_items where session_id = any(v_sessions);
    delete from sessions where id = any(v_sessions);
  end if;
  delete from restaurant_plans where restaurant_id = v_id;
  return jsonb_build_object('ok', true, 'restaurant_id', v_id);
end;
$$;

create or replace function admin_list_payment_accounts(p_admin_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  return (select coalesce(jsonb_agg(to_jsonb(p) order by sort_order, created_at), '[]'::jsonb) from payment_accounts p);
end;
$$;

create or replace function admin_upsert_payment_account(
  p_admin_key text, p_id uuid default null, p_label text default '', p_bank_name text default '',
  p_account_title text default '', p_account_number text default '', p_iban text default null,
  p_country text default 'PK', p_is_active boolean default true, p_sort_order int default 0
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform _admin_assert(p_admin_key);
  if length(trim(p_bank_name)) < 2 or length(trim(p_account_number)) < 4 then raise exception 'INVALID_ACCOUNT'; end if;
  if p_id is null then
    insert into payment_accounts(label, bank_name, account_title, account_number, iban, country, is_active, sort_order)
    values (coalesce(nullif(trim(p_label),''), trim(p_bank_name)), trim(p_bank_name), trim(p_account_title), trim(p_account_number),
      nullif(trim(coalesce(p_iban,'')),''), coalesce(nullif(trim(p_country),''),'PK'), coalesce(p_is_active, true), coalesce(p_sort_order, 0))
    returning id into v_id;
  else
    update payment_accounts set label = coalesce(nullif(trim(p_label),''), label), bank_name = trim(p_bank_name),
      account_title = trim(p_account_title), account_number = trim(p_account_number),
      iban = nullif(trim(coalesce(p_iban,'')),''), country = coalesce(nullif(trim(p_country),''),'PK'),
      is_active = coalesce(p_is_active, is_active), sort_order = coalesce(p_sort_order, sort_order)
    where id = p_id returning id into v_id;
  end if;
  return (select to_jsonb(p) from payment_accounts p where id = v_id);
end;
$$;

create or replace function admin_delete_payment_account(p_admin_key text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  delete from payment_accounts where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function admin_list_codes(p_admin_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from activation_codes c);
end;
$$;

create or replace function admin_create_codes(p_admin_key text, p_codes text[])
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c text; inserted int := 0;
begin
  perform _admin_assert(p_admin_key);
  if p_codes is null or array_length(p_codes,1) is null then raise exception 'NO_CODES'; end if;
  foreach c in array p_codes loop
    begin insert into activation_codes (code) values (upper(trim(c))); inserted := inserted + 1;
    exception when unique_violation then null; end;
  end loop;
  return jsonb_build_object('ok', true, 'inserted', inserted);
end;
$$;

create or replace function admin_delete_code(p_admin_key text, p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  delete from activation_codes where upper(trim(code)) = upper(trim(p_code));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function admin_sales_report(
  p_admin_key text, p_restaurant_ids text[] default null,
  p_from timestamptz default null, p_to timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_from timestamptz := coalesce(p_from, now() - interval '30 days'); v_to timestamptz := coalesce(p_to, now());
begin
  perform _admin_assert(p_admin_key);
  return (
    select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.revenue desc), '[]'::jsonb) from (
      select s.restaurant_id, max(s.restaurant_name) as restaurant_name,
        count(o.id)::int as order_count, coalesce(sum(o.total),0)::numeric as revenue
      from sessions s
      left join orders o on o.session_id = s.id and o.created_at >= v_from and o.created_at <= v_to
      where (p_restaurant_ids is null or s.restaurant_id = any(p_restaurant_ids))
      group by s.restaurant_id
    ) t
  );
end;
$$;

revoke all on function staff_login(text,text,text,text,boolean) from public;
revoke all on function staff_resume(text) from public;
grant execute on function staff_login(text,text,text,text,boolean) to authenticated;
grant execute on function staff_resume(text) to authenticated;

revoke all on function admin_list_restaurants(text) from public;
revoke all on function admin_update_plan(text,text,text,int,text,text) from public;
revoke all on function admin_upsert_restaurant(text,text,text,int,text,text) from public;
revoke all on function admin_delete_restaurant(text,text) from public;
revoke all on function admin_list_payment_accounts(text) from public;
revoke all on function admin_upsert_payment_account(text,uuid,text,text,text,text,text,text,boolean,int) from public;
revoke all on function admin_delete_payment_account(text,uuid) from public;
revoke all on function admin_list_codes(text) from public;
revoke all on function admin_create_codes(text,text[]) from public;
revoke all on function admin_delete_code(text,text) from public;
revoke all on function admin_sales_report(text,text[],timestamptz,timestamptz) from public;

grant execute on function admin_list_restaurants(text) to authenticated;
grant execute on function admin_update_plan(text,text,text,int,text,text) to authenticated;
grant execute on function admin_upsert_restaurant(text,text,text,int,text,text) to authenticated;
grant execute on function admin_delete_restaurant(text,text) to authenticated;
grant execute on function admin_list_payment_accounts(text) to authenticated;
grant execute on function admin_upsert_payment_account(text,uuid,text,text,text,text,text,text,boolean,int) to authenticated;
grant execute on function admin_delete_payment_account(text,uuid) to authenticated;
grant execute on function admin_list_codes(text) to authenticated;
grant execute on function admin_create_codes(text,text[]) to authenticated;
grant execute on function admin_delete_code(text,text) to authenticated;
grant execute on function admin_sales_report(text,text[],timestamptz,timestamptz) to authenticated;
