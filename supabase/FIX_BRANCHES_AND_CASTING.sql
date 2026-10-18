-- ============================================================
-- FIX_BRANCHES_AND_CASTING.sql
-- ============================================================
-- Purpose
--   1. Branches (Admin Panel → "Branch Requests"): makes sure the branch
--      tables and admin RPCs exist, with the same definitions as
--      FINAL_PRODUCTION_2026_10_08.sql, so the Admin tab does not error if
--      that file was only partly applied or the API schema cache is stale.
--   2. Branches security: enables RLS on restaurant_branches and
--      branch_requests. Both were previously readable/writable by anyone
--      holding the public anon key. The app only touches them through
--      SECURITY DEFINER RPCs, which bypass RLS, so nothing else changes.
--   3. Costing: fixes get_menu_profit_overview so items WITHOUT a recipe are
--      reported as NO_RECIPE instead of showing COGS 0 / HEALTHY.
--   4. Reloads the PostgREST schema cache so new/changed RPCs are visible.
--
-- Safety
--   * Every statement is idempotent (IF NOT EXISTS / CREATE OR REPLACE /
--     DROP POLICY IF EXISTS). Safe to run more than once.
--   * No data is deleted or modified. No column is dropped.
--   * Wrapped in a transaction: if anything fails, nothing is applied.
--
-- Prerequisites (already in your project)
--   * FINAL_ADMIN_AND_PRODUCTION_PATCH.sql  (provides _admin_assert, restaurant_plans)
--   * COSTING_AND_INVENTORY_MIGRATION.sql   (provides recipes, calculate_recipe_cogs, etc.)
--   * FINAL_PRODUCTION_2026_10_08.sql       (provides sessions.branch_id, staff branch RPCs)
--
-- How to run: see the instructions in the README / changelog (Supabase SQL Editor).
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0. PREFLIGHT: fail with a clear message if prerequisites are missing
-- ------------------------------------------------------------
do $$
begin
  if to_regprocedure('_admin_assert(text)') is null then
    raise exception 'PREREQ_MISSING: run FINAL_ADMIN_AND_PRODUCTION_PATCH.sql first (_admin_assert not found)';
  end if;
  if to_regclass('public.restaurant_plans') is null then
    raise exception 'PREREQ_MISSING: restaurant_plans table not found';
  end if;
  if to_regclass('public.recipes') is null then
    raise exception 'PREREQ_MISSING: run COSTING_AND_INVENTORY_MIGRATION.sql first (recipes table not found)';
  end if;
  if to_regclass('public.sessions') is null then
    raise exception 'PREREQ_MISSING: sessions table not found';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. BRANCH TABLES (safe to re-run; never drops data)
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
  unique (restaurant_id, branch_name)
);
create index if not exists idx_restaurant_branches_restaurant
  on restaurant_branches (restaurant_id, is_active);

create table if not exists branch_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  requested_by_session_id uuid references sessions(id) on delete set null,
  branch_name text not null,
  area text,
  address text,
  phone text,
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_branch_id uuid references restaurant_branches(id) on delete set null
);
create index if not exists idx_branch_requests_status
  on branch_requests (status, requested_at desc);

-- Column that the sessions flow uses (no-op if it already exists).
alter table sessions add column if not exists branch_id uuid;

-- ------------------------------------------------------------
-- 2. RLS: lock direct table access (RPCs still work — they are SECURITY DEFINER)
-- ------------------------------------------------------------
alter table restaurant_branches enable row level security;
alter table branch_requests enable row level security;

drop policy if exists restaurant_branches_deny_all on restaurant_branches;
create policy restaurant_branches_deny_all on restaurant_branches
  for all to anon, authenticated using (false) with check (false);

drop policy if exists branch_requests_deny_all on branch_requests;
create policy branch_requests_deny_all on branch_requests
  for all to anon, authenticated using (false) with check (false);

-- ------------------------------------------------------------
-- 3. ADMIN BRANCH RPCs (same logic as FINAL_PRODUCTION_2026_10_08.sql)
-- ------------------------------------------------------------
create or replace function admin_list_branch_requests(p_admin_key text, p_status text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _admin_assert(p_admin_key);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id,
      'restaurant_id', q.restaurant_id,
      'restaurant_name', coalesce(r.restaurant_name, q.restaurant_id),
      'branch_name', q.branch_name,
      'area', q.area,
      'address', q.address,
      'phone', q.phone,
      'notes', q.notes,
      'status', q.status,
      'admin_note', q.admin_note,
      'requested_at', q.requested_at,
      'reviewed_at', q.reviewed_at
    ) order by q.requested_at desc), '[]'::jsonb)
    from branch_requests q
    left join restaurant_plans r on r.restaurant_id = q.restaurant_id
    where nullif(trim(coalesce(p_status, '')), '') is null
       or q.status = trim(p_status)
  );
end $$;

create or replace function admin_review_branch_request(
  p_admin_key text, p_request_id uuid, p_action text, p_admin_note text default ''
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q branch_requests%rowtype;
  b restaurant_branches%rowtype;
begin
  perform _admin_assert(p_admin_key);

  select * into q from branch_requests where id = p_request_id for update;
  if not found then raise exception 'BRANCH_REQUEST_NOT_FOUND'; end if;
  if q.status <> 'pending' then raise exception 'BRANCH_REQUEST_ALREADY_REVIEWED'; end if;

  if lower(trim(p_action)) = 'approve' then
    insert into restaurant_branches (restaurant_id, branch_name, area, address, phone, is_default, is_active)
    values (q.restaurant_id, q.branch_name, q.area, q.address, q.phone, false, true)
    on conflict (restaurant_id, branch_name) do update
      set is_active = true, area = excluded.area, address = excluded.address, phone = excluded.phone
    returning * into b;

    update branch_requests
      set status = 'approved', admin_note = nullif(trim(p_admin_note), ''),
          reviewed_at = now(), created_branch_id = b.id
      where id = q.id;

    return jsonb_build_object('ok', true, 'status', 'approved', 'branch_id', b.id);

  elsif lower(trim(p_action)) = 'reject' then
    update branch_requests
      set status = 'rejected', admin_note = nullif(trim(p_admin_note), ''), reviewed_at = now()
      where id = q.id;

    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  raise exception 'INVALID_BRANCH_ACTION';
end $$;

revoke all on function admin_list_branch_requests(text, text) from public;
grant execute on function admin_list_branch_requests(text, text) to authenticated;
revoke all on function admin_review_branch_request(text, uuid, text, text) from public;
grant execute on function admin_review_branch_request(text, uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. COSTING FIX: items without a recipe must report NO_RECIPE
--    Previously calculate_recipe_cogs() returned 0 (never NULL), so
--    has_recipe was always true and un-costed dishes looked HEALTHY.
--    Return shape is unchanged, so this is a drop-in replacement.
-- ------------------------------------------------------------
create or replace function get_menu_profit_overview(p_session_id uuid)
returns table (
  menu_item_id uuid,
  name text,
  category text,
  selling_price numeric,
  cogs numeric,
  overhead_share numeric,
  net_profit numeric,
  margin_percent numeric,
  has_recipe boolean,
  profit_status text
)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_oh numeric;
begin
  if not is_staff_for_session(p_session_id) then
    raise exception 'Not authorized';
  end if;

  v_oh := calculate_overhead_per_plate(p_session_id);

  return query
  select
    mi.id,
    mi.name,
    mi.category,
    mi.price,
    coalesce(c.cogs, 0),
    v_oh,
    round(mi.price - coalesce(c.cogs, 0) - v_oh, 2),
    case when mi.price > 0
      then round(((mi.price - coalesce(c.cogs, 0) - v_oh) / mi.price) * 100, 1)
      else 0
    end,
    hr.has_recipe,
    case
      when not hr.has_recipe then 'NO_RECIPE'
      when (mi.price - coalesce(c.cogs, 0) - v_oh) < 0 then 'LOSS'
      when ((mi.price - coalesce(c.cogs, 0) - v_oh) / nullif(mi.price, 0)) < 0.15 then 'LOW'
      else 'HEALTHY'
    end
  from menu_items mi
  cross join lateral (
    select exists (select 1 from recipes r where r.menu_item_id = mi.id) as has_recipe
  ) hr
  left join lateral (
    select calculate_recipe_cogs(mi.id) as cogs
  ) c on true
  where mi.session_id = p_session_id
  order by mi.category, mi.name;
end $$;

revoke all on function get_menu_profit_overview(uuid) from public;
grant execute on function get_menu_profit_overview(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Reload the API schema cache so new/changed RPCs are visible immediately
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

commit;

-- ============================================================
-- VERIFY (optional, run separately in SQL Editor after the migration)
--   select count(*) from restaurant_branches;
--   select count(*) from branch_requests;
--   select * from get_menu_profit_overview('<your-session-id>');
--   select relname, relrowsecurity from pg_class
--     where relname in ('restaurant_branches','branch_requests');   -- both should be true
--
-- ROLLBACK (commented out — uncomment and run ONLY if you must revert)
--   -- Restores RLS-free access on the branch tables (NOT recommended):
--   -- drop policy if exists restaurant_branches_deny_all on restaurant_branches;
--   -- drop policy if exists branch_requests_deny_all on branch_requests;
--   -- alter table restaurant_branches disable row level security;
--   -- alter table branch_requests disable row level security;
--   --
--   -- Reverting the costing function: re-run the get_menu_profit_overview
--   -- definition from COSTING_AND_INVENTORY_MIGRATION.sql (section 16).
--   --
--   -- Tables and data created by IF NOT EXISTS are NOT dropped here, to
--   -- protect your data. Drop them manually only if you are certain:
--   -- drop table if exists branch_requests;
--   -- drop table if exists restaurant_branches;
-- ============================================================
