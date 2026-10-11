\set ON_ERROR_STOP on
\o /dev/null
create function pg_temp.rr_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'read-only reader assertion: %',label; end if; end $$;
create function pg_temp.rr_expect(statement text, expected_state text default null, expected_message text default null) returns void language plpgsql as $$
declare ok boolean;
begin
  begin execute statement into ok;
  exception when others then
    if sqlstate is distinct from expected_state or (expected_message is not null and sqlerrm<>expected_message) then raise; end if;
    return;
  end;
  if expected_state is not null then raise exception 'Expected %: %',expected_state,statement; end if;
  perform pg_temp.rr_assert(ok,statement);
end $$;
select to_regprocedure('public.system_read_scope_package_core(uuid,uuid,text,boolean)') is not null as package_reader_tail \gset
\if :package_reader_tail
\ir ../supabase/migrations/rollback-20261020090026_package_readonly_authority.sql
\endif
-- A later provider-seat tail preserves the new legitimate website read scope.
select position('public.provider_seat_read_role(' in prosrc)>0 as reader_provider_tail from pg_proc where oid='public.website_document_read_actor(uuid,uuid,uuid,text,boolean,boolean)'::regprocedure \gset
-- The entire public catalog, including writer bodies, ACLs and volatility.
create temporary table rr_final as select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl
  from pg_proc p where pronamespace='public'::regnamespace and prokind='f';
\ir ../supabase/migrations/rollback-20261013230000_readonly_reader_authority.sql
create temporary table rr_baseline as select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl
  from pg_proc p where pronamespace='public'::regnamespace and prokind='f';
-- Committed setup is required before actual READ ONLY request transactions.
begin;
\ir support/readonly-reader-fixture.sql
\ir support/readonly-reader-cases.sql
commit;
select pg_temp.rr_assert((select count(*)=26 from readonly_reader_cases),'reported reader class and previous ten volatility workarounds exercised');
select pg_temp.rr_assert(exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace
 and p.proname=c.rpc_name and p.pronargs=(select count(*) from jsonb_object_keys(c.parameters))
 and array(select jsonb_object_keys(c.parameters)) <@ p.proargnames),c.rpc_name||' HTTP parameter names match catalog')
 from readonly_reader_cases c;
-- Every locking path reproduces the original failure with real authorized data.
-- Fourteen STABLE functions (one private helper), the UUID offer overload
-- and prior ten workaround readers. Agency overview masks 25006 as an
-- unavailable client; W6 Systems export already works and is a control.
select format('begin read only; %s select pg_temp.rr_expect(%L,%L); rollback;',
 case when exposed then 'set local role service_role;' else '' end,
 case when rpc_name='agency_client_overview_v2' then 'select not ('||substr(statement,8)||')' else statement end,
 case when rpc_name='agency_client_overview_v2' or (rpc_name='export_workspace_v3_category' and parameters->>'p_category'='systems') then null else '25006' end) from readonly_reader_cases \gexec
\ir ../supabase/migrations/20261013230000_readonly_reader_authority.sql
\if :reader_provider_tail
\ir ../supabase/migrations/20261018130000_provider_seat_readonly_website_authority.sql
\endif

\if :package_reader_tail
\ir ../supabase/migrations/20261020090026_package_readonly_authority.sql
\endif
