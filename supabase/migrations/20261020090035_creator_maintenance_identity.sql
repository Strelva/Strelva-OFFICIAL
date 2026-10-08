-- #287: protect the exact verified identity for this supplied-actor writer.
-- Existing membership, approved agreements, future state and rates are unchanged.
begin;
set local lock_timeout='3s';
lock table public.creator_royalty_terms in share mode;
create table release_rollback_baseline.creator_maintenance_identity (
 signature text primary key, definition_hash text not null, acl_hash text not null
);
create table release_rollback_baseline.creator_maintenance_identity_terms (
 id uuid primary key, receipt_hash text not null
);
insert into release_rollback_baseline.creator_maintenance_identity_terms
 select id,md5(to_jsonb(t)::text) from public.creator_royalty_terms t;
revoke all on release_rollback_baseline.creator_maintenance_identity,release_rollback_baseline.creator_maintenance_identity_terms
 from public,anon,authenticated,service_role;
alter function public.record_creator_royalty_maintenance(uuid,uuid,text,text,text,text,timestamptz)
 rename to record_creator_royalty_maintenance_before_identity;
revoke all on function public.record_creator_royalty_maintenance_before_identity(uuid,uuid,text,text,text,text,timestamptz)
 from public,anon,authenticated,service_role;
create function public.record_creator_royalty_maintenance(p_listing_id uuid,p_user_id uuid,p_verified_email text,p_state text,p_agreement text,p_rate text,p_effective timestamptz) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Current verification/email must survive through the immutable INSERT and
 -- exact replay. Lock identity before the existing listing/membership path.
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'connect_denied';end if;
 return public.record_creator_royalty_maintenance_before_identity(p_listing_id,p_user_id,p_verified_email,p_state,p_agreement,p_rate,p_effective);
end $$;
revoke all on function public.record_creator_royalty_maintenance(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_creator_royalty_maintenance(uuid,uuid,text,text,text,text,timestamptz) to service_role;
insert into release_rollback_baseline.creator_maintenance_identity
 select p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),md5(coalesce(p.proacl::text,'')) from pg_proc p where p.oid in
 ('public.record_creator_royalty_maintenance(uuid,uuid,text,text,text,text,timestamptz)'::regprocedure,
  'public.record_creator_royalty_maintenance_before_identity(uuid,uuid,text,text,text,text,timestamptz)'::regprocedure);
notify pgrst,'reload schema';
commit;
