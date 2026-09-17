-- ============================================================
-- Table Order SaaS — Supabase schema
-- Run this in the Supabase SQL editor (or via `supabase db push`)
-- ============================================================

create extension if not exists "pgcrypto";

-- One row per active "room": a restaurant's counter opens a session
-- with a secret PIN. Customers and staff both scope all reads/writes
-- to a session_id derived from (restaurant_id, pin).
create table if not exists sessions (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  text not null,        -- url-safe slug, e.g. "cafe-noor"
  restaurant_name text not null,
  pin            text not null,        -- secret room PIN staff share with the QR code
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  closed_at      timestamptz,
  logo_url       text,                  -- public URL of the uploaded restaurant logo
  theme          jsonb default '{}'::jsonb, -- auto-extracted brand palette, see src/utils/theme.js
  unique (restaurant_id, pin)
);

create table if not exists orders (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  table_id     text not null,
  items        jsonb not null,         -- [{ name, price, qty }]
  note         text default '',
  total        numeric(10,2) not null default 0,
  status       text not null default 'pending', -- pending | cooking | served | cancelled
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists alerts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  table_id     text not null,
  type         text not null,          -- water | waiter
  resolved     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Each restaurant's own editable menu: items, prices, photos, availability.
create table if not exists menu_items (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  category     text not null,
  name         text not null,
  price        numeric(10,2) not null default 0,
  photo_url    text,
  badge        text,                  -- optional label like "Chef Special", "Best Seller"
  is_available boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists idx_orders_session on orders(session_id);
create index if not exists idx_alerts_session on alerts(session_id);
create index if not exists idx_menu_items_session on menu_items(session_id);

-- Keep updated_at fresh on status changes
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
-- Row Level Security
-- Demo-friendly policy: anyone holding the anon key can read/write.
-- The PIN itself is the access control (like a Wi-Fi password).
-- For real production use, tighten this further (e.g. verify PIN
-- server-side via an Edge Function before issuing a scoped token).
-- ------------------------------------------------------------
alter table sessions   enable row level security;
alter table orders     enable row level security;
alter table alerts     enable row level security;
alter table menu_items enable row level security;

create policy "sessions_read" on sessions for select using (true);
create policy "sessions_insert" on sessions for insert with check (true);
create policy "sessions_update" on sessions for update using (true);

create policy "orders_all" on orders for all using (true) with check (true);
create policy "alerts_all" on alerts for all using (true) with check (true);
create policy "menu_items_all" on menu_items for all using (true) with check (true);

-- ------------------------------------------------------------
-- Enable Realtime on these tables (Supabase dashboard: Database
-- > Replication, or run this if using the CLI-managed publication)
-- ------------------------------------------------------------
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table alerts;
alter publication supabase_realtime add table sessions;
alter publication supabase_realtime add table menu_items;

-- ------------------------------------------------------------
-- Storage bucket for menu item photos (separate from logos so
-- each can be managed/cleared independently).
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu-photos', 'menu-photos', true)
on conflict (id) do nothing;

create policy "menu_photo_public_read" on storage.objects
  for select using (bucket_id = 'menu-photos');

create policy "menu_photo_public_upload" on storage.objects
  for insert with check (bucket_id = 'menu-photos');

create policy "menu_photo_public_update" on storage.objects
  for update using (bucket_id = 'menu-photos');

-- ------------------------------------------------------------
-- Storage bucket for restaurant logos.
-- Public bucket: logos need to be readable (no auth) by every
-- customer's phone, and readable cross-origin so the browser can
-- sample pixels off the image to auto-extract the color palette.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('restaurant-logos', 'restaurant-logos', true)
on conflict (id) do nothing;

create policy "logo_public_read" on storage.objects
  for select using (bucket_id = 'restaurant-logos');

create policy "logo_public_upload" on storage.objects
  for insert with check (bucket_id = 'restaurant-logos');

create policy "logo_public_update" on storage.objects
  for update using (bucket_id = 'restaurant-logos');

-- ------------------------------------------------------------
-- Gatekeeps brand-new restaurant signups: a code must exist and be
-- unused before a first-time login can create a new session. Add rows
-- here yourself (Table Editor) whenever you sell the product to a new
-- restaurant. Existing restaurants logging back in never touch this
-- table. (Already created manually in production — this block is here
-- so a fresh project setup includes it automatically.)
-- ------------------------------------------------------------
create table if not exists activation_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  is_used    boolean not null default false,
  used_by    text,
  created_at timestamptz not null default now()
);

alter table activation_codes enable row level security;
create policy "allow_read" on activation_codes for select using (true);
create policy "allow_update" on activation_codes for update using (true) with check (true);
