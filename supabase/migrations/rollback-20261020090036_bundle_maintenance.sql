begin;
set local lock_timeout='3s';
-- Fence all receipt writers before observing emptiness. A guard that reads
-- first can miss an uncommitted insert and erase it after DROP waits.
lock table public.bundle_maintenance_attachments,public.bundle_maintenance_preparations,public.bundle_maintenance_event_links in access exclusive mode;
do $$
declare expected record; installed record; actual_acl text[]; expected_acl text[];
begin
 if exists(select 1 from public.bundle_maintenance_attachments) or exists(select 1 from public.bundle_maintenance_preparations) or exists(select 1 from public.bundle_maintenance_event_links) then raise exception 'bundle_maintenance_evidence_preservation_required'; end if;
 -- A later wrapper/config/ACL must be retired by its own qualified inverse.
 -- This packet never blindly drops a successor function or altered authority.
 for expected in select * from (values
  ('public.bundle_maintenance_holds(uuid,uuid,text)','902ee876512bb7b418fbddc181945189','plpgsql','jsonb','v',array['p_attachment_id','p_user_id','p_email'],false),
  ('public.attach_keep_me_found_maintenance(uuid,text,uuid,uuid,text,text,text)','f0c346521d540066b4b5e881abed6787','plpgsql','jsonb','v',array['p_user_id','p_verified_email','p_bundle_id','p_binding_id','p_location_id','p_hours_source','p_reply_policy'],true),
  ('public.check_bundle_maintenance_attachment(uuid,uuid,text)','33de19c8a8332d6261945c3355d0dc21','sql','jsonb','v',array['p_attachment_id','p_user_id','p_verified_email'],true),
  ('public.reserve_bundle_maintenance_preparation(uuid,uuid,text,text,bigint,jsonb)','ee4df20e7d6017a0bbcf996493f7e3fa','plpgsql','jsonb','v',array['p_attachment_id','p_user_id','p_verified_email','p_cycle_key','p_record_revision','p_draft'],true),
  ('public.link_bundle_maintenance_event(uuid,uuid,text,text)','07d2062c2f5c44c56650db94a9a35620','plpgsql','void','v',array['p_preparation_id','p_user_id','p_verified_email','p_event_id'],true),
  ('public.check_bundle_maintenance_event(uuid,text,uuid,uuid,text,jsonb)','7273bfa7e1bdd900832a19bc1fcf976a','plpgsql','boolean','v',array['p_preparation_id','p_event_id','p_business_id','p_binding_id','p_location_id','p_draft'],true),
  ('public.create_keep_me_found_maintenance_bundle(uuid,uuid,uuid,uuid,text,text,jsonb,integer,timestamptz,uuid,text)','36a380c3344238900fce772eb27c8308','plpgsql','jsonb','v',array['p_business_id','p_service_request_id','p_provider_id','p_user_id','p_verified_email','p_idempotency_key','p_investigations','p_every_seconds','p_next_at','p_binding_id','p_location_id'],true),
  ('public.read_bundle_maintenance_receipts(uuid,uuid,text,timestamptz,timestamptz)','92e8748cf5118c456aaaa7c987ecef9a','plpgsql','jsonb','s',array['p_business_id','p_user_id','p_verified_email','p_from','p_to'],true)
 ) as pin(signature,source_md5,language,result_type,volatility,argument_names,service_callable) loop
  select p.*,l.lanname into installed from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(expected.signature);
  if not found then raise exception 'bundle_maintenance_rollback_function_drift: %',expected.signature; end if;
  if md5(installed.prosrc) is distinct from expected.source_md5 or installed.lanname is distinct from expected.language
   or installed.prorettype is distinct from to_regtype(expected.result_type) or installed.provolatile::text is distinct from expected.volatility
   or installed.proargnames is distinct from expected.argument_names or installed.proargmodes is not null
   or installed.prokind<>'f' or installed.proretset or installed.pronargdefaults<>0 or installed.proisstrict or installed.proleakproof or installed.proparallel<>'u'
   or installed.procost<>100 or installed.prorows<>0 or installed.prosupport<>0 or installed.probin is not null or installed.prosqlbody is not null or installed.protrftypes is not null
   or not installed.prosecdef or installed.proconfig is distinct from array['search_path=public, pg_temp']
   or installed.proowner<>(select relowner from pg_class where oid='public.bundle_maintenance_attachments'::regclass)
   or installed.proowner<>(select oid from pg_roles where rolname=current_user)
   then raise exception 'bundle_maintenance_rollback_function_drift: %',expected.signature; end if;
  select array_agg((case acl.grantee when installed.proowner then 'owner' when (select oid from pg_roles where rolname='service_role') then 'service' else acl.grantee::text end)||':'||
   (case acl.grantor when installed.proowner then 'owner' else acl.grantor::text end)||':'||acl.privilege_type||':'||acl.is_grantable::text order by acl.grantee<>installed.proowner,acl.grantee,acl.grantor,acl.privilege_type,acl.is_grantable)
   into actual_acl from aclexplode(coalesce(installed.proacl,acldefault('f',installed.proowner))) acl;
  expected_acl:=array['owner:owner:EXECUTE:false'];
  if expected.service_callable then expected_acl:=expected_acl||array['service:owner:EXECUTE:false']; end if;
  if actual_acl is distinct from expected_acl then raise exception 'bundle_maintenance_rollback_acl_drift: %',expected.signature; end if;
 end loop;
end $$;
drop function public.read_bundle_maintenance_receipts(uuid,uuid,text,timestamptz,timestamptz);
drop function public.create_keep_me_found_maintenance_bundle(uuid,uuid,uuid,uuid,text,text,jsonb,integer,timestamptz,uuid,text);
drop function public.check_bundle_maintenance_event(uuid,text,uuid,uuid,text,jsonb);
drop function public.link_bundle_maintenance_event(uuid,uuid,text,text);
drop function public.reserve_bundle_maintenance_preparation(uuid,uuid,text,text,bigint,jsonb);
drop function public.check_bundle_maintenance_attachment(uuid,uuid,text);
drop function public.attach_keep_me_found_maintenance(uuid,text,uuid,uuid,text,text,text);
drop function public.bundle_maintenance_holds(uuid,uuid,text);
drop table public.bundle_maintenance_event_links,public.bundle_maintenance_preparations,public.bundle_maintenance_attachments;
commit;
