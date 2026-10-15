\set ON_ERROR_STOP on
begin;
create function pg_temp.conn_apps_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Connections Apps: %',label; end if; end $$;
create function pg_temp.conn_apps_expect(q text,expected text) returns void language plpgsql as $$ begin begin execute q; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise; end; raise exception 'Expected %',expected; end $$;
do $$ declare definition jsonb; declaration jsonb; requirement jsonb; legacy jsonb; q jsonb; begin
 select r.definition,r.declaration into definition,legacy from public.system_version_source_revisions r where id='ca000000-0000-4000-8000-000000000021';
 perform pg_temp.conn_apps_assert(not legacy ? 'requiredConnections','old stored revision remains byte-shape compatible');
 declaration:=public.system_package_behavior(definition,'{}');
 requirement:='[{"provider":"resend","access":"act","optional":false,"purpose":"Send System email to approved recipients"}]';
 perform pg_temp.conn_apps_assert(declaration->'requiredConnections'=requirement,'email runtime declares actual platform provider');
 perform public.system_package_assert_declaration(definition,legacy,'{}');
 perform public.system_package_assert_declaration(definition,declaration,'{}');
 perform pg_temp.conn_apps_expect(format('select public.system_package_assert_declaration(%L,%L,''{}'')',definition,jsonb_set(declaration,'{requiredConnections}','[]')),'system_package_declaration_exceeded');
 perform pg_temp.conn_apps_expect(format('select public.system_package_assert_declaration(%L,%L,''{}'')',definition,jsonb_set(declaration,'{requiredConnections,0,access}','"read"')),'system_package_declaration_exceeded');
 perform pg_temp.conn_apps_expect(format('select public.system_package_assert_declaration(%L,%L,''{}'')',definition,jsonb_set(declaration,'{requiredConnections,0,optional}','true')),'system_package_declaration_exceeded');
 perform pg_temp.conn_apps_expect(format('select public.system_package_assert_declaration(%L,%L,''{}'')',definition,jsonb_set(declaration,'{requiredConnections}',requirement||'[{"provider":"imaginary","access":"read","optional":true,"purpose":"Unsafe claim"}]')),'system_package_declaration_invalid');
 perform pg_temp.conn_apps_expect(format('select public.system_package_assert_declaration(%L,%L,''{}'')',definition,jsonb_set(declaration,'{requiredConnections}',requirement||'[{"provider":"highlevel","access":"read","optional":true,"purpose":"Unused provider claim"}]')),'system_package_declaration_exceeded');
 perform pg_temp.conn_apps_assert(public.system_package_behavior('{"kind":"website_section","title":"FAQ","items":[{"question":"When?","answer":"Ask our team."}]}','{}')->'requiredConnections'='[]','website publish adds no outside account');
 perform pg_temp.conn_apps_assert(public.system_package_behavior(jsonb_build_object('kind','bundle','systems',jsonb_build_array(jsonb_build_object('key','one','name','One','definition',definition),jsonb_build_object('key','two','name','Two','definition',definition))),'{}')->'requiredConnections'=requirement,'bundle deduplicates requirements');
 perform pg_temp.conn_apps_expect($q$select public.system_package_behavior('{"kind":"booking","provider":"calendly"}','{}')$q$,'system_package_runtime_unsupported');
 q:=public.record_system_revision_qualification('ca000000-0000-4000-8000-000000000001','conn-apps@example.test','ca000000-0000-4000-8000-000000000021');
 perform pg_temp.conn_apps_assert(exists(select 1 from jsonb_array_elements(q->'evidence') e where e->>'check'='declaration_match' and e->>'status'='passed'),'database qualification includes derived legacy connections');
 perform pg_temp.conn_apps_assert((select r.declaration=legacy from public.system_version_source_revisions r where id='ca000000-0000-4000-8000-000000000021'),'qualification does not rewrite immutable declaration');
end $$;
select pg_temp.conn_apps_assert((select relrowsecurity from pg_class where oid='conn_apps_rollback.functions'::regclass),'migration metadata has RLS');
select pg_temp.conn_apps_assert(not has_table_privilege('authenticated','conn_apps_rollback.functions','SELECT'),'client cannot read snapshots');
select pg_temp.conn_apps_assert(not has_function_privilege('anon','public.system_package_behavior(jsonb,text[])','EXECUTE') and not has_function_privilege('authenticated','public.system_package_assert_declaration(jsonb,jsonb,text[])','EXECUTE'),'closed helpers stay private');
rollback;
