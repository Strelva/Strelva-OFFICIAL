-- Exact additive-port inverse retains every immutable paid Version row and original writer.
begin;
set local lock_timeout='3s';
-- Retained history is never dropped by the inverse. Reapply admits only this
-- exact previously created shape, under a write-blocking lock before inspection.
create temporary table neutral_creator_period_shape (
 line_id text primary key,
 business_workspace_id uuid not null,
 version_id uuid not null,
 release_number integer not null check(release_number>0),
 source_system_id uuid not null,
 source_revision_id uuid not null,
 listing_id uuid not null,
 creator_workspace_id uuid not null,
 price_version text not null,
 period_start timestamptz not null,period_end timestamptz not null check(period_end>period_start),
 maintainer_state text not null check(maintainer_state in('creator','takeover','tapered')),
 agreement_version text,rate_reference text,rate_bps integer check(rate_bps between 0 and 10000),
 payer_kind text not null check(payer_kind in('business','agency')),payer_workspace_id uuid not null,
 accepted_by uuid not null,
 accepted_at timestamptz not null,
 check((maintainer_state='takeover' and agreement_version is null and rate_reference is null and rate_bps is null)
  or (maintainer_state in('creator','tapered') and agreement_version is not null and rate_reference is not null and rate_bps is not null))
) on commit drop;
do $neutral_retained_shape$
declare t record; actual jsonb; expected jsonb; migrator oid:=(current_user::regrole)::oid;
begin
 lock table public.creator_version_paid_periods in access exclusive mode;
 select * into t from pg_class where oid='public.creator_version_paid_periods'::regclass;
 if t.relowner<>migrator or t.relnamespace<>'public'::regnamespace or t.relkind<>'r' or t.relpersistence<>'p' or not t.relrowsecurity or t.relforcerowsecurity or t.relispartition or t.reloptions is not null or exists(select 1 from pg_policy where polrelid=t.oid) or exists(select 1 from pg_inherits where inhrelid=t.oid or inhparent=t.oid) or exists(select 1 from pg_attribute where attrelid=t.oid and (attisdropped or attacl is not null)) then raise exception 'neutral_creator_retained_table_drift';end if;
 select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) into actual from aclexplode(coalesce(t.relacl,acldefault('r',migrator))) a;
 select jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) into expected from aclexplode(acldefault('r',migrator)) a;
 if actual is distinct from expected then raise exception 'neutral_creator_retained_acl_drift';end if;
 select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) into actual from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=t.oid and a.attnum>0;
 select jsonb_agg(jsonb_build_array(a.attnum,a.attname,a.atttypid,a.atttypmod,a.attnotnull,a.attidentity,a.attgenerated,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) into expected from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='pg_temp.neutral_creator_period_shape'::regclass and a.attnum>0;
 if actual is distinct from expected then raise exception 'neutral_creator_retained_columns_drift';end if;
 select jsonb_agg(jsonb_build_array(c.contype,c.conkey,c.condeferrable,c.condeferred,c.convalidated,c.connoinherit,pg_get_expr(c.conbin,c.conrelid)) order by c.contype,pg_get_expr(c.conbin,c.conrelid)) into actual from pg_constraint c where c.conrelid=t.oid and c.contype<>'f';
 select jsonb_agg(jsonb_build_array(c.contype,c.conkey,c.condeferrable,c.condeferred,c.convalidated,c.connoinherit,pg_get_expr(c.conbin,c.conrelid)) order by c.contype,pg_get_expr(c.conbin,c.conrelid)) into expected from pg_constraint c where c.conrelid='pg_temp.neutral_creator_period_shape'::regclass;
 if actual is distinct from expected then raise exception 'neutral_creator_retained_constraints_drift';end if;
 select jsonb_agg(jsonb_build_array((select jsonb_agg(a.attname order by k.position) from unnest(c.conkey) with ordinality k(attnum,position) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum),c.confrelid,(select jsonb_agg(a.attname order by k.position) from unnest(c.confkey) with ordinality k(attnum,position) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum),c.confupdtype,c.confdeltype,c.confmatchtype,c.condeferrable,c.condeferred,c.convalidated) order by (select jsonb_agg(a.attname order by k.position)::text from unnest(c.conkey) with ordinality k(attnum,position) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)) into actual from pg_constraint c where c.conrelid=t.oid and c.contype='f';
 select jsonb_agg(jsonb_build_array(column_names,to_regclass(reference_table)::oid,reference_columns,'a','r','s',false,false,true) order by to_jsonb(column_names)::text) into expected from (values (array['line_id']::text[],'public.platform_collection_terms',array['line_id']::text[]),(array['business_workspace_id']::text[],'public.workspaces',array['id']::text[]),(array['version_id']::text[],'public.system_versions',array['id']::text[]),(array['source_system_id']::text[],'public.system_version_sources',array['system_id']::text[]),(array['source_revision_id']::text[],'public.system_version_source_revisions',array['id']::text[]),(array['listing_id']::text[],'public.creator_listings',array['id']::text[]),(array['creator_workspace_id']::text[],'public.workspaces',array['id']::text[]),(array['price_version']::text[],'public.platform_collection_prices',array['version']::text[]),(array['payer_workspace_id']::text[],'public.workspaces',array['id']::text[]),(array['accepted_by']::text[],'public.users',array['id']::text[]),(array['version_id','release_number']::text[],'public.system_version_releases',array['version_id','number']::text[])) v(column_names,reference_table,reference_columns);
 if actual is distinct from expected or (select count(*) from pg_constraint where conrelid=t.oid and contype='f')<>11 then raise exception 'neutral_creator_retained_foreign_keys_drift';end if;
 if (select count(*) from pg_index where indrelid=t.oid)<>1 or not exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am am on am.oid=c.relam where i.indrelid=t.oid and i.indisprimary and i.indisunique and i.indisvalid and i.indisready and i.indislive and i.indimmediate and i.indkey::text='1' and i.indnkeyatts=1 and i.indnatts=1 and i.indexprs is null and i.indpred is null and c.relowner=migrator and c.reloptions is null and am.amname='btree') then raise exception 'neutral_creator_retained_index_drift';end if;
 select jsonb_build_array(i.indclass::text,i.indcollation::text,i.indoption::text,i.indnullsnotdistinct,i.indcheckxmin) into actual from pg_index i where i.indrelid=t.oid;
 select jsonb_build_array(i.indclass::text,i.indcollation::text,i.indoption::text,i.indnullsnotdistinct,i.indcheckxmin) into expected from pg_index i where i.indrelid='pg_temp.neutral_creator_period_shape'::regclass;
 if actual is distinct from expected then raise exception 'neutral_creator_retained_index_properties_drift';end if;
 if (select count(*) from pg_trigger where tgrelid=t.oid and not tgisinternal)<>1 or not exists(select 1 from pg_trigger where tgrelid=t.oid and not tgisinternal and tgname='money_immutable' and tgfoid='public.money_immutable_guard()'::regprocedure and tgtype=27 and tgenabled='O' and tgnargs=0 and tgargs=''::bytea and tgqual is null and tgconstraint=0) then raise exception 'neutral_creator_retained_trigger_drift';end if;
end $neutral_retained_shape$;
drop table pg_temp.neutral_creator_period_shape;

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
drop function public.register_neutral_creator_listing(uuid,text,jsonb);
drop function public.record_neutral_creator_money(uuid,text,jsonb);
drop function public.prepare_neutral_version_collection(uuid,text,jsonb);
drop function public.record_neutral_version_settlement(uuid,text,text,bigint,text,text,text);
drop function public.observe_neutral_creator_settlement(uuid);
drop function public.read_neutral_creator_sources(uuid,uuid,text);
drop function public.read_neutral_version_money(uuid,uuid,text);
drop function public.export_neutral_creator_paid_periods(uuid,uuid,text,text,integer,integer);
notify pgrst,'reload schema';
commit;
