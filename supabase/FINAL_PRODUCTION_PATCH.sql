-- ============================================================
-- TABLE ORDER — FINAL PRODUCTION PATCH
-- Run this ONCE after the existing schema/admin migrations.
-- It is designed to repair the current Admin + onboarding flow.
--
-- IMPORTANT:
--   1) PINs remain bcrypt-hashed. The old PIN is never recoverable.
--   2) Admin can create/reset a PIN, but cannot read the old PIN.
--   3) New restaurants are provisioned by Admin first.
--   4) First Counter login requires Name + PIN + assigned Activation Code.
--   5) After first successful activation, Activation Code is no longer needed.
--   6) Subscription expiry never deletes restaurant data.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- PLAN TABLE HARDENING
-- ------------------------------------------------------------
create table if not exists restaurant_plans (
  restaurant_id text primary key,
  restaurant_name text,
  plan_status text not null default 'trial',
  trial_ends_at timestamptz,
  paid_until timestamptz,
  activated_at timestamptz not null default now(),
  notes text,
  updated_at timestamptz not null default now(),
  billing_cycle text default 'month',
  grace_ends_at timestamptz,
  sold_out_at timestamptz
);

alter table restaurant_plans add column if not exists billing_cycle text default 'month';
alter table restaurant_plans add column if not exists grace_ends_at timestamptz;
alter table restaurant_plans add column if not exists sold_out_at timestamptz;
alter table restaurant_plans add column if not exists activation_required boolean not null default false;

-- Older trial migrations may have a check constraint that blocks overdue,
-- suspended and sold_out statuses. Remove only constraints that mention plan_status.
do $$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.restaurant_plans'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%plan_status%'
  loop
    execute format('alter table public.restaurant_plans drop constraint if exists %I', r.conname);
  end loop;
end $$;

-- Existing restaurants are considered already provisioned/activated.
update restaurant_plans
set activation_required = false
where activation_required is null;

-- Backfill a plan row for old sessions that were created before SaaS plans.
insert into restaurant_plans (restaurant_id, restaurant_name, plan_status, trial_ends_at, activated_at, activation_required)
select s.restaurant_id, max(s.restaurant_name), 'trial', now() + interval '30 days', min(s.created_at), false
from sessions s
left join restaurant_plans p on p.restaurant_id = s.restaurant_id
where p.restaurant_id is null
group by s.restaurant_id
on conflict (restaurant_id) do nothing;

alter table restaurant_plans enable row level security;
drop policy if exists restaurant_plans_deny_all on restaurant_plans;
create policy restaurant_plans_deny_all on restaurant_plans
  for all to authenticated, anon using (false) with check (false);

-- ------------------------------------------------------------
-- ACTIVATION CODES
-- ------------------------------------------------------------
alter table activation_codes add column if not exists restaurant_id text;
alter table activation_codes add column if not exists assigned_at timestamptz;
alter table activation_codes add column if not exists used_at timestamptz;
alter table activation_codes add column if not exists is_revoked boolean not null default false;

create index if not exists idx_activation_codes_restaurant on activation_codes(restaurant_id);
create index if not exists idx_activation_codes_available on activation_codes(is_used, is_revoked);

alter table activation_codes enable row level security;
drop policy if exists activation_codes_deny_all on activation_codes;
create policy activation_codes_deny_all on activation_codes
  for all to authenticated, anon using (false) with check (false);

-- ------------------------------------------------------------
-- APP SETTINGS / PAYMENTS / AUDIT
-- ------------------------------------------------------------
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into app_settings(key,value)
values
  ('admin_key','CHANGE-ME-TO-A-LONG-SECRET'),
  ('company_name','Table Order'),
  ('support_contact',''),
  ('default_trial_days','30'),
  ('default_grace_days','10'),
  ('default_monthly_price','5000'),
  ('default_yearly_price','60000'),
  ('currency','PKR')
on conflict (key) do nothing;

alter table app_settings enable row level security;
drop policy if exists app_settings_deny on app_settings;
create policy app_settings_deny on app_settings
  for all to authenticated, anon using (false) with check (false);

create table if not exists payment_records (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'PKR',
  method text,
  reference_note text,
  admin_note text,
  payment_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_payment_records_restaurant on payment_records(restaurant_id, payment_date desc);
alter table payment_records enable row level security;
drop policy if exists payment_records_deny on payment_records;
create policy payment_records_deny on payment_records
  for all to authenticated, anon using (false) with check (false);

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  action_type text not null,
  restaurant_id text,
  result text not null default 'success',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_audit_created on admin_audit_log(created_at desc);
alter table admin_audit_log enable row level security;
drop policy if exists admin_audit_deny on admin_audit_log;
create policy admin_audit_deny on admin_audit_log
  for all to authenticated, anon using (false) with check (false);

-- ------------------------------------------------------------
-- ADMIN SECURITY HELPER
-- ------------------------------------------------------------
create or replace function _admin_assert(p_key text)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v text;
begin
  select value into v from app_settings where key='admin_key';
  if v is null or length(trim(v)) < 8 then
    raise exception 'ADMIN_NOT_CONFIGURED';
  end if;
  if trim(coalesce(p_key,'')) <> trim(v) then
    raise exception 'ADMIN_UNAUTHORIZED';
  end if;
end;
$$;
revoke all on function _admin_assert(text) from public;

-- ------------------------------------------------------------
-- PLAN ACCESS USED BY STAFF LOGIN
-- This version does NOT silently create restaurants.
-- ------------------------------------------------------------
create or replace function ensure_restaurant_plan_access(
  p_restaurant_id text,
  p_restaurant_name text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  p restaurant_plans%rowtype;
  v_now timestamptz := now();
  v_due timestamptz;
begin
  select * into p from restaurant_plans where restaurant_id=lower(trim(p_restaurant_id)) for update;
  if not found then raise exception 'RESTAURANT_NOT_PROVISIONED'; end if;

  if p.plan_status='complimentary' then
    return jsonb_build_object('access','ok','status','complimentary','payment_due',false,'activation_required',p.activation_required);
  end if;
  if p.plan_status in ('suspended','sold_out','expired') then raise exception 'PLAN_SOLD_OUT'; end if;

  if p.plan_status='trial' then v_due := p.trial_ends_at; else v_due := p.paid_until; end if;

  if v_due is not null and v_due > v_now then
    return jsonb_build_object(
      'access','ok','status',p.plan_status,'payment_due',false,
      'due_at',v_due,'billing_cycle',coalesce(p.billing_cycle,'month'),
      'activation_required',p.activation_required
    );
  end if;

  if p.grace_ends_at is null then
    update restaurant_plans
    set plan_status='overdue',
        grace_ends_at=coalesce(v_due,v_now)+interval '10 days',
        updated_at=v_now
    where restaurant_id=p.restaurant_id
    returning * into p;
  else
    update restaurant_plans set plan_status='overdue', updated_at=v_now
    where restaurant_id=p.restaurant_id and plan_status <> 'overdue'
    returning * into p;
  end if;

  if p.grace_ends_at is not null and p.grace_ends_at > v_now then
    return jsonb_build_object(
      'access','grace','status','overdue','payment_due',true,
      'due_at',v_due,'grace_ends_at',p.grace_ends_at,
      'billing_cycle',coalesce(p.billing_cycle,'month'),
      'activation_required',p.activation_required
    );
  end if;

  update restaurant_plans
  set plan_status='sold_out', sold_out_at=coalesce(sold_out_at,v_now), updated_at=v_now
  where restaurant_id=p.restaurant_id;
  raise exception 'PLAN_SOLD_OUT';
end;
$$;
revoke all on function ensure_restaurant_plan_access(text,text) from public;

-- ------------------------------------------------------------
-- STAFF LOGIN: existing provisioned restaurant + first activation code
-- ------------------------------------------------------------
create or replace function staff_login(
  p_restaurant_name text,
  p_pin text,
  p_activation_code text default '',
  p_tab_secret text default '',
  p_silent boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id text := lower(trim(regexp_replace(coalesce(p_restaurant_name,''),'[^a-zA-Z0-9]+','-','g')));
  v_active sessions%rowtype;
  v_old sessions%rowtype;
  v_access staff_access%rowtype;
  v_plan restaurant_plans%rowtype;
  v_code activation_codes%rowtype;
  v_new sessions%rowtype;
  v_now timestamptz := now();
  v_plan_json jsonb;
  v_pay jsonb;
  v_first_activation boolean := false;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_pin,''))) < 4 or length(trim(coalesce(p_pin,''))) > 32 then raise exception 'Invalid PIN'; end if;
  if length(v_restaurant_id) < 2 or length(v_restaurant_id) > 80 then raise exception 'Invalid restaurant name'; end if;
  if length(trim(coalesce(p_tab_secret,''))) < 16 then raise exception 'Tab session missing'; end if;

  select * into v_plan from restaurant_plans where restaurant_id=v_restaurant_id for update;
  if not found then raise exception 'RESTAURANT_NOT_PROVISIONED'; end if;

  v_plan_json := ensure_restaurant_plan_access(v_restaurant_id,p_restaurant_name);
  select * into v_plan from restaurant_plans where restaurant_id=v_restaurant_id;

  select * into v_active from sessions where restaurant_id=v_restaurant_id and is_active=true for update;

  if found then
    if v_active.pin_hash is null or crypt(p_pin,v_active.pin_hash) <> v_active.pin_hash then
      raise exception 'INVALID_PIN';
    end if;

    -- First activation: code must match the code assigned by Admin.
    if v_plan.activation_required then
      select * into v_code
      from activation_codes
      where restaurant_id=v_restaurant_id
        and upper(trim(code))=upper(trim(coalesce(p_activation_code,'')))
        and is_used=false and is_revoked=false
      for update;
      if not found then raise exception 'INVALID_ACTIVATION_CODE'; end if;

      update activation_codes
      set is_used=true, used_by=v_restaurant_id, used_at=v_now
      where id=v_code.id;

      update restaurant_plans
      set activation_required=false, restaurant_name=trim(p_restaurant_name), updated_at=v_now
      where restaurant_id=v_restaurant_id;
      v_first_activation := true;
      v_plan_json := jsonb_set(coalesce(v_plan_json,'{}'::jsonb), '{activation_required}', 'false'::jsonb, true);
    end if;

    select * into v_access from staff_access where session_id=v_active.id;
    if found and v_access.user_id=v_uid and v_access.tab_secret=p_tab_secret then
      update staff_access set last_seen_at=v_now where session_id=v_active.id;
      update sessions set last_seen_at=v_now where id=v_active.id;
      return jsonb_build_object('ok',true,'session',to_jsonb(v_active)-'pin_hash','resumed',true,'new_restaurant',v_first_activation,'plan',v_plan_json,'payment_accounts',coalesce(list_active_payment_accounts(),'[]'::jsonb));
    end if;

    if p_silent then return jsonb_build_object('ok',false,'code','SILENT_RESUME_FAILED'); end if;
    if found and v_access.last_seen_at > v_now-interval '45 seconds' then raise exception 'RESTAURANT_ALREADY_ACTIVE'; end if;

    if found then
      update staff_access set user_id=v_uid, tab_secret=p_tab_secret, last_seen_at=v_now where session_id=v_active.id;
    else
      insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_active.id,v_uid,p_tab_secret,v_now);
    end if;
    update sessions set last_seen_at=v_now where id=v_active.id;
    select * into v_active from sessions where id=v_active.id;
    return jsonb_build_object('ok',true,'session',to_jsonb(v_active)-'pin_hash','resumed',true,'plan',v_plan_json,'payment_accounts',coalesce(list_active_payment_accounts(),'[]'::jsonb));
  end if;

  -- Existing restaurant with a closed shift. PIN is copied from the last session.
  select * into v_old from sessions where restaurant_id=v_restaurant_id order by created_at desc limit 1;
  if not found then raise exception 'RESTAURANT_NOT_PROVISIONED'; end if;
  if v_old.pin_hash is null or crypt(p_pin,v_old.pin_hash) <> v_old.pin_hash then raise exception 'INVALID_PIN'; end if;

  insert into sessions(
    restaurant_id,restaurant_name,pin_hash,qr_secret,rider_secret,is_active,
    shift_started_at,last_seen_at,logo_url,theme,tax_percent,tax_label
  )
  values(
    v_old.restaurant_id,v_old.restaurant_name,v_old.pin_hash,
    coalesce(nullif(trim(v_old.qr_secret),''),encode(gen_random_bytes(16),'hex')),
    coalesce(nullif(trim(v_old.rider_secret),''),encode(gen_random_bytes(24),'hex')),
    true,v_now,v_now,v_old.logo_url,coalesce(v_old.theme,'{}'::jsonb),
    coalesce(v_old.tax_percent,0),coalesce(nullif(v_old.tax_label,''),'Tax')
  ) returning * into v_new;

  insert into staff_access(session_id,user_id,tab_secret,last_seen_at)
  values(v_new.id,v_uid,p_tab_secret,v_now);

  insert into menu_items(session_id,category,name,price,photo_url,badge,is_available,sort_order)
  select v_new.id,category,name,price,photo_url,badge,is_available,sort_order
  from menu_items where session_id=v_old.id;

  begin
    insert into delivery_areas(session_id,name,charge)
    select v_new.id,name,charge from delivery_areas where session_id=v_old.id;
  exception when undefined_table then null;
  end;

  begin
    insert into deals(session_id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order)
    select v_new.id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order
    from deals where session_id=v_old.id;
  exception when undefined_table then null;
  end;

  return jsonb_build_object('ok',true,'session',to_jsonb(v_new)-'pin_hash','new_shift',true,'plan',v_plan_json,'payment_accounts',coalesce(list_active_payment_accounts(),'[]'::jsonb));
exception
  when unique_violation then raise exception 'RESTAURANT_ALREADY_ACTIVE';
end;
$$;
revoke all on function staff_login(text,text,text,text,boolean) from public;
grant execute on function staff_login(text,text,text,text,boolean) to authenticated;

-- ------------------------------------------------------------
-- STAFF RESUME: also return current plan/payment state
-- ------------------------------------------------------------
create or replace function staff_resume(p_tab_secret text)
returns jsonb language plpgsql security definer
set search_path=public, pg_temp
as $$
declare
  v_uid uuid:=auth.uid();
  v_access staff_access%rowtype;
  v_session sessions%rowtype;
  v_plan jsonb;
begin
  if v_uid is null or length(trim(coalesce(p_tab_secret,'')))<16 then return jsonb_build_object('ok',false); end if;
  select * into v_access from staff_access where user_id=v_uid and tab_secret=p_tab_secret limit 1;
  if not found then return jsonb_build_object('ok',false); end if;
  select * into v_session from sessions where id=v_access.session_id and is_active=true;
  if not found then delete from staff_access where id=v_access.id; return jsonb_build_object('ok',false); end if;
  update staff_access set last_seen_at=now() where id=v_access.id;
  update sessions set last_seen_at=now() where id=v_session.id;
  v_plan := ensure_restaurant_plan_access(v_session.restaurant_id,v_session.restaurant_name);
  select * into v_session from sessions where id=v_session.id;
  return jsonb_build_object('ok',true,'session',to_jsonb(v_session)-'pin_hash','plan',v_plan,'payment_accounts',coalesce(list_active_payment_accounts(),'[]'::jsonb));
end;
$$;
revoke all on function staff_resume(text) from public;
grant execute on function staff_resume(text) to authenticated;

-- ------------------------------------------------------------
-- ADMIN LIST / STATS
-- ------------------------------------------------------------
create or replace function admin_list_restaurants(p_admin_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);

  -- Update subscription state without deleting anything.
  update restaurant_plans p set
    plan_status=case
      when p.plan_status='complimentary' then 'complimentary'
      when p.plan_status in ('sold_out','expired') then 'sold_out'
      when p.plan_status='suspended' then 'suspended'
      when coalesce(p.paid_until,p.trial_ends_at) is not null
           and coalesce(p.paid_until,p.trial_ends_at)<now()
           and coalesce(p.grace_ends_at,coalesce(p.paid_until,p.trial_ends_at)+interval '10 days')<now() then 'sold_out'
      when coalesce(p.paid_until,p.trial_ends_at) is not null
           and coalesce(p.paid_until,p.trial_ends_at)<now() then 'overdue'
      else p.plan_status end,
    grace_ends_at=case
      when p.plan_status in ('complimentary','suspended','sold_out') then p.grace_ends_at
      when coalesce(p.paid_until,p.trial_ends_at)<now() and p.grace_ends_at is null
        then coalesce(p.paid_until,p.trial_ends_at)+interval '10 days'
      else p.grace_ends_at end,
    sold_out_at=case
      when p.plan_status not in ('complimentary','suspended','sold_out')
       and coalesce(p.grace_ends_at,coalesce(p.paid_until,p.trial_ends_at)+interval '10 days')<now()
       and coalesce(p.paid_until,p.trial_ends_at)<now() then coalesce(p.sold_out_at,now())
      else p.sold_out_at end,
    updated_at=now()
  where true;

  return (
    select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.activated_at desc),'[]'::jsonb)
    from (
      select p.*,
        (select count(*)::int from sessions s where s.restaurant_id=p.restaurant_id) as session_count,
        (select count(*)::int from orders o join sessions s on s.id=o.session_id where s.restaurant_id=p.restaurant_id) as order_count,
        (select coalesce(sum(o.total),0)::numeric from orders o join sessions s on s.id=o.session_id where s.restaurant_id=p.restaurant_id) as lifetime_revenue,
        (select max(o.created_at) from orders o join sessions s on s.id=o.session_id where s.restaurant_id=p.restaurant_id) as last_activity,
        (select count(*)::int from payment_records pr where pr.restaurant_id=p.restaurant_id) as payment_count,
        (select coalesce(sum(pr.amount),0)::numeric from payment_records pr where pr.restaurant_id=p.restaurant_id) as payments_total,
        (select c.code from activation_codes c where c.restaurant_id=p.restaurant_id and c.is_used=false and c.is_revoked=false order by c.created_at desc limit 1) as activation_code,
        exists(select 1 from sessions s where s.restaurant_id=p.restaurant_id and s.is_active=true) as has_active_session
      from restaurant_plans p
    ) t
  );
end;
$$;
revoke all on function admin_list_restaurants(text) from public;
grant execute on function admin_list_restaurants(text) to authenticated;

create or replace function admin_dashboard_stats(p_admin_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare r jsonb;
begin
  perform _admin_assert(p_admin_key);
  select jsonb_build_object(
    'total',(select count(*) from restaurant_plans),
    'active',(select count(*) from restaurant_plans where plan_status='active'),
    'trial',(select count(*) from restaurant_plans where plan_status='trial'),
    'monthly',(select count(*) from restaurant_plans where billing_cycle='month' and plan_status not in ('sold_out','suspended')),
    'yearly',(select count(*) from restaurant_plans where billing_cycle='year' and plan_status not in ('sold_out','suspended')),
    'complimentary',(select count(*) from restaurant_plans where plan_status='complimentary'),
    'due_soon',(select count(*) from restaurant_plans where plan_status in ('trial','active') and coalesce(paid_until,trial_ends_at) between now() and now()+interval '7 days'),
    'overdue',(select count(*) from restaurant_plans where plan_status='overdue'),
    'suspended',(select count(*) from restaurant_plans where plan_status='suspended'),
    'sold_out',(select count(*) from restaurant_plans where plan_status='sold_out'),
    'recent_7d',(select count(*) from restaurant_plans where activated_at>=now()-interval '7 days'),
    'revenue',(select coalesce(sum(amount),0) from payment_records)
  ) into r;
  return r;
end;
$$;
revoke all on function admin_dashboard_stats(text) from public;
grant execute on function admin_dashboard_stats(text) to authenticated;

-- ------------------------------------------------------------
-- ADMIN CREATE RESTAURANT
-- Creates the plan + first active session + assigned activation code.
-- ------------------------------------------------------------
create or replace function admin_create_restaurant(
  p_admin_key text,
  p_restaurant_name text,
  p_pin text,
  p_plan_status text default 'trial',
  p_days int default 30,
  p_billing_cycle text default 'month',
  p_notes text default null,
  p_activation_code text default ''
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare
  v_name text:=trim(p_restaurant_name);
  v_id text:=lower(trim(regexp_replace(coalesce(p_restaurant_name,''),'[^a-zA-Z0-9]+','-','g')));
  v_status text:=coalesce(nullif(trim(p_plan_status),''),'trial');
  v_cycle text:=coalesce(nullif(trim(p_billing_cycle),''),'month');
  v_days int:=greatest(coalesce(p_days,30),1);
  v_now timestamptz:=now();
  v_code text;
  v_code_row activation_codes%rowtype;
  v_session sessions%rowtype;
  v_plan restaurant_plans%rowtype;
begin
  perform _admin_assert(p_admin_key);
  if length(v_name)<2 or length(v_id)<2 then raise exception 'INVALID_NAME'; end if;
  if length(trim(coalesce(p_pin,'')))<4 or length(trim(p_pin))>32 then raise exception 'INVALID_PIN'; end if;
  if v_status not in ('trial','active','complimentary') then raise exception 'INVALID_PLAN_STATUS'; end if;
  if v_cycle not in ('month','year') then raise exception 'INVALID_BILLING_CYCLE'; end if;
  if v_cycle='year' and v_status='active' then v_days:=greatest(v_days,365); end if;
  if exists(select 1 from restaurant_plans where restaurant_id=v_id) or exists(select 1 from sessions where restaurant_id=v_id) then raise exception 'RESTAURANT_EXISTS'; end if;

  if nullif(trim(p_activation_code),'') is not null then
    v_code:=upper(trim(p_activation_code));
    select * into v_code_row from activation_codes where upper(trim(code))=v_code for update;
    if found then
      if v_code_row.is_used or v_code_row.is_revoked then raise exception 'ACTIVATION_CODE_UNAVAILABLE'; end if;
      if v_code_row.restaurant_id is not null and v_code_row.restaurant_id<>v_id then raise exception 'ACTIVATION_CODE_ASSIGNED'; end if;
      update activation_codes set restaurant_id=v_id, assigned_at=v_now where id=v_code_row.id;
    else
      insert into activation_codes(code,restaurant_id,assigned_at) values(v_code,v_id,v_now) returning * into v_code_row;
    end if;
  else
    loop
      v_code:='TO-'||upper(substr(encode(gen_random_bytes(5),'hex'),1,8));
      begin
        insert into activation_codes(code,restaurant_id,assigned_at)
        values(v_code,v_id,v_now) returning * into v_code_row;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
  end if;

  insert into restaurant_plans(
    restaurant_id,restaurant_name,plan_status,trial_ends_at,paid_until,
    billing_cycle,activated_at,notes,activation_required
  ) values(
    v_id,v_name,v_status,
    case when v_status='trial' then v_now+make_interval(days=>v_days) else null end,
    case when v_status='active' then v_now+make_interval(days=>v_days) else null end,
    v_cycle,v_now,p_notes,true
  ) returning * into v_plan;

  insert into sessions(
    restaurant_id,restaurant_name,pin_hash,qr_secret,rider_secret,is_active,
    shift_started_at,last_seen_at,tax_percent,tax_label
  ) values(
    v_id,v_name,crypt(trim(p_pin),gen_salt('bf',10)),
    encode(gen_random_bytes(16),'hex'),encode(gen_random_bytes(24),'hex'),
    true,v_now,v_now,0,'Tax'
  ) returning * into v_session;

  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('create_restaurant',v_id,'success',jsonb_build_object('name',v_name,'plan',v_status,'billing_cycle',v_cycle));

  return jsonb_build_object(
    'ok',true,'restaurant_id',v_id,'restaurant_name',v_name,
    'activation_code',v_code,'session_id',v_session.id,'plan',to_jsonb(v_plan)
  );
exception
  when unique_violation then raise exception 'RESTAURANT_EXISTS';
end;
$$;
revoke all on function admin_create_restaurant(text,text,text,text,int,text,text,text) from public;
grant execute on function admin_create_restaurant(text,text,text,text,int,text,text,text) to authenticated;

-- ------------------------------------------------------------
-- ADMIN RESET PIN
-- Resets the active session and all stored historical sessions for the restaurant.
-- ------------------------------------------------------------
create or replace function admin_reset_pin(p_admin_key text,p_restaurant_id text,p_new_pin text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare v_id text:=lower(trim(p_restaurant_id));
begin
  perform _admin_assert(p_admin_key);
  if length(trim(coalesce(p_new_pin,'')))<4 or length(trim(p_new_pin))>32 then raise exception 'INVALID_PIN'; end if;
  if not exists(select 1 from restaurant_plans where restaurant_id=v_id) then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  update sessions set pin_hash=crypt(trim(p_new_pin),gen_salt('bf',10)) where restaurant_id=v_id;
  insert into admin_audit_log(action_type,restaurant_id,result,details) values('reset_pin',v_id,'success','{}'::jsonb);
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function admin_reset_pin(text,text,text) from public;
grant execute on function admin_reset_pin(text,text,text) to authenticated;

-- ------------------------------------------------------------
-- ADMIN PLAN ACTIONS
-- ------------------------------------------------------------
create or replace function admin_update_plan(
  p_admin_key text,p_restaurant_id text,p_action text,
  p_days int default 30,p_notes text default null,p_billing_cycle text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_id text:=lower(trim(p_restaurant_id));
  v_now timestamptz:=now();
  v_days int:=greatest(coalesce(p_days,30),1);
  v_cycle text:=coalesce(nullif(trim(p_billing_cycle),''),'month');
  v_row restaurant_plans%rowtype;
begin
  perform _admin_assert(p_admin_key);
  select * into v_row from restaurant_plans where restaurant_id=v_id for update;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;

  if p_action='mark_paid' then
    if v_cycle='year' then v_days:=greatest(v_days,365); end if;
    update restaurant_plans set plan_status='active',billing_cycle=v_cycle,
      paid_until=greatest(coalesce(paid_until,v_now),v_now)+make_interval(days=>v_days),
      grace_ends_at=null,sold_out_at=null,updated_at=v_now where restaurant_id=v_id;
  elsif p_action='extend_trial' then
    update restaurant_plans set plan_status='trial',
      trial_ends_at=greatest(coalesce(trial_ends_at,v_now),v_now)+make_interval(days=>v_days),
      grace_ends_at=null,sold_out_at=null,updated_at=v_now where restaurant_id=v_id;
  elsif p_action='complimentary' then
    update restaurant_plans set plan_status='complimentary',grace_ends_at=null,sold_out_at=null,updated_at=v_now where restaurant_id=v_id;
  elsif p_action='suspend' then
    update restaurant_plans set plan_status='suspended',updated_at=v_now where restaurant_id=v_id;
  elsif p_action='reactivate' then
    update restaurant_plans set plan_status='active',billing_cycle=coalesce(nullif(v_cycle,''),'month'),
      paid_until=v_now+make_interval(days=>v_days),grace_ends_at=null,sold_out_at=null,updated_at=v_now where restaurant_id=v_id;
  elsif p_action in ('expire','sold_out') then
    update restaurant_plans set plan_status='sold_out',sold_out_at=coalesce(sold_out_at,v_now),updated_at=v_now where restaurant_id=v_id;
  elsif p_action='set_notes' then
    update restaurant_plans set notes=p_notes,updated_at=v_now where restaurant_id=v_id;
  else raise exception 'INVALID_ACTION';
  end if;

  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('plan_'||p_action,v_id,'success',jsonb_build_object('days',v_days,'cycle',v_cycle));
  return (select to_jsonb(p) from restaurant_plans p where restaurant_id=v_id);
end;
$$;
revoke all on function admin_update_plan(text,text,text,int,text,text) from public;
grant execute on function admin_update_plan(text,text,text,int,text,text) to authenticated;

-- ------------------------------------------------------------
-- HARD DELETE RESTAURANT
-- Irreversible. Expiry/suspension never uses this function.
-- ------------------------------------------------------------
create or replace function admin_delete_restaurant(p_admin_key text,p_restaurant_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_id text:=lower(trim(p_restaurant_id));
begin
  perform _admin_assert(p_admin_key);
  if not exists(select 1 from restaurant_plans where restaurant_id=v_id) and not exists(select 1 from sessions where restaurant_id=v_id) then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  delete from staff_access where session_id in (select id from sessions where restaurant_id=v_id);
  delete from customer_access where session_id in (select id from sessions where restaurant_id=v_id);
  delete from rider_access where session_id in (select id from sessions where restaurant_id=v_id);
  delete from activation_codes where restaurant_id=v_id;
  delete from payment_records where restaurant_id=v_id;
  delete from sessions where restaurant_id=v_id;
  delete from restaurant_plans where restaurant_id=v_id;
  insert into admin_audit_log(action_type,restaurant_id,result,details) values('delete_restaurant',v_id,'success','{}'::jsonb);
  return jsonb_build_object('ok',true,'restaurant_id',v_id);
end;
$$;
revoke all on function admin_delete_restaurant(text,text) from public;
grant execute on function admin_delete_restaurant(text,text) to authenticated;

-- ------------------------------------------------------------
-- ACTIVATION CODE ADMIN RPCs
-- ------------------------------------------------------------
create or replace function admin_list_codes(p_admin_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'code',c.code,'restaurant_id',c.restaurant_id,
      'is_used',c.is_used,'is_revoked',c.is_revoked,'used_by',c.used_by,
      'assigned_at',c.assigned_at,'used_at',c.used_at,'created_at',c.created_at,
      'status',case when c.is_revoked then 'revoked' when c.is_used then 'used' when c.restaurant_id is not null then 'assigned' else 'unused' end
    ) order by c.created_at desc),'[]'::jsonb)
    from activation_codes c
  );
end;
$$;
revoke all on function admin_list_codes(text) from public;
grant execute on function admin_list_codes(text) to authenticated;

create or replace function admin_create_codes(p_admin_key text,p_codes text[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare c text; n int:=0; code_clean text;
begin
  perform _admin_assert(p_admin_key);
  if p_codes is null or array_length(p_codes,1) is null then raise exception 'NO_CODES'; end if;
  foreach c in array p_codes loop
    code_clean:=upper(trim(c));
    if code_clean<>'' then
      begin insert into activation_codes(code) values(code_clean); n:=n+1; exception when unique_violation then null; end;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'inserted',n);
end;
$$;
revoke all on function admin_create_codes(text,text[]) from public;
grant execute on function admin_create_codes(text,text[]) to authenticated;

create or replace function admin_revoke_code(p_admin_key text,p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);
  update activation_codes set is_revoked=true where upper(trim(code))=upper(trim(p_code)) and is_used=false;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function admin_revoke_code(text,text) from public;
grant execute on function admin_revoke_code(text,text) to authenticated;

create or replace function admin_delete_code(p_admin_key text,p_code text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);
  delete from activation_codes where upper(trim(code))=upper(trim(p_code)) and is_used=false and restaurant_id is null;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function admin_delete_code(text,text) from public;
grant execute on function admin_delete_code(text,text) to authenticated;

-- ------------------------------------------------------------
-- PAYMENT RPCs
-- ------------------------------------------------------------
create or replace function admin_list_payments(p_admin_key text,p_restaurant_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);
  return (select coalesce(jsonb_agg(to_jsonb(p) order by p.payment_date desc),'[]'::jsonb)
          from payment_records p
          where p_restaurant_id is null or p.restaurant_id=lower(trim(p_restaurant_id)));
end;
$$;
revoke all on function admin_list_payments(text,text) from public;
grant execute on function admin_list_payments(text,text) to authenticated;

create or replace function admin_record_payment(
  p_admin_key text,p_restaurant_id text,p_amount numeric,
  p_method text default null,p_reference text default null,p_admin_note text default null,
  p_days int default 30,p_billing_cycle text default 'month'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_id text:=lower(trim(p_restaurant_id)); v_now timestamptz:=now(); v_payment payment_records%rowtype; v_days int:=greatest(coalesce(p_days,30),1); v_cycle text:=coalesce(nullif(trim(p_billing_cycle),''),'month');
begin
  perform _admin_assert(p_admin_key);
  if not exists(select 1 from restaurant_plans where restaurant_id=v_id) then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_cycle='year' then v_days:=greatest(v_days,365); end if;
  insert into payment_records(restaurant_id,amount,currency,method,reference_note,admin_note) values(v_id,p_amount,'PKR',p_method,p_reference,p_admin_note) returning * into v_payment;
  update restaurant_plans set plan_status='active',billing_cycle=v_cycle,
    paid_until=greatest(coalesce(paid_until,v_now),v_now)+make_interval(days=>v_days),
    grace_ends_at=null,sold_out_at=null,updated_at=v_now where restaurant_id=v_id;
  insert into admin_audit_log(action_type,restaurant_id,result,details) values('record_payment',v_id,'success',jsonb_build_object('amount',p_amount,'days',v_days,'cycle',v_cycle));
  return to_jsonb(v_payment);
end;
$$;
revoke all on function admin_record_payment(text,text,numeric,text,text,text,int,text) from public;
grant execute on function admin_record_payment(text,text,numeric,text,text,text,int,text) to authenticated;

-- ------------------------------------------------------------
-- SETTINGS / KEY / AUDIT
-- ------------------------------------------------------------
create or replace function admin_get_settings(p_admin_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare r jsonb;
begin
  perform _admin_assert(p_admin_key);
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into r from app_settings where key<>'admin_key';
  return r;
end;
$$;
revoke all on function admin_get_settings(text) from public;
grant execute on function admin_get_settings(text) to authenticated;

create or replace function admin_update_settings(p_admin_key text,p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare k text; v text;
begin
  perform _admin_assert(p_admin_key);
  if p_settings is null or jsonb_typeof(p_settings)<>'object' then raise exception 'INVALID_SETTINGS'; end if;
  for k,v in select key,value from jsonb_each_text(p_settings) loop
    if k='admin_key' then continue; end if;
    insert into app_settings(key,value,updated_at) values(k,v,now()) on conflict(key) do update set value=excluded.value,updated_at=now();
  end loop;
  return (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from app_settings where key<>'admin_key');
end;
$$;
revoke all on function admin_update_settings(text,jsonb) from public;
grant execute on function admin_update_settings(text,jsonb) to authenticated;

create or replace function admin_change_key(p_admin_key text,p_old_key text,p_new_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);
  if trim(coalesce(p_old_key,''))<>trim(coalesce(p_admin_key,'')) then raise exception 'ADMIN_UNAUTHORIZED'; end if;
  if length(trim(coalesce(p_new_key,'')))<8 then raise exception 'ADMIN_KEY_TOO_SHORT'; end if;
  update app_settings set value=trim(p_new_key),updated_at=now() where key='admin_key';
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function admin_change_key(text,text,text) from public;
grant execute on function admin_change_key(text,text,text) to authenticated;

create or replace function admin_list_audit(p_admin_key text,p_limit int default 150)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);
  return (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb)
          from (select * from admin_audit_log order by created_at desc limit greatest(least(coalesce(p_limit,150),500),1)) a);
end;
$$;
revoke all on function admin_list_audit(text,int) from public;
grant execute on function admin_list_audit(text,int) to authenticated;

-- ------------------------------------------------------------
-- PAYMENT ACCOUNTS (existing table)
-- ------------------------------------------------------------
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
create policy payment_accounts_deny on payment_accounts for all to authenticated,anon using(false) with check(false);

create or replace function list_active_payment_accounts()
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  return (select coalesce(jsonb_agg(to_jsonb(p) order by sort_order,created_at),'[]'::jsonb) from payment_accounts p where is_active=true);
end;
$$;
revoke all on function list_active_payment_accounts() from public;
grant execute on function list_active_payment_accounts() to authenticated;

-- ------------------------------------------------------------
-- STAFF PIN CHANGE
-- ------------------------------------------------------------
create or replace function staff_change_pin(
  p_session_id uuid,p_tab_secret text,p_current_pin text,p_new_pin text
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_session sessions%rowtype; v_access staff_access%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_tab_secret,'')))<16 then raise exception 'Tab session missing'; end if;
  if length(trim(coalesce(p_current_pin,'')))<4 or length(trim(coalesce(p_new_pin,'')))<4 or length(trim(coalesce(p_new_pin,'')))>32 then raise exception 'Invalid PIN'; end if;
  select * into v_session from sessions where id=p_session_id and is_active=true for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  select * into v_access from staff_access where session_id=p_session_id and user_id=v_uid and tab_secret=p_tab_secret;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_session.pin_hash is null or crypt(p_current_pin,v_session.pin_hash)<>v_session.pin_hash then raise exception 'INVALID_CURRENT_PIN'; end if;
  update sessions set pin_hash=crypt(p_new_pin,gen_salt('bf',10)) where restaurant_id=v_session.restaurant_id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function staff_change_pin(uuid,text,text,text) from public;
grant execute on function staff_change_pin(uuid,text,text,text) to authenticated;

-- ------------------------------------------------------------
-- CUSTOMER ORDER RPC: production-safe normalization + rate limit.
-- This replaces the fragile browser-side total calculation path.
-- ------------------------------------------------------------
create or replace function place_customer_order(
  p_session_id uuid,p_table_id text,p_items jsonb,p_note text default '',
  p_fulfillment text default null,p_customer_name text default null,
  p_customer_phone text default null,p_customer_address text default null,
  p_area_name text default null
) returns orders
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_uid uuid:=auth.uid(); v_session sessions%rowtype; v_item jsonb; v_id uuid; v_qty int; v_price numeric(10,2); v_name text; v_type text;
  v_items jsonb:='[]'::jsonb; v_subtotal numeric(10,2):=0; v_tax numeric(10,2):=0; v_delivery numeric(10,2):=0; v_total numeric(10,2):=0; v_area_charge numeric(10,2); v_order orders%rowtype; v_count int;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from sessions where id=p_session_id and is_active=true;
  if not found or not exists(select 1 from customer_access where session_id=p_session_id and table_id=trim(p_table_id) and user_id=v_uid) then raise exception 'Customer session expired'; end if;
  perform ensure_restaurant_plan_access(v_session.restaurant_id, v_session.restaurant_name);
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then raise exception 'Invalid order items'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'Note too long'; end if;
  if p_fulfillment not in ('delivery','takeaway') and p_fulfillment is not null then raise exception 'Invalid fulfillment'; end if;
  if p_fulfillment='delivery' and lower(trim(p_table_id))<>'takeaway' then raise exception 'Delivery is only available from takeaway QR'; end if;
  if p_fulfillment='takeaway' and lower(trim(p_table_id))<>'takeaway' then raise exception 'Invalid takeaway order'; end if;

  select count(*) into v_count from orders where customer_user_id=v_uid and created_at>now()-interval '60 seconds';
  if v_count>=5 then raise exception 'RATE_LIMIT'; end if;
  select count(*) into v_count from orders where session_id=p_session_id and table_id=trim(p_table_id) and created_at>now()-interval '60 seconds';
  if v_count>=5 then raise exception 'RATE_LIMIT'; end if;

  if p_fulfillment='delivery' then
    if coalesce(trim(p_customer_name),'')='' or coalesce(trim(p_customer_phone),'')='' or coalesce(trim(p_customer_address),'')='' or coalesce(trim(p_area_name),'')='' then raise exception 'Delivery details required'; end if;
    select charge into v_area_charge from delivery_areas where session_id=p_session_id and name=trim(p_area_name);
    if not found then raise exception 'Invalid delivery area'; end if;
    v_delivery:=coalesce(v_area_charge,0);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty:=greatest(0,least(coalesce((v_item->>'qty')::int,0),20));
    if v_qty<1 then raise exception 'Invalid quantity'; end if;
    v_type:=coalesce(v_item->>'type','item');
    if v_type='deal' then
      begin v_id:=(v_item->>'id')::uuid; exception when others then raise exception 'Invalid deal'; end;
      select name,price into v_name,v_price from deals where id=v_id and session_id=p_session_id and is_active=true and (valid_from is null or valid_from<=current_date) and (valid_until is null or valid_until>=current_date);
      if not found then raise exception 'Deal unavailable'; end if;
      v_items:=v_items||jsonb_build_array(jsonb_build_object('id',v_id,'name',v_name,'price',v_price,'qty',v_qty,'type','deal'));
    else
      begin v_id:=(v_item->>'id')::uuid; exception when others then raise exception 'Invalid menu item'; end;
      select name,price into v_name,v_price from menu_items where id=v_id and session_id=p_session_id and is_available=true;
      if not found then raise exception 'Menu item unavailable'; end if;
      v_items:=v_items||jsonb_build_array(jsonb_build_object('id',v_id,'name',v_name,'price',v_price,'qty',v_qty));
    end if;
    v_subtotal:=v_subtotal+(v_price*v_qty);
  end loop;

  v_tax:=round(v_subtotal*coalesce(v_session.tax_percent,0)/100,2);
  v_total:=v_subtotal+v_tax+v_delivery;

  insert into orders(session_id,table_id,items,note,total,delivery_charge,status,fulfillment,customer_name,customer_phone,customer_address,area_name,customer_user_id)
  values(p_session_id,trim(p_table_id),v_items,coalesce(p_note,''),v_total,v_delivery,'pending',p_fulfillment,nullif(trim(p_customer_name),''),nullif(trim(p_customer_phone),''),nullif(trim(p_customer_address),''),nullif(trim(p_area_name),''),v_uid)
  returning * into v_order;
  return v_order;
end;
$$;
revoke all on function place_customer_order(uuid,text,jsonb,text,text,text,text,text,text) from public;
grant execute on function place_customer_order(uuid,text,jsonb,text,text,text,text,text,text) to authenticated;

-- ============================================================
-- END
-- ============================================================


-- ------------------------------------------------------------
-- CUSTOMER QR BOOTSTRAP: enforce plan access and expose only safe fields.
-- ------------------------------------------------------------
create or replace function customer_bootstrap(p_restaurant_id text, p_qr_secret text, p_table_id text)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
  v_table text := trim(p_table_id);
  v_plan jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(v_table)<1 or length(v_table)>80 then raise exception 'Invalid table'; end if;
  select * into v_session
  from sessions
  where restaurant_id=trim(p_restaurant_id)
    and qr_secret=trim(p_qr_secret)
    and is_active=true
  limit 1;
  if not found then raise exception 'INVALID_QR'; end if;

  v_plan := ensure_restaurant_plan_access(v_session.restaurant_id,v_session.restaurant_name);

  insert into customer_access(session_id,user_id,table_id,last_seen_at)
  values(v_session.id,v_uid,v_table,now())
  on conflict(session_id,user_id,table_id) do update set last_seen_at=now();

  return jsonb_build_object(
    'id',v_session.id,
    'restaurant_name',v_session.restaurant_name,
    'logo_url',v_session.logo_url,
    'theme',v_session.theme,
    'tax_percent',v_session.tax_percent,
    'tax_label',v_session.tax_label,
    'is_active',v_session.is_active,
    'plan',v_plan
  );
end;
$$;
revoke all on function customer_bootstrap(text,text,text) from public;
grant execute on function customer_bootstrap(text,text,text) to authenticated;

-- Keep this patch's important RPC permissions explicit after every replacement.
revoke all on function place_customer_order(uuid,text,jsonb,text,text,text,text,text,text) from public;
grant execute on function place_customer_order(uuid,text,jsonb,text,text,text,text,text,text) to authenticated;


-- ------------------------------------------------------------
-- SECURITY FIELD TRIGGER: allow only our server-side PIN RPCs to rotate hashes.
-- Direct browser updates still cannot change PIN / QR / rider secrets.
-- ------------------------------------------------------------
create or replace function protect_session_security_fields() returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
  if tg_op='UPDATE'
     and (new.restaurant_id is distinct from old.restaurant_id
       or new.qr_secret is distinct from old.qr_secret
       or new.rider_secret is distinct from old.rider_secret
       or new.pin_hash is distinct from old.pin_hash) then
    if coalesce(current_setting('table_order.allow_security_update', true),'off') <> 'on' then
      raise exception 'Protected session identity fields cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

-- Ensure the trigger exists even if an older migration created a different version.
drop trigger if exists trg_sessions_protect on sessions;
create trigger trg_sessions_protect before update on sessions for each row execute function protect_session_security_fields();

-- Recreate the two PIN-changing RPCs with the protected update flag.
create or replace function admin_reset_pin(p_admin_key text,p_restaurant_id text,p_new_pin text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare v_id text:=lower(trim(p_restaurant_id));
begin
  perform _admin_assert(p_admin_key);
  if length(trim(coalesce(p_new_pin,'')))<4 or length(trim(p_new_pin))>32 then raise exception 'INVALID_PIN'; end if;
  if not exists(select 1 from restaurant_plans where restaurant_id=v_id) then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  perform set_config('table_order.allow_security_update','on',true);
  update sessions set pin_hash=crypt(trim(p_new_pin),gen_salt('bf',10)) where restaurant_id=v_id;
  insert into admin_audit_log(action_type,restaurant_id,result,details) values('reset_pin',v_id,'success','{}'::jsonb);
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function admin_reset_pin(text,text,text) from public;
grant execute on function admin_reset_pin(text,text,text) to authenticated;

create or replace function staff_change_pin(
  p_session_id uuid,p_tab_secret text,p_current_pin text,p_new_pin text
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_session sessions%rowtype; v_access staff_access%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_tab_secret,'')))<16 then raise exception 'Tab session missing'; end if;
  if length(trim(coalesce(p_current_pin,'')))<4 or length(trim(coalesce(p_new_pin,'')))<4 or length(trim(coalesce(p_new_pin,'')))>32 then raise exception 'Invalid PIN'; end if;
  select * into v_session from sessions where id=p_session_id and is_active=true for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  select * into v_access from staff_access where session_id=p_session_id and user_id=v_uid and tab_secret=p_tab_secret;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if v_session.pin_hash is null or crypt(p_current_pin,v_session.pin_hash)<>v_session.pin_hash then raise exception 'INVALID_CURRENT_PIN'; end if;
  perform set_config('table_order.allow_security_update','on',true);
  update sessions set pin_hash=crypt(trim(p_new_pin),gen_salt('bf',10)) where restaurant_id=v_session.restaurant_id;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function staff_change_pin(uuid,text,text,text) from public;
grant execute on function staff_change_pin(uuid,text,text,text) to authenticated;
