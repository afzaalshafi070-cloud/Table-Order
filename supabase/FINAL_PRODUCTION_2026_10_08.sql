-- ============================================================
-- TABLE ORDER FINAL PRODUCTION PATCH - 2026-10-08
-- ============================================================
-- Run this ONE file after the existing Table Order schema/migrations.
-- It is intentionally corrective/additive. It does not delete orders,
-- menu items, payment history, restaurants or closed shifts.
--
-- Main fixes in this file:
--   1) Rider QR flow removed from the application and replaced by
--      permanent rider portal links + PIN-only login.
--   2) Rider portal login survives refresh in the same browser tab.
--   3) Rider links never expire; Counter can delete/revoke/regenerate them.
--   4) Rider profile: WhatsApp, photo, bike number, area, email and name.
--   5) Fair auto-dispatch with row locking so one rider is not repeatedly
--      selected when other eligible riders are available.
--   6) Delivery orders auto-dispatch when placed and when a rider goes ON DUTY.
--   7) 15-second rider alarm is driven by the portal frontend.
--   8) Customer dashboard can see assigned rider public details.
--   9) Branch requests/admin approval + brand delivery area routing.
--  10) Payment verification remains Admin-controlled. Pending requests do not
--      create revenue or renew a subscription.
--  11) Clean overloaded rider_set_duty_status functions that caused the
--      screenshot error.
--  12) staff_close_shift is reasserted through SECURITY DEFINER so the old
--      post-close-login failure does not return.
--
-- Browser limitation:
-- A normal mobile browser cannot guarantee sound/vibration while the OS has
-- fully suspended/killed the page. The portal therefore uses Audio API,
-- Notification API, polling and vibration when the browser is allowed to run.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- A. RIDER DATA MODEL
-- ------------------------------------------------------------
create table if not exists riders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  full_name text not null,
  phone text not null,
  email text,
  whatsapp text,
  photo_url text,
  bike_number text,
  pin_hash text not null,
  duty_status text not null default 'OFF_DUTY'
    check (duty_status in ('OFF_DUTY','AVAILABLE','ASSIGNED','ACCEPTED','PICKING_UP','OUT_FOR_DELIVERY')),
  is_active boolean not null default true,
  primary_area text,
  last_assigned_at timestamptz,
  last_accepted_at timestamptz,
  last_delivered_at timestamptz,
  last_available_at timestamptz,
  last_seen_at timestamptz,
  last_lat double precision,
  last_lng double precision,
  deliveries_completed_count int not null default 0,
  rating_sum int not null default 0,
  rating_count int not null default 0,
  auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table riders add column if not exists email text;
alter table riders add column if not exists whatsapp text;
alter table riders add column if not exists photo_url text;
alter table riders add column if not exists bike_number text;
alter table riders add column if not exists primary_area text;
alter table riders add column if not exists last_assigned_at timestamptz;
alter table riders add column if not exists last_accepted_at timestamptz;
alter table riders add column if not exists last_delivered_at timestamptz;
alter table riders add column if not exists last_available_at timestamptz;
alter table riders add column if not exists last_seen_at timestamptz;
alter table riders add column if not exists last_lat double precision;
alter table riders add column if not exists last_lng double precision;
alter table riders add column if not exists deliveries_completed_count int not null default 0;
alter table riders add column if not exists rating_sum int not null default 0;
alter table riders add column if not exists rating_count int not null default 0;

create unique index if not exists idx_riders_phone_active on riders(restaurant_id, phone) where is_active=true;
create index if not exists idx_riders_restaurant_duty on riders(restaurant_id, duty_status) where is_active=true;

alter table riders enable row level security;
drop policy if exists riders_deny_all on riders;
create policy riders_deny_all on riders for all to authenticated using(false) with check(false);

create table if not exists rider_area_assignments (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references riders(id) on delete cascade,
  restaurant_id text not null,
  area_name text not null,
  created_at timestamptz not null default now(),
  unique(rider_id, area_name)
);
alter table rider_area_assignments enable row level security;
drop policy if exists rider_area_assignments_deny_all on rider_area_assignments;
create policy rider_area_assignments_deny_all on rider_area_assignments for all to authenticated using(false) with check(false);

create table if not exists rider_assignment_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  restaurant_id text not null,
  session_id uuid references sessions(id) on delete set null,
  area_name text,
  status text not null default 'ASSIGNED',
  assigned_at timestamptz not null default now(),
  offer_expires_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  reassign_reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_rider_assignment_history_rider on rider_assignment_history(rider_id, assigned_at desc);
create index if not exists idx_rider_assignment_history_order on rider_assignment_history(order_id, assigned_at desc);
alter table rider_assignment_history enable row level security;
drop policy if exists rider_assignment_history_deny_all on rider_assignment_history;
create policy rider_assignment_history_deny_all on rider_assignment_history for all to authenticated using(false) with check(false);

create table if not exists rider_ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  restaurant_id text not null,
  customer_user_id uuid references auth.users(id) on delete set null,
  stars int not null check(stars between 1 and 5),
  created_at timestamptz not null default now(),
  unique(order_id)
);
alter table rider_ratings enable row level security;
drop policy if exists rider_ratings_deny_all on rider_ratings;
create policy rider_ratings_deny_all on rider_ratings for all to authenticated using(false) with check(false);

-- Permanent portal link. There is deliberately NO expiry column.
create table if not exists rider_portal_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  rider_id uuid not null references riders(id) on delete cascade,
  link_token text not null unique default encode(gen_random_bytes(32),'hex'),
  is_revoked boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists idx_one_active_rider_link on rider_portal_links(rider_id) where is_revoked=false;
create index if not exists idx_rider_portal_links_restaurant on rider_portal_links(restaurant_id, created_at desc);
alter table rider_portal_links enable row level security;
drop policy if exists rider_portal_links_deny_all on rider_portal_links;
create policy rider_portal_links_deny_all on rider_portal_links for all to authenticated using(false) with check(false);

create table if not exists rider_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references riders(id) on delete cascade,
  restaurant_id text not null,
  auth_user_id uuid references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists idx_rider_portal_sessions_rider on rider_portal_sessions(rider_id, last_seen_at desc);
alter table rider_portal_sessions enable row level security;
drop policy if exists rider_portal_sessions_deny_all on rider_portal_sessions;
create policy rider_portal_sessions_deny_all on rider_portal_sessions for all to authenticated using(false) with check(false);

-- ------------------------------------------------------------
-- B. ORDERS: rider assignment columns
-- ------------------------------------------------------------
alter table orders add column if not exists assigned_rider_id uuid;
alter table orders add column if not exists assigned_at timestamptz;
alter table orders add column if not exists assignment_status text;
alter table orders add column if not exists offer_expires_at timestamptz;
create index if not exists idx_orders_assigned_rider on orders(assigned_rider_id) where assigned_rider_id is not null;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='orders_assigned_rider_id_fkey') then
    begin
      alter table orders add constraint orders_assigned_rider_id_fkey foreign key(assigned_rider_id) references riders(id) on delete set null;
    exception when others then null;
    end;
  end if;
end $$;

-- ------------------------------------------------------------
-- C. BRANCHES + REQUESTS
-- ------------------------------------------------------------
create table if not exists restaurant_branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  branch_name text not null,
  area text,
  address text,
  phone text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(restaurant_id, branch_name)
);
create index if not exists idx_restaurant_branches_restaurant on restaurant_branches(restaurant_id, is_active);

create table if not exists branch_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  requested_by_session_id uuid references sessions(id) on delete set null,
  branch_name text not null,
  area text,
  address text,
  phone text,
  notes text,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  admin_note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_branch_id uuid references restaurant_branches(id) on delete set null
);
create index if not exists idx_branch_requests_status on branch_requests(status, requested_at desc);

-- Every existing restaurant gets a Main branch, and existing sessions are attached to it.
do $$
declare r record; b uuid;
begin
  for r in select distinct restaurant_id, max(restaurant_name) restaurant_name from sessions group by restaurant_id loop
    insert into restaurant_branches(restaurant_id,branch_name,is_default,is_active)
    values(r.restaurant_id,'Main Branch',true,true)
    on conflict(restaurant_id,branch_name) do update set is_default=true
    returning id into b;
    if b is null then select id into b from restaurant_branches where restaurant_id=r.restaurant_id and branch_name='Main Branch' limit 1; end if;
    alter table sessions add column if not exists branch_id uuid;
    update sessions set branch_id=b where restaurant_id=r.restaurant_id and branch_id is null;
  end loop;
end $$;

alter table sessions add column if not exists branch_id uuid;
do $$
begin
  if not exists(select 1 from pg_constraint where conname='sessions_branch_id_fkey') then
    begin alter table sessions add constraint sessions_branch_id_fkey foreign key(branch_id) references restaurant_branches(id) on delete set null; exception when others then null; end;
  end if;
end $$;

-- Replace the old one-active-session-per-restaurant rule with one-active-session-per-branch.
drop index if exists sessions_one_active_restaurant_idx;
create unique index if not exists sessions_one_active_branch_idx on sessions(restaurant_id,coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid)) where is_active=true;

-- Preserve the branch across future shift creation. Old staff_login creates a new
-- session without mentioning branch_id, so this trigger safely copies the last
-- branch for that restaurant. Brand-new restaurants fall back to Main Branch.
create or replace function set_session_default_branch()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.branch_id is null then
    select branch_id into new.branch_id from sessions where restaurant_id=new.restaurant_id order by created_at desc limit 1;
    if new.branch_id is null then
      select id into new.branch_id from restaurant_branches where restaurant_id=new.restaurant_id and is_default=true and is_active=true order by created_at limit 1;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists sessions_default_branch_trigger on sessions;
create trigger sessions_default_branch_trigger before insert on sessions for each row execute function set_session_default_branch();

-- ------------------------------------------------------------
-- D. STAFF BRANCH REQUEST RPCs
-- ------------------------------------------------------------
create or replace function staff_set_current_branch(p_session_id uuid,p_tab_secret text,p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype; b restaurant_branches%rowtype; active_count int;
begin
  s:=assert_staff_for_session(p_session_id,p_tab_secret);
  select * into b from restaurant_branches where id=p_branch_id and restaurant_id=s.restaurant_id and is_active=true;
  if not found then raise exception 'BRANCH_NOT_FOUND'; end if;
  select count(*) into active_count from orders where session_id=s.id and status not in('served','cancelled');
  if active_count>0 then raise exception 'BRANCH_SWITCH_BLOCKED_ACTIVE_ORDERS'; end if;
  update sessions set branch_id=b.id where id=s.id;
  return jsonb_build_object('ok',true,'branch_id',b.id,'branch_name',b.branch_name);
end $$;

create or replace function staff_list_branches(p_session_id uuid,p_tab_secret text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype;
b jsonb;
begin
  s:=assert_staff_for_session(p_session_id,p_tab_secret);
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'branch_name',x.branch_name,'area',x.area,'address',x.address,'phone',x.phone,'is_default',x.is_default,'is_active',x.is_active) order by x.is_default desc,x.branch_name),'[]'::jsonb)
  into b from restaurant_branches x where x.restaurant_id=s.restaurant_id and x.is_active=true;
  return b;
end $$;

create or replace function staff_request_branch(p_session_id uuid,p_tab_secret text,p_branch_name text,p_address text default '',p_area text default '',p_phone text default '',p_notes text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype; id uuid;
begin
  s:=assert_staff_for_session(p_session_id,p_tab_secret);
  if length(trim(coalesce(p_branch_name,'')))<2 then raise exception 'BRANCH_NAME_REQUIRED'; end if;
  if exists(select 1 from restaurant_branches where restaurant_id=s.restaurant_id and lower(branch_name)=lower(trim(p_branch_name)) and is_active=true) then raise exception 'BRANCH_ALREADY_EXISTS'; end if;
  insert into branch_requests(restaurant_id,requested_by_session_id,branch_name,address,area,phone,notes)
  values(s.restaurant_id,s.id,trim(p_branch_name),nullif(trim(p_address),''),nullif(trim(p_area),''),nullif(trim(p_phone),''),nullif(trim(p_notes),'')) returning id into id;
  return jsonb_build_object('ok',true,'request_id',id);
end $$;

create or replace function admin_list_branch_requests(p_admin_key text,p_status text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  return (select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'restaurant_id',q.restaurant_id,'restaurant_name',coalesce(r.restaurant_name,q.restaurant_id),'branch_name',q.branch_name,'area',q.area,'address',q.address,'phone',q.phone,'notes',q.notes,'status',q.status,'admin_note',q.admin_note,'requested_at',q.requested_at,'reviewed_at',q.reviewed_at) order by q.requested_at desc),'[]'::jsonb) from branch_requests q left join restaurant_plans r on r.restaurant_id=q.restaurant_id where nullif(trim(coalesce(p_status,'')),'') is null or q.status=trim(p_status));
end $$;

create or replace function admin_review_branch_request(p_admin_key text,p_request_id uuid,p_action text,p_admin_note text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q branch_requests%rowtype; b restaurant_branches%rowtype;
begin
  perform _admin_assert(p_admin_key);
  select * into q from branch_requests where id=p_request_id for update;
  if not found then raise exception 'BRANCH_REQUEST_NOT_FOUND'; end if;
  if q.status<>'pending' then raise exception 'BRANCH_REQUEST_ALREADY_REVIEWED'; end if;
  if lower(trim(p_action))='approve' then
    insert into restaurant_branches(restaurant_id,branch_name,area,address,phone,is_default,is_active)
    values(q.restaurant_id,q.branch_name,q.area,q.address,q.phone,false,true)
    on conflict(restaurant_id,branch_name) do update set is_active=true,area=excluded.area,address=excluded.address,phone=excluded.phone
    returning * into b;
    update branch_requests set status='approved',admin_note=nullif(trim(p_admin_note),''),reviewed_at=now(),created_branch_id=b.id where id=q.id;
    return jsonb_build_object('ok',true,'status','approved','branch_id',b.id);
  elsif lower(trim(p_action))='reject' then
    update branch_requests set status='rejected',admin_note=nullif(trim(p_admin_note),''),reviewed_at=now() where id=q.id;
    return jsonb_build_object('ok',true,'status','rejected');
  end if;
  raise exception 'INVALID_BRANCH_ACTION';
end $$;

-- ------------------------------------------------------------
-- E. FAIR RIDER DISPATCH
-- ------------------------------------------------------------
create or replace function rider_avg_rating(p_rating_sum int,p_rating_count int)
returns numeric language sql immutable as $$ select case when coalesce(p_rating_count,0)<=0 then null else round(p_rating_sum::numeric/p_rating_count::numeric,2) end $$;

create or replace function pick_fair_rider(p_restaurant_id text,p_area_name text default null,p_allow_fallback_any_area boolean default true)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare id uuid; area text:=nullif(trim(coalesce(p_area_name,'')),'');
begin
  select r.id into id
  from riders r
  where r.restaurant_id=trim(p_restaurant_id)
    and r.is_active=true
    and r.duty_status='AVAILABLE'
    and (
      area is null
      or not exists(select 1 from rider_area_assignments ra where ra.rider_id=r.id)
      or exists(select 1 from rider_area_assignments ra where ra.rider_id=r.id and lower(trim(ra.area_name))=lower(area))
    )
  order by
    case when area is not null and exists(select 1 from rider_area_assignments ra where ra.rider_id=r.id and lower(trim(ra.area_name))=lower(area)) then 0 else 1 end,
    r.last_assigned_at nulls first,
    r.last_delivered_at nulls first,
    r.deliveries_completed_count asc,
    r.created_at asc
  for update skip locked
  limit 1;
  return id;
end $$;

create or replace function assign_order_to_rider(p_order_id uuid,p_rider_id uuid,p_offer_timeout_seconds int default 15)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype; r riders%rowtype; ex timestamptz;
begin
  select * into o from orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.fulfillment is distinct from 'delivery' then raise exception 'NOT_DELIVERY_ORDER'; end if;
  if o.status not in ('pending','cooking') then raise exception 'ORDER_NOT_OPEN'; end if;
  if o.assigned_rider_id is not null and o.assignment_status in ('ASSIGNED','ACCEPTED','PICKING_UP','OUT_FOR_DELIVERY') then return jsonb_build_object('ok',false,'reason','already_assigned','rider_id',o.assigned_rider_id); end if;
  select * into r from riders where id=p_rider_id for update;
  if not found or not r.is_active or r.duty_status<>'AVAILABLE' then raise exception 'RIDER_NOT_AVAILABLE'; end if;
  if not exists(select 1 from sessions s where s.id=o.session_id and s.restaurant_id=r.restaurant_id) then raise exception 'RESTAURANT_MISMATCH'; end if;
  ex:=now()+make_interval(secs=>greatest(5,least(coalesce(p_offer_timeout_seconds,15),120)));
  update orders set assigned_rider_id=r.id,assigned_at=now(),assignment_status='ASSIGNED',offer_expires_at=ex,updated_at=now() where id=o.id;
  update riders set duty_status='ASSIGNED',last_assigned_at=now(),last_seen_at=now(),updated_at=now() where id=r.id;
  insert into rider_assignment_history(order_id,rider_id,restaurant_id,session_id,area_name,status,assigned_at,offer_expires_at) values(o.id,r.id,r.restaurant_id,o.session_id,o.area_name,'ASSIGNED',now(),ex);
  return jsonb_build_object('ok',true,'order_id',o.id,'rider_id',r.id,'offer_expires_at',ex);
end $$;

create or replace function dispatch_delivery_order(p_order_id uuid,p_offer_timeout_seconds int default 15)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype; restaurant text; rider uuid;
begin
  select * into o from orders where id=p_order_id;
  if not found then return jsonb_build_object('ok',false,'reason','order_not_found'); end if;
  if o.fulfillment is distinct from 'delivery' then return jsonb_build_object('ok',false,'reason','not_delivery'); end if;
  if o.assigned_rider_id is not null then return jsonb_build_object('ok',true,'reason','already_assigned','rider_id',o.assigned_rider_id); end if;
  select restaurant_id into restaurant from sessions where id=o.session_id;
  rider:=pick_fair_rider(restaurant,o.area_name,true);
  if rider is null then return jsonb_build_object('ok',false,'reason','no_available_rider'); end if;
  return assign_order_to_rider(o.id,rider,p_offer_timeout_seconds);
end $$;

create or replace function dispatch_waiting_deliveries(p_restaurant_id text,p_limit int default 25)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o record; n int:=0; result jsonb:='[]'::jsonb; x jsonb;
begin
  for o in select o.id from orders o join sessions s on s.id=o.session_id where s.restaurant_id=trim(p_restaurant_id) and s.is_active=true and o.fulfillment='delivery' and o.status in('pending','cooking') and o.assigned_rider_id is null order by o.created_at asc limit greatest(1,least(coalesce(p_limit,25),100)) loop
    x:=dispatch_delivery_order(o.id,15); result:=result||jsonb_build_array(x); n:=n+1;
  end loop;
  return jsonb_build_object('ok',true,'processed',n,'results',result);
end $$;

-- ------------------------------------------------------------
-- F. STAFF RIDER CRUD + PERMANENT LINKS
-- ------------------------------------------------------------
create or replace function staff_create_rider(p_session_id uuid,p_tab_secret text,p_full_name text,p_phone text,p_pin text,p_photo_url text default null,p_email text default null,p_whatsapp text default null,p_primary_area text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype; r riders%rowtype; link rider_portal_links%rowtype;
begin
  s:=assert_staff_for_session(p_session_id,p_tab_secret);
  if length(trim(coalesce(p_full_name,'')))<2 then raise exception 'NAME_REQUIRED'; end if;
  if length(trim(coalesce(p_phone,'')))<5 then raise exception 'PHONE_REQUIRED'; end if;
  if length(trim(coalesce(p_pin,'')))<4 then raise exception 'PIN_MUST_BE_4_DIGITS'; end if;
  insert into riders(restaurant_id,full_name,phone,pin_hash,photo_url,email,whatsapp,primary_area,duty_status)
  values(s.restaurant_id,trim(p_full_name),trim(p_phone),crypt(trim(p_pin),gen_salt('bf',10)),nullif(trim(coalesce(p_photo_url,'')),''),nullif(trim(coalesce(p_email,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),nullif(trim(coalesce(p_primary_area,'')),''),'OFF_DUTY') returning * into r;
  if r.primary_area is not null then insert into rider_area_assignments(rider_id,restaurant_id,area_name) values(r.id,s.restaurant_id,r.primary_area) on conflict do nothing; end if;
  insert into rider_portal_links(restaurant_id,rider_id) values(s.restaurant_id,r.id) returning * into link;
  return jsonb_build_object('ok',true,'rider_id',r.id,'full_name',r.full_name,'phone',r.phone,'link_token',link.link_token);
exception when unique_violation then raise exception 'RIDER_PHONE_ALREADY_EXISTS';
end $$;

create or replace function staff_regenerate_rider_link(p_session_id uuid,p_tab_secret text,p_rider_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype; r riders%rowtype; l rider_portal_links%rowtype;
begin
  s:=assert_staff_for_session(p_session_id,p_tab_secret);
  select * into r from riders where id=p_rider_id and restaurant_id=s.restaurant_id and is_active=true;
  if not found then raise exception 'RIDER_NOT_FOUND'; end if;
  update rider_portal_links set is_revoked=true,revoked_at=now() where rider_id=r.id and is_revoked=false;
  update rider_portal_sessions set revoked_at=now() where rider_id=r.id and revoked_at is null;
  insert into rider_portal_links(restaurant_id,rider_id) values(s.restaurant_id,r.id) returning * into l;
  return jsonb_build_object('ok',true,'link_token',l.link_token);
end $$;

create or replace function staff_delete_rider_link(p_session_id uuid,p_tab_secret text,p_rider_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype;
begin
  s:=assert_staff_for_session(p_session_id,p_tab_secret);
  update rider_portal_links set is_revoked=true,revoked_at=now() where rider_id=p_rider_id and restaurant_id=s.restaurant_id and is_revoked=false;
  if not found then
    update rider_portal_sessions set revoked_at=now() where rider_id=p_rider_id and restaurant_id=s.restaurant_id and revoked_at is null;
    return found;
  end if;
  update rider_portal_sessions set revoked_at=now() where rider_id=p_rider_id and restaurant_id=s.restaurant_id and revoked_at is null;
  return true;
end $$;

create or replace function staff_list_riders(p_session_id uuid,p_tab_secret text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype; rows jsonb;
begin
  s:=assert_staff_for_session(p_session_id,p_tab_secret);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'full_name',r.full_name,'phone',r.phone,'email',r.email,'whatsapp',r.whatsapp,'photo_url',r.photo_url,'bike_number',r.bike_number,
    'duty_status',r.duty_status,'is_active',r.is_active,'primary_area',r.primary_area,'deliveries_completed_count',r.deliveries_completed_count,
    'avg_rating',rider_avg_rating(r.rating_sum,r.rating_count),'rating_count',r.rating_count,
    'link_token',l.link_token,'link_revoked',coalesce(l.is_revoked,true)
  ) order by r.created_at),'[]'::jsonb) into rows
  from riders r left join lateral(select * from rider_portal_links x where x.rider_id=r.id and x.is_revoked=false order by x.created_at desc limit 1) l on true
  where r.restaurant_id=s.restaurant_id and r.is_active=true;
  return rows;
end $$;

create or replace function staff_set_rider_duty(p_session_id uuid,p_tab_secret text,p_rider_id uuid,p_duty_status text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype; ok boolean:=false;
begin
  s:=assert_staff_for_session(p_session_id,p_tab_secret);
  if p_duty_status not in('OFF_DUTY','AVAILABLE') then raise exception 'INVALID_DUTY_STATUS'; end if;
  update riders set duty_status=p_duty_status,last_available_at=case when p_duty_status='AVAILABLE' then now() else last_available_at end,last_seen_at=now(),updated_at=now() where id=p_rider_id and restaurant_id=s.restaurant_id and is_active=true and duty_status in('OFF_DUTY','AVAILABLE');
  ok:=found;
  if ok and p_duty_status='AVAILABLE' then perform dispatch_waiting_deliveries(s.restaurant_id,25); end if;
  return ok;
end $$;

create or replace function staff_deactivate_rider(p_session_id uuid,p_tab_secret text,p_rider_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype;
begin
  s:=assert_staff_for_session(p_session_id,p_tab_secret);
  update riders set is_active=false,duty_status='OFF_DUTY',updated_at=now() where id=p_rider_id and restaurant_id=s.restaurant_id;
  update rider_portal_links set is_revoked=true,revoked_at=now() where rider_id=p_rider_id and is_revoked=false;
  update rider_portal_sessions set revoked_at=now() where rider_id=p_rider_id and revoked_at is null;
  return found;
end $$;

-- ------------------------------------------------------------
-- G. RIDER PORTAL AUTH / PROFILE / DUTY / ORDERS
-- ------------------------------------------------------------
create or replace function rider_portal_login(p_restaurant_id text,p_link_token text,p_pin text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l rider_portal_links%rowtype; r riders%rowtype; s sessions%rowtype; tok text; thash text; uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into l from rider_portal_links where restaurant_id=trim(p_restaurant_id) and link_token=trim(p_link_token) and is_revoked=false;
  if not found then raise exception 'LINK_REVOKED'; end if;
  select * into r from riders where id=l.rider_id and restaurant_id=l.restaurant_id and is_active=true;
  if not found then raise exception 'RIDER_NOT_FOUND'; end if;
  if r.pin_hash is null or crypt(trim(p_pin),r.pin_hash)<>r.pin_hash then raise exception 'INVALID_PIN'; end if;
  tok:=encode(gen_random_bytes(32),'hex'); thash:=encode(digest(tok,'sha256'),'hex');
  update rider_portal_sessions set revoked_at=now() where rider_id=r.id and auth_user_id=uid and revoked_at is null;
  insert into rider_portal_sessions(rider_id,restaurant_id,auth_user_id,token_hash) values(r.id,r.restaurant_id,uid,thash);
  select * into s from sessions where restaurant_id=r.restaurant_id and is_active=true order by created_at desc limit 1;
  return jsonb_build_object('ok',true,'portal_token',tok,'rider_id',r.id,'full_name',r.full_name,'phone',r.phone,'email',r.email,'whatsapp',r.whatsapp,'photo_url',r.photo_url,'bike_number',r.bike_number,'primary_area',r.primary_area,'duty_status',r.duty_status,'avg_rating',rider_avg_rating(r.rating_sum,r.rating_count),'rating_count',r.rating_count,'deliveries_completed_count',r.deliveries_completed_count,'restaurant_id',r.restaurant_id,'restaurant_name',coalesce(s.restaurant_name,r.restaurant_id),'logo_url',s.logo_url,'theme',coalesce(s.theme,'{}'::jsonb));
end $$;

create or replace function rider_portal_resume(p_restaurant_id text,p_link_token text,p_portal_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ps rider_portal_sessions%rowtype; l rider_portal_links%rowtype; r riders%rowtype; s sessions%rowtype; uid uuid:=auth.uid(); thash text:=encode(digest(trim(p_portal_token),'sha256'),'hex');
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into ps from rider_portal_sessions where token_hash=thash and auth_user_id=uid and restaurant_id=trim(p_restaurant_id) and revoked_at is null and last_seen_at>now()-interval '30 days';
  if not found then raise exception 'RIDER_SESSION_EXPIRED'; end if;
  select * into l from rider_portal_links where rider_id=ps.rider_id and restaurant_id=ps.restaurant_id and link_token=trim(p_link_token) and is_revoked=false;
  if not found then raise exception 'LINK_REVOKED'; end if;
  select * into r from riders where id=ps.rider_id and is_active=true;
  if not found then raise exception 'RIDER_NOT_FOUND'; end if;
  update rider_portal_sessions set last_seen_at=now() where id=ps.id;
  select * into s from sessions where restaurant_id=r.restaurant_id and is_active=true order by created_at desc limit 1;
  return jsonb_build_object('ok',true,'rider_id',r.id,'full_name',r.full_name,'phone',r.phone,'email',r.email,'whatsapp',r.whatsapp,'photo_url',r.photo_url,'bike_number',r.bike_number,'primary_area',r.primary_area,'duty_status',r.duty_status,'avg_rating',rider_avg_rating(r.rating_sum,r.rating_count),'rating_count',r.rating_count,'deliveries_completed_count',r.deliveries_completed_count,'restaurant_id',r.restaurant_id,'restaurant_name',coalesce(s.restaurant_name,r.restaurant_id),'logo_url',s.logo_url,'theme',coalesce(s.theme,'{}'::jsonb));
end $$;

create or replace function rider_portal_logout(p_portal_token text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare thash text:=encode(digest(trim(p_portal_token),'sha256'),'hex');
begin update rider_portal_sessions set revoked_at=now() where token_hash=thash and auth_user_id=auth.uid() and revoked_at is null; return found; end $$;

create or replace function rider_portal_update_profile(p_portal_token text,p_full_name text,p_phone text,p_whatsapp text,p_photo_url text,p_bike_number text,p_primary_area text,p_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ps rider_portal_sessions%rowtype; r riders%rowtype; s sessions%rowtype; thash text:=encode(digest(trim(p_portal_token),'sha256'),'hex');
begin
  select * into ps from rider_portal_sessions where token_hash=thash and auth_user_id=auth.uid() and revoked_at is null and last_seen_at>now()-interval '30 days';
  if not found then raise exception 'RIDER_SESSION_EXPIRED'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 or length(trim(coalesce(p_phone,'')))<5 then raise exception 'NAME_AND_PHONE_REQUIRED'; end if;
  update riders set full_name=trim(p_full_name),phone=trim(p_phone),whatsapp=nullif(trim(coalesce(p_whatsapp,'')),''),photo_url=nullif(trim(coalesce(p_photo_url,'')),''),bike_number=nullif(trim(coalesce(p_bike_number,'')),''),primary_area=nullif(trim(coalesce(p_primary_area,'')),''),email=nullif(trim(coalesce(p_email,'')),''),updated_at=now() where id=ps.rider_id returning * into r;
  delete from rider_area_assignments where rider_id=r.id;
  if r.primary_area is not null then insert into rider_area_assignments(rider_id,restaurant_id,area_name) values(r.id,r.restaurant_id,r.primary_area) on conflict do nothing; end if;
  update rider_portal_sessions set last_seen_at=now() where id=ps.id;
  select * into s from sessions where restaurant_id=r.restaurant_id and is_active=true order by created_at desc limit 1;
  return jsonb_build_object('ok',true,'rider_id',r.id,'full_name',r.full_name,'phone',r.phone,'email',r.email,'whatsapp',r.whatsapp,'photo_url',r.photo_url,'bike_number',r.bike_number,'primary_area',r.primary_area,'duty_status',r.duty_status,'avg_rating',rider_avg_rating(r.rating_sum,r.rating_count),'rating_count',r.rating_count,'deliveries_completed_count',r.deliveries_completed_count,'restaurant_id',r.restaurant_id,'restaurant_name',coalesce(s.restaurant_name,r.restaurant_id),'logo_url',s.logo_url,'theme',coalesce(s.theme,'{}'::jsonb));
end $$;

create or replace function rider_portal_set_duty(p_portal_token text,p_duty_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ps rider_portal_sessions%rowtype; r riders%rowtype; thash text:=encode(digest(trim(p_portal_token),'sha256'),'hex');
begin
  select * into ps from rider_portal_sessions where token_hash=thash and auth_user_id=auth.uid() and revoked_at is null and last_seen_at>now()-interval '30 days';
  if not found then raise exception 'RIDER_SESSION_EXPIRED'; end if;
  if p_duty_status not in('OFF_DUTY','AVAILABLE') then raise exception 'INVALID_DUTY_STATUS'; end if;
  update riders set duty_status=p_duty_status,last_available_at=case when p_duty_status='AVAILABLE' then now() else last_available_at end,last_seen_at=now(),updated_at=now() where id=ps.rider_id and is_active=true and duty_status in('OFF_DUTY','AVAILABLE');
  if not found then raise exception 'DUTY_UPDATE_BLOCKED_ACTIVE_DELIVERY'; end if;
  update rider_portal_sessions set last_seen_at=now() where id=ps.id;
  if p_duty_status='AVAILABLE' then perform dispatch_waiting_deliveries(ps.restaurant_id,50); end if;
  return jsonb_build_object('ok',true,'duty_status',p_duty_status);
end $$;

create or replace function rider_portal_list_orders(p_portal_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ps rider_portal_sessions%rowtype; thash text:=encode(digest(trim(p_portal_token),'sha256'),'hex'); rows jsonb;
begin
  select * into ps from rider_portal_sessions where token_hash=thash and auth_user_id=auth.uid() and revoked_at is null and last_seen_at>now()-interval '30 days';
  if not found then raise exception 'RIDER_SESSION_EXPIRED'; end if;
  update rider_portal_sessions set last_seen_at=now() where id=ps.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'session_id',o.session_id,'status',o.status,'fulfillment',o.fulfillment,'items',o.items,'total',o.total,'customer_name',o.customer_name,'customer_phone',o.customer_phone,'customer_address',o.customer_address,'area_name',o.area_name,'assignment_status',o.assignment_status,'assigned_at',o.assigned_at,'created_at',o.created_at,'branch_name',coalesce(b.branch_name,'Main Branch')
  ) order by o.created_at desc),'[]'::jsonb) into rows
  from orders o join sessions s on s.id=o.session_id left join restaurant_branches b on b.id=s.branch_id
  where o.assigned_rider_id=ps.rider_id and o.fulfillment='delivery' and o.status in('pending','cooking');
  return rows;
end $$;

create or replace function rider_accept_order(p_portal_token text,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ps rider_portal_sessions%rowtype; o orders%rowtype; thash text:=encode(digest(trim(p_portal_token),'sha256'),'hex');
begin
  select * into ps from rider_portal_sessions where token_hash=thash and auth_user_id=auth.uid() and revoked_at is null and last_seen_at>now()-interval '30 days';
  if not found then raise exception 'RIDER_SESSION_EXPIRED'; end if;
  select * into o from orders where id=p_order_id and assigned_rider_id=ps.rider_id for update;
  if not found then raise exception 'ORDER_NOT_ASSIGNED_TO_YOU'; end if;
  update orders set assignment_status='ACCEPTED',updated_at=now() where id=o.id;
  update riders set duty_status='ACCEPTED',last_accepted_at=now(),last_seen_at=now(),updated_at=now() where id=ps.rider_id;
  update rider_assignment_history set status='ACCEPTED',accepted_at=now() where order_id=o.id and rider_id=ps.rider_id and status='ASSIGNED';
  return jsonb_build_object('ok',true,'order_id',o.id,'assignment_status','ACCEPTED');
end $$;

create or replace function rider_portal_mark_delivered(p_portal_token text,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ps rider_portal_sessions%rowtype; o orders%rowtype; thash text:=encode(digest(trim(p_portal_token),'sha256'),'hex');
begin
  select * into ps from rider_portal_sessions where token_hash=thash and auth_user_id=auth.uid() and revoked_at is null and last_seen_at>now()-interval '30 days';
  if not found then raise exception 'RIDER_SESSION_EXPIRED'; end if;
  select * into o from orders where id=p_order_id and assigned_rider_id=ps.rider_id for update;
  if not found then raise exception 'ORDER_NOT_ASSIGNED_TO_YOU'; end if;
  update orders set status='served',assignment_status='DELIVERED',updated_at=now() where id=o.id;
  update riders set duty_status='AVAILABLE',last_delivered_at=now(),last_available_at=now(),last_seen_at=now(),deliveries_completed_count=deliveries_completed_count+1,updated_at=now() where id=ps.rider_id;
  update rider_assignment_history set status='DELIVERED',completed_at=now() where order_id=o.id and rider_id=ps.rider_id and status not in('DELIVERED','CANCELLED');
  update rider_portal_sessions set last_seen_at=now() where id=ps.id;
  perform dispatch_waiting_deliveries(ps.restaurant_id,50);
  return jsonb_build_object('ok',true,'order_id',o.id);
end $$;

-- Clean the exact overloaded function that caused the screenshot error.
drop function if exists rider_set_duty_status(uuid,text,text);
drop function if exists rider_set_duty_status(uuid,text);
create or replace function rider_set_duty_status(p_rider_id uuid,p_duty_status text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_duty_status not in('OFF_DUTY','AVAILABLE') then raise exception 'INVALID_DUTY_STATUS'; end if;
  update riders set duty_status=p_duty_status,last_available_at=case when p_duty_status='AVAILABLE' then now() else last_available_at end,last_seen_at=now(),updated_at=now() where id=p_rider_id and is_active=true and duty_status in('OFF_DUTY','AVAILABLE');
  return found;
end $$;

-- Customer-safe rider information.
create or replace function customer_order_rider_public(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o orders%rowtype; r riders%rowtype; uid uuid:=auth.uid();
begin
  select * into o from orders where id=p_order_id and customer_user_id=uid;
  if not found or o.assigned_rider_id is null then return null; end if;
  select * into r from riders where id=o.assigned_rider_id and is_active=true;
  if not found then return null; end if;
  return jsonb_build_object('name',r.full_name,'phone',r.phone,'whatsapp',r.whatsapp,'photo_url',r.photo_url,'bike_number',r.bike_number,'avg_rating',rider_avg_rating(r.rating_sum,r.rating_count),'rating_count',r.rating_count,'lat',o.rider_lat,'lng',o.rider_lng);
end $$;

-- ------------------------------------------------------------
-- H. CUSTOMER DELIVERY ROUTING + ORDER AUTO-DISPATCH
-- ------------------------------------------------------------
create or replace function brand_delivery_areas(p_restaurant_id text,p_brand_secret text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from sessions where restaurant_id=trim(p_restaurant_id) and qr_secret=trim(p_brand_secret)) then raise exception 'INVALID_DELIVERY_QR'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('area_name',x.area_name,'charge',x.charge) order by x.area_name),'[]'::jsonb) from (
    select da.name area_name,min(da.charge) charge from delivery_areas da join sessions s on s.id=da.session_id where s.restaurant_id=trim(p_restaurant_id) and s.is_active=true group by da.name
  ) x);
end $$;

create or replace function brand_delivery_resolve(p_restaurant_id text,p_brand_secret text,p_area_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s sessions%rowtype; a delivery_areas%rowtype; active_orders int;
begin
  if not exists(select 1 from sessions where restaurant_id=trim(p_restaurant_id) and qr_secret=trim(p_brand_secret)) then raise exception 'INVALID_DELIVERY_QR'; end if;
  select s1.* into s from sessions s1 join delivery_areas da on da.session_id=s1.id where s1.restaurant_id=trim(p_restaurant_id) and s1.is_active=true and lower(trim(da.name))=lower(trim(p_area_name)) order by (select count(*) from orders o where o.session_id=s1.id and o.fulfillment='delivery' and o.status in('pending','cooking')) asc,s1.created_at desc limit 1;
  if not found then return jsonb_build_object('ok',false,'code','AREA_NOT_COVERED'); end if;
  select * into a from delivery_areas where session_id=s.id and lower(trim(name))=lower(trim(p_area_name)) order by charge asc limit 1;
  return jsonb_build_object('ok',true,'restaurant_id',s.restaurant_id,'restaurant_name',s.restaurant_name,'qr_secret',s.qr_secret,'theme',s.theme,'logo_url',s.logo_url,'delivery_charge',a.charge,'area_name',a.name,'branch_id',s.branch_id,'branch_name',coalesce((select branch_name from restaurant_branches where id=s.branch_id),'Main Branch'));
end $$;

-- Replace order RPC so BrandDelivery can use the stable takeaway table route while
-- fulfillment='delivery' is the actual source of truth.
create or replace function place_customer_order(p_session_id uuid,p_table_id text,p_items jsonb,p_note text default '',p_fulfillment text default null,p_customer_name text default null,p_customer_phone text default null,p_customer_address text default null,p_area_name text default null)
returns orders language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); s sessions%rowtype; item jsonb; v_item_id uuid; qty int; price numeric(10,2); nm text; typ text; rows jsonb:='[]'::jsonb; subtotal numeric(10,2):=0; tax numeric(10,2):=0; delivery numeric(10,2):=0; total numeric(10,2):=0; area_charge numeric(10,2); o orders%rowtype; c int;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into s from sessions where id=p_session_id and is_active=true;
  if not found or not exists(select 1 from customer_access where session_id=p_session_id and table_id=trim(p_table_id) and user_id=uid) then raise exception 'Customer session expired'; end if;
  perform ensure_restaurant_plan_access(s.restaurant_id,s.restaurant_name);
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>30 then raise exception 'Invalid order items'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'Note too long'; end if;
  if p_fulfillment not in('delivery','takeaway') and p_fulfillment is not null then raise exception 'Invalid fulfillment'; end if;
  if p_fulfillment='delivery' and lower(trim(p_table_id))<>'takeaway' then raise exception 'Delivery is only available from delivery/takeaway QR'; end if;
  if p_fulfillment='takeaway' and lower(trim(p_table_id))<>'takeaway' then raise exception 'Invalid takeaway order'; end if;
  select count(*) into c from orders where customer_user_id=uid and created_at>now()-interval '60 seconds'; if c>=5 then raise exception 'RATE_LIMIT'; end if;
  if p_fulfillment='delivery' then
    if coalesce(trim(p_customer_name),'')='' or coalesce(trim(p_customer_phone),'')='' or coalesce(trim(p_customer_address),'')='' or coalesce(trim(p_area_name),'')='' then raise exception 'Delivery details required'; end if;
    select charge into area_charge from delivery_areas where session_id=p_session_id and lower(trim(name))=lower(trim(p_area_name));
    if not found then raise exception 'Invalid delivery area'; end if;
    delivery:=coalesce(area_charge,0);
  end if;
  for item in select * from jsonb_array_elements(p_items) loop
    qty:=greatest(0,least(coalesce((item->>'qty')::int,0),20)); if qty<1 then raise exception 'Invalid quantity'; end if; typ:=coalesce(item->>'type','item');
    if typ='deal' then
      begin v_item_id:=(item->>'id')::uuid; exception when others then raise exception 'Invalid deal'; end;
      select name,price into nm,price from deals d where d.id=v_item_id and d.session_id=p_session_id and is_active=true and (valid_from is null or valid_from<=current_date) and (valid_until is null or valid_until>=current_date); if not found then raise exception 'Deal unavailable'; end if;
      rows:=rows||jsonb_build_array(jsonb_build_object('id',v_item_id,'name',nm,'price',price,'qty',qty,'type','deal'));
    else
      begin v_item_id:=(item->>'id')::uuid; exception when others then raise exception 'Invalid menu item'; end;
      select name,price into nm,price from menu_items m where m.id=v_item_id and m.session_id=p_session_id and is_available=true; if not found then raise exception 'Menu item unavailable'; end if;
      rows:=rows||jsonb_build_array(jsonb_build_object('id',v_item_id,'name',nm,'price',price,'qty',qty,'type','item'));
    end if;
    subtotal:=subtotal+(price*qty);
  end loop;
  tax:=round(subtotal*coalesce(s.tax_percent,0)/100,2); total:=subtotal+tax+delivery;
  insert into orders(session_id,table_id,items,note,total,delivery_charge,status,fulfillment,customer_name,customer_phone,customer_address,area_name,customer_user_id)
  values(p_session_id,trim(p_table_id),rows,coalesce(p_note,''),total,delivery,'pending',p_fulfillment,nullif(trim(p_customer_name),''),nullif(trim(p_customer_phone),''),nullif(trim(p_customer_address),''),nullif(trim(p_area_name),''),uid) returning * into o;
  if p_fulfillment='delivery' then perform dispatch_delivery_order(o.id,15); select * into o from orders where id=o.id; end if;
  return o;
end $$;

-- ------------------------------------------------------------
-- I. STORAGE FOR RIDER PHOTOS
-- ------------------------------------------------------------
insert into storage.buckets(id,name,public) values('rider-photos','rider-photos',true) on conflict(id) do update set public=true;
drop policy if exists rider_photo_public_read on storage.objects;
drop policy if exists rider_photo_upload on storage.objects;
drop policy if exists rider_photo_update on storage.objects;
drop policy if exists rider_photo_delete on storage.objects;
create policy rider_photo_public_read on storage.objects for select to public using(bucket_id='rider-photos');
create policy rider_photo_upload on storage.objects for insert to authenticated with check(bucket_id='rider-photos' and exists(select 1 from rider_portal_sessions ps where ps.auth_user_id=auth.uid() and ps.rider_id::text=(storage.foldername(name))[1] and ps.revoked_at is null and ps.last_seen_at>now()-interval '30 days'));
create policy rider_photo_update on storage.objects for update to authenticated using(bucket_id='rider-photos' and exists(select 1 from rider_portal_sessions ps where ps.auth_user_id=auth.uid() and ps.rider_id::text=(storage.foldername(name))[1] and ps.revoked_at is null and ps.last_seen_at>now()-interval '30 days')) with check(bucket_id='rider-photos' and exists(select 1 from rider_portal_sessions ps where ps.auth_user_id=auth.uid() and ps.rider_id::text=(storage.foldername(name))[1] and ps.revoked_at is null and ps.last_seen_at>now()-interval '30 days'));
create policy rider_photo_delete on storage.objects for delete to authenticated using(bucket_id='rider-photos' and exists(select 1 from rider_portal_sessions ps where ps.auth_user_id=auth.uid() and ps.rider_id::text=(storage.foldername(name))[1] and ps.revoked_at is null and ps.last_seen_at>now()-interval '30 days'));

-- ------------------------------------------------------------
-- J. SHIFT CLOSE: preserve the working post-fix flow
-- ------------------------------------------------------------
drop function if exists staff_close_shift(uuid,text);
create or replace function staff_close_shift(p_session_id uuid,p_tab_secret text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); a staff_access%rowtype; s sessions%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into a from staff_access where session_id=p_session_id and user_id=uid and tab_secret=p_tab_secret;
  if not found then select * into a from staff_access where session_id=p_session_id and user_id=uid; end if;
  if not found then raise exception 'NOT_STAFF_FOR_SESSION'; end if;
  select * into s from sessions where id=p_session_id for update; if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  update sessions set is_active=false,closed_at=now(),last_seen_at=now() where id=p_session_id;
  delete from staff_access where session_id=p_session_id;
  return jsonb_build_object('ok',true,'session_id',p_session_id);
end $$;

-- ------------------------------------------------------------
-- K. PAYMENT SAFETY REASSERTION
-- ------------------------------------------------------------
-- These grants intentionally keep payment submission separate from approval.
-- If the project already has the final payment migration, these are harmless.
revoke all on function get_subscription_price_info() from public;
grant execute on function get_subscription_price_info() to authenticated;
revoke all on function admin_list_branch_requests(text,text) from public;
grant execute on function admin_list_branch_requests(text,text) to authenticated;
revoke all on function admin_review_branch_request(text,uuid,text,text) from public;
grant execute on function admin_review_branch_request(text,uuid,text,text) to authenticated;
revoke all on function staff_set_current_branch(uuid,text,uuid) from public;
grant execute on function staff_set_current_branch(uuid,text,uuid) to authenticated;
revoke all on function staff_list_branches(uuid,text) from public;
grant execute on function staff_list_branches(uuid,text) to authenticated;
revoke all on function staff_request_branch(uuid,text,text,text,text,text,text) from public;
grant execute on function staff_request_branch(uuid,text,text,text,text,text,text) to authenticated;
revoke all on function staff_create_rider(uuid,text,text,text,text,text,text,text,text) from public;
grant execute on function staff_create_rider(uuid,text,text,text,text,text,text,text,text) to authenticated;
revoke all on function staff_regenerate_rider_link(uuid,text,uuid) from public;
grant execute on function staff_regenerate_rider_link(uuid,text,uuid) to authenticated;
revoke all on function staff_delete_rider_link(uuid,text,uuid) from public;
grant execute on function staff_delete_rider_link(uuid,text,uuid) to authenticated;
revoke all on function staff_list_riders(uuid,text) from public;
grant execute on function staff_list_riders(uuid,text) to authenticated;
revoke all on function staff_set_rider_duty(uuid,text,uuid,text) from public;
grant execute on function staff_set_rider_duty(uuid,text,uuid,text) to authenticated;
revoke all on function staff_deactivate_rider(uuid,text,uuid) from public;
grant execute on function staff_deactivate_rider(uuid,text,uuid) to authenticated;
revoke all on function rider_portal_login(text,text,text) from public;
grant execute on function rider_portal_login(text,text,text) to authenticated;
revoke all on function rider_portal_resume(text,text,text) from public;
grant execute on function rider_portal_resume(text,text,text) to authenticated;
revoke all on function rider_portal_logout(text) from public;
grant execute on function rider_portal_logout(text) to authenticated;
revoke all on function rider_portal_update_profile(text,text,text,text,text,text,text,text) from public;
grant execute on function rider_portal_update_profile(text,text,text,text,text,text,text,text) to authenticated;
revoke all on function rider_portal_set_duty(text,text) from public;
grant execute on function rider_portal_set_duty(text,text) to authenticated;
revoke all on function rider_portal_list_orders(text) from public;
grant execute on function rider_portal_list_orders(text) to authenticated;
revoke all on function rider_accept_order(text,uuid) from public;
grant execute on function rider_accept_order(text,uuid) to authenticated;
revoke all on function rider_portal_mark_delivered(text,uuid) from public;
grant execute on function rider_portal_mark_delivered(text,uuid) to authenticated;
revoke all on function rider_set_duty_status(uuid,text) from public;
grant execute on function rider_set_duty_status(uuid,text) to authenticated;
revoke all on function customer_order_rider_public(uuid) from public;
grant execute on function customer_order_rider_public(uuid) to authenticated;
revoke all on function brand_delivery_areas(text,text) from public;
grant execute on function brand_delivery_areas(text,text) to authenticated;
revoke all on function brand_delivery_resolve(text,text,text) from public;
grant execute on function brand_delivery_resolve(text,text,text) to authenticated;
revoke all on function place_customer_order(uuid,text,jsonb,text,text,text,text,text,text) from public;
grant execute on function place_customer_order(uuid,text,jsonb,text,text,text,text,text,text) to authenticated;
revoke all on function dispatch_delivery_order(uuid,int) from public;
grant execute on function dispatch_delivery_order(uuid,int) to authenticated;
revoke all on function dispatch_waiting_deliveries(text,int) from public;
grant execute on function dispatch_waiting_deliveries(text,int) to authenticated;
revoke all on function staff_close_shift(uuid,text) from public;
grant execute on function staff_close_shift(uuid,text) to authenticated;

-- Legacy loyalty functions can remain in the database for compatibility with
-- old data, but the final application no longer exposes a loyalty UI/card.
-- ============================================================
-- END FINAL PRODUCTION PATCH
-- ============================================================
