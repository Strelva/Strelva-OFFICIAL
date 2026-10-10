\set ON_ERROR_STOP on
begin;
-- BEGIN EXACT REWARDS CATALOG GUARD
-- A grant to an unknown role, inherited default grant or grant option aborts
-- this transaction. These same reviewed body/structure guards precede inverse DDL.
create temporary table reward_mutation_catalog_shape (
 tenant_stable_id uuid not null,
 command_id text not null check (char_length(command_id) between 1 and 200),
 input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
 result jsonb not null check (jsonb_typeof(result)='object'),
 accepted_at timestamptz not null default clock_timestamp(),
 primary key (tenant_stable_id,command_id)
) on commit drop;
create index reward_shape_member_idx on reward_mutation_catalog_shape(tenant_stable_id,(result->'member'->>'email')) where result ? 'member';
create index reward_shape_transaction_idx on reward_mutation_catalog_shape(tenant_stable_id,(result->'transaction'->>'id')) where result ? 'transaction';
do $reward_exact_catalog$
declare e record;p record;t record;actual jsonb;expected jsonb;migrator oid:=(current_user::regrole)::oid;
begin
 for e in select * from (values
 ('public.reward_record_canonical_json(jsonb)','18c83eaa9d3c65bbcc386cfdd42c9c74','text','i',false,array['p_value']::text[],1),
 ('public.reward_record_native_fence()','3f996ccc083587bb893675d564f0a122','trigger','v',true,null::text[],1),
 ('public.mutate_tenant_reward_record(text,text,jsonb)','c351ff03c4b2464fd0b5fc1afaaf4a7c','jsonb','v',true,array['p_tenant_id','p_email','p_input']::text[],2)) v(signature,source_hash,return_type,volatility,security_definer,arg_names,acl_count) loop
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname=split_part(split_part(e.signature,'.',2),'(',1))<>1 then raise exception 'rewards_function_catalog_drift';end if;
  select q.*,l.lanname into p from pg_proc q join pg_language l on l.oid=q.prolang where q.oid=to_regprocedure(e.signature);
  if p.oid is null or p.proowner<>migrator or p.pronamespace<>'public'::regnamespace or p.lanname<>'plpgsql' or p.prokind<>'f' or p.prorettype<>to_regtype(e.return_type) or p.proretset or p.proisstrict or p.prosecdef is distinct from e.security_definer or p.proleakproof or p.provolatile::text<>e.volatility or p.proparallel<>'u' or p.proconfig is distinct from array['search_path=public, pg_temp']::text[] or p.provariadic<>0 or p.prosupport<>0 or p.procost<>100 or p.prorows<>0 or p.pronargdefaults<>0 or p.proargdefaults is not null or p.proargmodes is not null or p.proallargtypes is not null or p.proargnames is distinct from e.arg_names or p.pronargs<>coalesce(cardinality(e.arg_names),0) or md5(p.prosrc)<>e.source_hash then raise exception 'rewards_function_catalog_drift';end if;
  if p.proacl is null or (select count(*) from aclexplode(p.proacl))<>e.acl_count or not exists(select 1 from aclexplode(p.proacl) a where a.grantee=migrator) or (e.acl_count=2 and not exists(select 1 from aclexplode(p.proacl) a where a.grantee=('service_role'::regrole)::oid)) or exists(select 1 from aclexplode(p.proacl) a where a.grantor<>migrator or a.privilege_type<>'EXECUTE' or a.is_grantable or (a.grantee<>migrator and (e.acl_count<>2 or a.grantee<>('service_role'::regrole)::oid))) then raise exception 'rewards_function_acl_drift';end if;
 end loop;
 select * into t from pg_class where oid='public.tenant_reward_mutations'::regclass;
 if t.relowner<>migrator or t.relnamespace<>'public'::regnamespace or t.relkind<>'r' or t.relpersistence<>'p' or not t.relrowsecurity or t.relforcerowsecurity or t.relispartition or t.reloptions is not null or exists(select 1 from pg_policy where polrelid=t.oid) or exists(select 1 from pg_inherits where inhrelid=t.oid or inhparent=t.oid) or exists(select 1 from pg_attribute where attrelid=t.oid and (attisdropped or attacl is not null)) or exists(select 1 from pg_trigger where tgrelid=t.oid and not tgisinternal) or exists(select 1 from pg_rewrite where ev_class=t.oid) then raise exception 'rewards_table_catalog_drift';end if;
 select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) into actual from aclexplode(coalesce(t.relacl,acldefault('r',migrator))) a;
 select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) into expected from aclexplode(acldefault('r',migrator)) a;
 if actual is distinct from expected then raise exception 'rewards_table_acl_drift';end if;
 select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) into actual from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=t.oid and a.attnum>0;
 select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) into expected from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='pg_temp.reward_mutation_catalog_shape'::regclass and a.attnum>0;
 if actual is distinct from expected then raise exception 'rewards_table_columns_drift';end if;
 select jsonb_agg(jsonb_build_array(c.contype,c.conkey,c.condeferrable,c.condeferred,c.convalidated,c.connoinherit,pg_get_expr(c.conbin,c.conrelid)) order by c.contype,pg_get_expr(c.conbin,c.conrelid)) into actual from pg_constraint c where c.conrelid=t.oid and c.contype<>'f';
 select jsonb_agg(jsonb_build_array(c.contype,c.conkey,c.condeferrable,c.condeferred,c.convalidated,c.connoinherit,pg_get_expr(c.conbin,c.conrelid)) order by c.contype,pg_get_expr(c.conbin,c.conrelid)) into expected from pg_constraint c where c.conrelid='pg_temp.reward_mutation_catalog_shape'::regclass;
 if actual is distinct from expected then raise exception 'rewards_table_constraints_drift';end if;
 if (select count(*) from pg_constraint where conrelid=t.oid and contype='f')<>1 or not exists(select 1 from pg_constraint where conrelid=t.oid and contype='f' and conkey=array[1]::smallint[] and confrelid='public.tenants'::regclass and confkey=array[(select attnum from pg_attribute where attrelid='public.tenants'::regclass and attname='stable_id')]::smallint[] and confupdtype='a' and confdeltype='c' and confmatchtype='s' and not condeferrable and not condeferred and convalidated) then raise exception 'rewards_table_foreign_key_drift';end if;
 if (select count(*) from pg_index where indrelid=t.oid)<>3 or exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am a on a.oid=c.relam where i.indrelid=t.oid and (c.relowner<>migrator or c.relnamespace<>'public'::regnamespace or c.reloptions is not null or c.relacl is not null or a.amname<>'btree' or c.relname not in ('tenant_reward_mutations_pkey','tenant_reward_mutations_member_idx','tenant_reward_mutations_transaction_idx'))) then raise exception 'rewards_table_index_drift';end if;
 select jsonb_agg(jsonb_build_array(i.indisprimary,i.indisunique,i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indisreplident,i.indnkeyatts,i.indnatts,i.indkey::text,i.indclass::text,i.indcollation::text,i.indoption::text,i.indnullsnotdistinct,i.indcheckxmin,pg_get_expr(i.indexprs,i.indrelid),pg_get_expr(i.indpred,i.indrelid)) order by i.indisprimary,pg_get_expr(i.indpred,i.indrelid)) into actual from pg_index i where i.indrelid=t.oid;
 select jsonb_agg(jsonb_build_array(i.indisprimary,i.indisunique,i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indisreplident,i.indnkeyatts,i.indnatts,i.indkey::text,i.indclass::text,i.indcollation::text,i.indoption::text,i.indnullsnotdistinct,i.indcheckxmin,pg_get_expr(i.indexprs,i.indrelid),pg_get_expr(i.indpred,i.indrelid)) order by i.indisprimary,pg_get_expr(i.indpred,i.indrelid)) into expected from pg_index i where i.indrelid='pg_temp.reward_mutation_catalog_shape'::regclass;
 if actual is distinct from expected then raise exception 'rewards_table_index_properties_drift';end if;
 if (select count(*) from pg_trigger where tgfoid='public.reward_record_native_fence()'::regprocedure and not tgisinternal)<>1 or not exists(select 1 from pg_trigger where tgrelid='public.tenant_client_records'::regclass and tgname='reward_record_native_fence' and tgfoid='public.reward_record_native_fence()'::regprocedure and tgtype=23 and tgenabled='O' and not tgisinternal and tgnargs=0 and tgargs=''::bytea and tgqual is null and tgconstraint=0 and tgattr=''::int2vector) then raise exception 'rewards_trigger_catalog_drift';end if;
end $reward_exact_catalog$;
drop table pg_temp.reward_mutation_catalog_shape;
-- END EXACT REWARDS CATALOG GUARD
rollback;
