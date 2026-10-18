-- ============================================================================
-- PHASE 8B: ROLLBACK rider login + profile to the ORIGINAL definitions
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL Editor if you ran PHASE8_RIDER_BRAND_LOOKUP.sql
-- (v1). It restores rider_portal_login and rider_portal_update_profile exactly as
-- they were in FINAL_PRODUCTION_2026_10_08.sql. Safe to run even if v1 was never run.
-- ============================================================================

create or replace function rider_portal_login(p_restaurant_id text,p_link_token text,p_pin text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l rider_portal_links%rowtype; r riders%rowtype; s sessions%rowtype; tok text; thash text; uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into l from rider_portal_links where restaurant_id=trim(p_restaurant_id) and link_token=trim(p_link_token) and is_revoked=false;
  if not found then raise exception 'LINK_REVOKED'; end if;
  select * into r from riders where id=l.rider_id and restaurant_id=l.restaurant_id and is_active=true;
  if not found then raise exception 'RIDER_NOT_FOUND'; end if;
  if r.pin_hash is null or crypt(trim(p_pin),r.pin_hash)<>r.pin_hash then raise exception 'INVALID_PIN'; end if;
  tok:=encode(gen_random_bytes(32),'hex'); thash:=encode(digest(tok,'sha256'),'hex');
  update rider_portal_sessions set revoked_at=now() where rider_id=r.id and auth_user_id=uid and revoked_at is null;
  insert into rider_portal_sessions(rider_id,restaurant_id,auth_user_id,token_hash) values(r.id,r.restaurant_id,uid,thash);
  select * into s from sessions where restaurant_id=r.restaurant_id and is_active=true order by created_at desc limit 1;
  return jsonb_build_object('ok',true,'portal_token',tok,'rider_id',r.id,'full_name',r.full_name,'phone',r.phone,'email',r.email,'whatsapp',r.whatsapp,'photo_url',r.photo_url,'bike_number',r.bike_number,'primary_area',r.primary_area,'duty_status',r.duty_status,'avg_rating',rider_avg_rating(r.rating_sum,r.rating_count),'rating_count',r.rating_count,'deliveries_completed_count',r.deliveries_completed_count,'restaurant_id',r.restaurant_id,'restaurant_name',coalesce(s.restaurant_name,r.restaurant_id),'logo_url',s.logo_url,'theme',coalesce(s.theme,'{}'::jsonb));
end $$;

create or replace function rider_portal_update_profile(p_portal_token text,p_full_name text,p_phone text,p_whatsapp text,p_photo_url text,p_bike_number text,p_primary_area text,p_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare ps rider_portal_sessions%rowtype; r riders%rowtype; s sessions%rowtype; thash text:=encode(digest(trim(p_portal_token),'sha256'),'hex');
begin
  select * into ps from rider_portal_sessions where token_hash=thash and auth_user_id=auth.uid() and revoked_at is null and last_seen_at>now()-interval '30 days';
  if not found then raise exception 'RIDER_SESSION_EXPIRED'; end if;
  if length(trim(coalesce(p_full_name,'')))<2 or length(trim(coalesce(p_phone,'')))<5 then raise exception 'NAME_AND_PHONE_REQUIRED'; end if;
  update riders set full_name=trim(p_full_name),phone=trim(p_phone),whatsapp=nullif(trim(coalesce(p_whatsapp,'')),''),photo_url=nullif(trim(coalesce(p_photo_url,'')),''),bike_number=nullif(trim(coalesce(p_bike_number,'')),''),primary_area=nullif(trim(coalesce(p_primary_area,'')),''),email=nullif(trim(coalesce(p_email,'')),''),updated_at=now() where id=ps.rider_id returning * into r;
  delete from rider_area_assignments where rider_id=r.id;
  if r.primary_area is not null then insert into rider_area_assignments(rider_id,restaurant_id,area_name) values(r.id,r.restaurant_id,r.primary_area) on conflict do nothing; end if;
  update rider_portal_sessions set last_seen_at=now() where id=ps.id;
  select * into s from sessions where restaurant_id=r.restaurant_id and is_active=true order by created_at desc limit 1;
  return jsonb_build_object('ok',true,'rider_id',r.id,'full_name',r.full_name,'phone',r.phone,'email',r.email,'whatsapp',r.whatsapp,'photo_url',r.photo_url,'bike_number',r.bike_number,'primary_area',r.primary_area,'duty_status',r.duty_status,'avg_rating',rider_avg_rating(r.rating_sum,r.rating_count),'rating_count',r.rating_count,'deliveries_completed_count',r.deliveries_completed_count,'restaurant_id',r.restaurant_id,'restaurant_name',coalesce(s.restaurant_name,r.restaurant_id),'logo_url',s.logo_url,'theme',coalesce(s.theme,'{}'::jsonb));
end $$;

-- VERIFY (expect 4 rows: rider_brand_session, rider_portal_resume, rider_portal_login, rider_portal_update_profile)
--   select proname from pg_proc where proname like 'rider_portal_%' or proname = 'rider_brand_session';
