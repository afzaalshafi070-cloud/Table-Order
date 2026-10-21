-- ============================================================
-- TABLE ORDER — SELLING MODEL FINAL HARDENING
-- Apply AFTER the existing production/payment migrations.
-- Additive / non-destructive. Does NOT delete restaurant, order,
-- menu, QR, session, or subscription data.
--
-- Purpose:
-- 1) Make 6-month pricing fully Admin-controlled.
-- 2) Make grace period use Admin setting instead of hard-coded 10d.
-- 3) Fix payment-request restaurant session timestamp field.
-- 4) Prevent duplicate transaction/reference submissions.
-- 5) Lock the amount/cycle at payment-request creation so a later
--    price change does not invalidate an already-submitted request.
-- 6) Keep existing Restaurant Name + PIN + Activation Code model.
-- 7) Keep existing manual bank/payment workflow and RLS model.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Selling-plan defaults
-- ------------------------------------------------------------
insert into app_settings(key,value) values
  ('default_monthly_price','5000'),
  ('default_six_month_price','30000'),
  ('default_yearly_price','60000'),
  ('default_grace_days','10')
on conflict (key) do nothing;

-- Existing payment-account table already supports these fields in the
-- previous payment migration. IF NOT EXISTS keeps this patch safe if the
-- columns were already created.
alter table payment_accounts add column if not exists method_type text default 'bank';
alter table payment_accounts add column if not exists qr_url text;
alter table payment_accounts add column if not exists instructions text;

-- Store the exact server-approved price at request time for auditability.
alter table subscription_payment_requests add column if not exists price_locked numeric(12,2);
alter table subscription_payment_requests add column if not exists currency_locked text;

update subscription_payment_requests
set price_locked = coalesce(price_locked, amount),
    currency_locked = coalesce(currency_locked, currency, 'PKR')
where price_locked is null or currency_locked is null;

-- ------------------------------------------------------------
-- 2. Central subscription price RPC
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
-- 3. Plan access: use Admin-configured grace period.
-- Existing access states remain unchanged.
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
  v_grace_days int := 10;
begin
  select * into p
  from restaurant_plans
  where restaurant_id=lower(trim(p_restaurant_id))
  for update;

  if not found then raise exception 'RESTAURANT_NOT_PROVISIONED'; end if;

  select greatest(coalesce(nullif(value,'')::int,10),0)
  into v_grace_days
  from app_settings where key='default_grace_days';

  if p.plan_status='complimentary' then
    return jsonb_build_object('access','ok','status','complimentary','payment_due',false,'activation_required',p.activation_required);
  end if;

  if p.plan_status in ('suspended','sold_out','expired') then
    raise exception 'PLAN_SOLD_OUT';
  end if;

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
        grace_ends_at=coalesce(v_due,v_now)+make_interval(days=>v_grace_days),
        updated_at=v_now
    where restaurant_id=p.restaurant_id
    returning * into p;
  else
    update restaurant_plans
    set plan_status='overdue', updated_at=v_now
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
grant execute on function ensure_restaurant_plan_access(text,text) to authenticated;

-- ------------------------------------------------------------
-- 4. Admin restaurant list: same configurable grace period.
-- Also preserves the existing returned fields.
-- ------------------------------------------------------------
create or replace function admin_list_restaurants(p_admin_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_grace_days int := 10;
begin
  perform _admin_assert(p_admin_key);
  select greatest(coalesce(nullif(value,'')::int,10),0)
  into v_grace_days from app_settings where key='default_grace_days';

  update restaurant_plans p set
    plan_status = case
      when plan_status='complimentary' then plan_status
      when plan_status in ('sold_out','expired') then 'sold_out'
      when coalesce(paid_until,trial_ends_at) is not null
       and coalesce(grace_ends_at,coalesce(paid_until,trial_ends_at)+make_interval(days=>v_grace_days)) < now() then 'sold_out'
      when coalesce(paid_until,trial_ends_at) is not null
       and coalesce(paid_until,trial_ends_at) < now() then 'overdue'
      else plan_status end,
    grace_ends_at = case
      when plan_status='complimentary' then grace_ends_at
      when coalesce(paid_until,trial_ends_at) < now() and grace_ends_at is null
        then coalesce(paid_until,trial_ends_at)+make_interval(days=>v_grace_days)
      else grace_ends_at end,
    sold_out_at = case
      when plan_status not in ('sold_out','expired','complimentary')
       and coalesce(grace_ends_at,coalesce(paid_until,trial_ends_at)+make_interval(days=>v_grace_days)) < now()
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
        (select coalesce(sum(pr.amount),0)::numeric from payment_records pr where pr.restaurant_id=p.restaurant_id) as payments_total
      from restaurant_plans p
    ) t
  );
end;
$$;
revoke all on function admin_list_restaurants(text) from public;
grant execute on function admin_list_restaurants(text) to authenticated;

-- ------------------------------------------------------------
-- 5. Payment submission: preserve old flow but lock amount at submit
-- time and reject duplicate transaction references.
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
  v_currency text;
  v_account payment_accounts%rowtype;
  v_txn text := lower(trim(coalesce(p_transaction_id,'')));
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_tab_secret,''))) < 16 then raise exception 'Tab session missing'; end if;
  if length(v_txn) < 4 then raise exception 'INVALID_TRANSACTION_REFERENCE'; end if;
  if p_payment_account_id is null then raise exception 'PAYMENT_ACCOUNT_REQUIRED'; end if;
  if coalesce(p_confirmed,false) is not true then raise exception 'PAYMENT_CONFIRMATION_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext(v_txn));

  select * into v_session from sessions where id=p_session_id and is_active=true;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  select * into v_access from staff_access where session_id=p_session_id and user_id=v_uid and tab_secret=p_tab_secret;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_account from payment_accounts where id=p_payment_account_id and is_active=true;
  if not found then raise exception 'PAYMENT_ACCOUNT_NOT_FOUND'; end if;

  if exists(
    select 1 from subscription_payment_requests
    where lower(trim(coalesce(transaction_id,'')))=v_txn
      and status in ('pending','approved')
  ) or exists(
    select 1 from payment_records
    where lower(trim(coalesce(reference_note,'')))=v_txn
  ) then
    raise exception 'DUPLICATE_TRANSACTION_REFERENCE';
  end if;

  if exists(select 1 from subscription_payment_requests where restaurant_id=v_session.restaurant_id and status='pending') then
    raise exception 'PENDING_REQUEST_EXISTS';
  end if;

  select coalesce(nullif(value,'')::numeric,5000) into v_monthly from app_settings where key='default_monthly_price';
  select coalesce(nullif(value,'')::numeric,30000) into v_six from app_settings where key='default_six_month_price';
  select coalesce(nullif(value,'')::numeric,60000) into v_yearly from app_settings where key='default_yearly_price';
  select coalesce(nullif(value,''),'PKR') into v_currency from app_settings where key='currency';

  v_cycle := coalesce(nullif(trim(p_billing_cycle),''),'month');
  if v_cycle not in ('month','six_months','year') then raise exception 'INVALID_BILLING_CYCLE'; end if;
  v_expected := case when v_cycle='year' then v_yearly when v_cycle='six_months' then v_six else v_monthly end;
  if abs(coalesce(p_amount,0)-v_expected) > 0.01 then raise exception 'INVALID_AMOUNT'; end if;

  insert into subscription_payment_requests(
    restaurant_id,amount,currency,method,transaction_id,payment_date,proof_url,status,
    billing_cycle,created_by_session,payment_account_id,customer_confirmed,price_locked,currency_locked
  ) values(
    v_session.restaurant_id,v_expected,v_currency,
    coalesce(nullif(trim(v_account.label),''),nullif(trim(p_method),''),'Payment'),
    nullif(trim(p_transaction_id),''),coalesce(p_payment_date,now()),nullif(trim(p_proof_url),''),
    'pending',v_cycle,p_session_id,v_account.id,true,v_expected,v_currency
  ) returning * into v_req;

  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('subscription_payment_submitted',v_session.restaurant_id,'success',jsonb_build_object(
    'request_id',v_req.id,'amount',v_expected,'cycle',v_cycle,'transaction_id',v_req.transaction_id,'payment_account_id',v_account.id
  ));

  return jsonb_build_object('ok',true,'status','pending','request',to_jsonb(v_req));
end;
$$;
revoke all on function submit_subscription_payment(uuid,text,numeric,text,text,timestamptz,text,text,uuid,boolean) from public;
grant execute on function submit_subscription_payment(uuid,text,numeric,text,text,timestamptz,text,text,uuid,boolean) to authenticated;

-- ------------------------------------------------------------
-- 6. Admin payment-request list: correct session timestamp field.
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
      'price_locked',r.price_locked,'currency_locked',r.currency_locked,
      'bank_name',pa.bank_name,'account_title',pa.account_title
    ) order by r.created_at desc),'[]'::jsonb)
    from subscription_payment_requests r
    left join lateral(
      select restaurant_name
      from sessions
      where restaurant_id=r.restaurant_id
      order by shift_started_at desc nulls last
      limit 1
    ) s on true
    left join payment_accounts pa on pa.id=r.payment_account_id
    where p_status is null or r.status=p_status
  );
end;
$$;
revoke all on function admin_list_payment_requests(text,text) from public;
grant execute on function admin_list_payment_requests(text,text) to authenticated;

-- ------------------------------------------------------------
-- 7. Admin approval: uses the locked request amount/cycle.
-- Changing today's price cannot silently invalidate an older request.
-- Duplicate transaction is checked again before payment_records insert.
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
  v_txn text;
begin
  perform _admin_assert(p_admin_key);
  if p_action not in ('approve','reject') then raise exception 'INVALID_ACTION'; end if;

  select * into v_req from subscription_payment_requests where id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'REQUEST_ALREADY_REVIEWED'; end if;

  if p_action='reject' then
    update subscription_payment_requests
    set status='rejected',admin_note=nullif(trim(p_admin_note),''),reviewed_at=v_now
    where id=p_request_id returning * into v_req;
    insert into admin_audit_log(action_type,restaurant_id,result,details)
    values('subscription_payment_rejected',v_req.restaurant_id,'success',jsonb_build_object('request_id',p_request_id,'note',p_admin_note));
    return jsonb_build_object('ok',true,'status','rejected','request',to_jsonb(v_req));
  end if;

  if length(trim(coalesce(v_req.transaction_id,''))) < 4 then raise exception 'INVALID_TRANSACTION_REFERENCE'; end if;
  if v_req.customer_confirmed is not true then raise exception 'PAYMENT_CONFIRMATION_REQUIRED'; end if;

  v_txn := lower(trim(v_req.transaction_id));
  perform pg_advisory_xact_lock(hashtext(v_txn));

  if exists(
    select 1 from payment_records
    where lower(trim(coalesce(reference_note,'')))=v_txn
  ) or exists(
    select 1 from subscription_payment_requests
    where id<>v_req.id
      and lower(trim(coalesce(transaction_id,'')))=v_txn
      and status in ('pending','approved')
  ) then
    raise exception 'DUPLICATE_TRANSACTION_REFERENCE';
  end if;

  if coalesce(v_req.price_locked,v_req.amount) <= 0 then raise exception 'INVALID_REQUEST_AMOUNT'; end if;
  v_cycle:=coalesce(nullif(trim(v_req.billing_cycle),''),'month');
  if v_cycle not in ('month','six_months','year') then raise exception 'INVALID_BILLING_CYCLE'; end if;
  v_days:=case when v_cycle='year' then 365 when v_cycle='six_months' then 180 else 30 end;

  insert into payment_records(restaurant_id,amount,currency,method,reference_note,admin_note,payment_date,payment_source)
  values(
    v_req.restaurant_id,
    coalesce(v_req.price_locked,v_req.amount),
    coalesce(v_req.currency_locked,v_req.currency,'PKR'),
    v_req.method,
    v_req.transaction_id,
    coalesce(nullif(trim(p_admin_note),''),'Payment verified by Admin'),
    coalesce(v_req.payment_date,v_now),
    'manual_transfer_verified'
  ) returning * into v_payment;

  update restaurant_plans set
    plan_status='active',billing_cycle=v_cycle,
    paid_until=greatest(coalesce(paid_until,v_now),v_now)+make_interval(days=>v_days),
    trial_ends_at=null,grace_ends_at=null,sold_out_at=null,updated_at=v_now
  where restaurant_id=v_req.restaurant_id;

  update subscription_payment_requests
  set status='approved',admin_note=nullif(trim(p_admin_note),''),reviewed_at=v_now
  where id=p_request_id returning * into v_req;

  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('subscription_payment_approved',v_req.restaurant_id,'success',jsonb_build_object(
    'request_id',p_request_id,'payment_id',v_payment.id,'amount',v_payment.amount,'days',v_days,'cycle',v_cycle,'transaction_id',v_req.transaction_id
  ));

  return jsonb_build_object('ok',true,'status','approved','request',to_jsonb(v_req),'payment',to_jsonb(v_payment));
end;
$$;
revoke all on function admin_review_payment_request(text,uuid,text,text) from public;
grant execute on function admin_review_payment_request(text,uuid,text,text) to authenticated;

-- ------------------------------------------------------------
-- 8. Explicit server-side activation-code RPC only.
-- No browser-generated fallback should be used by the UI.
-- ------------------------------------------------------------
create or replace function admin_generate_activation_code(p_admin_key text)
returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp
as $$
declare
  v_code text;
  v_row activation_codes%rowtype;
begin
  perform _admin_assert(p_admin_key);
  loop
    v_code := 'TO-' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8));
    begin
      insert into activation_codes(code,is_used,is_revoked)
      values(v_code,false,false)
      returning * into v_row;
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  return jsonb_build_object('ok',true,'code',v_row.code,'id',v_row.id);
end;
$$;
revoke all on function admin_generate_activation_code(text) from public;
grant execute on function admin_generate_activation_code(text) to authenticated;

-- ============================================================
-- END SELLING MODEL FINAL HARDENING
-- ============================================================
