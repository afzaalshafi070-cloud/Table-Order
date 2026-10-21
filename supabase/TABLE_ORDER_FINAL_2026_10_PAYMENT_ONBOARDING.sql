-- ============================================================
-- TABLE ORDER FINAL 2026-10
-- REAL BANK PAYMENT + SECURE ACTIVATION ONBOARDING
-- ============================================================
-- Run this ONCE after the existing project migrations.
-- This patch is additive / corrective and does NOT delete orders,
-- menu items, restaurant data, payment history or sessions.
--
-- IMPORTANT PAYMENT RULE:
-- Counter can ONLY submit a PENDING payment request.
-- No payment record is created and no subscription is renewed
-- until Admin explicitly approves the request after checking the
-- real bank transfer / transaction reference.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. Plan pricing: 1 month / 6 months / 1 year
-- ------------------------------------------------------------
insert into app_settings(key, value)
values
  ('default_monthly_price','5000'),
  ('default_six_month_price','30000'),
  ('default_yearly_price','60000'),
  ('currency','PKR')
on conflict (key) do nothing;

alter table restaurant_plans add column if not exists initial_pin_hash text;

-- ------------------------------------------------------------
-- 2. Activation-code generation is SERVER-SIDE.
-- The browser never invents an activation code that is merely
-- displayed. Every generated code exists in the DB immediately.
-- ------------------------------------------------------------
create or replace function admin_generate_activation_code(p_admin_key text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_code text;
  v_row activation_codes%rowtype;
begin
  perform _admin_assert(p_admin_key);
  loop
    v_code := 'TO-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
    begin
      insert into activation_codes(code, is_used, is_revoked)
      values(v_code, false, false)
      returning * into v_row;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'code', v_row.code, 'id', v_row.id);
end;
$$;
revoke all on function admin_generate_activation_code(text) from public;
grant execute on function admin_generate_activation_code(text) to authenticated;

-- ------------------------------------------------------------
-- 3. Admin creates restaurant WITHOUT creating a fake/active
-- session. The generated activation code + hashed initial PIN
-- are stored against the plan. The first real Counter login
-- consumes the activation code and creates the first session.
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
  v_name text := trim(p_restaurant_name);
  v_id text := lower(trim(regexp_replace(coalesce(p_restaurant_name,''),'[^a-zA-Z0-9]+','-','g')));
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
  if v_cycle='six_months' and v_status='active' then v_days := greatest(v_days,180); end if;
  if v_cycle='year' and v_status='active' then v_days := greatest(v_days,365); end if;
  if exists(select 1 from restaurant_plans where restaurant_id=v_id) then raise exception 'RESTAURANT_EXISTS'; end if;
  if v_code = '' then raise exception 'ACTIVATION_CODE_REQUIRED'; end if;

  select * into v_code_row
  from activation_codes
  where upper(trim(code)) = v_code
  for update;
  if not found then raise exception 'ACTIVATION_CODE_NOT_FOUND'; end if;
  if v_code_row.is_used or v_code_row.is_revoked then raise exception 'ACTIVATION_CODE_UNAVAILABLE'; end if;
  if v_code_row.restaurant_id is not null and v_code_row.restaurant_id <> v_id then raise exception 'ACTIVATION_CODE_ASSIGNED'; end if;

  update activation_codes
  set restaurant_id=v_id, assigned_at=v_now
  where id=v_code_row.id;

  insert into restaurant_plans(
    restaurant_id, restaurant_name, plan_status, trial_ends_at, paid_until,
    billing_cycle, activated_at, notes, activation_required, initial_pin_hash
  ) values(
    v_id, v_name, v_status,
    case when v_status='trial' then v_now+make_interval(days=>v_days) else null end,
    case when v_status='active' then v_now+make_interval(days=>v_days) else null end,
    v_cycle, v_now, p_notes, true,
    crypt(trim(p_pin), gen_salt('bf',10))
  ) returning * into v_plan;

  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('create_restaurant',v_id,'success',jsonb_build_object(
    'name',v_name,'plan',v_status,'billing_cycle',v_cycle,'activation_code',v_code
  ));

  return jsonb_build_object(
    'ok',true,
    'restaurant_id',v_id,
    'restaurant_name',v_name,
    'activation_code',v_code,
    'activation_required',true,
    'plan',to_jsonb(v_plan) - 'initial_pin_hash'
  );
exception when unique_violation then
  raise exception 'RESTAURANT_EXISTS';
end;
$$;
revoke all on function admin_create_restaurant(text,text,text,text,int,text,text,text) from public;
grant execute on function admin_create_restaurant(text,text,text,text,int,text,text,text) to authenticated;

-- ------------------------------------------------------------
-- 4. Correct first-login activation workflow.
-- Existing restaurants with old sessions keep their old login.
-- Newly provisioned restaurants use the assigned code + the
-- bcrypt-hashed initial PIN. Code is consumed exactly once.
-- ------------------------------------------------------------
create or replace function staff_login(
  p_restaurant_name text,
  p_pin text,
  p_activation_code text default '',
  p_tab_secret text default '',
  p_silent boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_restaurant_id text := lower(trim(regexp_replace(coalesce(p_restaurant_name,''), '[^a-zA-Z0-9]+', '-', 'g')));
  v_active sessions%rowtype;
  v_old sessions%rowtype;
  v_new sessions%rowtype;
  v_access staff_access%rowtype;
  v_code activation_codes%rowtype;
  v_plan restaurant_plans%rowtype;
  v_plan_json jsonb;
  v_pay jsonb;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_pin,''))) < 4 or length(trim(coalesce(p_pin,''))) > 32 then raise exception 'INVALID_PIN'; end if;
  if length(v_restaurant_id) < 2 or length(v_restaurant_id) > 80 then raise exception 'INVALID_RESTAURANT'; end if;
  if length(trim(coalesce(p_tab_secret,''))) < 16 then raise exception 'Tab session missing'; end if;

  select * into v_plan from restaurant_plans where restaurant_id=v_restaurant_id;
  if not found then
    -- New restaurants must be provisioned by Admin. Do not auto-create
    -- random trial rows from a mistyped restaurant name.
    raise exception 'RESTAURANT_NOT_PROVISIONED';
  end if;
  v_plan_json := ensure_restaurant_plan_access(v_restaurant_id, p_restaurant_name);
  select * into v_plan from restaurant_plans where restaurant_id=v_restaurant_id;
  v_pay := list_active_payment_accounts();

  -- Existing active session: normal PIN validation and resume.
  select * into v_active from sessions
  where restaurant_id=v_restaurant_id and is_active=true
  order by created_at desc limit 1 for update;
  if found then
    if v_active.pin_hash is null or crypt(p_pin,v_active.pin_hash) <> v_active.pin_hash then raise exception 'INVALID_PIN'; end if;
    select * into v_access from staff_access where session_id=v_active.id;
    if found and v_access.user_id=v_uid and v_access.tab_secret=p_tab_secret then
      update staff_access set last_seen_at=v_now where session_id=v_active.id;
      update sessions set last_seen_at=v_now where id=v_active.id;
      return jsonb_build_object('ok',true,'session',to_jsonb(v_active)-'pin_hash','resumed',true,'plan',v_plan_json,'payment_accounts',v_pay);
    end if;
    if p_silent then return jsonb_build_object('ok',false,'code','SILENT_RESUME_FAILED'); end if;
    if found and v_access.last_seen_at > v_now - interval '45 seconds' then raise exception 'RESTAURANT_ALREADY_ACTIVE'; end if;
    update staff_access set user_id=v_uid, tab_secret=p_tab_secret, last_seen_at=v_now where session_id=v_active.id;
    if not found then insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_active.id,v_uid,p_tab_secret,v_now); end if;
    update sessions set last_seen_at=v_now where id=v_active.id;
    select * into v_active from sessions where id=v_active.id;
    return jsonb_build_object('ok',true,'session',to_jsonb(v_active)-'pin_hash','resumed',true,'plan',v_plan_json,'payment_accounts',v_pay);
  end if;

  -- Old session exists: create a new shift without requiring the one-time code.
  select * into v_old from sessions where restaurant_id=v_restaurant_id order by created_at desc limit 1;
  if found then
    if v_old.pin_hash is null or crypt(p_pin,v_old.pin_hash) <> v_old.pin_hash then raise exception 'INVALID_PIN'; end if;
    insert into sessions(
      restaurant_id,restaurant_name,pin_hash,qr_secret,rider_secret,is_active,
      shift_started_at,last_seen_at,logo_url,theme,tax_percent,tax_label
    ) values(
      v_restaurant_id,trim(p_restaurant_name),v_old.pin_hash,
      coalesce(nullif(trim(v_old.qr_secret),''),encode(gen_random_bytes(16),'hex')),
      coalesce(nullif(trim(v_old.rider_secret),''),encode(gen_random_bytes(24),'hex')),
      true,v_now,v_now,v_old.logo_url,coalesce(v_old.theme,'{}'::jsonb),coalesce(v_old.tax_percent,0),coalesce(nullif(v_old.tax_label,''),'Tax')
    ) returning * into v_new;
    insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_new.id,v_uid,p_tab_secret,v_now);
    insert into menu_items(session_id,category,name,price,description,image_url,is_available,sort_order)
      select v_new.id,category,name,price,description,image_url,is_available,sort_order from menu_items where session_id=v_old.id;
    begin
      insert into delivery_areas(session_id,name,charge) select v_new.id,name,charge from delivery_areas where session_id=v_old.id;
    exception when others then null;
    end;
    begin
      insert into deals(session_id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order)
        select v_new.id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order from deals where session_id=v_old.id;
    exception when others then null;
    end;
    return jsonb_build_object('ok',true,'session',to_jsonb(v_new)-'pin_hash','new_shift',true,'plan',v_plan_json,'payment_accounts',v_pay);
  end if;

  -- Brand-new Admin-provisioned restaurant: code must belong to this restaurant.
  if length(trim(coalesce(p_activation_code,''))) < 4 then raise exception 'INVALID_ACTIVATION_CODE'; end if;
  select * into v_code
  from activation_codes
  where upper(trim(code))=upper(trim(p_activation_code))
    and is_used=false
    and coalesce(is_revoked,false)=false
    and (restaurant_id is null or restaurant_id=v_restaurant_id)
  for update;
  if not found then raise exception 'INVALID_ACTIVATION_CODE'; end if;
  if v_plan.initial_pin_hash is null or crypt(p_pin,v_plan.initial_pin_hash) <> v_plan.initial_pin_hash then raise exception 'INVALID_PIN'; end if;

  insert into sessions(
    restaurant_id,restaurant_name,pin_hash,qr_secret,rider_secret,is_active,
    shift_started_at,last_seen_at,tax_percent,tax_label
  ) values(
    v_restaurant_id,trim(p_restaurant_name),v_plan.initial_pin_hash,
    encode(gen_random_bytes(16),'hex'),encode(gen_random_bytes(24),'hex'),
    true,v_now,v_now,0,'Tax'
  ) returning * into v_new;

  update activation_codes
  set is_used=true, used_by=v_restaurant_id, used_at=v_now
  where id=v_code.id;

  update restaurant_plans
  set restaurant_name=trim(p_restaurant_name), activation_required=false, initial_pin_hash=null, updated_at=v_now
  where restaurant_id=v_restaurant_id;

  insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_new.id,v_uid,p_tab_secret,v_now);

  return jsonb_build_object('ok',true,'session',to_jsonb(v_new)-'pin_hash','new_restaurant',true,'plan',v_plan_json,'payment_accounts',v_pay);
exception when unique_violation then
  raise exception 'RESTAURANT_ALREADY_ACTIVE';
end;
$$;
revoke all on function staff_login(text,text,text,text,boolean) from public;
grant execute on function staff_login(text,text,text,text,boolean) to authenticated;

-- ------------------------------------------------------------
-- 5. Subscription request table: lock request to an active
-- payment account and require an explicit customer confirmation.
-- ------------------------------------------------------------
alter table subscription_payment_requests add column if not exists payment_account_id uuid;
alter table subscription_payment_requests add column if not exists customer_confirmed boolean not null default false;
alter table payment_records add column if not exists payment_source text default 'manual';
create index if not exists idx_sub_pay_req_pending on subscription_payment_requests(status, created_at desc) where status='pending';

-- ------------------------------------------------------------
-- 6. Price info for Counter: 1 / 6 / 12 months
-- ------------------------------------------------------------
create or replace function get_subscription_price_info()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_monthly numeric;
  v_six numeric;
  v_yearly numeric;
  v_currency text;
begin
  select nullif(value,'')::numeric into v_monthly from app_settings where key='default_monthly_price';
  select nullif(value,'')::numeric into v_six from app_settings where key='default_six_month_price';
  select nullif(value,'')::numeric into v_yearly from app_settings where key='default_yearly_price';
  select coalesce(nullif(value,''),'PKR') into v_currency from app_settings where key='currency';
  return jsonb_build_object(
    'monthly',coalesce(v_monthly,5000),
    'six_months',coalesce(v_six,30000),
    'yearly',coalesce(v_yearly,60000),
    'currency',coalesce(v_currency,'PKR')
  );
end;
$$;
revoke all on function get_subscription_price_info() from public;
grant execute on function get_subscription_price_info() to authenticated;

-- ------------------------------------------------------------
-- 7. Submit payment request ONLY. Never creates payment_records.
-- Exact amount is enforced server-side from Admin settings.
-- Remove the older 8-argument overload so no legacy submit path remains.
-- ------------------------------------------------------------
drop function if exists submit_subscription_payment(uuid,text,numeric,text,text,timestamptz,text,text);

create or replace function submit_subscription_payment(
  p_session_id uuid,
  p_tab_secret text,
  p_amount numeric,
  p_method text default null,
  p_transaction_id text default null,
  p_payment_date timestamptz default null,
  p_proof_url text default null,
  p_billing_cycle text default null,
  p_payment_account_id uuid default null,
  p_confirmed boolean default false
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
  v_access staff_access%rowtype;
  v_req subscription_payment_requests%rowtype;
  v_cycle text;
  v_expected numeric;
  v_monthly numeric;
  v_six numeric;
  v_yearly numeric;
  v_account payment_accounts%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_tab_secret,''))) < 16 then raise exception 'Tab session missing'; end if;
  select * into v_session from sessions where id=p_session_id and is_active=true;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  select * into v_access from staff_access where session_id=p_session_id and user_id=v_uid and tab_secret=p_tab_secret;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  if coalesce(p_confirmed,false) is not true then raise exception 'PAYMENT_CONFIRMATION_REQUIRED'; end if;
  if length(trim(coalesce(p_transaction_id,''))) < 4 then raise exception 'INVALID_TRANSACTION_REFERENCE'; end if;
  if p_payment_account_id is null then raise exception 'PAYMENT_ACCOUNT_REQUIRED'; end if;

  select * into v_account from payment_accounts where id=p_payment_account_id and is_active=true;
  if not found then raise exception 'PAYMENT_ACCOUNT_NOT_FOUND'; end if;

  if exists(select 1 from subscription_payment_requests where restaurant_id=v_session.restaurant_id and status='pending') then
    raise exception 'PENDING_REQUEST_EXISTS';
  end if;

  select coalesce(nullif(value,'')::numeric,5000) into v_monthly from app_settings where key='default_monthly_price';
  select coalesce(nullif(value,'')::numeric,30000) into v_six from app_settings where key='default_six_month_price';
  select coalesce(nullif(value,'')::numeric,60000) into v_yearly from app_settings where key='default_yearly_price';

  v_cycle := coalesce(nullif(trim(p_billing_cycle),''),'month');
  if v_cycle not in ('month','six_months','year') then raise exception 'INVALID_BILLING_CYCLE'; end if;
  v_expected := case when v_cycle='year' then v_yearly when v_cycle='six_months' then v_six else v_monthly end;
  if abs(coalesce(p_amount,0)-v_expected) > 0.01 then raise exception 'INVALID_AMOUNT'; end if;

  insert into subscription_payment_requests(
    restaurant_id,amount,currency,method,transaction_id,payment_date,proof_url,status,
    billing_cycle,created_by_session,payment_account_id,customer_confirmed
  ) values(
    v_session.restaurant_id,v_expected,'PKR',
    coalesce(nullif(trim(v_account.label),''),nullif(trim(p_method),''),'Bank Transfer'),
    nullif(trim(p_transaction_id),''),coalesce(p_payment_date,now()),nullif(trim(p_proof_url),''),
    'pending',v_cycle,p_session_id,v_account.id,true
  ) returning * into v_req;

  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('subscription_payment_submitted',v_session.restaurant_id,'success',jsonb_build_object(
    'request_id',v_req.id,'amount',v_expected,'cycle',v_cycle,'transaction_id',v_req.transaction_id
  ));

  return jsonb_build_object('ok',true,'status','pending','request',to_jsonb(v_req));
end;
$$;
revoke all on function submit_subscription_payment(uuid,text,numeric,text,text,timestamptz,text,text,uuid,boolean) from public;
grant execute on function submit_subscription_payment(uuid,text,numeric,text,text,timestamptz,text,text,uuid,boolean) to authenticated;

-- ------------------------------------------------------------
-- 8. Customer's own request history
-- ------------------------------------------------------------
create or replace function list_my_subscription_payments(p_session_id uuid,p_tab_secret text)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_session sessions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from sessions where id=p_session_id and is_active=true;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not exists(select 1 from staff_access where session_id=p_session_id and user_id=v_uid and tab_secret=p_tab_secret) then raise exception 'NOT_AUTHORIZED'; end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
    from subscription_payment_requests r
    where r.restaurant_id=v_session.restaurant_id
  );
end;
$$;
revoke all on function list_my_subscription_payments(uuid,text) from public;
grant execute on function list_my_subscription_payments(uuid,text) to authenticated;

-- ------------------------------------------------------------
-- 9. Admin request list. Pending requests are NOT payments yet.
-- ------------------------------------------------------------
create or replace function admin_list_payment_requests(p_admin_key text,p_status text default null)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'restaurant_id',r.restaurant_id,'restaurant_name',coalesce(s.restaurant_name,r.restaurant_id),
      'amount',r.amount,'currency',r.currency,'method',r.method,'transaction_id',r.transaction_id,
      'payment_date',r.payment_date,'proof_url',r.proof_url,'status',r.status,'admin_note',r.admin_note,
      'billing_cycle',r.billing_cycle,'created_at',r.created_at,'reviewed_at',r.reviewed_at,
      'payment_account_id',r.payment_account_id,'customer_confirmed',r.customer_confirmed,
      'bank_name',pa.bank_name,'account_title',pa.account_title
    ) order by r.created_at desc),'[]'::jsonb)
    from subscription_payment_requests r
    left join lateral(select restaurant_name from sessions where restaurant_id=r.restaurant_id order by started_at desc nulls last limit 1)s on true
    left join payment_accounts pa on pa.id=r.payment_account_id
    where p_status is null or r.status=p_status
  );
end;
$$;
revoke all on function admin_list_payment_requests(text,text) from public;
grant execute on function admin_list_payment_requests(text,text) to authenticated;

-- ------------------------------------------------------------
-- 10. Admin approval is the ONLY place that creates the real
-- payment record and extends subscription.
-- ------------------------------------------------------------
create or replace function admin_review_payment_request(
  p_admin_key text,
  p_request_id uuid,
  p_action text,
  p_admin_note text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_req subscription_payment_requests%rowtype;
  v_now timestamptz:=now();
  v_days int;
  v_cycle text;
  v_payment payment_records%rowtype;
  v_expected numeric;
  v_monthly numeric;
  v_six numeric;
  v_yearly numeric;
begin
  perform _admin_assert(p_admin_key);
  if p_action not in ('approve','reject') then raise exception 'INVALID_ACTION'; end if;
  select * into v_req from subscription_payment_requests where id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'REQUEST_ALREADY_REVIEWED'; end if;

  if p_action='reject' then
    update subscription_payment_requests set status='rejected',admin_note=nullif(trim(p_admin_note),''),reviewed_at=v_now where id=p_request_id returning * into v_req;
    insert into admin_audit_log(action_type,restaurant_id,result,details)
    values('subscription_payment_rejected',v_req.restaurant_id,'success',jsonb_build_object('request_id',p_request_id,'note',p_admin_note));
    return jsonb_build_object('ok',true,'status','rejected','request',to_jsonb(v_req));
  end if;

  if length(trim(coalesce(v_req.transaction_id,''))) < 4 then raise exception 'INVALID_TRANSACTION_REFERENCE'; end if;
  if v_req.customer_confirmed is not true then raise exception 'PAYMENT_CONFIRMATION_REQUIRED'; end if;

  select coalesce(nullif(value,'')::numeric,5000) into v_monthly from app_settings where key='default_monthly_price';
  select coalesce(nullif(value,'')::numeric,30000) into v_six from app_settings where key='default_six_month_price';
  select coalesce(nullif(value,'')::numeric,60000) into v_yearly from app_settings where key='default_yearly_price';
  v_cycle:=coalesce(nullif(trim(v_req.billing_cycle),''),'month');
  v_expected:=case when v_cycle='year' then v_yearly when v_cycle='six_months' then v_six else v_monthly end;
  if abs(coalesce(v_req.amount,0)-v_expected)>0.01 then raise exception 'REQUEST_AMOUNT_NO_LONGER_MATCHES_PLAN_PRICE'; end if;
  v_days:=case when v_cycle='year' then 365 when v_cycle='six_months' then 180 else 30 end;

  insert into payment_records(restaurant_id,amount,currency,method,reference_note,admin_note,payment_date,payment_source)
  values(v_req.restaurant_id,v_req.amount,coalesce(v_req.currency,'PKR'),v_req.method,v_req.transaction_id,
    coalesce(nullif(trim(p_admin_note),''),'Bank transfer verified by Admin'),coalesce(v_req.payment_date,v_now),'bank_transfer_verified')
  returning * into v_payment;

  update restaurant_plans set
    plan_status='active',billing_cycle=v_cycle,
    paid_until=greatest(coalesce(paid_until,v_now),v_now)+make_interval(days=>v_days),
    trial_ends_at=null,grace_ends_at=null,sold_out_at=null,updated_at=v_now
  where restaurant_id=v_req.restaurant_id;

  update subscription_payment_requests set status='approved',admin_note=nullif(trim(p_admin_note),''),reviewed_at=v_now where id=p_request_id returning * into v_req;

  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('subscription_payment_approved',v_req.restaurant_id,'success',jsonb_build_object(
    'request_id',p_request_id,'payment_id',v_payment.id,'amount',v_req.amount,'days',v_days,'cycle',v_cycle,'transaction_id',v_req.transaction_id
  ));

  return jsonb_build_object('ok',true,'status','approved','request',to_jsonb(v_req),'payment',to_jsonb(v_payment));
end;
$$;
revoke all on function admin_review_payment_request(text,uuid,text,text) from public;
grant execute on function admin_review_payment_request(text,uuid,text,text) to authenticated;

-- ------------------------------------------------------------
-- 11. Payment history is still only actual approved/manual
-- payment_records. Pending requests never inflate revenue.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 12. Helpful admin activation-code listing / delete permissions
-- ------------------------------------------------------------
revoke all on function admin_list_codes(text) from public;
grant execute on function admin_list_codes(text) to authenticated;
revoke all on function admin_delete_code(text,text) from public;
grant execute on function admin_delete_code(text,text) to authenticated;

-- ============================================================
-- END
-- ============================================================


-- Add a 6-month count to the admin dashboard without changing existing fields.
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
    'six_months',(select count(*) from restaurant_plans where billing_cycle='six_months' and plan_status not in ('sold_out','suspended')),
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

-- Never expose the bcrypt initial PIN hash through Admin restaurant listings.
create or replace function admin_list_restaurants(p_admin_key text)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);

  update restaurant_plans p set
    plan_status = case
      when plan_status='complimentary' then plan_status
      when plan_status in ('sold_out','expired') then 'sold_out'
      when coalesce(paid_until,trial_ends_at) is not null
       and coalesce(paid_until,trial_ends_at) < now()
       and coalesce(grace_ends_at,coalesce(paid_until,trial_ends_at)+interval '10 days') < now() then 'sold_out'
      when coalesce(paid_until,trial_ends_at) is not null
       and coalesce(paid_until,trial_ends_at) < now() then 'overdue'
      else plan_status end,
    grace_ends_at = case
      when plan_status='complimentary' then grace_ends_at
      when coalesce(paid_until,trial_ends_at) < now() and grace_ends_at is null
        then coalesce(paid_until,trial_ends_at)+interval '10 days'
      else grace_ends_at end,
    sold_out_at = case
      when plan_status not in ('sold_out','expired','complimentary')
       and coalesce(grace_ends_at,coalesce(paid_until,trial_ends_at)+interval '10 days') < now()
       and coalesce(paid_until,trial_ends_at) < now() then coalesce(sold_out_at,now())
      else sold_out_at end,
    updated_at=now()
  where plan_status <> 'complimentary';

  return (
    select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.activated_at desc),'[]'::jsonb)
    from (
      select
        p.restaurant_id,
        p.restaurant_name,
        p.plan_status,
        p.trial_ends_at,
        p.paid_until,
        p.activated_at,
        p.notes,
        p.updated_at,
        p.billing_cycle,
        p.grace_ends_at,
        p.sold_out_at,
        p.activation_required,
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

-- Admin PIN reset must also work BEFORE the restaurant has completed
-- its first activation-code login.
create or replace function admin_reset_pin(p_admin_key text,p_restaurant_id text,p_new_pin text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare
  v_id text:=lower(trim(p_restaurant_id));
  v_hash text;
  v_count int;
begin
  perform _admin_assert(p_admin_key);
  if length(trim(coalesce(p_new_pin,'')))<4 or length(trim(p_new_pin))>32 then raise exception 'INVALID_PIN'; end if;
  if not exists(select 1 from restaurant_plans where restaurant_id=v_id) then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  v_hash:=crypt(trim(p_new_pin),gen_salt('bf',10));
  update sessions set pin_hash=v_hash where restaurant_id=v_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    update restaurant_plans set initial_pin_hash=v_hash, activation_required=true, updated_at=now() where restaurant_id=v_id;
  else
    update restaurant_plans set initial_pin_hash=null, activation_required=false, updated_at=now() where restaurant_id=v_id;
  end if;
  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('reset_pin',v_id,'success','{}'::jsonb);
  return jsonb_build_object('ok',true,'restaurant_id',v_id);
end;
$$;
revoke all on function admin_reset_pin(text,text,text) from public;
grant execute on function admin_reset_pin(text,text,text) to authenticated;
