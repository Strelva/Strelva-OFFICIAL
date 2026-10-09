begin;
set local lock_timeout='3s';
-- Conservative catalog/event-trigger exclusion requires the actual superuser.
-- Refuse managed roles rather than allowing a same-session DDL hook past review.
do $$begin if not (select rolsuper from pg_roles where rolname=current_user) then raise exception 'rewards_forward_catalog_lock_unavailable';end if;end $$;
-- Inverse and native acceptance share this exact global serialization boundary.
select pg_advisory_xact_lock(hashtextextended('reward-native-writer',1750));
lock table public.tenant_client_records in access exclusive mode;
-- These catalog writers are excluded before the first trigger-capable DDL.
-- Relation locks cannot stop an enabled event trigger in this same session.
-- Disabled triggers cannot be enabled while pg_event_trigger remains locked.
lock table pg_catalog.pg_event_trigger,pg_catalog.pg_authid,
 pg_catalog.pg_auth_members,pg_catalog.pg_namespace,pg_catalog.pg_default_acl
 in share row exclusive mode;
do $reward_no_event_hooks$
begin
 if not (select rolsuper from pg_roles where rolname=current_user) then raise exception 'rewards_catalog_authority_changed';end if;
 if exists(select 1 from pg_event_trigger where evtenabled<>'D') then raise exception 'rewards_unreviewed_event_trigger';end if;
end $reward_no_event_hooks$;
-- Financial reward mutation receipts survive cache loss and ambiguous responses.
-- Generic client records retain their existing export/tenant identity contract.
create table public.tenant_reward_mutations (
 tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
 command_id text not null check (char_length(command_id) between 1 and 200),
 input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
 result jsonb not null check (jsonb_typeof(result)='object'),
 accepted_at timestamptz not null default clock_timestamp(),
 primary key (tenant_stable_id,command_id)
);
create index tenant_reward_mutations_member_idx on public.tenant_reward_mutations(tenant_stable_id,(result->'member'->>'email')) where result ? 'member';
create index tenant_reward_mutations_transaction_idx on public.tenant_reward_mutations(tenant_stable_id,(result->'transaction'->>'id')) where result ? 'transaction';
alter table public.tenant_reward_mutations enable row level security;
revoke all on public.tenant_reward_mutations from public,anon,authenticated,service_role;

-- Match the existing JavaScript clientRecordHash, including nested profile data.
create function public.reward_record_canonical_json(p_value jsonb) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare result text;
begin
 if jsonb_typeof(p_value)='object' then
  select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.reward_record_canonical_json(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(p_value);
 elsif jsonb_typeof(p_value)='array' then
  select '['||coalesce(string_agg(public.reward_record_canonical_json(value),',' order by ordinality),'')||']' into result from jsonb_array_elements(p_value) with ordinality;
 else result:=coalesce(p_value::text,'null'); end if;
 return result;
end $$;
revoke all on function public.reward_record_canonical_json(jsonb) from public,anon,authenticated,service_role;

-- Once a native receipt exists, a delayed Redis copy cannot change balances,
-- receipts or removal state, even with a future clock. Identical repair and
-- workspace-link updates remain safe. The service-only native writer enables
-- exactly one stable store/record at a time and restores the prior local flag.
create function public.reward_record_native_fence() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare target public.tenant_client_records%rowtype; protected boolean;
begin
 if tg_op='UPDATE' then target:=old; else target:=new; end if;
 if target.store not in ('reward_members','reward_transactions') then return new; end if;
 if target.store='reward_members' then
  select exists(select 1 from public.tenant_reward_mutations r where r.tenant_stable_id=target.tenant_stable_id and r.result ? 'member' and r.result->'member'->>'email'=target.record_id) into protected;
 else
  select exists(select 1 from public.tenant_reward_mutations r where r.tenant_stable_id=target.tenant_stable_id and r.result ? 'transaction' and r.result->'transaction'->>'id'=target.record_id) into protected;
 end if;
 if not protected then return new; end if;
 if current_setting('strelva.reward_record_native',true)=target.tenant_stable_id::text||':'||target.store||':'||target.record_id then return new; end if;
 if tg_op='UPDATE' and new.tenant_stable_id is not distinct from old.tenant_stable_id and new.store=old.store and new.record_id=old.record_id
 and new.payload is not distinct from old.payload and new.payload_hash=old.payload_hash and new.removed_at is not distinct from old.removed_at then return new; end if;
 raise exception 'rewards_native_authority_required';
end $$;
revoke all on function public.reward_record_native_fence() from public,anon,authenticated,service_role;
create trigger reward_record_native_fence before insert or update on public.tenant_client_records
 for each row execute function public.reward_record_native_fence();

create function public.mutate_tenant_reward_record(p_tenant_id text,p_email text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 stable uuid; op text:=p_input->>'operation'; command text:=p_input->>'commandId'; email text:=lower(btrim(p_email));
 member public.tenant_client_records%rowtype; receipt public.tenant_reward_mutations%rowtype;
 payload jsonb; txn jsonb:=p_input->'transaction'; result jsonb; input_hash text;
 available numeric; lifetime numeric; delta numeric; threshold numeric; tier text; override_tier text;
 previous_native_flag text; actor_id uuid; actor_email text; authorized boolean:=false; captured timestamptz; txn_time timestamptz;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('reward-native-writer',1750));
 if p_input is null or jsonb_typeof(p_input)<>'object' or op is null or op not in ('save','adjust','log')
 or command is null or char_length(command) not between 1 and 200
 or email is null or char_length(email) not between 1 and 300 or position('@' in email)=0 then raise exception 'rewards_invalid'; end if;
 -- Teardown/rename cannot change the tenant identity during a reward write.
 perform pg_advisory_xact_lock(hashtextextended('hosted-tenant:'||p_tenant_id,7416));
 select stable_id into stable from public.tenants where id=p_tenant_id and active for share;
 if stable is null then raise exception 'rewards_unknown_tenant'; end if;
 -- Signed-in administration rechecks current verification and permission under
 -- locks held until commit. Trusted service-only import/earn producers can omit
 -- an actor; the exposed admin route always supplies one.
 if p_input ? 'actor' then
  actor_id:=(p_input->'actor'->>'userId')::uuid; actor_email:=lower(btrim(p_input->'actor'->>'verifiedEmail'));
  perform 1 from public.users u where u.id=actor_id and u.verified_at is not null and lower(u.email)=actor_email for share;
  if not found then raise exception 'rewards_access_denied' using errcode='42501'; end if;
  perform 1 from public.memberships m where m.user_id=actor_id and m.tenant_stable_id=stable and m.tenant_id=p_tenant_id and m.role in ('editor','admin','owner') for share;
  authorized:=found;
  if not authorized then
   perform 1 from public.super_admins a where a.user_id=actor_id and a.revoked_at is null for share;
   authorized:=found;
  end if;
  if not authorized then raise exception 'rewards_access_denied' using errcode='42501'; end if;
 end if;
 if txn is not null then
  if jsonb_typeof(txn)<>'object' or txn->>'type' is null or txn->>'type' not in ('earn','redeem','admin-credit','admin-debit')
  or char_length(coalesce(txn->>'id','')) not between 1 and 300 or char_length(btrim(coalesce(txn->>'reason',''))) not between 1 and 10000
  or coalesce(txn->>'amount','') !~ '^[0-9]+$' then raise exception 'rewards_invalid_transaction'; end if;
  if (txn->>'amount')::numeric not between 1 and 9007199254740991 then raise exception 'rewards_invalid_transaction'; end if;
  txn_time:=(txn->>'timestamp')::timestamptz;
  if txn_time is null or not isfinite(txn_time) then raise exception 'rewards_invalid_transaction'; end if;
  if txn->>'type' in ('admin-credit','admin-debit') and not authorized then raise exception 'rewards_access_denied' using errcode='42501'; end if;
  txn:=txn||jsonb_build_object('email',email);
 elsif op='log' then raise exception 'rewards_invalid_transaction'; end if;
 -- Retry identity excludes only the server-generated transaction timestamp.
 -- Actor, member, delta, threshold, type, amount, reason and target remain bound.
 input_hash:=encode(sha256(convert_to(public.reward_record_canonical_json(jsonb_build_object('email',email,'input',case when p_input ? 'transaction' then jsonb_set(p_input,'{transaction}',(p_input->'transaction')-'timestamp') else p_input end)),'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(stable::text||':reward_command:'||command,9106));
 select * into receipt from public.tenant_reward_mutations where tenant_stable_id=stable and command_id=command;
 if found then
  if receipt.input_hash<>input_hash then raise exception 'rewards_command_conflict'; end if;
  return receipt.result;
 end if;
 -- Same lock as every legacy mirror/repair/backfill of this exact member.
 perform pg_advisory_xact_lock(hashtextextended(stable::text||':reward_members:'||email,9106));
 select * into member from public.tenant_client_records where tenant_stable_id=stable and store='reward_members' and record_id=email for update;
 if op='adjust' and (not found or member.removed_at is not null) then return jsonb_build_object('status','missing'); end if;
 captured:=greatest(clock_timestamp(),coalesce(member.captured_at,'-infinity'::timestamptz)+interval '1 microsecond');
 if op='save' then
  payload:=p_input->'member';
  if coalesce(p_input->>'tierThreshold','') !~ '^[0-9]+$' or (p_input->>'tierThreshold')::numeric>9007199254740991 then raise exception 'rewards_invalid_threshold'; end if;
  threshold:=(p_input->>'tierThreshold')::numeric;
  if payload is null or jsonb_typeof(payload)<>'object' or payload->>'email' is distinct from email
    or coalesce(payload->>'starsAvailable','') !~ '^[0-9]+$' or coalesce(payload->>'starsLifetime','') !~ '^[0-9]+$'
    or (payload->>'starsAvailable')::numeric>9007199254740991 or (payload->>'starsLifetime')::numeric>9007199254740991
    or payload->>'tier' is null or payload->>'tier' not in ('snapper','super-snapper')
    or coalesce(payload->>'tierOverride','') not in ('','snapper','super-snapper') then raise exception 'rewards_invalid_member'; end if;
  if member.id is not null and member.removed_at is null then
   -- A profile snapshot is never a balance/lifetime reset or identity rewrite.
   payload:=member.payload||payload||jsonb_build_object('starsAvailable',member.payload->>'starsAvailable','starsLifetime',member.payload->>'starsLifetime','createdAt',member.payload->>'createdAt');
   if coalesce(payload->>'tierOverride','')<>'' then payload:=payload||jsonb_build_object('tier',payload->>'tierOverride');
   else payload:=payload||jsonb_build_object('tier',case when (member.payload->>'starsLifetime')::numeric>=threshold then 'super-snapper' else 'snapper' end); end if;
  end if;
 elsif op='adjust' then
  if coalesce(p_input->>'delta','') !~ '^-?[0-9]+$' or coalesce(p_input->>'tierThreshold','') !~ '^[0-9]+$' then raise exception 'rewards_invalid_delta'; end if;
  delta:=(p_input->>'delta')::numeric; threshold:=(p_input->>'tierThreshold')::numeric;
  if abs(delta)>9007199254740991 or threshold>9007199254740991 then raise exception 'rewards_invalid_delta'; end if;
  if member.payload->>'email' is distinct from email or coalesce(member.payload->>'starsAvailable','') !~ '^[0-9]+$' or coalesce(member.payload->>'starsLifetime','') !~ '^[0-9]+$' then raise exception 'rewards_invalid_balance'; end if;
  available:=(member.payload->>'starsAvailable')::numeric; lifetime:=(member.payload->>'starsLifetime')::numeric;
  if available+delta<0 then return jsonb_build_object('status','insufficient','available',available,'requested',-delta); end if;
  available:=available+delta; lifetime:=lifetime+greatest(delta,0);
  if available>9007199254740991 or lifetime>9007199254740991 then raise exception 'rewards_balance_overflow'; end if;
  override_tier:=coalesce(member.payload->>'tierOverride','');
  if override_tier not in ('','snapper','super-snapper') then raise exception 'rewards_invalid_member'; end if;
  tier:=case when override_tier<>'' then override_tier when lifetime>=threshold then 'super-snapper' else 'snapper' end;
  payload:=member.payload||jsonb_build_object('starsAvailable',available::text,'starsLifetime',lifetime::text,'tier',tier);
  if txn is not null and (delta=0 or (txn->>'amount')::numeric<>abs(delta)
    or (delta>0 and txn->>'type' not in ('earn','admin-credit')) or (delta<0 and txn->>'type' not in ('redeem','admin-debit'))) then raise exception 'rewards_invalid_transaction'; end if;
 end if;
 if payload is not null then
  previous_native_flag:=coalesce(current_setting('strelva.reward_record_native',true),'');
  perform set_config('strelva.reward_record_native',stable::text||':reward_members:'||email,true);
  result:=public.record_tenant_client_record(p_tenant_id,'reward_members',email,payload,encode(sha256(convert_to(public.reward_record_canonical_json(payload),'UTF8')),'hex'),captured,'dual_write','replace');
  perform set_config('strelva.reward_record_native',previous_native_flag,true);
  if result->>'status' not in ('recorded','updated','unchanged') then raise exception 'rewards_member_unconfirmed'; end if;
 end if;
 if txn is not null then
  perform pg_advisory_xact_lock(hashtextextended(stable::text||':reward_transactions:'||(txn->>'id'),9106));
  if exists(select 1 from public.tenant_client_records where tenant_stable_id=stable and store='reward_transactions' and record_id=txn->>'id') then raise exception 'rewards_transaction_conflict'; end if;
  previous_native_flag:=coalesce(current_setting('strelva.reward_record_native',true),'');
  perform set_config('strelva.reward_record_native',stable::text||':reward_transactions:'||(txn->>'id'),true);
  result:=public.record_tenant_client_record(p_tenant_id,'reward_transactions',txn->>'id',txn,encode(sha256(convert_to(public.reward_record_canonical_json(txn),'UTF8')),'hex'),txn_time,'dual_write','replace');
  perform set_config('strelva.reward_record_native',previous_native_flag,true);
  if result->>'status'<>'recorded' then raise exception 'rewards_transaction_unconfirmed'; end if;
 end if;
 result:=jsonb_build_object('status',case op when 'save' then 'saved' when 'adjust' then 'adjusted' else 'logged' end);
 if payload is not null then result:=result||jsonb_build_object('member',payload); end if;
 if txn is not null then result:=result||jsonb_build_object('transaction',txn-'email'); end if;
 insert into public.tenant_reward_mutations(tenant_stable_id,command_id,input_hash,result) values(stable,command,input_hash,result);
 return result;
end $$;
revoke all on function public.mutate_tenant_reward_record(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_tenant_reward_record(text,text,jsonb) to service_role;
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
notify pgrst,'reload schema';
commit;
