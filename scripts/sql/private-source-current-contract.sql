\set ON_ERROR_STOP on
-- Current351 catalog only. Historical1740/1730/private receipts are retained.
-- Exact1745 successor authority, all eight neutral ports and original private
-- source journals/table/ACL checks share this READ ONLY transaction.
begin read only;
do $catalog0$
declare p record; migrator oid:=(current_user::regrole)::oid;
begin
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='system_version_assert_source_manager')<>1 then raise exception 'private_source_order_catalog_drift';end if;
 select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure('public.system_version_assert_source_manager(uuid,uuid,text)');
 if p.oid is null or p.proowner<>migrator or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'void'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile<>'v' or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.protrftypes is not null or p.probin is not null or p.prosqlbody is not null or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from array['p_workspace_id','p_user_id','p_verified_email']::text[] or p.pronargs<>3 or md5(p.prosrc)<>'c5102a2adad96ab31f2313ddfcc4eceb' then raise exception 'private_source_order_catalog_drift';end if;
 if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>1 or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.grantee not in(migrator) or a.privilege_type<>'EXECUTE' or a.is_grantable) then raise exception 'private_source_order_acl_drift';end if;
end $catalog0$;
do $catalog1$
declare p record; migrator oid:=(current_user::regrole)::oid;
begin
 if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='register_neutral_creator_listing')<>1 then raise exception 'private_source_order_catalog_drift';end if;
 select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure('public.register_neutral_creator_listing(uuid,text,jsonb)');
 if p.oid is null or p.proowner<>migrator or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile<>'v' or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.protrftypes is not null or p.probin is not null or p.prosqlbody is not null or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from array['p_user_id','p_verified_email','p_command']::text[] or p.pronargs<>3 or md5(p.prosrc)<>'1a08f3d5253b3d50037b9bce52fbd916' then raise exception 'private_source_order_catalog_drift';end if;
 if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>2 or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=('service_role'::regrole)::oid) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.grantee not in(migrator,('service_role'::regrole)::oid) or a.privilege_type<>'EXECUTE' or a.is_grantable) then raise exception 'private_source_order_acl_drift';end if;
end $catalog1$;
do $neutral_ports$
declare expected record; p record; migrator oid:=(current_user::regrole)::oid;
begin
 for expected in select * from (values
 ('public.register_neutral_creator_listing(uuid,text,jsonb)','1a08f3d5253b3d50037b9bce52fbd916','v',array['p_user_id','p_verified_email','p_command']::text[]),
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
do $contract$
declare signature text; table_name text; audited_function record; actual_acl jsonb;
begin
 if (select count(*) from public.private_definition_function_receipts)<>17 or (select count(*) from public.private_definition_predecessors)<>6 then raise exception 'private_journal_incomplete';end if;
 foreach table_name in array array['public.private_application_sources','public.private_source_install_grants','public.private_definition_predecessors','public.private_definition_function_receipts'] loop
  if not exists(select 1 from pg_class where oid=table_name::regclass and relowner=(current_user::regrole)::oid and relrowsecurity)
   or exists(select 1 from pg_policy where polrelid=table_name::regclass)
   or exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl where c.oid=table_name::regclass and (acl.grantee<>c.relowner or acl.grantor<>c.relowner))
   or exists(select 1 from pg_attribute attribute join pg_class c on c.oid=attribute.attrelid cross join lateral aclexplode(attribute.attacl) acl where attribute.attrelid=table_name::regclass and attribute.attnum>0 and not attribute.attisdropped and (acl.grantee<>c.relowner or acl.grantor<>c.relowner))
   then raise exception 'private_table_authority_not_closed';end if;
 end loop;
 for audited_function in select * from public.private_definition_function_receipts loop
  if audited_function.body_sha256<>encode(sha256(convert_to(pg_get_functiondef(audited_function.signature::regprocedure),'UTF8')),'hex') then raise exception 'private_successor_body_drift';end if;
  select coalesce(jsonb_agg(jsonb_build_array(acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable) order by acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable),'[]'::jsonb) into actual_acl
   from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=audited_function.signature::regprocedure;
  if actual_acl is distinct from audited_function.acl then raise exception 'private_successor_acl_drift';end if;
 end loop;
 foreach signature in array array[
 'public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)',
 'public.require_private_application_source_share(uuid,uuid,text,uuid)'] loop
  if (select provolatile from pg_proc where oid=signature::regprocedure)<>'s' then raise exception 'private_read_not_stable';end if;
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'private_read_exposed';end if;
 end loop;
 if exists(select 1 from public.private_definition_predecessors receipt where encode(sha256(convert_to(pg_get_functiondef(receipt.signature::regprocedure),'UTF8')),'hex')<>receipt.after_sha256)then raise exception 'private_predecessor_drift';end if;
end $contract$;
rollback;
