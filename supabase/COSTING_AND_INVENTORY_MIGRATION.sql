-- ============================================================
-- TABLE ORDER — COSTING, RECIPE, INVENTORY & WASTE DETECTION
-- Migration: COSTING_AND_INVENTORY_MIGRATION.sql
-- Run this ONCE in Supabase SQL Editor (after existing schema)
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE)
-- ============================================================

-- ------------------------------------------------------------
-- 1. RAW MATERIALS MASTER
-- ------------------------------------------------------------
create table if not exists raw_materials (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,
  unit text not null default 'kg',          -- kg, g, ltr, ml, pc, dozen
  current_stock numeric(12,3) not null default 0,
  avg_cost_per_unit numeric(12,4) not null default 0,  -- weighted avg
  last_purchase_price numeric(12,4) not null default 0,
  min_stock_alert numeric(12,3) not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_raw_materials_session on raw_materials(session_id);
create unique index if not exists idx_raw_materials_session_name
  on raw_materials(session_id, lower(name));

-- ------------------------------------------------------------
-- 2. RECIPES (menu_item → ingredients)
-- ------------------------------------------------------------
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  raw_material_id uuid not null references raw_materials(id) on delete restrict,
  quantity numeric(12,4) not null check (quantity > 0),  -- in the unit of raw_material
  created_at timestamptz not null default now()
);

create index if not exists idx_recipes_menu_item on recipes(menu_item_id);
create index if not exists idx_recipes_raw_material on recipes(raw_material_id);
create unique index if not exists idx_recipes_unique
  on recipes(menu_item_id, raw_material_id);

-- ------------------------------------------------------------
-- 3. OVERHEADS (monthly fixed costs)
-- ------------------------------------------------------------
create table if not exists overheads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  name text not null,                       -- Staff Salaries, Rent, Gas, Electricity...
  monthly_amount numeric(12,2) not null default 0,
  allocation_method text not null default 'per_plate'
    check (allocation_method in ('per_plate', 'percentage_of_sales')),
  expected_monthly_plates int not null default 1000,  -- used for per_plate share
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_overheads_session on overheads(session_id);

-- ------------------------------------------------------------
-- 4. INVENTORY LOG (purchases, usage, adjustments, waste)
-- ------------------------------------------------------------
create table if not exists inventory_log (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  raw_material_id uuid not null references raw_materials(id) on delete cascade,
  type text not null check (type in ('purchase', 'usage', 'adjustment', 'waste', 'opening')),
  quantity numeric(12,3) not null,          -- + for purchase/opening, - for usage/waste
  unit_cost numeric(12,4),                  -- cost at time of transaction
  reference_id uuid,                        -- order_id or null
  notes text,
  created_by text,                          -- staff identifier optional
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_log_session on inventory_log(session_id);
create index if not exists idx_inventory_log_material on inventory_log(raw_material_id);
create index if not exists idx_inventory_log_created on inventory_log(created_at);
create index if not exists idx_inventory_log_type on inventory_log(type);

-- ------------------------------------------------------------
-- 5. DAILY PROFIT SNAPSHOTS (optional but useful for history)
-- ------------------------------------------------------------
create table if not exists daily_profit_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  snapshot_date date not null default current_date,
  total_sales numeric(12,2) not null default 0,
  total_cogs numeric(12,2) not null default 0,
  total_overhead_share numeric(12,2) not null default 0,
  net_profit numeric(12,2) not null default 0,
  waste_value numeric(12,2) not null default 0,
  plates_sold int not null default 0,
  created_at timestamptz not null default now(),
  unique (session_id, snapshot_date)
);

create index if not exists idx_daily_profit_session on daily_profit_snapshots(session_id);

-- ------------------------------------------------------------
-- 6. TOUCH updated_at TRIGGERS
-- ------------------------------------------------------------
create or replace function touch_raw_materials_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_raw_materials_touch on raw_materials;
create trigger trg_raw_materials_touch
  before update on raw_materials
  for each row execute function touch_raw_materials_updated_at();

create or replace function touch_overheads_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_overheads_touch on overheads;
create trigger trg_overheads_touch
  before update on overheads
  for each row execute function touch_overheads_updated_at();

-- ------------------------------------------------------------
-- 7. RLS POLICIES (staff only, same pattern as existing)
-- ------------------------------------------------------------
alter table raw_materials enable row level security;
alter table recipes enable row level security;
alter table overheads enable row level security;
alter table inventory_log enable row level security;
alter table daily_profit_snapshots enable row level security;

-- raw_materials
drop policy if exists raw_materials_select on raw_materials;
drop policy if exists raw_materials_staff_all on raw_materials;
create policy raw_materials_select on raw_materials
  for select to authenticated
  using (is_staff_for_session(session_id));
create policy raw_materials_staff_all on raw_materials
  for all to authenticated
  using (is_staff_for_session(session_id))
  with check (is_staff_for_session(session_id));

-- recipes (access via menu_item → session)
drop policy if exists recipes_select on recipes;
drop policy if exists recipes_staff_all on recipes;
create policy recipes_select on recipes
  for select to authenticated
  using (
    exists (
      select 1 from menu_items mi
      where mi.id = recipes.menu_item_id
        and is_staff_for_session(mi.session_id)
    )
  );
create policy recipes_staff_all on recipes
  for all to authenticated
  using (
    exists (
      select 1 from menu_items mi
      where mi.id = recipes.menu_item_id
        and is_staff_for_session(mi.session_id)
    )
  )
  with check (
    exists (
      select 1 from menu_items mi
      where mi.id = recipes.menu_item_id
        and is_staff_for_session(mi.session_id)
    )
  );

-- overheads
drop policy if exists overheads_select on overheads;
drop policy if exists overheads_staff_all on overheads;
create policy overheads_select on overheads
  for select to authenticated
  using (is_staff_for_session(session_id));
create policy overheads_staff_all on overheads
  for all to authenticated
  using (is_staff_for_session(session_id))
  with check (is_staff_for_session(session_id));

-- inventory_log
drop policy if exists inventory_log_select on inventory_log;
drop policy if exists inventory_log_staff_all on inventory_log;
create policy inventory_log_select on inventory_log
  for select to authenticated
  using (is_staff_for_session(session_id));
create policy inventory_log_staff_all on inventory_log
  for all to authenticated
  using (is_staff_for_session(session_id))
  with check (is_staff_for_session(session_id));

-- daily_profit_snapshots
drop policy if exists daily_profit_select on daily_profit_snapshots;
drop policy if exists daily_profit_staff_all on daily_profit_snapshots;
create policy daily_profit_select on daily_profit_snapshots
  for select to authenticated
  using (is_staff_for_session(session_id));
create policy daily_profit_staff_all on daily_profit_snapshots
  for all to authenticated
  using (is_staff_for_session(session_id))
  with check (is_staff_for_session(session_id));

-- ------------------------------------------------------------
-- 8. HELPER: Calculate Recipe COGS for one menu item
-- ------------------------------------------------------------
create or replace function calculate_recipe_cogs(p_menu_item_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cogs numeric := 0;
begin
  select coalesce(sum(r.quantity * rm.avg_cost_per_unit), 0)
  into v_cogs
  from recipes r
  join raw_materials rm on rm.id = r.raw_material_id
  where r.menu_item_id = p_menu_item_id
    and rm.is_active = true;

  return round(v_cogs, 2);
end;
$$;

-- ------------------------------------------------------------
-- 9. HELPER: Calculate overhead share per plate
-- ------------------------------------------------------------
create or replace function calculate_overhead_per_plate(p_session_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_total numeric := 0;
  v_row record;
begin
  for v_row in
    select monthly_amount, allocation_method, expected_monthly_plates
    from overheads
    where session_id = p_session_id and is_active = true
  loop
    if v_row.allocation_method = 'per_plate' and v_row.expected_monthly_plates > 0 then
      v_total := v_total + (v_row.monthly_amount / v_row.expected_monthly_plates);
    end if;
    -- percentage_of_sales is handled at report time, not per-plate fixed
  end loop;

  return round(v_total, 2);
end;
$$;

-- ------------------------------------------------------------
-- 10. HELPER: Net profit for one menu item (selling price - cogs - overhead share)
-- ------------------------------------------------------------
create or replace function calculate_net_profit(
  p_menu_item_id uuid,
  p_selling_price numeric default null
)
returns table (
  cogs numeric,
  overhead_share numeric,
  selling_price numeric,
  net_profit numeric,
  margin_percent numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_price numeric;
  v_cogs numeric;
  v_oh numeric;
  v_session uuid;
begin
  select mi.price, mi.session_id
  into v_price, v_session
  from menu_items mi
  where mi.id = p_menu_item_id;

  if v_price is null then
    return;
  end if;

  if p_selling_price is not null then
    v_price := p_selling_price;
  end if;

  v_cogs := calculate_recipe_cogs(p_menu_item_id);
  v_oh := calculate_overhead_per_plate(v_session);

  return query
  select
    v_cogs,
    v_oh,
    v_price,
    round(v_price - v_cogs - v_oh, 2),
    case when v_price > 0
      then round(((v_price - v_cogs - v_oh) / v_price) * 100, 1)
      else 0
    end;
end;
$$;

-- ------------------------------------------------------------
-- 11. RECORD PURCHASE (updates stock + weighted avg cost)
-- ------------------------------------------------------------
create or replace function record_purchase(
  p_session_id uuid,
  p_raw_material_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_notes text default null
)
returns raw_materials
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rm raw_materials%rowtype;
  v_old_stock numeric;
  v_old_avg numeric;
  v_new_avg numeric;
begin
  if not is_staff_for_session(p_session_id) then
    raise exception 'Not authorized';
  end if;

  if p_quantity <= 0 or p_unit_cost < 0 then
    raise exception 'Quantity must be > 0 and unit_cost >= 0';
  end if;

  select * into v_rm
  from raw_materials
  where id = p_raw_material_id and session_id = p_session_id
  for update;

  if not found then
    raise exception 'Raw material not found';
  end if;

  v_old_stock := v_rm.current_stock;
  v_old_avg := v_rm.avg_cost_per_unit;

  -- Weighted average cost
  if (v_old_stock + p_quantity) > 0 then
    v_new_avg := ((v_old_stock * v_old_avg) + (p_quantity * p_unit_cost))
                 / (v_old_stock + p_quantity);
  else
    v_new_avg := p_unit_cost;
  end if;

  update raw_materials
  set
    current_stock = current_stock + p_quantity,
    avg_cost_per_unit = round(v_new_avg, 4),
    last_purchase_price = p_unit_cost,
    updated_at = now()
  where id = p_raw_material_id
  returning * into v_rm;

  insert into inventory_log (
    session_id, raw_material_id, type, quantity, unit_cost, notes
  ) values (
    p_session_id, p_raw_material_id, 'purchase', p_quantity, p_unit_cost, p_notes
  );

  return v_rm;
end;
$$;

-- ------------------------------------------------------------
-- 12. RECORD ADJUSTMENT / WASTE (manual stock correction)
-- ------------------------------------------------------------
create or replace function record_stock_adjustment(
  p_session_id uuid,
  p_raw_material_id uuid,
  p_quantity numeric,          -- can be negative
  p_type text default 'adjustment',  -- adjustment | waste
  p_notes text default null
)
returns raw_materials
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rm raw_materials%rowtype;
begin
  if not is_staff_for_session(p_session_id) then
    raise exception 'Not authorized';
  end if;

  if p_type not in ('adjustment', 'waste', 'opening') then
    raise exception 'Invalid type';
  end if;

  select * into v_rm
  from raw_materials
  where id = p_raw_material_id and session_id = p_session_id
  for update;

  if not found then
    raise exception 'Raw material not found';
  end if;

  update raw_materials
  set current_stock = current_stock + p_quantity,
      updated_at = now()
  where id = p_raw_material_id
  returning * into v_rm;

  insert into inventory_log (
    session_id, raw_material_id, type, quantity, unit_cost, notes
  ) values (
    p_session_id, p_raw_material_id, p_type, p_quantity,
    v_rm.avg_cost_per_unit, p_notes
  );

  return v_rm;
end;
$$;

-- ------------------------------------------------------------
-- 13. DEDUCT STOCK WHEN ORDER IS SERVED / COMPLETED
--     Call this from frontend OR from a trigger on status change
-- ------------------------------------------------------------
create or replace function deduct_stock_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order orders%rowtype;
  v_item jsonb;
  v_menu_item_id uuid;
  v_qty int;
  v_recipe record;
  v_deduct numeric;
  v_results jsonb := '[]'::jsonb;
  v_already boolean;
begin
  select * into v_order from orders where id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;

  -- Prevent double deduction
  select exists (
    select 1 from inventory_log
    where reference_id = p_order_id and type = 'usage'
  ) into v_already;

  if v_already then
    return jsonb_build_object('ok', true, 'message', 'Already deducted', 'items', '[]'::jsonb);
  end if;

  for v_item in select * from jsonb_array_elements(v_order.items)
  loop
    -- items jsonb shape: { id, name, qty, price, ... }
    begin
      v_menu_item_id := (v_item->>'id')::uuid;
    exception when others then
      continue;  -- skip non-uuid or missing id
    end;

    v_qty := coalesce((v_item->>'qty')::int, 1);
    if v_qty <= 0 then continue; end if;

    for v_recipe in
      select r.quantity, r.raw_material_id, rm.name, rm.current_stock, rm.avg_cost_per_unit
      from recipes r
      join raw_materials rm on rm.id = r.raw_material_id
      where r.menu_item_id = v_menu_item_id
        and rm.session_id = v_order.session_id
        and rm.is_active = true
    loop
      v_deduct := v_recipe.quantity * v_qty;

      update raw_materials
      set current_stock = current_stock - v_deduct,
          updated_at = now()
      where id = v_recipe.raw_material_id;

      insert into inventory_log (
        session_id, raw_material_id, type, quantity, unit_cost, reference_id, notes
      ) values (
        v_order.session_id,
        v_recipe.raw_material_id,
        'usage',
        -v_deduct,
        v_recipe.avg_cost_per_unit,
        p_order_id,
        format('Order usage: %s x %s', v_qty, coalesce(v_item->>'name', 'item'))
      );

      v_results := v_results || jsonb_build_object(
        'material', v_recipe.name,
        'deducted', v_deduct,
        'remaining', v_recipe.current_stock - v_deduct
      );
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'items', v_results);
end;
$$;

-- ------------------------------------------------------------
-- 14. AUTO-DEDUCT TRIGGER when order status → served / completed
-- ------------------------------------------------------------
create or replace function trg_order_status_deduct_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only fire when status changes TO served or completed
  if (TG_OP = 'UPDATE')
     and (OLD.status is distinct from NEW.status)
     and (NEW.status in ('served', 'completed'))
     and (OLD.status not in ('served', 'completed'))
  then
    perform deduct_stock_for_order(NEW.id);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_orders_deduct_stock on orders;
create trigger trg_orders_deduct_stock
  after update of status on orders
  for each row
  execute function trg_order_status_deduct_stock();

-- ------------------------------------------------------------
-- 15. WASTE / LEAKAGE DETECTION
--     Compares theoretical usage (from recipes × sales) vs actual usage
-- ------------------------------------------------------------
create or replace function detect_waste(
  p_session_id uuid,
  p_from timestamptz default (current_date - interval '1 day'),
  p_to   timestamptz default now()
)
returns table (
  raw_material_id uuid,
  material_name text,
  unit text,
  theoretical_usage numeric,
  actual_usage numeric,
  difference numeric,
  difference_value numeric,
  status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff_for_session(p_session_id) then
    raise exception 'Not authorized';
  end if;

  return query
  with sales_items as (
    -- Expand all sold items in date range
    select
      (elem->>'id')::uuid as menu_item_id,
      coalesce((elem->>'qty')::int, 1) as qty
    from orders o,
         lateral jsonb_array_elements(o.items) elem
    where o.session_id = p_session_id
      and o.status in ('served', 'completed')
      and o.created_at >= p_from
      and o.created_at < p_to
      and (elem->>'id') is not null
  ),
  theoretical as (
    select
      r.raw_material_id,
      sum(r.quantity * si.qty) as theo_qty
    from sales_items si
    join recipes r on r.menu_item_id = si.menu_item_id
    group by r.raw_material_id
  ),
  actual as (
    select
      il.raw_material_id,
      sum(abs(il.quantity)) as act_qty
    from inventory_log il
    where il.session_id = p_session_id
      and il.type = 'usage'
      and il.created_at >= p_from
      and il.created_at < p_to
    group by il.raw_material_id
  )
  select
    rm.id,
    rm.name,
    rm.unit,
    round(coalesce(t.theo_qty, 0), 3),
    round(coalesce(a.act_qty, 0), 3),
    round(coalesce(a.act_qty, 0) - coalesce(t.theo_qty, 0), 3),
    round((coalesce(a.act_qty, 0) - coalesce(t.theo_qty, 0)) * rm.avg_cost_per_unit, 2),
    case
      when coalesce(a.act_qty, 0) - coalesce(t.theo_qty, 0) > (coalesce(t.theo_qty, 0) * 0.08)
        then 'RED'      -- > 8% extra usage
      when coalesce(a.act_qty, 0) - coalesce(t.theo_qty, 0) > (coalesce(t.theo_qty, 0) * 0.03)
        then 'YELLOW'   -- 3-8%
      else 'OK'
    end
  from raw_materials rm
  left join theoretical t on t.raw_material_id = rm.id
  left join actual a on a.raw_material_id = rm.id
  where rm.session_id = p_session_id
    and rm.is_active = true
    and (coalesce(t.theo_qty, 0) > 0 or coalesce(a.act_qty, 0) > 0)
  order by (coalesce(a.act_qty, 0) - coalesce(t.theo_qty, 0)) * rm.avg_cost_per_unit desc;
end;
$$;

-- ------------------------------------------------------------
-- 16. PROFIT OVERVIEW for all menu items of a session
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
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
    coalesce(cogs.cogs, 0),
    v_oh,
    round(mi.price - coalesce(cogs.cogs, 0) - v_oh, 2),
    case when mi.price > 0
      then round(((mi.price - coalesce(cogs.cogs, 0) - v_oh) / mi.price) * 100, 1)
      else 0
    end,
    (cogs.cogs is not null),
    case
      when cogs.cogs is null then 'NO_RECIPE'
      when (mi.price - coalesce(cogs.cogs, 0) - v_oh) < 0 then 'LOSS'
      when ((mi.price - coalesce(cogs.cogs, 0) - v_oh) / nullif(mi.price, 0)) < 0.15 then 'LOW'
      else 'HEALTHY'
    end
  from menu_items mi
  left join lateral (
    select calculate_recipe_cogs(mi.id) as cogs
  ) cogs on true
  where mi.session_id = p_session_id
  order by mi.category, mi.name;
end;
$$;

-- ------------------------------------------------------------
-- 17. LOW STOCK ALERTS
-- ------------------------------------------------------------
create or replace function get_low_stock_alerts(p_session_id uuid)
returns table (
  raw_material_id uuid,
  name text,
  unit text,
  current_stock numeric,
  min_stock_alert numeric,
  avg_cost_per_unit numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff_for_session(p_session_id) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    rm.id,
    rm.name,
    rm.unit,
    rm.current_stock,
    rm.min_stock_alert,
    rm.avg_cost_per_unit
  from raw_materials rm
  where rm.session_id = p_session_id
    and rm.is_active = true
    and rm.min_stock_alert > 0
    and rm.current_stock <= rm.min_stock_alert
  order by (rm.current_stock / nullif(rm.min_stock_alert, 0));
end;
$$;

-- ------------------------------------------------------------
-- 18. REALTIME (optional)
-- ------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table raw_materials;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table inventory_log;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- DONE
-- After running this file:
-- 1. Verify tables exist in Table Editor
-- 2. Deploy the frontend ZIP files
-- 3. Open Counter Dashboard → new "Costing" tab
-- ============================================================
