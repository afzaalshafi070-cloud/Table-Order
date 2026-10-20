-- ============================================================================
-- PHASE 12: Admin repair tools (simple, no guesswork)
-- ----------------------------------------------------------------------------
-- 1. admin_find_restaurant(name): tells admin if a restaurant exists, its plan,
--    and its activation code. Uses the SAME slug rule as staff_login.
-- 2. admin_issue_activation_code(restaurant_id): if the owner lost the code and
--    has not logged in yet, issue a fresh code for that restaurant only.
--    Old unused codes for it are revoked.
-- Safe to re-run. Run AFTER PHASE9.
-- ============================================================================

create or replace function admin_find_restaurant(p_admin_key text, p_name text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_id text := btrim(lower(regexp_replace(coalesce(p_name,''),'[^a-zA-Z0-9]+','-','g')),'-');
  v_plan restaurant_plans%rowtype;
  v_code text;
begin
  perform _admin_assert(p_admin_key);
  if v_id = '' then
    return jsonb_build_object('ok', true, 'found', false, 'restaurant_id', v_id);
  end if;

  select * into v_plan from restaurant_plans where restaurant_id = v_id;
  if not found then
    return jsonb_build_object('ok', true, 'found', false, 'restaurant_id', v_id);
  end if;

  select code into v_code
  from activation_codes
  where restaurant_id = v_id
  order by (is_used = false) desc, created_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'found', true,
    'restaurant_id', v_id,
    'restaurant_name', v_plan.restaurant_name,
    'plan_status', v_plan.plan_status,
    'activation_required', coalesce(v_plan.activation_required, false),
    'activation_code', v_code
  );
end;
$$;

revoke all on function admin_find_restaurant(text, text) from public;
grant execute on function admin_find_restaurant(text, text) to authenticated;

create or replace function admin_issue_activation_code(p_admin_key text, p_restaurant_id text)
returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp
as $$
declare
  v_id text := btrim(lower(coalesce(p_restaurant_id,'')));
  v_plan restaurant_plans%rowtype;
  v_code text;
begin
  perform _admin_assert(p_admin_key);

  select * into v_plan from restaurant_plans where restaurant_id = v_id;
  if not found then raise exception 'RESTAURANT_NOT_FOUND'; end if;
  if coalesce(v_plan.activation_required, false) = false then
    raise exception 'ALREADY_ACTIVATED';
  end if;

  -- Revoke older unused codes for this restaurant so only one is valid.
  update activation_codes
  set is_revoked = true
  where restaurant_id = v_id and is_used = false;

  loop
    v_code := 'TO-' || upper(substr(encode(gen_random_bytes(5),'hex'),1,8));
    exit when not exists(select 1 from activation_codes where code = v_code);
  end loop;

  insert into activation_codes(code, is_used, is_revoked, restaurant_id, assigned_at)
  values(v_code, false, false, v_id, now());

  return jsonb_build_object('ok', true, 'restaurant_id', v_id, 'code', v_code);
end;
$$;

revoke all on function admin_issue_activation_code(text, text) from public;
grant execute on function admin_issue_activation_code(text, text) to authenticated;

-- VERIFY
-- select proname from pg_proc where proname in ('admin_find_restaurant','admin_issue_activation_code');  -- 2 rows
