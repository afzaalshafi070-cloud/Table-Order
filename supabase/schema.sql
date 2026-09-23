-- ============================================================
-- Table Order SaaS — aligned production/demo schema
-- Run in Supabase SQL Editor.
-- This script is intentionally migration-friendly: it adds the
-- fields required by the current React app and removes the old
-- one-session-per-restaurant unique constraint.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- SESSIONS / SHIFTS
-- ------------------------------------------------------------
create table if not exists sessions (
  id                uuid primary key default gen_random_uuid(),
  restaurant_id     text not null,
  restaurant_name   text not null,
  pin               text not null,
  qr_secret         text not null default encode(gen_random_bytes(16), 'hex'),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  shift_started_at  timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  closed_at         timestamptz,
  logo_url          text,
  theme             jsonb not null default '{}'::jsonb,
  tax_percent       numeric(6,2) not null default 0,
  tax_label         text not null default 'Tax'
);

alter table sessions add column if not exists qr_secret text;
alter table sessions add column if not exists shift_started_at timestamptz;
alter table sessions add column if not exists last_seen_at timestamptz;
alter table sessions add column if not exists tax_percent numeric(6,2);
alter table sessions add column if not exists tax_label text;
alter table sessions add column if not exists logo_url text;
alter table sessions add column if not exists theme jsonb;

update sessions
set qr_secret = encode(gen_random_bytes(16), 'hex')
where qr_secret is null or trim(qr_secret) = '';

update sessions
set shift_started_at = coalesce(shift_started_at, created_at, now());

update sessions
set last_seen_at = coalesce(last_seen_at, created_at, now());

update sessions
set tax_percent = coalesce(tax_percent, 0),
    tax_label = coalesce(nullif(tax_label, ''), 'Tax'),
    theme = coalesce(theme, '{}'::jsonb);

alter table sessions alter column qr_secret set default encode(gen_random_bytes(16), 'hex');
alter table sessions alter column qr_secret set not null;
alter table sessions alter column shift_started_at set default now();
alter table sessions alter column shift_started_at set not null;
alter table sessions alter column tax_percent set default 0;
alter table sessions alter column tax_percent set not null;
alter table sessions alter column tax_label set default 'Tax';
alter table sessions alter column tax_label set not null;
alter table sessions alter column theme set default '{}'::jsonb;
alter table sessions alter column theme set not null;

-- The old schema had UNIQUE (restaurant_id, pin), which prevented
-- a closed shift from being followed by a new shift with the same PIN.
alter table sessions drop constraint if exists sessions_restaurant_id_pin_key;
create unique index if not exists sessions_one_active_shift_idx
  on sessions (restaurant_id, pin)
  where is_active = true;
-- QR secret is permanent for a restaurant across shifts. Closed shifts may
-- share the same secret; only the currently active session must be unique.
drop index if exists sessions_qr_secret_idx;
create unique index if not exists sessions_qr_secret_active_idx
  on sessions (qr_secret)
  where is_active = true;
create index if not exists idx_sessions_restaurant_pin on sessions(restaurant_id, pin);

-- ------------------------------------------------------------
-- ORDERS
-- ------------------------------------------------------------
create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references sessions(id) on delete cascade,
  table_id          text not null,
  items             jsonb not null,
  note              text default '',
  total             numeric(10,2) not null default 0,
  delivery_charge   numeric(10,2) not null default 0,
  status            text not null default 'pending',
  fulfillment       text,
  customer_name     text,
  customer_phone    text,
  customer_address  text,
  area_name         text,
  rating            int,
  rider_lat         double precision,
  rider_lng         double precision,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
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
alter table orders add column if not exists updated_at timestamptz;

update orders set delivery_charge = coalesce(delivery_charge, 0);
update orders set updated_at = coalesce(updated_at, created_at, now());

alter table orders alter column delivery_charge set default 0;
alter table orders alter column delivery_charge set not null;
alter table orders alter column updated_at set default now();
alter table orders alter column updated_at set not null;

-- ------------------------------------------------------------
-- DELIVERY AREAS
-- ------------------------------------------------------------
create table if not exists delivery_areas (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  name        text not null,
  charge      numeric(10,2) not null default 0,
  created_at  timestamptz not null default now()
);

alter table delivery_areas add column if not exists charge numeric(10,2);
update delivery_areas set charge = coalesce(charge, 0);
alter table delivery_areas alter column charge set default 0;
alter table delivery_areas alter column charge set not null;
create index if not exists idx_delivery_areas_session on delivery_areas(session_id);
create unique index if not exists delivery_areas_session_name_idx on delivery_areas(session_id, lower(name));

-- ------------------------------------------------------------
-- ALERTS
-- ------------------------------------------------------------
create table if not exists alerts (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  table_id    text not null,
  type        text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- MENU
-- ------------------------------------------------------------
create table if not exists menu_items (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  category      text not null,
  name          text not null,
  price         numeric(10,2) not null default 0,
  photo_url     text,
  badge         text,
  is_available  boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_orders_session on orders(session_id);
create index if not exists idx_orders_delivery_area on orders(session_id, fulfillment, area_name, status);
create index if not exists idx_alerts_session on alerts(session_id);
create index if not exists idx_menu_items_session on menu_items(session_id);

-- ------------------------------------------------------------
-- UPDATED_AT
-- ------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_touch on orders;
create trigger trg_orders_touch before update on orders
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------
-- ACTIVATION CODES
-- ------------------------------------------------------------
create table if not exists activation_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  is_used    boolean not null default false,
  used_by    text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- RLS
-- NOTE: This remains anon/demo-friendly because the current app uses
-- the Supabase anon client directly. Tight production authorization
-- should be added later through server-side verification / Edge Functions.
-- ------------------------------------------------------------
alter table sessions enable row level security;
alter table orders enable row level security;
alter table alerts enable row level security;
alter table menu_items enable row level security;
alter table delivery_areas enable row level security;
alter table activation_codes enable row level security;

drop policy if exists sessions_read on sessions;
drop policy if exists sessions_insert on sessions;
drop policy if exists sessions_update on sessions;
create policy sessions_read on sessions for select using (true);
create policy sessions_insert on sessions for insert with check (true);
create policy sessions_update on sessions for update using (true) with check (true);

drop policy if exists orders_all on orders;
create policy orders_all on orders for all using (true) with check (true);

drop policy if exists alerts_all on alerts;
create policy alerts_all on alerts for all using (true) with check (true);

drop policy if exists menu_items_all on menu_items;
create policy menu_items_all on menu_items for all using (true) with check (true);

drop policy if exists delivery_areas_all on delivery_areas;
create policy delivery_areas_all on delivery_areas for all using (true) with check (true);

drop policy if exists activation_codes_read on activation_codes;
drop policy if exists activation_codes_update on activation_codes;
create policy activation_codes_read on activation_codes for select using (true);
create policy activation_codes_update on activation_codes for update using (true) with check (true);

-- ------------------------------------------------------------
-- REALTIME
-- ------------------------------------------------------------
do $$
begin
  begin alter publication supabase_realtime add table sessions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table alerts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table menu_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table delivery_areas; exception when duplicate_object then null; end;
end $$;

-- ------------------------------------------------------------
-- STORAGE
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu-photos', 'menu-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('restaurant-logos', 'restaurant-logos', true)
on conflict (id) do nothing;

drop policy if exists menu_photo_public_read on storage.objects;
drop policy if exists menu_photo_public_upload on storage.objects;
drop policy if exists menu_photo_public_update on storage.objects;
create policy menu_photo_public_read on storage.objects for select using (bucket_id = 'menu-photos');
create policy menu_photo_public_upload on storage.objects for insert with check (bucket_id = 'menu-photos');
create policy menu_photo_public_update on storage.objects for update using (bucket_id = 'menu-photos');

drop policy if exists logo_public_read on storage.objects;
drop policy if exists logo_public_upload on storage.objects;
drop policy if exists logo_public_update on storage.objects;
create policy logo_public_read on storage.objects for select using (bucket_id = 'restaurant-logos');
create policy logo_public_upload on storage.objects for insert with check (bucket_id = 'restaurant-logos');
create policy logo_public_update on storage.objects for update using (bucket_id = 'restaurant-logos');

-- ------------------------------------------------------------
-- DEALS / COMBOS
-- ------------------------------------------------------------
create table if not exists deals (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  name            text not null,
  description     text not null default '',
  price           numeric(10,2) not null default 0,
  original_price  numeric(10,2),
  photo_url       text,
  is_active       boolean not null default true,
  valid_from      date,
  valid_until     date,
  mood_tags       text not null default '',
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_deals_session on deals(session_id);

alter table deals enable row level security;
drop policy if exists deals_all on deals;
create policy deals_all on deals for all using (true) with check (true);

do $$
begin
  begin alter publication supabase_realtime add table deals; exception when duplicate_object then null; end;
end $$;
