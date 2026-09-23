-- Run this once in Supabase SQL Editor (for existing projects)
-- Adds Deals / Combos table used by Menu Editor + Customer Portal

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
