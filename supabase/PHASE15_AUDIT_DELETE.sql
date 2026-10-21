-- ============================================================================
-- PHASE 15: Admin audit log delete (selected / older than date / clear all)
-- ----------------------------------------------------------------------------
-- Every call checks the admin key with _admin_assert, same as other admin RPCs.
-- Each delete writes one "audit_delete" entry so the cleanup itself is traceable.
-- Safe to re-run.
-- ============================================================================

create or replace function admin_delete_audit(
  p_admin_key text,
  p_ids uuid[] default null,
  p_before timestamptz default null,
  p_all boolean default false
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_count int := 0;
  v_mode text;
begin
  perform _admin_assert(p_admin_key);

  if coalesce(p_all, false) then
    v_mode := 'all';
    delete from admin_audit_log where true;
  elsif p_ids is not null and array_length(p_ids, 1) > 0 then
    v_mode := 'selected';
    delete from admin_audit_log where id = any(p_ids);
  elsif p_before is not null then
    v_mode := 'before';
    delete from admin_audit_log where created_at < p_before;
  else
    raise exception 'NOTHING_SELECTED';
  end if;

  get diagnostics v_count = row_count;

  insert into admin_audit_log(action_type, restaurant_id, result, details)
  values ('audit_delete', null, 'success',
          jsonb_build_object('mode', v_mode, 'deleted', v_count));

  return jsonb_build_object('ok', true, 'deleted', v_count);
end;
$$;

revoke all on function admin_delete_audit(text, uuid[], timestamptz, boolean) from public;
grant execute on function admin_delete_audit(text, uuid[], timestamptz, boolean) to authenticated;

-- VERIFY: function exists
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc where proname = 'admin_delete_audit';
