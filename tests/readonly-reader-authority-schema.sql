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
-- Reapply restores the exact full public function catalog; no reader is made
-- VOLATILE to select READ WRITE. Unrelated writers keep their baseline bodies.
select pg_temp.rr_assert(not exists(
 (select signature,definition,proacl from rr_final except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl from pg_proc p where pronamespace='public'::regnamespace and prokind='f')
 union all
 (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl from pg_proc p where pronamespace='public'::regnamespace and prokind='f' except select signature,definition,proacl from rr_final)
),'rollback/reapply restores exact public function catalog');
select format('begin read only; %s select pg_temp.rr_expect(%L); rollback;',case when exposed then 'set local role service_role;' else '' end,statement) from readonly_reader_cases \gexec
-- Identity mismatch and verified outsiders must fail in READ ONLY as well.
select format('begin read only; %s select pg_temp.rr_expect(%L,%L,%L); rollback;',
 case when exposed then 'set local role service_role;' else '' end,
 replace(replace(statement,'13230000-0000-4000-8000-000000000001','13230000-0000-4000-8000-000000000003'),'readonly-owner@example.test','readonly-outsider@example.test'),'P0001',denial)
 from readonly_reader_cases where denial is not null \gexec
select format('begin read only; %s select pg_temp.rr_expect(%L,%L,%L); rollback;',
 case when exposed then 'set local role service_role;' else '' end,
 replace(statement,'readonly-owner@example.test','wrong@example.test'),'P0001',denial)
 from readonly_reader_cases where denial is not null \gexec
begin;
update public.users set verified_at=null where id='13230000-0000-4000-8000-000000000001';
commit;
select format('begin read only; %s select pg_temp.rr_expect(%L,%L,%L); rollback;',
 case when exposed then 'set local role service_role;' else '' end,statement,'P0001',denial)
 from readonly_reader_cases where denial is not null \gexec
begin;
update public.users set verified_at=now() where id='13230000-0000-4000-8000-000000000001';
commit;
-- The bearer-offer reader carries no actor parameters: unknown, expired,
-- changed and revoked grants deny the same offer. A GET creates no booking.
begin read only;
set local role service_role;
select pg_temp.rr_expect($$select public.read_inquiry_booking_offer('13230000-ffff-4000-8000-000000000099'::uuid) is null$$);
rollback;
begin;
update public.inquiry_booking_offers set expires_at=now()-interval '1 hour' where id=:'reader_offer_id';
commit;
begin read only;
set local role service_role;
select pg_temp.rr_expect(format('select public.read_inquiry_booking_offer(%L::uuid) is null',:'reader_offer_id'));
rollback;
begin;
update public.inquiry_booking_offers set expires_at=now()+interval '24 hours' where id=:'reader_offer_id';
update public.booking_settings set revision=revision+1 where tenant_stable_id='1323ffff-0000-4000-8000-000000000010';
commit;
begin read only;
set local role service_role;
select pg_temp.rr_expect(format('select public.read_inquiry_booking_offer(%L::uuid)',:'reader_offer_id'),'P0001','inquiry_booking_changed');
rollback;
begin;
update public.booking_settings set revision=revision-1 where tenant_stable_id='1323ffff-0000-4000-8000-000000000010';
commit;
begin;
update public.offering_website_bindings set status='revoked',revoked_at=now(),revoked_by='13230000-0000-4000-8000-000000000001',revocation_reason='Local read-only regression',revision=revision+1 where tenant_id_at_binding='readonly-reader-site';
commit;
begin read only;
set local role service_role;
select pg_temp.rr_expect(format('select public.read_inquiry_booking_offer(%L::uuid)',:'reader_offer_id'),'P0001','inquiry_booking_unavailable');
rollback;
select pg_temp.rr_assert((select count(*)=0 from public.business_bookings where origin='inquiry' and workspace_id=:'reader_workspace_id'),'offer reads create no booking');
-- Reader helpers remain inaccessible, including to service_role.
select pg_temp.rr_assert(not has_function_privilege('service_role',p.oid,'execute')
 and not has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute'),p.oid::regprocedure::text||' private')
 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=any(array[
 'provider_seat_read_role','business_record_read_actor','system_read_scope','system_read_load','system_version_read_access',
 'operator_queue_read_operator','business_effort_read_operator','make_real_read_actor','website_document_read_actor','inquiry_read_member','inquiry_booking_read_witness']);
-- Rollback returns the baseline exactly and safe reapply/retry preserves it.
\ir ../supabase/migrations/rollback-20261013230000_readonly_reader_authority.sql
select pg_temp.rr_assert(not exists(
 (select signature,definition,proacl from rr_baseline except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl from pg_proc p where pronamespace='public'::regnamespace and prokind='f')
 union all
 (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl from pg_proc p where pronamespace='public'::regnamespace and prokind='f' except select signature,definition,proacl from rr_baseline)
),'rollback restores exact baseline including writer bodies and ACLs');
\ir ../supabase/migrations/20261013230000_readonly_reader_authority.sql
\ir ../supabase/migrations/20261013230000_readonly_reader_authority.sql
\o
\echo Read-only reader proof: 26 READ ONLY calls pass after repair; baseline locking/projection failures reproduced; outsider/bearer denial; exact catalog rollback/reapply; writer definitions unchanged.
