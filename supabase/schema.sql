-- ============================================================
-- TABLE ORDER — SALE-READY PRODUCTION SCHEMA
--
-- Staff login: Restaurant Name + PIN (NO email/password)
-- Customer/rider: invisible Supabase Anonymous Auth (no signup form)
-- Staff PIN is stored as a bcrypt hash, never plaintext.
-- Public QR contains restaurant_id + qr_secret + table/area only.
-- All sensitive writes are protected by RLS and/or SECURITY DEFINER RPCs.
--
-- IMPORTANT: In Supabase Dashboard -> Authentication -> Providers,
-- enable Anonymous Sign-Ins before using the app.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- BASE TABLES
-- ------------------------------------------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  restaurant_name text not null,
  pin text,
  pin_hash text,
  qr_secret text not null default encode(gen_random_bytes(16), 'hex'),
  rider_secret text not null default encode(gen_random_bytes(24), 'hex'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  shift_started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  logo_url text,
  theme jsonb not null default '{}'::jsonb,
  tax_percent numeric(6,2) not null default 0,
  tax_label text not null default 'Tax'
);

alter table sessions add column if not exists pin_hash text;
alter table sessions add column if not exists qr_secret text;
alter table sessions add column if not exists rider_secret text;
alter table sessions add column if not exists shift_started_at timestamptz;
alter table sessions add column if not exists last_seen_at timestamptz;
alter table sessions add column if not exists closed_at timestamptz;
alter table sessions add column if not exists logo_url text;
alter table sessions add column if not exists theme jsonb;
alter table sessions add column if not exists tax_percent numeric(6,2);
alter table sessions add column if not exists tax_label text;

-- One-time migration from the old plaintext PIN column.
update sessions
set pin_hash = crypt(pin, gen_salt('bf', 10))
where (pin_hash is null or trim(pin_hash) = '')
  and pin is not null
  and trim(pin) <> '';

update sessions set qr_secret = encode(gen_random_bytes(16), 'hex') where qr_secret is null or trim(qr_secret) = '';
update sessions set rider_secret = encode(gen_random_bytes(24), 'hex') where rider_secret is null or trim(rider_secret) = '';
update sessions set shift_started_at = coalesce(shift_started_at, created_at, now());
update sessions set last_seen_at = coalesce(last_seen_at, created_at, now());
update sessions set tax_percent = coalesce(tax_percent, 0), tax_label = coalesce(nullif(tax_label, ''), 'Tax'), theme = coalesce(theme, '{}'::jsonb);

alter table sessions alter column qr_secret set default encode(gen_random_bytes(16), 'hex');
alter table sessions alter column qr_secret set not null;
alter table sessions alter column rider_secret set default encode(gen_random_bytes(24), 'hex');
alter table sessions alter column rider_secret set not null;
alter table sessions alter column pin_hash set not null;
alter table sessions alter column shift_started_at set default now();
alter table sessions alter column shift_started_at set not null;
alter table sessions alter column last_seen_at set default now();
alter table sessions alter column last_seen_at set not null;
alter table sessions alter column tax_percent set default 0;
alter table sessions alter column tax_percent set not null;
alter table sessions alter column tax_label set default 'Tax';
alter table sessions alter column tax_label set not null;
alter table sessions alter column theme set default '{}'::jsonb;
alter table sessions alter column theme set not null;

-- Remove old PIN-dependent indexes/constraint before dropping plaintext PIN.
alter table sessions drop constraint if exists sessions_restaurant_id_pin_key;
drop index if exists sessions_restaurant_id_pin_key;
drop index if exists sessions_one_active_shift_idx;
-- No plaintext PIN remains in the production schema.
alter table sessions drop column if exists pin;

-- Only one active shift per restaurant. If an old database contains more than
-- one active row for the same restaurant, keep the most recently active row
-- and close the older duplicates before creating the unique index.
with ranked as (
  select id, row_number() over (partition by restaurant_id order by last_seen_at desc, created_at desc) as rn
  from sessions where is_active=true
)
update sessions s
set is_active=false, closed_at=coalesce(s.closed_at, now())
from ranked r
where s.id=r.id and r.rn>1;
create unique index if not exists sessions_one_active_restaurant_idx on sessions (restaurant_id) where is_active = true;

drop index if exists sessions_qr_secret_idx;
create unique index if not exists sessions_qr_secret_active_idx on sessions (qr_secret) where is_active = true;
create unique index if not exists sessions_rider_secret_active_idx on sessions (rider_secret) where is_active = true;
create index if not exists idx_sessions_restaurant_id on sessions(restaurant_id);

create table if not exists staff_access (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tab_secret text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_staff_access_user on staff_access(user_id);

create table if not exists customer_access (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  table_id text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(session_id, user_id, table_id)
);
create index if not exists idx_customer_access_user on customer_access(user_id);
create index if not exists idx_customer_access_room on customer_access(session_id, table_id);

create table if not exists rider_access (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  area_name text not null,
  created_at timestamptz not null default now(),
  unique(session_id, user_id, area_name)
);
create index if not exists idx_rider_access_user on rider_access(user_id);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  table_id text not null,
  items jsonb not null,
  note text default '',
  total numeric(10,2) not null default 0,
  delivery_charge numeric(10,2) not null default 0,
  status text not null default 'pending',
  fulfillment text,
  customer_name text,
  customer_phone text,
  customer_address text,
  area_name text,
  rating int,
  rider_lat double precision,
  rider_lng double precision,
  customer_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table orders add column if not exists delivery_charge numeric(10,2);
alter table orders add column if not exists fulfillment text;
alter table orders add column if not exists customer_name text;
alter table orders add column if not exists customer_phone text;
alter table orders add column if not exists customer_address text;
alter table orders add column if not exists area_name text;
alter table orders add column if not exists rating int;
alter table orders add column if not exists rider_lat double precision;
alter table orders add column if not exists rider_lng double precision;
alter table orders add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
alter table orders add column if not exists updated_at timestamptz;
update orders set delivery_charge = coalesce(delivery_charge, 0), updated_at = coalesce(updated_at, created_at, now());
alter table orders alter column delivery_charge set default 0;
alter table orders alter column delivery_charge set not null;
alter table orders alter column updated_at set default now();
alter table orders alter column updated_at set not null;

create table if not exists delivery_areas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  charge numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
alter table delivery_areas add column if not exists charge numeric(10,2);
update delivery_areas set charge = coalesce(charge, 0);
alter table delivery_areas alter column charge set default 0;
alter table delivery_areas alter column charge set not null;

create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  table_id text not null,
  type text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  category text not null,
  name text not null,
  price numeric(10,2) not null default 0,
  photo_url text,
  badge text,
  is_available boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null default 0,
  original_price numeric(10,2),
  photo_url text,
  is_active boolean not null default true,
  valid_from date,
  valid_until date,
  mood_tags text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists activation_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  is_used boolean not null default false,
  used_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_session on orders(session_id);
create index if not exists idx_orders_delivery_area on orders(session_id, fulfillment, area_name, status);
create index if not exists idx_orders_customer on orders(customer_user_id, session_id, table_id);
create index if not exists idx_alerts_session on alerts(session_id);
create index if not exists idx_menu_items_session on menu_items(session_id);
create index if not exists idx_delivery_areas_session on delivery_areas(session_id);
create unique index if not exists delivery_areas_session_name_idx on delivery_areas(session_id, lower(name));
create index if not exists idx_deals_session on deals(session_id);

-- ------------------------------------------------------------
-- TRIGGERS / VALIDATION
-- ------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_touch on orders;
create trigger trg_orders_touch before update on orders for each row execute function touch_updated_at();

-- Staff may change operational settings, but never the identity/PIN/QR secret.
create or replace function protect_session_security_fields() returns trigger as $$
begin
  if tg_op='UPDATE' and (new.restaurant_id is distinct from old.restaurant_id or new.qr_secret is distinct from old.qr_secret or new.rider_secret is distinct from old.rider_secret or new.pin_hash is distinct from old.pin_hash) then
    if auth.uid() is not null then
      raise exception 'Protected session identity fields cannot be changed';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path=public,pg_temp;

drop trigger if exists trg_sessions_protect on sessions;
create trigger trg_sessions_protect before update on sessions for each row execute function protect_session_security_fields();

-- Prevent direct clients from forging system-owned order values.
create or replace function protect_order_system_fields() returns trigger as $$
begin
  if tg_op = 'UPDATE' and not exists (select 1 from staff_access sa where sa.session_id = old.session_id and sa.user_id = auth.uid() and sa.last_seen_at > now() - interval '60 seconds') then
    if new.session_id <> old.session_id or new.customer_user_id is distinct from old.customer_user_id or new.total <> old.total or new.items <> old.items or new.delivery_charge <> old.delivery_charge or new.created_at <> old.created_at then
      raise exception 'Protected order fields cannot be changed by this role';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_orders_protect on orders;
create trigger trg_orders_protect before update on orders for each row execute function protect_order_system_fields();

-- ------------------------------------------------------------
-- RLS HELPERS
-- ------------------------------------------------------------
create or replace function is_staff_for_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from staff_access sa
    join sessions s on s.id = sa.session_id
    where sa.session_id = p_session_id
      and sa.user_id = auth.uid()
      and s.is_active = true
      and sa.last_seen_at > now() - interval '60 seconds'
  );
$$;

create or replace function is_customer_for_table(p_session_id uuid, p_table_id text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from customer_access ca
    join sessions s on s.id = ca.session_id
    where ca.session_id = p_session_id
      and ca.table_id = p_table_id
      and ca.user_id = auth.uid()
      and s.is_active = true
  );
$$;

create or replace function is_rider_for_session(p_session_id uuid, p_area text default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from rider_access ra
    join sessions s on s.id = ra.session_id
    where ra.session_id = p_session_id
      and ra.user_id = auth.uid()
      and s.is_active = true
      and (p_area is null or ra.area_name = '__all__' or ra.area_name = p_area)
  );
$$;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table sessions enable row level security;
alter table staff_access enable row level security;
alter table customer_access enable row level security;
alter table rider_access enable row level security;
alter table orders enable row level security;
alter table alerts enable row level security;
alter table menu_items enable row level security;
alter table delivery_areas enable row level security;
alter table deals enable row level security;
alter table activation_codes enable row level security;

-- Sessions: public QR resolution is via RPC only. Staff can see/update own active session.
drop policy if exists sessions_read on sessions;
drop policy if exists sessions_insert on sessions;
drop policy if exists sessions_update on sessions;
create policy sessions_staff_select on sessions for select to authenticated using (is_staff_for_session(id));
create policy sessions_staff_update on sessions for update to authenticated using (is_staff_for_session(id)) with check (is_staff_for_session(id));

-- Access tables are not publicly enumerable.
drop policy if exists staff_access_select on staff_access;
drop policy if exists staff_access_modify on staff_access;
create policy staff_access_select on staff_access for select to authenticated using (user_id = auth.uid());

drop policy if exists customer_access_select on customer_access;
create policy customer_access_select on customer_access for select to authenticated using (user_id = auth.uid());

drop policy if exists rider_access_select on rider_access;
create policy rider_access_select on rider_access for select to authenticated using (user_id = auth.uid());

-- Menu / deals / areas: staff can manage own session; customer can read active session.
drop policy if exists menu_items_all on menu_items;
create policy menu_items_select on menu_items for select to authenticated using (is_staff_for_session(session_id) or exists (select 1 from customer_access ca where ca.session_id = menu_items.session_id and ca.user_id = auth.uid()));
create policy menu_items_staff_insert on menu_items for insert to authenticated with check (is_staff_for_session(session_id));
create policy menu_items_staff_update on menu_items for update to authenticated using (is_staff_for_session(session_id)) with check (is_staff_for_session(session_id));
create policy menu_items_staff_delete on menu_items for delete to authenticated using (is_staff_for_session(session_id));

drop policy if exists deals_all on deals;
create policy deals_select on deals for select to authenticated using (is_staff_for_session(session_id) or exists (select 1 from customer_access ca where ca.session_id = deals.session_id and ca.user_id = auth.uid()));
create policy deals_staff_insert on deals for insert to authenticated with check (is_staff_for_session(session_id));
create policy deals_staff_update on deals for update to authenticated using (is_staff_for_session(session_id)) with check (is_staff_for_session(session_id));
create policy deals_staff_delete on deals for delete to authenticated using (is_staff_for_session(session_id));

drop policy if exists delivery_areas_all on delivery_areas;
create policy delivery_areas_select on delivery_areas for select to authenticated using (is_staff_for_session(session_id) or exists (select 1 from customer_access ca where ca.session_id = delivery_areas.session_id and ca.user_id = auth.uid()));
create policy delivery_areas_staff_insert on delivery_areas for insert to authenticated with check (is_staff_for_session(session_id));
create policy delivery_areas_staff_update on delivery_areas for update to authenticated using (is_staff_for_session(session_id)) with check (is_staff_for_session(session_id));
create policy delivery_areas_staff_delete on delivery_areas for delete to authenticated using (is_staff_for_session(session_id));

-- Orders: staff see/manage whole restaurant shift; customers only see their own table/order identity; riders see delivery orders for their QR area.
drop policy if exists orders_all on orders;
create policy orders_select on orders for select to authenticated using (
  is_staff_for_session(session_id)
  or (customer_user_id = auth.uid() and is_customer_for_table(session_id, table_id))
  or (fulfillment = 'delivery' and is_rider_for_session(session_id, area_name))
);
create policy orders_staff_update on orders for update to authenticated using (is_staff_for_session(session_id)) with check (is_staff_for_session(session_id));

-- Alerts: customers create through RPC; staff read/resolve their own shift.
drop policy if exists alerts_all on alerts;
create policy alerts_staff_select on alerts for select to authenticated using (is_staff_for_session(session_id));
create policy alerts_staff_update on alerts for update to authenticated using (is_staff_for_session(session_id)) with check (is_staff_for_session(session_id));

-- Activation codes are never readable/writable from the browser.
-- No activation_codes policies are intentionally created.

-- ------------------------------------------------------------
-- RPC: STAFF LOGIN / SHIFT CREATION / SHIFT RESUME
-- ------------------------------------------------------------
create or replace function staff_login(
  p_restaurant_name text,
  p_pin text,
  p_activation_code text default '',
  p_tab_secret text default '',
  p_silent boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
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
    return jsonb_build_object('ok', true, 'session', to_jsonb(v_active) - 'pin_hash', 'resumed', false, 'reclaimed', true);
  end if;

  select * into v_old from sessions where restaurant_id = v_restaurant_id order by created_at desc limit 1;

  if p_silent then
    return jsonb_build_object('ok', false, 'code', 'SILENT_RESUME_FAILED');
  end if;

  if found then
    if v_old.pin_hash is null or crypt(p_pin, v_old.pin_hash) <> v_old.pin_hash then
      raise exception 'INVALID_PIN';
    end if;
    insert into sessions(restaurant_id,restaurant_name,pin_hash,qr_secret,rider_secret,is_active,shift_started_at,last_seen_at,logo_url,theme,tax_percent,tax_label)
    values(v_old.restaurant_id,v_old.restaurant_name,crypt(p_pin,gen_salt('bf',10)),v_old.qr_secret,v_old.rider_secret,true,v_now,v_now,v_old.logo_url,v_old.theme,v_old.tax_percent,v_old.tax_label)
    returning * into v_new;

    insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_new.id,v_uid,p_tab_secret,v_now);

    insert into menu_items(session_id,category,name,price,photo_url,badge,is_available,sort_order)
      select v_new.id,category,name,price,photo_url,badge,is_available,sort_order from menu_items where session_id=v_old.id;
    insert into delivery_areas(session_id,name,charge)
      select v_new.id,name,charge from delivery_areas where session_id=v_old.id;
    insert into deals(session_id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order)
      select v_new.id,name,description,price,original_price,photo_url,is_active,valid_from,valid_until,mood_tags,sort_order from deals where session_id=v_old.id;

    return jsonb_build_object('ok', true, 'session', to_jsonb(v_new) - 'pin_hash', 'new_shift', true);
  end if;

  select * into v_code from activation_codes where upper(trim(code)) = upper(trim(coalesce(p_activation_code,''))) and is_used=false for update;
  if not found then raise exception 'INVALID_ACTIVATION_CODE'; end if;

  insert into sessions(restaurant_id,restaurant_name,pin_hash,is_active,shift_started_at,last_seen_at,tax_percent,tax_label)
  values(v_restaurant_id,trim(p_restaurant_name),crypt(p_pin,gen_salt('bf',10)),true,v_now,v_now,0,'Tax')
  returning * into v_new;

  update activation_codes set is_used=true, used_by=v_restaurant_id where id=v_code.id;
  insert into staff_access(session_id,user_id,tab_secret,last_seen_at) values(v_new.id,v_uid,p_tab_secret,v_now);

  return jsonb_build_object('ok', true, 'session', to_jsonb(v_new) - 'pin_hash', 'new_restaurant', true);
exception
  when unique_violation then
    raise exception 'RESTAURANT_ALREADY_ACTIVE';
end;
$$;

-- ------------------------------------------------------------
-- RPC: STAFF RESUME (same tab refresh, no PIN stored in browser)
-- ------------------------------------------------------------
create or replace function staff_resume(p_tab_secret text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_access staff_access%rowtype; v_session sessions%rowtype;
begin
  if v_uid is null or length(trim(coalesce(p_tab_secret,'')))<16 then return jsonb_build_object('ok',false); end if;
  select * into v_access from staff_access where user_id=v_uid and tab_secret=p_tab_secret limit 1;
  if not found then return jsonb_build_object('ok',false); end if;
  select * into v_session from sessions where id=v_access.session_id and is_active=true;
  if not found then delete from staff_access where id=v_access.id; return jsonb_build_object('ok',false); end if;
  update staff_access set last_seen_at=now() where id=v_access.id;
  update sessions set last_seen_at=now() where id=v_session.id;
  select * into v_session from sessions where id=v_session.id;
  return jsonb_build_object('ok',true,'session',to_jsonb(v_session)-'pin_hash');
end;
$$;

-- ------------------------------------------------------------
-- RPC: CUSTOMER QR BOOTSTRAP
-- ------------------------------------------------------------
create or replace function customer_bootstrap(p_restaurant_id text, p_qr_secret text, p_table_id text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
  v_table text := trim(p_table_id);
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(v_table) < 1 or length(v_table) > 80 then raise exception 'Invalid table'; end if;
  select * into v_session from sessions where restaurant_id=trim(p_restaurant_id) and qr_secret=trim(p_qr_secret) and is_active=true limit 1;
  if not found then raise exception 'INVALID_QR'; end if;

  insert into customer_access(session_id,user_id,table_id,last_seen_at)
  values(v_session.id,v_uid,v_table,now())
  on conflict(session_id,user_id,table_id) do update set last_seen_at=now();

  return jsonb_build_object('id',v_session.id,'restaurant_name',v_session.restaurant_name,'logo_url',v_session.logo_url,'theme',v_session.theme,'tax_percent',v_session.tax_percent,'tax_label',v_session.tax_label,'is_active',v_session.is_active);
end;
$$;

-- ------------------------------------------------------------
-- RPC: CUSTOMER ORDER / ALERTS / COMPLETION / RATING
-- ------------------------------------------------------------
create or replace function place_customer_order(
  p_session_id uuid,
  p_table_id text,
  p_items jsonb,
  p_note text default '',
  p_fulfillment text default null,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_customer_address text default null,
  p_area_name text default null
) returns orders
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
  v_item jsonb;
  v_id uuid;
  v_qty int;
  v_price numeric(10,2);
  v_name text;
  v_type text;
  v_items jsonb := '[]'::jsonb;
  v_subtotal numeric(10,2) := 0;
  v_tax numeric(10,2) := 0;
  v_delivery numeric(10,2) := 0;
  v_total numeric(10,2) := 0;
  v_area_charge numeric(10,2);
  v_order orders%rowtype;
  v_count int;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from sessions where id=p_session_id and is_active=true;
  if not found or not exists(select 1 from customer_access where session_id=p_session_id and table_id=trim(p_table_id) and user_id=v_uid) then raise exception 'Customer session expired'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 30 then raise exception 'Invalid order items'; end if;
  if length(coalesce(p_note,'')) > 1000 then raise exception 'Note too long'; end if;
  if p_fulfillment not in ('delivery','takeaway') and p_fulfillment is not null then raise exception 'Invalid fulfillment'; end if;
  if p_fulfillment='delivery' and lower(trim(p_table_id)) <> 'takeaway' then raise exception 'Delivery is only available from takeaway QR'; end if;
  if p_fulfillment='takeaway' and lower(trim(p_table_id)) <> 'takeaway' then raise exception 'Invalid takeaway order'; end if;

  select count(*) into v_count from orders where customer_user_id=v_uid and created_at > now()-interval '60 seconds';
  if v_count >= 5 then raise exception 'RATE_LIMIT'; end if;
  select count(*) into v_count from orders where session_id=p_session_id and table_id=trim(p_table_id) and created_at > now()-interval '60 seconds';
  if v_count >= 5 then raise exception 'RATE_LIMIT'; end if;

  if p_fulfillment='delivery' then
    if coalesce(trim(p_customer_name),'')='' or coalesce(trim(p_customer_phone),'')='' or coalesce(trim(p_customer_address),'')='' or coalesce(trim(p_area_name),'')='' then raise exception 'Delivery details required'; end if;
    select charge into v_area_charge from delivery_areas where session_id=p_session_id and name=trim(p_area_name);
    if not found then raise exception 'Invalid delivery area'; end if;
    v_delivery := coalesce(v_area_charge,0);
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := greatest(0, least(coalesce((v_item->>'qty')::int,0), 20));
    if v_qty < 1 then raise exception 'Invalid quantity'; end if;
    v_type := coalesce(v_item->>'type','item');

    if v_type='deal' then
      begin v_id := (v_item->>'id')::uuid; exception when others then raise exception 'Invalid deal'; end;
      select name, price into v_name, v_price from deals where id=v_id and session_id=p_session_id and is_active=true and (valid_from is null or valid_from <= current_date) and (valid_until is null or valid_until >= current_date);
      if not found then raise exception 'Deal unavailable'; end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object('id',v_id,'name',v_name,'price',v_price,'qty',v_qty,'type','deal'));
    else
      begin v_id := (v_item->>'id')::uuid; exception when others then raise exception 'Invalid menu item'; end;
      select name, price into v_name, v_price from menu_items where id=v_id and session_id=p_session_id and is_available=true;
      if not found then raise exception 'Menu item unavailable'; end if;
      v_items := v_items || jsonb_build_array(jsonb_build_object('id',v_id,'name',v_name,'price',v_price,'qty',v_qty));
    end if;
    v_subtotal := v_subtotal + (v_price * v_qty);
  end loop;

  v_tax := round(v_subtotal * coalesce(v_session.tax_percent,0) / 100, 2);
  v_total := v_subtotal + v_tax + v_delivery;

  insert into orders(session_id,table_id,items,note,total,delivery_charge,status,fulfillment,customer_name,customer_phone,customer_address,area_name,customer_user_id)
  values(p_session_id,trim(p_table_id),v_items,coalesce(p_note,''),v_total,v_delivery,'pending',p_fulfillment,nullif(trim(p_customer_name),''),nullif(trim(p_customer_phone),''),nullif(trim(p_customer_address),''),nullif(trim(p_area_name),''),v_uid)
  returning * into v_order;
  return v_order;
end;
$$;

create or replace function customer_raise_alert(p_session_id uuid, p_table_id text, p_type text)
returns alerts language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_uid uuid:=auth.uid(); v_row alerts%rowtype; v_count int;
begin
  if v_uid is null or not exists(select 1 from customer_access where session_id=p_session_id and table_id=trim(p_table_id) and user_id=v_uid) then raise exception 'Customer session expired'; end if;
  if p_type not in ('water','waiter') then raise exception 'Invalid alert'; end if;
  select count(*) into v_count from alerts where session_id=p_session_id and table_id=trim(p_table_id) and created_at>now()-interval '60 seconds';
  if v_count >= 5 then raise exception 'RATE_LIMIT'; end if;
  insert into alerts(session_id,table_id,type) values(p_session_id,trim(p_table_id),p_type) returning * into v_row;
  return v_row;
end;
$$;

create or replace function customer_mark_served(p_order_id uuid)
returns orders language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row orders%rowtype;
begin
  update orders set status='served' where id=p_order_id and customer_user_id=auth.uid() and status in ('pending','cooking') returning * into v_row;
  if not found then raise exception 'Order cannot be completed'; end if;
  return v_row;
end;
$$;

create or replace function customer_rate_order(p_order_id uuid, p_rating int)
returns orders language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_row orders%rowtype;
begin
  if p_rating < 1 or p_rating > 5 then raise exception 'Invalid rating'; end if;
  update orders set rating=p_rating where id=p_order_id and customer_user_id=auth.uid() and status='served' returning * into v_row;
  if not found then raise exception 'Order not found'; end if;
  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- RPC: RIDER QR BOOTSTRAP + GPS
-- ------------------------------------------------------------
create or replace function rider_bootstrap(p_restaurant_id text, p_rider_secret text, p_area_name text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid:=auth.uid(); v_session sessions%rowtype; v_area text:=trim(p_area_name);
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from sessions where restaurant_id=trim(p_restaurant_id) and rider_secret=trim(p_rider_secret) and is_active=true limit 1;
  if not found then raise exception 'INVALID_QR'; end if;
  if length(v_area)<1 or length(v_area)>80 then raise exception 'Invalid area'; end if;
  insert into rider_access(session_id,user_id,area_name) values(v_session.id,v_uid,v_area) on conflict(session_id,user_id,area_name) do nothing;
  return jsonb_build_object('id',v_session.id,'restaurant_name',v_session.restaurant_name,'logo_url',v_session.logo_url,'theme',v_session.theme,'area_name',v_area);
end;
$$;

create or replace function rider_update_location(p_order_id uuid, p_lat double precision, p_lng double precision)
returns orders language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row orders%rowtype;
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then raise exception 'Invalid GPS'; end if;
  update orders set rider_lat=p_lat,rider_lng=p_lng where id=p_order_id and fulfillment='delivery' and status in ('pending','cooking') and is_rider_for_session(session_id,area_name) returning * into v_row;
  return v_row;
end;
$$;

-- ------------------------------------------------------------
-- RPC: STAFF HEARTBEAT / LOGOUT
-- ------------------------------------------------------------
create or replace function staff_heartbeat(p_session_id uuid, p_tab_secret text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update staff_access set last_seen_at=now() where session_id=p_session_id and user_id=auth.uid() and tab_secret=p_tab_secret;
  if not found then return false; end if;
  update sessions set last_seen_at=now() where id=p_session_id and is_active=true;
  return true;
end;
$$;

create or replace function staff_logout(p_session_id uuid, p_tab_secret text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from staff_access where session_id=p_session_id and user_id=auth.uid() and tab_secret=p_tab_secret;
  return found;
end;
$$;

-- ------------------------------------------------------------
-- RPC EXECUTE PERMISSIONS
-- ------------------------------------------------------------
revoke all on function staff_login(text,text,text,text,boolean) from public;
revoke all on function staff_resume(text) from public;
revoke all on function customer_bootstrap(text,text,text) from public;
revoke all on function place_customer_order(uuid,text,jsonb,text,text,text,text,text,text) from public;
revoke all on function customer_raise_alert(uuid,text,text) from public;
revoke all on function customer_mark_served(uuid) from public;
revoke all on function customer_rate_order(uuid,int) from public;
revoke all on function rider_bootstrap(text,text,text) from public;
revoke all on function rider_update_location(uuid,double precision,double precision) from public;
revoke all on function staff_heartbeat(uuid,text) from public;
revoke all on function staff_logout(uuid,text) from public;
grant execute on function staff_login(text,text,text,text,boolean) to authenticated;
grant execute on function staff_resume(text) to authenticated;
grant execute on function customer_bootstrap(text,text,text) to authenticated;
grant execute on function place_customer_order(uuid,text,jsonb,text,text,text,text,text,text) to authenticated;
grant execute on function customer_raise_alert(uuid,text,text) to authenticated;
grant execute on function customer_mark_served(uuid) to authenticated;
grant execute on function customer_rate_order(uuid,int) to authenticated;
grant execute on function rider_bootstrap(text,text,text) to authenticated;
grant execute on function rider_update_location(uuid,double precision,double precision) to authenticated;
grant execute on function staff_heartbeat(uuid,text) to authenticated;
grant execute on function staff_logout(uuid,text) to authenticated;

-- ------------------------------------------------------------
-- REALTIME
-- ------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table alerts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table menu_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table deals; exception when duplicate_object then null; end;
end $$;

-- ------------------------------------------------------------
-- STORAGE
-- ------------------------------------------------------------
insert into storage.buckets (id,name,public) values ('restaurant-logos','restaurant-logos',true) on conflict (id) do update set public=true;
insert into storage.buckets (id,name,public) values ('menu-photos','menu-photos',true) on conflict (id) do update set public=true;

drop policy if exists menu_photo_public_read on storage.objects;
drop policy if exists menu_photo_public_upload on storage.objects;
drop policy if exists menu_photo_public_update on storage.objects;
drop policy if exists logo_public_read on storage.objects;
drop policy if exists logo_public_upload on storage.objects;
drop policy if exists logo_public_update on storage.objects;
drop policy if exists "Public logo read" on storage.objects;
drop policy if exists "Staff logo upload" on storage.objects;
drop policy if exists "Staff logo update" on storage.objects;
drop policy if exists "Staff logo delete" on storage.objects;
drop policy if exists "Public menu photo read" on storage.objects;
drop policy if exists "Staff menu photo upload" on storage.objects;
drop policy if exists "Staff menu photo update" on storage.objects;
drop policy if exists "Staff menu photo delete" on storage.objects;

create policy "Public logo read" on storage.objects for select to public using (bucket_id='restaurant-logos');
create policy "Public menu photo read" on storage.objects for select to public using (bucket_id='menu-photos');
create policy "Staff logo upload" on storage.objects for insert to authenticated with check (bucket_id='restaurant-logos' and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' then is_staff_for_session(((storage.foldername(name))[1])::uuid) else false end);
create policy "Staff logo update" on storage.objects for update to authenticated using (bucket_id='restaurant-logos' and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' then is_staff_for_session(((storage.foldername(name))[1])::uuid) else false end) with check (bucket_id='restaurant-logos' and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' then is_staff_for_session(((storage.foldername(name))[1])::uuid) else false end);
create policy "Staff logo delete" on storage.objects for delete to authenticated using (bucket_id='restaurant-logos' and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' then is_staff_for_session(((storage.foldername(name))[1])::uuid) else false end);
create policy "Staff menu photo upload" on storage.objects for insert to authenticated with check (bucket_id='menu-photos' and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' then is_staff_for_session(((storage.foldername(name))[1])::uuid) else false end);
create policy "Staff menu photo update" on storage.objects for update to authenticated using (bucket_id='menu-photos' and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' then is_staff_for_session(((storage.foldername(name))[1])::uuid) else false end) with check (bucket_id='menu-photos' and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' then is_staff_for_session(((storage.foldername(name))[1])::uuid) else false end);
create policy "Staff menu photo delete" on storage.objects for delete to authenticated using (bucket_id='menu-photos' and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' then is_staff_for_session(((storage.foldername(name))[1])::uuid) else false end);
