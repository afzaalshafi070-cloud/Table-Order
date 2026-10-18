-- ============================================================
-- TABLE ORDER — LOYALTY + BRANDED CARD FINAL MIGRATION
-- Preserves the existing ordering/subscription model.
-- Loyalty settings live inside sessions.theme so no existing
-- restaurant/menu/order schema is replaced.
-- ============================================================

create or replace function customer_loyalty_status(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
  v_loyalty jsonb;
  v_enabled boolean := false;
  v_threshold int := 10;
  v_type text := 'free_item';
  v_value numeric := 0;
  v_item text := '1 free item';
  v_completed int := 0;
  v_stamps int := 0;
  v_rewards int := 0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_session from sessions where id = p_session_id and is_active = true;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not exists (
    select 1 from customer_access
    where session_id = p_session_id and user_id = v_uid
  ) then raise exception 'NOT_AUTHORIZED'; end if;

  v_loyalty := coalesce(v_session.theme->'loyalty', '{}'::jsonb);
  v_enabled := coalesce((v_loyalty->>'enabled')::boolean, false);
  v_threshold := greatest(1, least(coalesce((v_loyalty->>'ordersPerReward')::int, 10), 50));
  v_type := case when v_loyalty->>'rewardType' in ('free_item','percentage_discount','fixed_discount') then v_loyalty->>'rewardType' else 'free_item' end;
  v_value := greatest(0, coalesce((v_loyalty->>'rewardValue')::numeric, 0));
  v_item := coalesce(nullif(trim(v_loyalty->>'rewardItemName'), ''), '1 free item');

  select count(*)::int into v_completed
  from orders
  where session_id = p_session_id
    and customer_user_id = v_uid
    and status = 'served';

  v_stamps := case when v_threshold > 0 then mod(v_completed, v_threshold) else 0 end;
  v_rewards := case when v_threshold > 0 then floor(v_completed::numeric / v_threshold)::int else 0 end;

  return jsonb_build_object(
    'enabled', v_enabled,
    'ordersPerReward', v_threshold,
    'rewardType', v_type,
    'rewardValue', v_value,
    'rewardItemName', v_item,
    'completedOrders', v_completed,
    'stamps', v_stamps,
    'rewardsEarned', v_rewards,
    'ordersUntilReward', case when v_completed % v_threshold = 0 and v_completed > 0 then 0 else v_threshold - v_stamps end,
    'rewardReady', v_completed > 0 and v_stamps = 0,
    'restaurantName', v_session.restaurant_name,
    'logoUrl', v_session.logo_url,
    'theme', v_session.theme
  );
end;
$$;

revoke all on function customer_loyalty_status(uuid) from public;
grant execute on function customer_loyalty_status(uuid) to authenticated;

-- Optional helper for staff: safely read only the loyalty configuration,
-- never exposing customer history or auth identities.
create or replace function staff_loyalty_config(p_session_id uuid, p_tab_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session sessions%rowtype;
begin
  select s.* into v_session
  from sessions s
  join staff_access a on a.session_id = s.id
  where s.id = p_session_id
    and s.is_active = true
    and a.user_id = v_uid
    and a.tab_secret = p_tab_secret;
  if not found then raise exception 'NOT_AUTHORIZED'; end if;
  return coalesce(v_session.theme->'loyalty', '{}'::jsonb);
end;
$$;
revoke all on function staff_loyalty_config(uuid,text) from public;
grant execute on function staff_loyalty_config(uuid,text) to authenticated;

-- ============================================================
-- END
-- ============================================================
