-- Run once in Supabase → SQL Editor → Run

create table if not exists delivery_areas (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table delivery_areas enable row level security;

drop policy if exists "delivery_areas_all" on delivery_areas;
create policy "delivery_areas_all" on delivery_areas for all using (true) with check (true);

alter table orders add column if not exists fulfillment text;
alter table orders add column if not exists area_name text;
alter table orders add column if not exists customer_name text;
alter table orders add column if not exists customer_phone text;
alter table orders add column if not exists customer_address text;

create index if not exists idx_orders_fulfillment on orders(session_id, fulfillment);
create index if not exists idx_delivery_areas_session on delivery_areas(session_id);
