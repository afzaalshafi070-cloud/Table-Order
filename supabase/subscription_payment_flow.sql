-- ============================================================
-- Subscription Payment Flow (additive, non-destructive)
-- Central Admin payment methods → Restaurant renewal → Admin verify → Auto renew
-- Preserves existing restaurant_plans, payment_accounts, payment_records, RLS
-- ============================================================

-- 1) Extend payment_accounts (central Admin payment methods)
alter table payment_accounts add column if not exists method_type text default 'bank';
alter table payment_accounts add column if not exists qr_url text;
alter table payment_accounts add column if not exists instructions text;

-- 2) Pending payment requests from restaurants (Counter Dashboard)
create table if not exists subscription_payment_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  amount numeric(12,2) not null,
  currency text not null default 'PKR',
  method text,
  transaction_id text,
  payment_date timestamptz not null default now(),
  proof_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  billing_cycle text default 'month',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_by_session uuid
);

create index if not exists idx_sub_pay_req_restaurant on subscription_payment_requests(restaurant_id, created_at desc);
create index if not exists idx_sub_pay_req_status on subscription_payment_requests(status) where status = 'pending';

alter table subscription_payment_requests enable row level security;
drop policy if exists subscription_payment_requests_deny on subscription_payment_requests;
create policy subscription_payment_requests_deny on subscription_payment_requests
  for all to authenticated, anon using (false) with check (false);

-- 3) Update list_active_payment_accounts (already returns to_jsonb — new cols included automatically)

-- 4) Admin upsert payment account (support new columns; keep old signature compatible via defaults)
create or replace function admin_upsert_payment_account(
  p_admin_key text,
  p_id uuid default null,
  p_label text default null,
  p_bank_name text default null,
  p_account_title text default null,
  p_account_number text default null,
  p_iban text default null,
  p_country text default 'PK',
  p_is_active boolean default true,
  p_sort_order int default 0,
  p_method_type text default 'bank',
  p_qr_url text default null,
  p_instructions text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform _admin_assert(p_admin_key);
  if p_id is null then
    insert into payment_accounts(
      label, bank_name, account_title, account_number, iban, country,
      is_active, sort_order, method_type, qr_url, instructions
    ) values (
      coalesce(nullif(trim(p_label), ''), 'Bank Transfer'),
      coalesce(nullif(trim(p_bank_name), ''), ''),
      coalesce(nullif(trim(p_account_title), ''), ''),
      coalesce(nullif(trim(p_account_number), ''), ''),
      nullif(trim(p_iban), ''),
      coalesce(nullif(trim(p_country), ''), 'PK'),
      coalesce(p_is_active, true),
      coalesce(p_sort_order, 0),
      coalesce(nullif(trim(p_method_type), ''), 'bank'),
      nullif(trim(p_qr_url), ''),
      nullif(trim(p_instructions), '')
    ) returning id into v_id;
  else
    update payment_accounts set
      label = coalesce(nullif(trim(p_label), ''), label),
      bank_name = coalesce(nullif(trim(p_bank_name), ''), bank_name),
      account_title = coalesce(nullif(trim(p_account_title), ''), account_title),
      account_number = coalesce(nullif(trim(p_account_number), ''), account_number),
      iban = case when p_iban is null then iban else nullif(trim(p_iban), '') end,
      country = coalesce(nullif(trim(p_country), ''), country),
      is_active = coalesce(p_is_active, is_active),
      sort_order = coalesce(p_sort_order, sort_order),
      method_type = coalesce(nullif(trim(p_method_type), ''), method_type),
      qr_url = case when p_qr_url is null then qr_url else nullif(trim(p_qr_url), '') end,
      instructions = case when p_instructions is null then instructions else nullif(trim(p_instructions), '') end
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'PAYMENT_ACCOUNT_NOT_FOUND'; end if;
  end if;
  return (select to_jsonb(p) from payment_accounts p where id = v_id);
end;
$$;

revoke all on function admin_upsert_payment_account(text,uuid,text,text,text,text,text,text,boolean,int,text,text,text) from public;
grant execute on function admin_upsert_payment_account(text,uuid,text,text,text,text,text,text,boolean,int,text,text,text) to authenticated;

-- Keep older 10-arg version working if still referenced (wrapper)
create or replace function admin_upsert_payment_account(
  p_admin_key text,
  p_id uuid,
  p_label text,
  p_bank_name text,
  p_account_title text,
  p_account_number text,
  p_iban text,
  p_country text,
  p_is_active boolean,
  p_sort_order int
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return admin_upsert_payment_account(
    p_admin_key, p_id, p_label, p_bank_name, p_account_title, p_account_number,
    p_iban, p_country, p_is_active, p_sort_order, 'bank', null, null
  );
end;
$$;
revoke all on function admin_upsert_payment_account(text,uuid,text,text,text,text,text,text,boolean,int) from public;
grant execute on function admin_upsert_payment_account(text,uuid,text,text,text,text,text,text,boolean,int) to authenticated;

-- 5) Restaurant submits subscription payment (session-authenticated)
create or replace function submit_subscription_payment(
  p_session_id uuid,
  p_tab_secret text,
  p_amount numeric,
  p_method text default null,
  p_transaction_id text default null,
  p_payment_date timestamptz default null,
  p_proof_url text default null,
  p_billing_cycle text default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
  v_access staff_access%rowtype;
  v_plan restaurant_plans%rowtype;
  v_cycle text;
  v_amount numeric(12,2);
  v_req subscription_payment_requests%rowtype;
  v_monthly numeric;
  v_yearly numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_tab_secret, ''))) < 16 then raise exception 'Tab session missing'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select * into v_session from sessions where id = p_session_id and is_active = true;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  select * into v_access from staff_access
    where session_id = p_session_id and user_id = v_uid and tab_secret = p_tab_secret;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_plan from restaurant_plans where restaurant_id = v_session.restaurant_id;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  -- Prevent duplicate pending
  if exists (
    select 1 from subscription_payment_requests
    where restaurant_id = v_session.restaurant_id and status = 'pending'
  ) then
    raise exception 'PENDING_REQUEST_EXISTS';
  end if;

  select coalesce(nullif(value, '')::numeric, 5000) into v_monthly
    from app_settings where key = 'default_monthly_price';
  select coalesce(nullif(value, '')::numeric, 60000) into v_yearly
    from app_settings where key = 'default_yearly_price';

  v_cycle := coalesce(nullif(trim(p_billing_cycle), ''), v_plan.billing_cycle, 'month');
  if v_cycle not in ('month', 'year') then v_cycle := 'month'; end if;

  -- Amount must match plan price (security: restaurant cannot change amount)
  v_amount := case when v_cycle = 'year' then coalesce(v_yearly, 60000) else coalesce(v_monthly, 5000) end;
  -- Allow small tolerance only if client sent matching amount; otherwise force plan amount
  if abs(coalesce(p_amount, 0) - v_amount) > 1 then
    v_amount := v_amount; -- force correct amount
  end if;

  insert into subscription_payment_requests(
    restaurant_id, amount, currency, method, transaction_id,
    payment_date, proof_url, status, billing_cycle, created_by_session
  ) values (
    v_session.restaurant_id,
    v_amount,
    'PKR',
    nullif(trim(p_method), ''),
    nullif(trim(p_transaction_id), ''),
    coalesce(p_payment_date, now()),
    nullif(trim(p_proof_url), ''),
    'pending',
    v_cycle,
    p_session_id
  ) returning * into v_req;

  insert into admin_audit_log(action_type, restaurant_id, result, details)
  values (
    'subscription_payment_submitted',
    v_session.restaurant_id,
    'success',
    jsonb_build_object('request_id', v_req.id, 'amount', v_amount, 'cycle', v_cycle)
  );

  return to_jsonb(v_req);
end;
$$;

revoke all on function submit_subscription_payment(uuid,text,numeric,text,text,timestamptz,text,text) from public;
grant execute on function submit_subscription_payment(uuid,text,numeric,text,text,timestamptz,text,text) to authenticated;

-- 6) Restaurant lists own payment requests
create or replace function list_my_subscription_payments(
  p_session_id uuid,
  p_tab_secret text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from sessions where id = p_session_id and is_active = true;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not exists (
    select 1 from staff_access
    where session_id = p_session_id and user_id = v_uid and tab_secret = p_tab_secret
  ) then raise exception 'NOT_AUTHORIZED'; end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by created_at desc), '[]'::jsonb)
    from subscription_payment_requests r
    where r.restaurant_id = v_session.restaurant_id
  );
end;
$$;

revoke all on function list_my_subscription_payments(uuid,text) from public;
grant execute on function list_my_subscription_payments(uuid,text) to authenticated;

-- 7) Admin list payment requests
create or replace function admin_list_payment_requests(
  p_admin_key text,
  p_status text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform _admin_assert(p_admin_key);
  return (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'restaurant_id', r.restaurant_id,
        'restaurant_name', coalesce(s.restaurant_name, r.restaurant_id),
        'amount', r.amount,
        'currency', r.currency,
        'method', r.method,
        'transaction_id', r.transaction_id,
        'payment_date', r.payment_date,
        'proof_url', r.proof_url,
        'status', r.status,
        'admin_note', r.admin_note,
        'billing_cycle', r.billing_cycle,
        'created_at', r.created_at,
        'reviewed_at', r.reviewed_at
      ) order by r.created_at desc
    ), '[]'::jsonb)
    from subscription_payment_requests r
    left join lateral (
      select restaurant_name from sessions
      where restaurant_id = r.restaurant_id and is_active = true
      order by started_at desc nulls last
      limit 1
    ) s on true
    where (p_status is null or r.status = p_status)
  );
end;
$$;

revoke all on function admin_list_payment_requests(text,text) from public;
grant execute on function admin_list_payment_requests(text,text) to authenticated;

-- 8) Admin approve / reject → on approve auto-renew plan
create or replace function admin_review_payment_request(
  p_admin_key text,
  p_request_id uuid,
  p_action text, -- 'approve' | 'reject'
  p_admin_note text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_req subscription_payment_requests%rowtype;
  v_now timestamptz := now();
  v_days int;
  v_cycle text;
  v_payment payment_records%rowtype;
begin
  perform _admin_assert(p_admin_key);
  if p_action not in ('approve', 'reject') then raise exception 'INVALID_ACTION'; end if;

  select * into v_req from subscription_payment_requests where id = p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_req.status <> 'pending' then raise exception 'REQUEST_ALREADY_REVIEWED'; end if;

  if p_action = 'reject' then
    update subscription_payment_requests
    set status = 'rejected',
        admin_note = nullif(trim(p_admin_note), ''),
        reviewed_at = v_now
    where id = p_request_id
    returning * into v_req;

    insert into admin_audit_log(action_type, restaurant_id, result, details)
    values ('subscription_payment_rejected', v_req.restaurant_id, 'success',
      jsonb_build_object('request_id', p_request_id, 'note', p_admin_note));

    return to_jsonb(v_req);
  end if;

  -- APPROVE: record payment + extend plan (same rules as admin_record_payment)
  v_cycle := coalesce(nullif(trim(v_req.billing_cycle), ''), 'month');
  v_days := case when v_cycle = 'year' then 365 else 30 end;

  insert into payment_records(restaurant_id, amount, currency, method, reference_note, admin_note, payment_date)
  values (
    v_req.restaurant_id,
    v_req.amount,
    coalesce(v_req.currency, 'PKR'),
    v_req.method,
    v_req.transaction_id,
    coalesce(nullif(trim(p_admin_note), ''), 'Approved subscription payment request'),
    coalesce(v_req.payment_date, v_now)
  ) returning * into v_payment;

  update restaurant_plans set
    plan_status = 'active',
    billing_cycle = v_cycle,
    paid_until = greatest(coalesce(paid_until, v_now), v_now) + make_interval(days => v_days),
    grace_ends_at = null,
    sold_out_at = null,
    updated_at = v_now
  where restaurant_id = v_req.restaurant_id;

  update subscription_payment_requests
  set status = 'approved',
      admin_note = nullif(trim(p_admin_note), ''),
      reviewed_at = v_now
  where id = p_request_id
  returning * into v_req;

  insert into admin_audit_log(action_type, restaurant_id, result, details)
  values (
    'subscription_payment_approved',
    v_req.restaurant_id,
    'success',
    jsonb_build_object(
      'request_id', p_request_id,
      'payment_id', v_payment.id,
      'amount', v_req.amount,
      'days', v_days,
      'cycle', v_cycle
    )
  );

  return jsonb_build_object(
    'request', to_jsonb(v_req),
    'payment', to_jsonb(v_payment),
    'ok', true
  );
end;
$$;

revoke all on function admin_review_payment_request(text,uuid,text,text) from public;
grant execute on function admin_review_payment_request(text,uuid,text,text) to authenticated;

-- 9) Helper: plan amount for counter (optional convenience)
create or replace function get_subscription_price_info()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_monthly numeric;
  v_yearly numeric;
  v_currency text;
begin
  select coalesce(nullif(value, '')::numeric, 5000) into v_monthly from app_settings where key = 'default_monthly_price';
  select coalesce(nullif(value, '')::numeric, 60000) into v_yearly from app_settings where key = 'default_yearly_price';
  select coalesce(nullif(value, ''), 'PKR') into v_currency from app_settings where key = 'currency';
  return jsonb_build_object(
    'monthly', coalesce(v_monthly, 5000),
    'yearly', coalesce(v_yearly, 60000),
    'currency', coalesce(v_currency, 'PKR')
  );
end;
$$;
revoke all on function get_subscription_price_info() from public;
grant execute on function get_subscription_price_info() to authenticated;
