\set ON_ERROR_STOP on
-- Prepared native catalog check. No commercial/provider qualification implied.
begin read only;
do $neutral_ports$
declare expected record; p record; migrator oid:=(current_user::regrole)::oid;
begin
 for expected in select * from (values
 ('public.register_neutral_creator_listing(uuid,text,jsonb)','65070ed346aaff39df0c08a56c1afe2f','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.record_neutral_creator_money(uuid,text,jsonb)','3a7b15696eff0a4a27353f76934fc8e7','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.prepare_neutral_version_collection(uuid,text,jsonb)','ff5607bb4d9294b5593bb739920f0834','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.record_neutral_version_settlement(uuid,text,text,bigint,text,text,text)','8eda917902cc18f02a513c07fca79310','v',array['p_id','p_intent','p_charge','p_amount','p_currency','p_customer','p_event']::text[]),
 ('public.observe_neutral_creator_settlement(uuid)','f37e8e9bc019457c524a64563bbf8080','v',array['p_collection_id']::text[]),
 ('public.read_neutral_creator_sources(uuid,uuid,text)','f6593f4fd3185132455ff80b1dce4782','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.read_neutral_version_money(uuid,uuid,text)','3362aa67202ab16ca912791c8fdc36a7','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.export_neutral_creator_paid_periods(uuid,uuid,text,text,integer,integer)','9dc9eb68ec4e61a1f0942f516b3c2d9d','s',array['p_workspace_id','p_user_id','p_verified_email','p_category','p_offset','p_limit']::text[])) v(signature,source_hash,volatility,arg_names) loop
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=split_part(split_part(expected.signature,'.',2),'(',1))<>1 then raise exception 'neutral_creator_catalog_drift';end if;
  select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure(expected.signature);
  if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile::text<>expected.volatility or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from expected.arg_names or p.pronargs<>cardinality(expected.arg_names) or md5(p.prosrc)<>expected.source_hash then raise exception 'neutral_creator_catalog_drift';end if;
  if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=('service_role'::regrole)::oid) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or a.grantee not in(migrator,('service_role'::regrole)::oid)) then raise exception 'neutral_creator_acl_drift';end if;
 end loop;
end $neutral_ports$;
rollback;
