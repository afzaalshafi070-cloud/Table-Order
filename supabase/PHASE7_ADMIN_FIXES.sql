-- ============================================================
-- PHASE 7 — Admin fixes
--   1. Onboarding contact + address fields (restaurant_plans columns)
--   2. admin_create_restaurant v2 (accepts contact + address)
--   3. admin_list_restaurants (returns the new fields and archived_at)
--   4. Archive / Restore (soft, data kept)      -> admin_archive_restaurant, admin_restore_restaurant
--   5. Delete Permanently (hard, typed id must match) -> admin_permanent_delete_restaurant
--   6. Branches: list + add/edit                 -> admin_list_branches, admin_upsert_branch
-- Run once in Supabase SQL Editor. Idempotent. Needs the admin key checks
-- (_admin_assert) that already exist in FINAL_PRODUCTION_PATCH.sql.
-- admin_delete_restaurant is NOT removed; the Admin Panel no longer calls it.
-- ============================================================

begin;

-- Preflight
do $$
begin
  if to_regclass('public.restaurant_plans') is null
     or to_regclass('public.sessions') is null
     or to_regclass('public.restaurant_branches') is null then
    raise exception 'PHASE7_PREFLIGHT: restaurant_plans / sessions / restaurant_branches missing. Run the earlier production SQL first.';
  end if;
  if to_regprocedure('_admin_assert(text)') is null then
    raise exception 'PHASE7_PREFLIGHT: _admin_assert(text) missing. Run FINAL_PRODUCTION_PATCH.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='sessions' and column_name='is_active') then
    raise exception 'PHASE7_PREFLIGHT: sessions.is_active missing.';
  end if;
end $$;

-- 1. New columns (all nullable, safe on existing rows)
alter table restaurant_plans add column if not exists contact_name text;
alter table restaurant_plans add column if not exists contact_phone text;
alter table restaurant_plans add column if not exists contact_email text;
alter table restaurant_plans add column if not exists address text;
alter table restaurant_plans add column if not exists city text;
alter table restaurant_plans add column if not exists archived_at timestamptz;

-- 2. admin_create_restaurant v2 (old 8-argument version replaced)
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
  if length(coalesce(p_contact_name,'')) > 120 or length(coalesce(p_contact_phone,'')) > 30
     or length(coalesce(p_contact_email,'')) > 160 or length(coalesce(p_address,'')) > 300
     or length(coalesce(p_city,'')) > 80 then
    raise exception 'FIELD_TOO_LONG';
  end if;
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
    billing_cycle, activated_at, notes, activation_required, initial_pin_hash,
    contact_name, contact_phone, contact_email, address, city
  ) values(
    v_id, v_name, v_status,
    case when v_status='trial' then v_now+make_interval(days=>v_days) else null end,
    case when v_status='active' then v_now+make_interval(days=>v_days) else null end,
    v_cycle, v_now, p_notes, true,
    crypt(trim(p_pin), gen_salt('bf',10)),
    nullif(trim(coalesce(p_contact_name,'')),''),
    nullif(trim(coalesce(p_contact_phone,'')),''),
    nullif(trim(coalesce(p_contact_email,'')),''),
    nullif(trim(coalesce(p_address,'')),''),
    nullif(trim(coalesce(p_city,'')),'')
  ) returning * into v_plan;

  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('create_restaurant',v_id,'success',jsonb_build_object(
    'name',v_name,'plan',v_status,'billing_cycle',v_cycle,'activation_code',v_code,
    'city',nullif(trim(coalesce(p_city,'')),'')
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

revoke all on function admin_create_restaurant(text,text,text,text,int,text,text,text,text,text,text,text,text) from public;
grant execute on function admin_create_restaurant(text,text,text,text,int,text,text,text,text,text,text,text,text) to authenticated;

-- 3. admin_list_restaurants: same logic as before, plus contact/address/archived_at
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
        p.contact_name,
        p.contact_phone,
        p.contact_email,
        p.address,
        p.city,
        p.archived_at,
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

-- 4a. Archive: soft. Data stays. Restaurant's sessions stop taking orders.
create or replace function admin_archive_restaurant(p_admin_key text, p_restaurant_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_id text := lower(trim(p_restaurant_id));
begin
  perform _admin_assert(p_admin_key);
  if not exists(select 1 from restaurant_plans where restaurant_id=v_id) then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  update restaurant_plans set archived_at=coalesce(archived_at, now()), updated_at=now() where restaurant_id=v_id;
  update sessions set is_active=false where restaurant_id=v_id and is_active=true;
  insert into admin_audit_log(action_type,restaurant_id,result,details) values('archive_restaurant',v_id,'success','{}'::jsonb);
  return jsonb_build_object('ok',true,'restaurant_id',v_id,'archived',true);
end;
$$;

-- 4b. Restore an archived restaurant
create or replace function admin_restore_restaurant(p_admin_key text, p_restaurant_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_id text := lower(trim(p_restaurant_id));
begin
  perform _admin_assert(p_admin_key);
  if not exists(select 1 from restaurant_plans where restaurant_id=v_id) then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  update restaurant_plans set archived_at=null, updated_at=now() where restaurant_id=v_id;
  -- Reactivate only the newest inactive session per branch (one active session per branch is enforced by a unique index)
  with cand as (
    select distinct on (coalesce(i.branch_id::text,'')) i.id
    from sessions i
    where i.restaurant_id = v_id
      and i.is_active = false
      and not exists (
        select 1 from sessions a
        where a.restaurant_id = v_id and a.is_active = true
          and coalesce(a.branch_id::text,'') = coalesce(i.branch_id::text,'')
      )
    order by coalesce(i.branch_id::text,''), i.created_at desc
  )
  update sessions set is_active = true where id in (select id from cand);
  insert into admin_audit_log(action_type,restaurant_id,result,details) values('restore_restaurant',v_id,'success','{}'::jsonb);
  return jsonb_build_object('ok',true,'restaurant_id',v_id,'archived',false);
end;
$$;

-- 5. Delete Permanently: hard delete. Caller must send the restaurant id again as p_confirm_id.
create or replace function admin_permanent_delete_restaurant(p_admin_key text, p_restaurant_id text, p_confirm_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_id text := lower(trim(p_restaurant_id));
begin
  perform _admin_assert(p_admin_key);
  if lower(trim(coalesce(p_confirm_id,''))) <> v_id then raise exception 'CONFIRM_MISMATCH'; end if;
  if not exists(select 1 from restaurant_plans where restaurant_id=v_id) and not exists(select 1 from sessions where restaurant_id=v_id) then
    raise exception 'RESTAURANT_NOT_FOUND';
  end if;
  delete from staff_access where session_id in (select id from sessions where restaurant_id=v_id);
  delete from customer_access where session_id in (select id from sessions where restaurant_id=v_id);
  delete from rider_access where session_id in (select id from sessions where restaurant_id=v_id);
  delete from activation_codes where restaurant_id=v_id;
  delete from payment_records where restaurant_id=v_id;
  delete from sessions where restaurant_id=v_id;
  delete from restaurant_branches where restaurant_id=v_id;
  delete from restaurant_plans where restaurant_id=v_id;
  insert into admin_audit_log(action_type,restaurant_id,result,details) values('permanent_delete_restaurant',v_id,'success','{}'::jsonb);
  return jsonb_build_object('ok',true,'restaurant_id',v_id,'deleted',true);
end;
$$;

-- 6a. Branches: list (active and inactive)
create or replace function admin_list_branches(p_admin_key text, p_restaurant_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_id text := lower(trim(p_restaurant_id));
begin
  perform _admin_assert(p_admin_key);
  return (
    select coalesce(jsonb_agg(to_jsonb(b) order by b.is_default desc, b.branch_name), '[]'::jsonb)
    from restaurant_branches b
    where b.restaurant_id = v_id
  );
end;
$$;

-- 6b. Branches: add (p_branch_id null) or edit (p_branch_id set)
create or replace function admin_upsert_branch(
  p_admin_key text,
  p_restaurant_id text,
  p_branch_id uuid default null,
  p_branch_name text default null,
  p_area text default null,
  p_address text default null,
  p_phone text default null,
  p_is_default boolean default false,
  p_is_active boolean default true
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
  v_id text := lower(trim(p_restaurant_id));
  v_name text := trim(coalesce(p_branch_name,''));
  v_row restaurant_branches%rowtype;
begin
  perform _admin_assert(p_admin_key);
  if not exists(select 1 from restaurant_plans where restaurant_id=v_id) then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'INVALID_BRANCH_NAME'; end if;
  if length(coalesce(p_address,'')) > 300 or length(coalesce(p_phone,'')) > 30 or length(coalesce(p_area,'')) > 120 then
    raise exception 'FIELD_TOO_LONG';
  end if;

  if p_is_default then
    update restaurant_branches set is_default=false, updated_at=now()
    where restaurant_id=v_id and (p_branch_id is null or id<>p_branch_id);
  end if;

  begin
    if p_branch_id is null then
      insert into restaurant_branches(restaurant_id, branch_name, area, address, phone, is_default, is_active)
      values (v_id, v_name, nullif(trim(coalesce(p_area,'')),''), nullif(trim(coalesce(p_address,'')),''),
              nullif(trim(coalesce(p_phone,'')),''), coalesce(p_is_default,false), coalesce(p_is_active,true))
      returning * into v_row;
    else
      update restaurant_branches
         set branch_name = v_name,
             area = nullif(trim(coalesce(p_area,'')),''),
             address = nullif(trim(coalesce(p_address,'')),''),
             phone = nullif(trim(coalesce(p_phone,'')),''),
             is_default = coalesce(p_is_default,false),
             is_active = coalesce(p_is_active,true),
             updated_at = now()
       where id = p_branch_id and restaurant_id = v_id
      returning * into v_row;
      if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
    end if;
  exception when unique_violation then
    raise exception 'BRANCH_NAME_EXISTS';
  end;

  insert into admin_audit_log(action_type,restaurant_id,result,details)
  values('upsert_branch', v_id, 'success', jsonb_build_object('branch_id', v_row.id, 'branch_name', v_name));

  return to_jsonb(v_row);
end;
$$;

-- Grants (same pattern as the rest of the admin RPCs)
revoke all on function admin_archive_restaurant(text,text) from public;
grant execute on function admin_archive_restaurant(text,text) to authenticated;
revoke all on function admin_restore_restaurant(text,text) from public;
grant execute on function admin_restore_restaurant(text,text) to authenticated;
revoke all on function admin_permanent_delete_restaurant(text,text,text) from public;
grant execute on function admin_permanent_delete_restaurant(text,text,text) to authenticated;
revoke all on function admin_list_branches(text,text) from public;
grant execute on function admin_list_branches(text,text) to authenticated;
revoke all on function admin_upsert_branch(text,text,uuid,text,text,text,text,boolean,boolean) from public;
grant execute on function admin_upsert_branch(text,text,uuid,text,text,text,text,boolean,boolean) to authenticated;

notify pgrst, 'reload schema';

commit;

-- ============================================================
-- VERIFY (read-only, optional):
--   select column_name from information_schema.columns
--    where table_name='restaurant_plans' and column_name in ('contact_name','contact_phone','contact_email','address','city','archived_at');
--   -> 6 rows.
--
-- ROLLBACK (only if you must undo the new RPCs; columns are kept):
--   drop function if exists admin_archive_restaurant(text,text);
--   drop function if exists admin_restore_restaurant(text,text);
--   drop function if exists admin_permanent_delete_restaurant(text,text,text);
--   drop function if exists admin_list_branches(text,text);
--   drop function if exists admin_upsert_branch(text,text,uuid,text,text,text,text,boolean,boolean);
--   notify pgrst, 'reload schema';
-- ============================================================
