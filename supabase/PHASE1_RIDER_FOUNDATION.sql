-- ============================================================
-- PHASE 1 — RIDER APP FOUNDATION (safe additive migration)
-- ============================================================
-- Goals:
--   • Restaurant-scoped permanent riders (not session-only)
--   • Invitation tokens for future registration
--   • Duty / delivery state machine (server-side)
--   • Fair dispatch engine (waiting-time + workload)
--   • Assignment history, ratings foundation
--   • Customer-safe public rider info
--   • Existing QR rider portal + shift-close UNCHANGED
--
-- SAFE: no DROP of existing production tables/data.
-- Run once in Supabase SQL Editor after previous migrations.
-- Requires: pgcrypto (already in schema.sql)
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) RIDERS (permanent, per restaurant_id)
-- ------------------------------------------------------------
create table if not exists riders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  full_name text not null,
  phone text not null,
  email text,
  whatsapp text,
  photo_url text,
  pin_hash text not null,
  -- duty / delivery state machine
  duty_status text not null default 'OFF_DUTY'
    check (duty_status in (
      'OFF_DUTY',
      'AVAILABLE',
      'ASSIGNED',
      'ACCEPTED',
      'PICKING_UP',
      'OUT_FOR_DELIVERY'
    )),
  is_active boolean not null default true,
  primary_area text,
  -- fair-dispatch metrics
  last_assigned_at timestamptz,
  last_accepted_at timestamptz,
  last_delivered_at timestamptz,
  last_available_at timestamptz,
  last_seen_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  deliveries_completed_count int not null default 0,
  -- ratings aggregate
  rating_sum int not null default 0,
  rating_count int not null default 0,
  -- optional link to auth user after registration
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_riders_restaurant_active
  on riders (restaurant_id) where is_active = true;
create unique index if not exists idx_riders_phone_per_restaurant
  on riders (restaurant_id, phone) where is_active = true;
create index if not exists idx_riders_duty
  on riders (restaurant_id, duty_status) where is_active = true;
create index if not exists idx_riders_auth_user
  on riders (auth_user_id) where auth_user_id is not null;

alter table riders enable row level security;

-- No direct client CRUD. All access via SECURITY DEFINER RPCs.
drop policy if exists riders_deny_all on riders;
create policy riders_deny_all on riders
  for all to authenticated
  using (false)
  with check (false);

-- ------------------------------------------------------------
-- 2) RIDER INVITATIONS
-- ------------------------------------------------------------
create table if not exists rider_invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  invite_token text not null default encode(gen_random_bytes(24), 'hex'),
  created_by_session_id uuid references sessions(id) on delete set null,
  note text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  used_by_rider_id uuid references riders(id) on delete set null,
  is_revoked boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_rider_invitations_token
  on rider_invitations (invite_token);
create index if not exists idx_rider_invitations_restaurant
  on rider_invitations (restaurant_id, created_at desc);

alter table rider_invitations enable row level security;
drop policy if exists rider_invitations_deny_all on rider_invitations;
create policy rider_invitations_deny_all on rider_invitations
  for all to authenticated
  using (false)
  with check (false);

-- ------------------------------------------------------------
-- 3) RIDER AREA ASSIGNMENTS (many areas per rider)
-- ------------------------------------------------------------
create table if not exists rider_area_assignments (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references riders(id) on delete cascade,
  restaurant_id text not null,
  area_name text not null,
  created_at timestamptz not null default now(),
  unique (rider_id, area_name)
);

create index if not exists idx_rider_areas_restaurant
  on rider_area_assignments (restaurant_id, area_name);

alter table rider_area_assignments enable row level security;
drop policy if exists rider_areas_deny_all on rider_area_assignments;
create policy rider_areas_deny_all on rider_area_assignments
  for all to authenticated
  using (false)
  with check (false);

-- ------------------------------------------------------------
-- 4) ASSIGNMENT HISTORY (audit + fair dispatch input)
-- ------------------------------------------------------------
create table if not exists rider_assignment_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  restaurant_id text not null,
  session_id uuid references sessions(id) on delete set null,
  area_name text,
  status text not null default 'ASSIGNED'
    check (status in (
      'ASSIGNED',
      'ACCEPTED',
      'DECLINED',
      'TIMEOUT',
      'REASSIGNED',
      'PICKING_UP',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED'
    )),
  assigned_at timestamptz not null default now(),
  offer_expires_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  reassign_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rider_assign_hist_order
  on rider_assignment_history (order_id, assigned_at desc);
create index if not exists idx_rider_assign_hist_rider
  on rider_assignment_history (rider_id, assigned_at desc);
create index if not exists idx_rider_assign_hist_restaurant
  on rider_assignment_history (restaurant_id, assigned_at desc);

alter table rider_assignment_history enable row level security;
drop policy if exists rider_assign_hist_deny_all on rider_assignment_history;
create policy rider_assign_hist_deny_all on rider_assignment_history
  for all to authenticated
  using (false)
  with check (false);

-- ------------------------------------------------------------
-- 5) RIDER RATINGS (1–5, one per order)
-- ------------------------------------------------------------
create table if not exists rider_ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  restaurant_id text not null,
  customer_user_id uuid references auth.users(id) on delete set null,
  stars int not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists idx_rider_ratings_rider
  on rider_ratings (rider_id, created_at desc);

alter table rider_ratings enable row level security;
drop policy if exists rider_ratings_deny_all on rider_ratings;
create policy rider_ratings_deny_all on rider_ratings
  for all to authenticated
  using (false)
  with check (false);

-- ------------------------------------------------------------
-- 6) ORDERS — assignment + customer location columns
-- ------------------------------------------------------------
alter table orders add column if not exists assigned_rider_id uuid;
alter table orders add column if not exists assigned_at timestamptz;
alter table orders add column if not exists assignment_status text;
alter table orders add column if not exists offer_expires_at timestamptz;
alter table orders add column if not exists customer_lat double precision;
alter table orders add column if not exists customer_lng double precision;
alter table orders add column if not exists assigned_rider_user_id uuid; -- legacy QR portal compat

-- Soft FK (avoid hard fail if riders table created later on old DBs)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_assigned_rider_id_fkey'
  ) then
    begin
      alter table orders
        add constraint orders_assigned_rider_id_fkey
        foreign key (assigned_rider_id) references riders(id) on delete set null;
    exception when others then
      null;
    end;
  end if;
end $$;

create index if not exists idx_orders_assigned_rider
  on orders (assigned_rider_id)
  where assigned_rider_id is not null;

-- ------------------------------------------------------------
-- 7) Helpers
-- ------------------------------------------------------------
create or replace function rider_avg_rating(p_rating_sum int, p_rating_count int)
returns numeric
language sql immutable
as $$
  select case when coalesce(p_rating_count, 0) <= 0 then null
              else round(p_rating_sum::numeric / p_rating_count::numeric, 2)
         end;
$$;

create or replace function assert_staff_for_session(p_session_id uuid, p_tab_secret text default null)
returns sessions
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_session sessions%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from sessions where id = p_session_id and is_active = true;
  if not found then raise exception 'Session closed'; end if;
  if not exists (
    select 1 from staff_access
    where session_id = p_session_id
      and user_id = v_uid
      and (
        p_tab_secret is null
        or trim(p_tab_secret) = ''
        or tab_secret = trim(p_tab_secret)
      )
  ) then
    raise exception 'Unauthorized';
  end if;
  return v_session;
end;
$$;

-- ------------------------------------------------------------
-- 8) FAIR DISPATCH ENGINE
-- Among eligible ON-DUTY / AVAILABLE riders:
--   1) prefer area match when any area-assigned riders exist
--   2) exclude OFF_DUTY, inactive, and busy delivery states
--   3) prefer longest wait (oldest last_assigned_at / last_delivered_at)
--   4) prefer fewer recent assignments (24h)
-- Does NOT always pick "rider #1".
-- ------------------------------------------------------------
create or replace function pick_fair_rider(
  p_restaurant_id text,
  p_area_name text default null,
  p_allow_fallback_any_area boolean default true
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_area text := nullif(trim(coalesce(p_area_name, '')), '');
  v_has_area_riders boolean := false;
begin
  -- Active delivery states that block a new assignment
  -- (single active delivery policy by default)

  if v_area is not null then
    select exists (
      select 1
      from riders r
      join rider_area_assignments ra on ra.rider_id = r.id
      where r.restaurant_id = trim(p_restaurant_id)
        and r.is_active = true
        and r.duty_status = 'AVAILABLE'
        and ra.area_name = v_area
    ) into v_has_area_riders;
  end if;

  select r.id into v_id
  from riders r
  where r.restaurant_id = trim(p_restaurant_id)
    and r.is_active = true
    and r.duty_status = 'AVAILABLE'
    and (
      v_area is null
      or not v_has_area_riders
      or exists (
        select 1 from rider_area_assignments ra
        where ra.rider_id = r.id and ra.area_name = v_area
      )
      or (
        p_allow_fallback_any_area
        and not v_has_area_riders
      )
    )
  order by
    -- longest since last assignment / delivery first
    coalesce(r.last_assigned_at, r.last_delivered_at, r.created_at) asc,
    -- fewer completed deliveries preferred when timestamps tie
    r.deliveries_completed_count asc,
    r.created_at asc
  limit 1;

  -- If area-filtered had no match but fallback allowed and area riders
  -- existed but were busy — try any available rider in restaurant
  if v_id is null and p_allow_fallback_any_area and v_area is not null then
    select r.id into v_id
    from riders r
    where r.restaurant_id = trim(p_restaurant_id)
      and r.is_active = true
      and r.duty_status = 'AVAILABLE'
    order by
      coalesce(r.last_assigned_at, r.last_delivered_at, r.created_at) asc,
      r.deliveries_completed_count asc,
      r.created_at asc
    limit 1;
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 9) Assign order to a rider (server-side; used by future auto-dispatch)
-- ------------------------------------------------------------
create or replace function assign_order_to_rider(
  p_order_id uuid,
  p_rider_id uuid,
  p_offer_timeout_seconds int default 15
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_rider riders%rowtype;
  v_expires timestamptz;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.fulfillment is distinct from 'delivery' then
    raise exception 'Not a delivery order';
  end if;
  if v_order.status not in ('pending', 'cooking') then
    raise exception 'Order not open for assignment';
  end if;
  if v_order.assigned_rider_id is not null
     and v_order.assignment_status in ('ASSIGNED', 'ACCEPTED', 'PICKING_UP', 'OUT_FOR_DELIVERY') then
    raise exception 'Order already assigned';
  end if;

  select * into v_rider from riders where id = p_rider_id for update;
  if not found or not v_rider.is_active then raise exception 'Rider not found'; end if;
  if v_rider.duty_status <> 'AVAILABLE' then
    raise exception 'Rider not available';
  end if;

  -- restaurant match via session
  if not exists (
    select 1 from sessions s
    where s.id = v_order.session_id
      and s.restaurant_id = v_rider.restaurant_id
  ) then
    raise exception 'Restaurant mismatch';
  end if;

  v_expires := now() + make_interval(secs => greatest(5, least(coalesce(p_offer_timeout_seconds, 15), 120)));

  update orders set
    assigned_rider_id = p_rider_id,
    assigned_at = now(),
    assignment_status = 'ASSIGNED',
    offer_expires_at = v_expires,
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  update riders set
    duty_status = 'ASSIGNED',
    last_assigned_at = now(),
    updated_at = now()
  where id = p_rider_id;

  insert into rider_assignment_history (
    order_id, rider_id, restaurant_id, session_id, area_name,
    status, assigned_at, offer_expires_at
  ) values (
    p_order_id, p_rider_id, v_rider.restaurant_id, v_order.session_id, v_order.area_name,
    'ASSIGNED', now(), v_expires
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'rider_id', p_rider_id,
    'offer_expires_at', v_expires
  );
end;
$$;

-- Fair auto-dispatch entry point (Phase 2 will call this from order placement)
create or replace function dispatch_delivery_order(
  p_order_id uuid,
  p_offer_timeout_seconds int default 15
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_restaurant_id text;
  v_rider_id uuid;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.fulfillment is distinct from 'delivery' then
    return jsonb_build_object('ok', false, 'reason', 'not_delivery');
  end if;

  select restaurant_id into v_restaurant_id
  from sessions where id = v_order.session_id;
  if v_restaurant_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  v_rider_id := pick_fair_rider(v_restaurant_id, v_order.area_name, true);
  if v_rider_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_available_rider');
  end if;

  return assign_order_to_rider(p_order_id, v_rider_id, p_offer_timeout_seconds);
end;
$$;

-- ------------------------------------------------------------
-- 10) Staff: invitations + rider list/manage (foundation UI)
-- ------------------------------------------------------------
create or replace function staff_create_rider_invite(
  p_session_id uuid,
  p_tab_secret text,
  p_note text default null,
  p_expires_hours int default 168
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_session sessions%rowtype;
  v_inv rider_invitations%rowtype;
begin
  v_session := assert_staff_for_session(p_session_id, p_tab_secret);
  insert into rider_invitations (restaurant_id, created_by_session_id, note, expires_at)
  values (
    v_session.restaurant_id,
    v_session.id,
    nullif(trim(coalesce(p_note, '')), ''),
    now() + make_interval(hours => greatest(1, least(coalesce(p_expires_hours, 168), 720)))
  )
  returning * into v_inv;

  return jsonb_build_object(
    'id', v_inv.id,
    'invite_token', v_inv.invite_token,
    'restaurant_id', v_inv.restaurant_id,
    'expires_at', v_inv.expires_at,
    'note', v_inv.note
  );
end;
$$;

create or replace function staff_list_rider_invites(
  p_session_id uuid,
  p_tab_secret text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_session sessions%rowtype;
  v_rows jsonb;
begin
  v_session := assert_staff_for_session(p_session_id, p_tab_secret);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'invite_token', i.invite_token,
    'note', i.note,
    'expires_at', i.expires_at,
    'used_at', i.used_at,
    'is_revoked', i.is_revoked,
    'created_at', i.created_at
  ) order by i.created_at desc), '[]'::jsonb)
  into v_rows
  from rider_invitations i
  where i.restaurant_id = v_session.restaurant_id
    and i.created_at > now() - interval '30 days';
  return v_rows;
end;
$$;

create or replace function staff_revoke_rider_invite(
  p_session_id uuid,
  p_tab_secret text,
  p_invite_id uuid
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_session sessions%rowtype;
begin
  v_session := assert_staff_for_session(p_session_id, p_tab_secret);
  update rider_invitations
  set is_revoked = true
  where id = p_invite_id
    and restaurant_id = v_session.restaurant_id
    and used_at is null;
  return found;
end;
$$;

create or replace function staff_list_riders(
  p_session_id uuid,
  p_tab_secret text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_session sessions%rowtype;
  v_rows jsonb;
begin
  v_session := assert_staff_for_session(p_session_id, p_tab_secret);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'full_name', r.full_name,
    'phone', r.phone,
    'email', r.email,
    'whatsapp', r.whatsapp,
    'photo_url', r.photo_url,
    'duty_status', r.duty_status,
    'is_active', r.is_active,
    'primary_area', r.primary_area,
    'last_assigned_at', r.last_assigned_at,
    'last_delivered_at', r.last_delivered_at,
    'last_available_at', r.last_available_at,
    'deliveries_completed_count', r.deliveries_completed_count,
    'avg_rating', rider_avg_rating(r.rating_sum, r.rating_count),
    'rating_count', r.rating_count,
    'created_at', r.created_at
  ) order by r.created_at), '[]'::jsonb)
  into v_rows
  from riders r
  where r.restaurant_id = v_session.restaurant_id
    and r.is_active = true;
  return v_rows;
end;
$$;

-- Staff can set duty status (e.g. force OFF_DUTY) or deactivate
create or replace function staff_set_rider_duty(
  p_session_id uuid,
  p_tab_secret text,
  p_rider_id uuid,
  p_duty_status text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_session sessions%rowtype;
begin
  v_session := assert_staff_for_session(p_session_id, p_tab_secret);
  if p_duty_status not in ('OFF_DUTY', 'AVAILABLE') then
    raise exception 'Staff may only set OFF_DUTY or AVAILABLE';
  end if;
  update riders set
    duty_status = p_duty_status,
    last_available_at = case when p_duty_status = 'AVAILABLE' then now() else last_available_at end,
    updated_at = now()
  where id = p_rider_id
    and restaurant_id = v_session.restaurant_id
    and is_active = true
    and duty_status in ('OFF_DUTY', 'AVAILABLE', 'ASSIGNED'); -- don't interrupt active delivery mid-flight unless OFF
  return found;
end;
$$;

create or replace function staff_deactivate_rider(
  p_session_id uuid,
  p_tab_secret text,
  p_rider_id uuid
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_session sessions%rowtype;
begin
  v_session := assert_staff_for_session(p_session_id, p_tab_secret);
  update riders set
    is_active = false,
    duty_status = 'OFF_DUTY',
    updated_at = now()
  where id = p_rider_id
    and restaurant_id = v_session.restaurant_id;
  return found;
end;
$$;

-- Staff bootstrap create rider (admin-assisted; registration UI is Phase 2)
create or replace function staff_create_rider(
  p_session_id uuid,
  p_tab_secret text,
  p_full_name text,
  p_phone text,
  p_pin text,
  p_photo_url text default null,
  p_email text default null,
  p_whatsapp text default null,
  p_primary_area text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_session sessions%rowtype;
  v_row riders%rowtype;
  v_pin text := trim(coalesce(p_pin, ''));
begin
  v_session := assert_staff_for_session(p_session_id, p_tab_secret);
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Name required'; end if;
  if coalesce(trim(p_phone), '') = '' then raise exception 'Phone required'; end if;
  if length(v_pin) < 4 then raise exception 'PIN must be at least 4 digits'; end if;

  insert into riders (
    restaurant_id, full_name, phone, email, whatsapp, photo_url,
    pin_hash, duty_status, primary_area, last_available_at
  ) values (
    v_session.restaurant_id,
    trim(p_full_name),
    trim(p_phone),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    nullif(trim(coalesce(p_photo_url, '')), ''),
    crypt(v_pin, gen_salt('bf', 8)),
    'OFF_DUTY',
    nullif(trim(coalesce(p_primary_area, '')), ''),
    null
  )
  returning * into v_row;

  if v_row.primary_area is not null then
    insert into rider_area_assignments (rider_id, restaurant_id, area_name)
    values (v_row.id, v_session.restaurant_id, v_row.primary_area)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'full_name', v_row.full_name,
    'phone', v_row.phone,
    'duty_status', v_row.duty_status,
    'photo_url', v_row.photo_url
  );
end;
$$;

-- ------------------------------------------------------------
-- 11) Future registration via invite (API ready; UI Phase 2)
-- ------------------------------------------------------------
create or replace function rider_register_with_invite(
  p_invite_token text,
  p_full_name text,
  p_phone text,
  p_pin text,
  p_photo_url text default null,
  p_email text default null,
  p_whatsapp text default null,
  p_primary_area text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_inv rider_invitations%rowtype;
  v_row riders%rowtype;
  v_pin text := trim(coalesce(p_pin, ''));
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_inv from rider_invitations
  where invite_token = trim(p_invite_token)
  for update;
  if not found then raise exception 'Invalid invite'; end if;
  if v_inv.is_revoked then raise exception 'Invite revoked'; end if;
  if v_inv.used_at is not null then raise exception 'Invite already used'; end if;
  if v_inv.expires_at < now() then raise exception 'Invite expired'; end if;

  if coalesce(trim(p_full_name), '') = '' then raise exception 'Name required'; end if;
  if coalesce(trim(p_phone), '') = '' then raise exception 'Phone required'; end if;
  if length(v_pin) < 4 then raise exception 'PIN must be at least 4 digits'; end if;

  insert into riders (
    restaurant_id, full_name, phone, email, whatsapp, photo_url,
    pin_hash, duty_status, primary_area, auth_user_id
  ) values (
    v_inv.restaurant_id,
    trim(p_full_name),
    trim(p_phone),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_whatsapp, '')), ''),
    nullif(trim(coalesce(p_photo_url, '')), ''),
    crypt(v_pin, gen_salt('bf', 8)),
    'OFF_DUTY',
    nullif(trim(coalesce(p_primary_area, '')), ''),
    v_uid
  )
  returning * into v_row;

  if v_row.primary_area is not null then
    insert into rider_area_assignments (rider_id, restaurant_id, area_name)
    values (v_row.id, v_inv.restaurant_id, v_row.primary_area)
    on conflict do nothing;
  end if;

  update rider_invitations set
    used_at = now(),
    used_by_rider_id = v_row.id
  where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'rider_id', v_row.id,
    'restaurant_id', v_row.restaurant_id,
    'full_name', v_row.full_name
  );
end;
$$;

-- ------------------------------------------------------------
-- 12) Rider duty toggle + complete delivery (state machine)
-- ------------------------------------------------------------
create or replace function rider_set_duty_status(
  p_rider_id uuid,
  p_duty_status text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_duty_status not in ('OFF_DUTY', 'AVAILABLE') then
    raise exception 'Invalid duty status';
  end if;
  update riders set
    duty_status = p_duty_status,
    last_available_at = case when p_duty_status = 'AVAILABLE' then now() else last_available_at end,
    last_seen_at = now(),
    updated_at = now()
  where id = p_rider_id
    and is_active = true
    and duty_status in ('OFF_DUTY', 'AVAILABLE');
  return found;
end;
$$;

create or replace function rider_mark_delivered(
  p_order_id uuid,
  p_rider_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.assigned_rider_id is distinct from p_rider_id then
    raise exception 'Not your order';
  end if;

  update orders set
    status = 'served',
    assignment_status = 'DELIVERED',
    updated_at = now()
  where id = p_order_id;

  update riders set
    duty_status = 'AVAILABLE',
    last_delivered_at = now(),
    last_available_at = now(),
    deliveries_completed_count = deliveries_completed_count + 1,
    updated_at = now()
  where id = p_rider_id;

  update rider_assignment_history set
    status = 'DELIVERED',
    completed_at = now()
  where order_id = p_order_id
    and rider_id = p_rider_id
    and status not in ('DELIVERED', 'CANCELLED', 'REASSIGNED');

  return jsonb_build_object('ok', true);
end;
$$;

-- ------------------------------------------------------------
-- 13) Customer-safe rider public info + rating
-- ------------------------------------------------------------
create or replace function customer_order_rider_public(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_rider riders%rowtype;
begin
  select * into v_order from orders where id = p_order_id;
  if not found or v_order.assigned_rider_id is null then return null; end if;
  select * into v_rider from riders where id = v_order.assigned_rider_id and is_active = true;
  if not found then return null; end if;

  return jsonb_build_object(
    'name', v_rider.full_name,
    'phone', v_rider.phone,
    'photo_url', v_rider.photo_url,
    'whatsapp', v_rider.whatsapp,
    'avg_rating', rider_avg_rating(v_rider.rating_sum, v_rider.rating_count),
    'rating_count', v_rider.rating_count,
    'lat', coalesce(v_order.rider_lat, v_rider.last_lat),
    'lng', coalesce(v_order.rider_lng, v_rider.last_lng)
  );
end;
$$;

create or replace function customer_rate_rider(
  p_order_id uuid,
  p_stars int
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_uid uuid := auth.uid();
  v_stars int := greatest(1, least(5, coalesce(p_stars, 0)));
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_stars < 1 then raise exception 'Invalid rating'; end if;

  select * into v_order from orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  if v_order.customer_user_id is distinct from v_uid then
    raise exception 'Not your order';
  end if;
  if v_order.assigned_rider_id is null then
    raise exception 'No rider assigned';
  end if;
  if v_order.status is distinct from 'served' then
    raise exception 'Rate after delivery';
  end if;

  insert into rider_ratings (order_id, rider_id, restaurant_id, customer_user_id, stars)
  values (
    p_order_id,
    v_order.assigned_rider_id,
    (select restaurant_id from sessions where id = v_order.session_id),
    v_uid,
    v_stars
  )
  on conflict (order_id) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'already_rated');
  end if;

  update riders set
    rating_sum = rating_sum + v_stars,
    rating_count = rating_count + 1,
    updated_at = now()
  where id = v_order.assigned_rider_id;

  -- keep legacy order.rating in sync
  update orders set rating = v_stars, updated_at = now() where id = p_order_id;

  return jsonb_build_object('ok', true, 'stars', v_stars);
end;
$$;

-- ------------------------------------------------------------
-- 14) Existing QR Rider Portal compatibility RPCs
-- (frontend already calls these; they were missing from schema)
-- ------------------------------------------------------------
create or replace function rider_set_availability(
  p_session_id uuid,
  p_area_name text,
  p_available boolean
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  -- QR portal availability is session-scoped UI state; keep as no-op success
  -- for backward compatibility. New riders use rider_set_duty_status.
  if not is_rider_for_session(p_session_id, p_area_name) then
    return false;
  end if;
  return true;
end;
$$;

create or replace function rider_claim_order(
  p_order_id uuid,
  p_session_id uuid,
  p_area_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not is_rider_for_session(p_session_id, p_area_name) then
    raise exception 'Not authorized as rider';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.session_id is distinct from p_session_id then
    raise exception 'Wrong session';
  end if;
  if v_order.fulfillment is distinct from 'delivery' then
    raise exception 'Not delivery';
  end if;
  if v_order.assigned_rider_user_id is not null
     and v_order.assigned_rider_user_id is distinct from v_uid then
    raise exception 'Already claimed';
  end if;

  update orders set
    assigned_rider_user_id = v_uid,
    assigned_at = coalesce(assigned_at, now()),
    assignment_status = coalesce(assignment_status, 'ACCEPTED'),
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return jsonb_build_object('ok', true, 'order_id', v_order.id);
end;
$$;

-- ------------------------------------------------------------
-- 15) Preserve / re-assert staff_close_shift (do not break shift)
-- ------------------------------------------------------------
create or replace function staff_close_shift(
  p_session_id uuid,
  p_tab_secret text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_access staff_access%rowtype;
  v_session sessions%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select * into v_access
  from staff_access
  where session_id = p_session_id
    and user_id = v_uid
    and tab_secret = p_tab_secret;

  if not found then
    select * into v_access
    from staff_access
    where session_id = p_session_id
      and user_id = v_uid;
  end if;

  if not found then
    raise exception 'NOT_STAFF_FOR_SESSION';
  end if;

  select * into v_session from sessions where id = p_session_id for update;
  if not found then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  update sessions
  set is_active = false,
      closed_at = now(),
      last_seen_at = now()
  where id = p_session_id;

  delete from staff_access where session_id = p_session_id;

  return jsonb_build_object('ok', true, 'session_id', p_session_id);
end;
$$;

-- ------------------------------------------------------------
-- 16) Grants
-- ------------------------------------------------------------
revoke all on function pick_fair_rider(text, text, boolean) from public;
revoke all on function assign_order_to_rider(uuid, uuid, int) from public;
revoke all on function dispatch_delivery_order(uuid, int) from public;
revoke all on function staff_create_rider_invite(uuid, text, text, int) from public;
revoke all on function staff_list_rider_invites(uuid, text) from public;
revoke all on function staff_revoke_rider_invite(uuid, text, uuid) from public;
revoke all on function staff_list_riders(uuid, text) from public;
revoke all on function staff_set_rider_duty(uuid, text, uuid, text) from public;
revoke all on function staff_deactivate_rider(uuid, text, uuid) from public;
revoke all on function staff_create_rider(uuid, text, text, text, text, text, text, text, text) from public;
revoke all on function rider_register_with_invite(text, text, text, text, text, text, text, text) from public;
revoke all on function rider_set_duty_status(uuid, text) from public;
revoke all on function rider_mark_delivered(uuid, uuid) from public;
revoke all on function customer_order_rider_public(uuid) from public;
revoke all on function customer_rate_rider(uuid, int) from public;
revoke all on function rider_set_availability(uuid, text, boolean) from public;
revoke all on function rider_claim_order(uuid, uuid, text) from public;
revoke all on function staff_close_shift(uuid, text) from public;
revoke all on function assert_staff_for_session(uuid, text) from public;

grant execute on function staff_create_rider_invite(uuid, text, text, int) to authenticated;
grant execute on function staff_list_rider_invites(uuid, text) to authenticated;
grant execute on function staff_revoke_rider_invite(uuid, text, uuid) to authenticated;
grant execute on function staff_list_riders(uuid, text) to authenticated;
grant execute on function staff_set_rider_duty(uuid, text, uuid, text) to authenticated;
grant execute on function staff_deactivate_rider(uuid, text, uuid) to authenticated;
grant execute on function staff_create_rider(uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function rider_register_with_invite(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function rider_set_duty_status(uuid, text) to authenticated;
grant execute on function rider_mark_delivered(uuid, uuid) to authenticated;
grant execute on function customer_order_rider_public(uuid) to authenticated;
grant execute on function customer_rate_rider(uuid, int) to authenticated;
grant execute on function rider_set_availability(uuid, text, boolean) to authenticated;
grant execute on function rider_claim_order(uuid, uuid, text) to authenticated;
grant execute on function staff_close_shift(uuid, text) to authenticated;
-- dispatch engine callable by authenticated (staff/future triggers); still restaurant-scoped inside
grant execute on function dispatch_delivery_order(uuid, int) to authenticated;
grant execute on function pick_fair_rider(text, text, boolean) to authenticated;
grant execute on function assign_order_to_rider(uuid, uuid, int) to authenticated;
