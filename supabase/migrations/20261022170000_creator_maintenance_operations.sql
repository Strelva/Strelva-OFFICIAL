-- Governed no-provider maintenance operations; canonical migration35 baseline only.
begin;
set local lock_timeout='3s';
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
do $fresh_baseline$
declare migrator oid:=(current_user::regrole)::oid;
begin
 if not exists(select 1 from pg_namespace where nspname='release_rollback_baseline' and nspowner=migrator) or to_regclass('release_rollback_baseline.creator_maintenance_operations_catalog') is not null or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in('read_creator_maintenance_operations','record_creator_maintenance_from_workspace')) then raise exception 'creator_maintenance_operations_unsupported_baseline';end if;
 if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole=migrator and d.defaclnamespace in(0,'public'::regnamespace,'release_rollback_baseline'::regnamespace) and d.defaclobjtype in('f','r') and (a.grantor<>migrator or a.is_grantable or a.grantee not in(0,migrator,('anon'::regrole)::oid,('authenticated'::regrole)::oid,('service_role'::regrole)::oid))) then raise exception 'creator_maintenance_operations_unsupported_default_acl';end if;
end $fresh_baseline$;
create table release_rollback_baseline.creator_maintenance_operations_catalog(signature text primary key,definition_hash text not null,acl_hash text not null,owner_name text not null,properties_hash text not null);
revoke all on release_rollback_baseline.creator_maintenance_operations_catalog from public,anon,authenticated,service_role;
create function public.read_creator_maintenance_operations(p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare listings jsonb; agreements jsonb;
begin
 perform public.connect_assert_reader(p_workspace_id,p_user_id,p_verified_email);
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'definitionId',l.definition_id,'sourceRevisionId',l.source_revision_id,'agreementVersion',l.agreement_version,'rateReference',l.rate_reference,'maintainerState',l.maintainer_state,'history',coalesce((select jsonb_agg(to_jsonb(t) order by t.effective_from,t.id) from public.creator_royalty_terms t where t.listing_id=l.id),'[]'::jsonb)) order by l.created_at,l.id),'[]'::jsonb) into listings from public.creator_listings l where l.creator_workspace_id=p_workspace_id;
 select coalesce(jsonb_agg(jsonb_build_object('version',a.version,'rateReference',a.rate_reference,'rateBps',a.rate_bps,'effectiveFrom',a.effective_from,'effectiveUntil',a.effective_until) order by a.effective_from,a.id),'[]'::jsonb) into agreements from public.money_agreements a where a.beneficiary_workspace_id=p_workspace_id and a.kind='creator';
 return jsonb_build_object('workspaceId',p_workspace_id,'canMaintain',not public.workspace_exit_completed(p_workspace_id),'listings',listings,'agreements',agreements);
end $$;
create function public.record_creator_maintenance_from_workspace(p_workspace_id uuid,p_listing_id uuid,p_source_revision_id uuid,p_user_id uuid,p_verified_email text,p_state text,p_agreement text,p_rate text,p_effective timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Same identity -> listing -> membership order as the existing writer.
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for share;
 if not found then raise exception 'connect_denied';end if;
 perform 1 from public.creator_listings where id=p_listing_id and creator_workspace_id=p_workspace_id and source_revision_id=p_source_revision_id for update;
 if not found then raise exception 'creator_maintenance_scope_denied';end if;
 return public.record_creator_royalty_maintenance(p_listing_id,p_user_id,p_verified_email,p_state,p_agreement,p_rate,p_effective);
end $$;
revoke all on function public.read_creator_maintenance_operations(uuid,uuid,text),public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.read_creator_maintenance_operations(uuid,uuid,text),public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz) to service_role;
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
insert into release_rollback_baseline.creator_maintenance_operations_catalog select source.signature,md5(pg_get_functiondef(p.oid)),md5(coalesce((select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantor),case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,a.privilege_type,a.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb)::text),pg_get_userbyid(p.proowner),md5(jsonb_build_object('lang',p.prolang,'kind',p.prokind,'returns',p.prorettype,'set',p.proretset,'strict',p.proisstrict,'security',p.prosecdef,'leak',p.proleakproof,'volatile',p.provolatile,'parallel',p.proparallel,'config',p.proconfig,'variadic',p.provariadic,'support',p.prosupport,'cost',p.procost,'rows',p.prorows,'defaultCount',p.pronargdefaults,'defaults',p.proargdefaults::text,'argNames',p.proargnames,'argModes',p.proargmodes,'allArgTypes',p.proallargtypes)::text) from unnest(array['public.read_creator_maintenance_operations(uuid,uuid,text)','public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz)']) source(signature) join pg_proc p on p.oid=source.signature::regprocedure;
notify pgrst,'reload schema';
commit;
