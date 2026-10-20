-- ============================================================================
-- PHASE 8E: FIX "function crypt(text, text) does not exist" (Rider login)
-- ----------------------------------------------------------------------------
-- Cause: on Supabase, pgcrypto lives in the "extensions" schema. The rider
-- functions use crypt(), gen_salt(), digest() and gen_random_bytes() but their
-- search_path is only "public, pg_temp", so Postgres cannot find them.
--
-- Fix: add "extensions" to the search_path of every public function whose body
-- calls those pgcrypto helpers. Function bodies are NOT changed.
--
-- RUN THIS LAST, after PHASE8B / PHASE8 / PHASE8C / PHASE8D, because PHASE8B
-- re-creates rider_portal_login with the old search_path.
-- Safe to re-run.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.prosrc ~* '(crypt|gen_salt|digest|gen_random_bytes)\s*\('
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', r.sig);
    raise notice 'Fixed: %', r.sig;
  end loop;
end $$;

-- VERIFY 1: pgcrypto should be in the "extensions" schema (or public). Either is fine now.
select extname, extnamespace::regnamespace as schema from pg_extension where extname = 'pgcrypto';

-- VERIFY 2: every rider function should now show extensions in proconfig.
select proname, proconfig
from pg_proc
where proname like 'rider%' or proname = 'staff_create_rider'
order by proname;

-- VERIFY 3 (optional, read-only): direct PIN check. Replace the phone and PIN.
-- select r.full_name, (crypt('1234', r.pin_hash) = r.pin_hash) as pin_ok
-- from riders r where r.phone = '03001234567';
