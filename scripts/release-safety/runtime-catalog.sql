-- Temporary helper only; public runtime remains unchanged. Includes bodies,
-- owners, ACLs, table/column contracts, constraints, indexes, triggers and RLS.
create or replace function pg_temp.batch8_runtime_catalog() returns jsonb
language sql as $catalog$
select jsonb_build_object(
 'functions', coalesce((select jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_object('def',pg_get_functiondef(p.oid),'acl',coalesce(p.proacl,acldefault('f',p.proowner))::text,'owner',pg_get_userbyid(p.proowner))) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')), '{}'::jsonb),
 'tables', coalesce((select jsonb_object_agg(c.relname,jsonb_build_object('acl',coalesce(c.relacl,acldefault('r',c.relowner))::text,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity)) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'), '{}'::jsonb),
 'columns', coalesce((select jsonb_object_agg(c.relname||'.'||a.attname,jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(ad.adbin,ad.adrelid),'acl',a.attacl::text)) from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef ad on ad.adrelid=a.attrelid and ad.adnum=a.attnum where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped), '{}'::jsonb),
 'constraints', coalesce((select jsonb_object_agg(c.relname||'.'||k.conname, pg_get_constraintdef(k.oid)) from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='public'::regnamespace and c.relkind='r' and k.contype<>'n'), '{}'::jsonb),
 'indexes', coalesce((select jsonb_object_agg(i.relname,jsonb_build_object('table',t.relname,'def',pg_get_indexdef(i.oid))) from pg_index x join pg_class i on i.oid=x.indexrelid join pg_class t on t.oid=x.indrelid where t.relnamespace='public'::regnamespace and not exists(select 1 from pg_constraint k where k.conindid=i.oid)), '{}'::jsonb),
 'triggers', coalesce((select jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_object('def',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal), '{}'::jsonb),
 'policies', coalesce((select jsonb_object_agg(tablename||'.'||policyname,to_jsonb(p)-'schemaname') from pg_policies p where schemaname='public'), '{}'::jsonb)
)
$catalog$;
create or replace function pg_temp.batch8_runtime_fingerprint() returns text
language sql as $$ select encode(sha256(convert_to(pg_temp.batch8_runtime_catalog()::text,'UTF8')),'hex') $$;
-- Role security is outside public object ACLs. Pin the whole role identity,
-- attribute and membership graph (no passwords or other credential fields).
-- Conservative: even an unrelated role change requires a reviewed recovery.
create or replace function pg_temp.batch8_runtime_role_fingerprint() returns text
language sql as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'roles',(select coalesce(jsonb_agg(jsonb_build_object(
      'oid',r.oid,'name',r.rolname,'superuser',r.rolsuper,'inherit',r.rolinherit,
      'createRole',r.rolcreaterole,'createDb',r.rolcreatedb,'login',r.rolcanlogin,
      'replication',r.rolreplication,'bypassRls',r.rolbypassrls) order by r.oid),'[]'::jsonb) from pg_roles r),
    'memberships',(select coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]'::jsonb) from pg_auth_members m)
  )::text,'UTF8')),'hex')
$$;
