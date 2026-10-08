-- Privileged metadata only: no customer rows, credentials, browser or service grants.
-- Capture BEFORE batch 8; then --set=batch8_capture_forward=true immediately
-- AFTER forward and BEFORE any recovery companion. Existing captures refuse reuse.
\set ON_ERROR_STOP on
\if :{?batch8_capture_forward}
\else
\set batch8_capture_forward false
\endif
begin;
set local lock_timeout='3s';
set local statement_timeout='120s';
\if :batch8_capture_forward
do $capture$
declare snapshot jsonb;
begin
  if current_user in ('anon','authenticated','service_role') then raise exception 'batch8_capture_owner_required'; end if;
  snapshot:=release_rollback_baseline.batch8_public_catalog();
  update release_rollback_baseline.batch8_empty_schema set
    forward_catalog=snapshot,forward_hash=md5(snapshot::text),forward_flags=public.workspace_release_flag_names()
    where singleton and captured_by=current_user and forward_catalog is null;
  if not found then raise exception 'batch8_capture_missing_reused_or_wrong_owner'; end if;
end $capture$;
\else
create schema if not exists release_rollback_baseline;
revoke all on schema release_rollback_baseline from public,anon,authenticated,service_role;
create function release_rollback_baseline.batch8_public_catalog() returns jsonb
language sql security invoker set search_path=public,pg_temp as $catalog$
select jsonb_build_object(
 'functions', coalesce((select jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_object('def',pg_get_functiondef(p.oid),'acl',coalesce(p.proacl,acldefault('f',p.proowner))::text,'owner',pg_get_userbyid(p.proowner))) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')), '{}'::jsonb),
 'tables', coalesce((select jsonb_object_agg(c.relname,jsonb_build_object('acl',coalesce(c.relacl,acldefault('r',c.relowner))::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity)) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'), '{}'::jsonb),
 'columns', coalesce((select jsonb_object_agg(c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(ad.adbin,ad.adrelid),'acl',a.attacl::text)) from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped), '{}'::jsonb),
 'constraints', coalesce((select jsonb_object_agg(c.relname||'.'||k.conname, pg_get_constraintdef(k.oid)) from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and c.relkind='r' and k.contype<>'n'), '{}'::jsonb),
 'indexes', coalesce((select jsonb_object_agg(i.relname,jsonb_build_object('table',t.relname,'def',pg_get_indexdef(i.oid))) from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class t on t.oid=x.indrelid where t.relnamespace='public'::regnamespace and not exists(select 1 from pg_constraint k where k.conindid=i.oid)), '{}'::jsonb),
 'triggers', coalesce((select jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_object('def',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal), '{}'::jsonb),
 'policies', coalesce((select jsonb_object_agg(tablename||'.'||policyname,to_jsonb(p)-'schemaname') from pg_policies p where schemaname='public'), '{}'::jsonb)
);
$catalog$;
revoke all on function release_rollback_baseline.batch8_public_catalog() from public,anon,authenticated,service_role;
create table release_rollback_baseline.batch8_empty_schema(
  singleton boolean primary key check(singleton), captured_by name not null,
  before_catalog jsonb not null,before_hash text not null,before_flags text[] not null,
  forward_catalog jsonb,forward_hash text,forward_flags text[]
);
revoke all on table release_rollback_baseline.batch8_empty_schema from public,anon,authenticated,service_role;
do $capture$
declare snapshot jsonb;
begin
  if current_user in ('anon','authenticated','service_role') then raise exception 'batch8_capture_owner_required'; end if;
  snapshot:=release_rollback_baseline.batch8_public_catalog();
  insert into release_rollback_baseline.batch8_empty_schema values
    (true,current_user,snapshot,md5(snapshot::text),public.workspace_release_flag_names(),null,null,null);
end $capture$;
\endif
commit;
