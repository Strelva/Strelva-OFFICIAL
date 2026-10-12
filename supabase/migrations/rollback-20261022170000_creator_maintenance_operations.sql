-- Lock the journal before its first read. Retain all historical money bytes.
begin;
set local lock_timeout='3s';
do $journal_exists$begin if to_regclass('release_rollback_baseline.creator_maintenance_operations_catalog') is null then raise exception 'creator_maintenance_operations_journal_missing';end if;end $journal_exists$;
lock table release_rollback_baseline.creator_maintenance_operations_catalog in access exclusive mode;
do $journal_shape$
declare j oid:=to_regclass('release_rollback_baseline.creator_maintenance_operations_catalog'); migrator oid:=(current_user::regrole)::oid;
begin
 if j is null or not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=j and n.nspname='release_rollback_baseline' and n.nspowner=migrator and c.relowner=migrator and c.relkind='r' and c.relpersistence='p' and not c.relrowsecurity and not c.relforcerowsecurity) or exists(select 1 from pg_policy where polrelid=j) then raise exception 'creator_maintenance_operations_journal_authority';end if;
 if exists(select 1 from pg_attribute where attrelid=j and attnum>0 and attisdropped) then raise exception 'creator_maintenance_operations_journal_shape';end if;
 if exists(select 1 from pg_attribute a where a.attrelid=j and a.attnum>0 and (a.atttypmod<>-1 or a.attcollation<>(select typcollation from pg_type where oid='text'::regtype) or a.atthasmissing or a.attinhcount<>0 or not a.attislocal)) then raise exception 'creator_maintenance_operations_journal_shape';end if;
 if (select array_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid::regtype::text,a.attnotnull,a.attidentity,a.attgenerated,a.atthasdef) order by a.attnum) from pg_attribute a where a.attrelid=j and a.attnum>0 and not a.attisdropped) is distinct from array[jsonb_build_array(1,'signature','text',true,'','',false),jsonb_build_array(2,'definition_hash','text',true,'','',false),jsonb_build_array(3,'acl_hash','text',true,'','',false),jsonb_build_array(4,'owner_name','text',true,'','',false),jsonb_build_array(5,'properties_hash','text',true,'','',false)] then raise exception 'creator_maintenance_operations_journal_shape';end if;
 if (select count(*) from pg_constraint where conrelid=j and contype<>'n')<>1 or not exists(select 1 from pg_constraint where conrelid=j and contype='p' and conkey=array[1]::smallint[] and not condeferrable and not condeferred and convalidated) then raise exception 'creator_maintenance_operations_journal_shape';end if;
 if exists(select 1 from pg_inherits where inhrelid=j or inhparent=j) then raise exception 'creator_maintenance_operations_journal_shape';end if;
 if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid=j and (a.grantee<>migrator or a.grantor<>migrator or a.is_grantable)) or exists(select 1 from pg_attribute c cross join lateral aclexplode(c.attacl) a where c.attrelid=j and c.attnum>0 and not c.attisdropped) then raise exception 'creator_maintenance_operations_journal_acl';end if;
 -- Compare the complete normalized table privilege set, not only unwanted entries.
 if (select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid=j) is distinct from (select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) from aclexplode(acldefault('r',migrator)) a) then raise exception 'creator_maintenance_operations_journal_acl';end if;
end $journal_shape$;
do $predecessor35$
declare expected record; p record; migrator oid:=(current_user::regrole)::oid;
begin
 for expected in select * from (values ('public.record_creator_royalty_maintenance(uuid,uuid,text,text,text,text,timestamptz)','8aa1deadd54a1ece8ef11b53b24af4c8',true,'v',array['p_listing_id','p_user_id','p_verified_email','p_state','p_agreement','p_rate','p_effective']::text[]),
 ('public.record_creator_royalty_maintenance_before_identity(uuid,uuid,text,text,text,text,timestamptz)','98705591ce82bfa6cfa70a5b2a2e57ca',false,'v',array['p_listing_id','p_user_id','p_verified_email','p_state','p_agreement','p_rate','p_effective']::text[])) v(signature,source_hash,service_access,volatility,arg_names) loop
  select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure(expected.signature);
  if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile::text<>expected.volatility or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from expected.arg_names or p.pronargs<>cardinality(expected.arg_names) or md5(p.prosrc)<>expected.source_hash then
   raise exception 'creator_maintenance_operations_unsupported_function: %',expected.signature;
  end if;
  if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>(case when expected.service_access then 2 else 1 end) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or (a.grantee<>migrator and (not expected.service_access or a.grantee<>('service_role'::regrole)::oid))) then
   raise exception 'creator_maintenance_operations_unsupported_function_acl: %',expected.signature;
  end if;
  -- Hidden helpers must not become callable through inherited owner membership.
  if not expected.service_access and exists(select 1 from pg_roles r where r.oid<>migrator and not r.rolsuper and has_function_privilege(r.oid,p.oid,'EXECUTE')) then raise exception 'creator_maintenance_operations_hidden_helper_exposed';end if;
 end loop;
end $predecessor35$;
do $fixed_signatures$begin if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in('read_creator_maintenance_operations','record_creator_maintenance_from_workspace'))<>2 then raise exception 'creator_maintenance_operations_journal_signatures';end if;end $fixed_signatures$;
do $successor_functions$
declare expected record; p record; migrator oid:=(current_user::regrole)::oid;
begin
 for expected in select * from (values ('public.read_creator_maintenance_operations(uuid,uuid,text)','b9d1f652439acf69f4b1c5db8e1674f8',true,'s',array['p_workspace_id','p_user_id','p_verified_email']::text[]),
 ('public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz)','e78ad511867bceea67f3b98603661611',true,'v',array['p_workspace_id','p_listing_id','p_source_revision_id','p_user_id','p_verified_email','p_state','p_agreement','p_rate','p_effective']::text[])) v(signature,source_hash,service_access,volatility,arg_names) loop
  select f.*,l.lanname into p from pg_proc f join pg_language l on l.oid=f.prolang where f.oid=to_regprocedure(expected.signature);
  if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>'jsonb'::regtype or p.proretset or p.proisstrict or not p.prosecdef or p.proleakproof or p.provolatile::text<>expected.volatility or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from expected.arg_names or p.pronargs<>cardinality(expected.arg_names) or md5(p.prosrc)<>expected.source_hash then
   raise exception 'creator_maintenance_operations_unsupported_function: %',expected.signature;
  end if;
  if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>(case when expected.service_access then 2 else 1 end) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or (a.grantee<>migrator and (not expected.service_access or a.grantee<>('service_role'::regrole)::oid))) then
   raise exception 'creator_maintenance_operations_unsupported_function_acl: %',expected.signature;
  end if;
  -- Hidden helpers must not become callable through inherited owner membership.
  if not expected.service_access and exists(select 1 from pg_roles r where r.oid<>migrator and not r.rolsuper and has_function_privilege(r.oid,p.oid,'EXECUTE')) then raise exception 'creator_maintenance_operations_hidden_helper_exposed';end if;
 end loop;
end $successor_functions$;
do $inverse_rows$
declare r record; p record;
begin
 if (select count(*) from release_rollback_baseline.creator_maintenance_operations_catalog)<>2 or exists(select 1 from release_rollback_baseline.creator_maintenance_operations_catalog where signature not in('public.read_creator_maintenance_operations(uuid,uuid,text)','public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz)') or owner_name<>current_user) then raise exception 'creator_maintenance_operations_journal_rows';end if;
 for r in select * from release_rollback_baseline.creator_maintenance_operations_catalog loop
  select * into p from pg_proc where oid=to_regprocedure(r.signature);
  if p.oid is null or pg_get_userbyid(p.proowner)<>r.owner_name or md5(pg_get_functiondef(p.oid))<>r.definition_hash or md5(coalesce((select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb)::text)<>r.acl_hash or md5(jsonb_build_object('lang',p.prolang,'kind',p.prokind,'returns',p.prorettype,'set',p.proretset,'strict',p.proisstrict,'security',p.prosecdef,'leak',p.proleakproof,'volatile',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'variadic',p.provariadic,'support',p.prosupport,'cost',p.procost,'rows',p.prorows,'defaultCount',p.pronargdefaults,'defaults',p.proargdefaults::text,'argNames',p.proargnames,'argModes',p.proargmodes,'allArgTypes',p.proallargtypes)::text)<>r.properties_hash then raise exception 'creator_maintenance_operations_catalog_drift';end if;
 end loop;
end $inverse_rows$;
drop function public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz);
drop function public.read_creator_maintenance_operations(uuid,uuid,text);
drop table release_rollback_baseline.creator_maintenance_operations_catalog;
notify pgrst,'reload schema';
commit;
