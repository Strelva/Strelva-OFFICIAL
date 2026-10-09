-- Remove only the exact additive producer ports; written terms/accepted periods/history remain.
begin;
set local lock_timeout='3s';
do $canonical_governed_money$
declare expected record; p record; migrator oid:=(current_user::regrole)::oid;
begin
 for expected in select * from (values
 ('public.record_governed_money_configuration(uuid,text,jsonb)','c50a9dbfea6cd8fb74158f9c3131306e','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.read_governed_money_configuration(uuid,uuid,text)','cb48f96fadd0536308c1cdf9784145cd','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.read_governed_money_preparation(uuid,uuid,text)','069ebd4ec0274185bf97814ea64f6523','s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.prepare_governed_collection_terms(uuid,text,jsonb)','d76caf2ab026b72931ce6af8570b7d36','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.register_governed_creator_listing(uuid,text,jsonb)','e67a0cb58c80c3622be80e31bfa98940','v',array['p_user_id','p_verified_email','p_command']::text[]),
 ('public.assert_governed_payout_dispatch(uuid,uuid,text,text,text,text,bigint,text,bigint)','b8fb6dd56365665db132b300ce564d70','v',array['p_payout_id','p_user_id','p_verified_email','p_profile_version','p_recipient','p_charge','p_amount','p_currency','p_available']::text[])) v(signature,source_hash,volatility,arg_names) loop
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=split_part(split_part(expected.signature,'.',2),'(',1))<>1 then raise exception 'governed_money_catalog_drift';end if;
  select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure(expected.signature);
  if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile::text<>expected.volatility or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from expected.arg_names or p.pronargs<>cardinality(expected.arg_names) or md5(p.prosrc)<>expected.source_hash then raise exception 'governed_money_catalog_drift';end if;
  if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=('service_role'::regrole)::oid) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or a.grantee not in(migrator,('service_role'::regrole)::oid)) then raise exception 'governed_money_acl_drift';end if;
 end loop;
end $canonical_governed_money$;
drop function public.record_governed_money_configuration(uuid,text,jsonb);
drop function public.read_governed_money_configuration(uuid,uuid,text);
drop function public.read_governed_money_preparation(uuid,uuid,text);
drop function public.prepare_governed_collection_terms(uuid,text,jsonb);
drop function public.register_governed_creator_listing(uuid,text,jsonb);
drop function public.assert_governed_payout_dispatch(uuid,uuid,text,text,text,text,bigint,text,bigint);
notify pgrst,'reload schema';
commit;
