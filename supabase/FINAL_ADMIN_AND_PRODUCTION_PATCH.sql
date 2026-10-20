-- ============================================================
-- TABLE ORDER — FINAL ADMIN & PRODUCTION PATCH
-- 
-- This patch ensures:
-- 1. Admin authentication is properly configured
-- 2. All admin RPC functions have correct execute permissions
-- 3. Security is maintained throughout
-- 4. No existing data is deleted or modified
--
-- Run this AFTER the main schema.sql and admin_panel_migration.sql
-- ============================================================

-- ============================================================
-- VERIFY APP SETTINGS TABLE EXISTS AND ADMIN KEY IS SET
-- ============================================================
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- IMPORTANT: Ensure admin_key exists with a secure value
-- If the key is still the default 'CHANGE-ME-TO-A-LONG-SECRET', it needs to be set
-- in Supabase directly or through your admin setup process.
insert into app_settings (key, value)
values ('admin_key', 'CHANGE-ME-TO-A-LONG-SECRET')
on conflict (key) do nothing;

alter table app_settings enable row level security;
drop policy if exists app_settings_deny on app_settings;
create policy app_settings_deny on app_settings
  for all to authenticated, anon using (false) with check (false);

-- ============================================================
-- VERIFY ACTIVATION CODES TABLE STRUCTURE
-- ============================================================
create table if not exists activation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  is_used boolean not null default false,
  used_by text,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table activation_codes add column if not exists is_used boolean default false;
alter table activation_codes add column if not exists used_by text;
alter table activation_codes add column if not exists used_at timestamptz;

create index if not exists idx_activation_codes_code on activation_codes(code);
create index if not exists idx_activation_codes_is_used on activation_codes(is_used);

alter table activation_codes enable row level security;
drop policy if exists activation_codes_deny_all on activation_codes;
create policy activation_codes_deny_all on activation_codes
  for all to authenticated, anon using (false) with check (false);

-- ============================================================
-- VERIFY RESTAURANT PLANS TABLE STRUCTURE
-- ============================================================
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

create index if not exists idx_restaurant_plans_status on restaurant_plans(plan_status);
create index if not exists idx_restaurant_plans_activated_at on restaurant_plans(activated_at);

alter table restaurant_plans enable row level security;
drop policy if exists restaurant_plans_deny_all on restaurant_plans;
create policy restaurant_plans_deny_all on restaurant_plans
  for all to authenticated, anon using (false) with check (false);

-- ============================================================
-- ENSURE _ADMIN_ASSERT FUNCTION EXISTS
-- ============================================================
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

-- ============================================================
-- ENSURE CORE ADMIN RPC FUNCTIONS EXIST WITH CORRECT PERMISSIONS
-- ============================================================

-- admin_list_restaurants: List all restaurants with their plans and stats
create or replace function admin_list_restaurants(p_admin_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  
  -- Update statuses based on current time
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

-- admin_update_plan: Update a restaurant's plan
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

-- admin_list_codes: List all activation codes
create or replace function admin_list_codes(p_admin_key text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  return (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb) from activation_codes c);
end;
$$;

-- admin_create_codes: Create new activation codes
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

-- admin_delete_code: Delete an activation code
create or replace function admin_delete_code(p_admin_key text, p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  delete from activation_codes where upper(trim(code)) = upper(trim(p_code));
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================
-- ENSURE CORRECT EXECUTE PERMISSIONS FOR ADMIN FUNCTIONS
-- ============================================================
revoke all on function admin_list_restaurants(text) from public;
revoke all on function admin_update_plan(text,text,text,int,text,text) from public;
revoke all on function admin_list_codes(text) from public;
revoke all on function admin_create_codes(text,text[]) from public;
revoke all on function admin_delete_code(text,text) from public;

grant execute on function admin_list_restaurants(text) to authenticated;
grant execute on function admin_update_plan(text,text,text,int,text,text) to authenticated;
grant execute on function admin_list_codes(text) to authenticated;
grant execute on function admin_create_codes(text,text[]) to authenticated;
grant execute on function admin_delete_code(text,text) to authenticated;

-- ============================================================
-- VERIFY PAYMENT ACCOUNTS TABLE FOR REFERENCE
-- ============================================================
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

-- ============================================================
-- SUMMARY OF CHANGES
-- ============================================================
-- Added/verified:
-- - app_settings table (stores admin_key)
-- - activation_codes table (stores activation codes)
-- - restaurant_plans table (stores subscription info)
-- - payment_accounts table (for payment info)
-- 
-- Functions added/verified:
-- - _admin_assert(p_key) - checks admin authorization
-- - admin_list_restaurants(p_admin_key) - lists all restaurants with stats
-- - admin_update_plan(...) - updates restaurant plan
-- - admin_list_codes(p_admin_key) - lists activation codes
-- - admin_create_codes(...) - creates new codes
-- - admin_delete_code(...) - deletes a code
--
-- All functions are SECURITY DEFINER and check admin key before execution.
-- Restaurant data is NEVER deleted when subscription expires.
-- All sensitive operations require admin authentication.
-- ============================================================
