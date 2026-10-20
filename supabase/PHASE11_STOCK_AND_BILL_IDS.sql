-- ============================================================================
-- PHASE 11: Stock management + NTN/STRN support
-- ----------------------------------------------------------------------------
-- menu_items.stock_quantity: NULL = not tracked (unlimited), 0 = out of stock.
-- Trigger on orders:
--   * new order  -> stock decreases by qty; blocks the order if not enough stock
--   * cancelled  -> stock is restored (+qty)
-- Deal items are not stock-tracked (only regular menu items).
-- Safe to re-run. Run AFTER PHASE10.
-- ============================================================================

alter table menu_items add column if not exists stock_quantity int;

create or replace function orders_apply_stock()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_qty int;
  v_stock int;
  v_name text;
begin
  if tg_op = 'INSERT' then
    for v_item in select * from jsonb_array_elements(coalesce(new.items,'[]'::jsonb)) loop
      if coalesce(v_item->>'type','item') = 'deal' then continue; end if;
      begin
        v_id := (v_item->>'id')::uuid;
      exception when others then
        continue;
      end;
      v_qty := greatest(coalesce((v_item->>'qty')::int, 0), 0);
      select stock_quantity, name into v_stock, v_name from menu_items where id = v_id for update;
      if not found or v_stock is null then continue; end if;
      if v_stock < v_qty then
        raise exception 'OUT_OF_STOCK: % (available: %)', coalesce(v_name, 'item'), v_stock;
      end if;
      update menu_items set stock_quantity = stock_quantity - v_qty where id = v_id;
    end loop;
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then
    for v_item in select * from jsonb_array_elements(coalesce(new.items,'[]'::jsonb)) loop
      if coalesce(v_item->>'type','item') = 'deal' then continue; end if;
      begin
        v_id := (v_item->>'id')::uuid;
      exception when others then
        continue;
      end;
      v_qty := greatest(coalesce((v_item->>'qty')::int, 0), 0);
      update menu_items set stock_quantity = stock_quantity + v_qty
      where id = v_id and stock_quantity is not null;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_stock_insert on orders;
create trigger trg_orders_stock_insert
  before insert on orders
  for each row execute function orders_apply_stock();

drop trigger if exists trg_orders_stock_cancel on orders;
create trigger trg_orders_stock_cancel
  after update of status on orders
  for each row execute function orders_apply_stock();

-- VERIFY: set a test item to stock 2 in MenuEditor, place 3 qty -> should fail with OUT_OF_STOCK
