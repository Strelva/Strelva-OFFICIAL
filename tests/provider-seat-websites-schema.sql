\set ON_ERROR_STOP on
-- Real website RPCs on fictional data; callers have no direct client membership.
-- Run with -v rollback_expected=false (forward/reapply) or true (rollback).
begin;
create function pg_temp.pw_assert(value boolean, label text) returns void language plpgsql as $$begin if value is not true then raise exception 'provider website assertion failed: %',label; end if; end$$;
create function pg_temp.pw_expect(statement text, expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm not like expected then raise exception 'expected % got %',expected,sqlerrm; end if; return; end; raise exception 'expected failure: %',statement; end$$;
insert into public.users(id,email,verified_at) values
 ('5f000000-0000-4000-8000-000000000001','pw-owner@example.test',now()),
 ('5f000000-0000-4000-8000-000000000002','pw-agency@example.test',now()),
 ('5f000000-0000-4000-8000-000000000003','pw-staff@example.test',now()),
 ('5f000000-0000-4000-8000-000000000004','pw-unstaffed@example.test',now()),
 ('5f000000-0000-4000-8000-000000000005','pw-other@example.test',now()),
 ('5f000000-0000-4000-8000-000000000006','pw-unverified@example.test',null);
insert into public.workspaces(id,kind,name,created_by) values
 ('5f000000-0000-4000-8000-000000000010','customer','Website client','5f000000-0000-4000-8000-000000000001'),
 ('5f000000-0000-4000-8000-000000000020','agency','Website agency','5f000000-0000-4000-8000-000000000002'),
 ('5f000000-0000-4000-8000-000000000030','agency','Other agency','5f000000-0000-4000-8000-000000000005');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000001','owner','5f000000-0000-4000-8000-000000000001'),
 ('5f000000-0000-4000-8000-000000000020','5f000000-0000-4000-8000-000000000002','owner','5f000000-0000-4000-8000-000000000002'),
 ('5f000000-0000-4000-8000-000000000020','5f000000-0000-4000-8000-000000000003','member','5f000000-0000-4000-8000-000000000002'),
 ('5f000000-0000-4000-8000-000000000020','5f000000-0000-4000-8000-000000000004','member','5f000000-0000-4000-8000-000000000002'),
 ('5f000000-0000-4000-8000-000000000020','5f000000-0000-4000-8000-000000000006','member','5f000000-0000-4000-8000-000000000002'),
 ('5f000000-0000-4000-8000-000000000030','5f000000-0000-4000-8000-000000000005','owner','5f000000-0000-4000-8000-000000000005');
select public.choose_business_provider('5f000000-0000-4000-8000-000000000001','pw-owner@example.test','5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('5f000000-0000-4000-8000-000000000002','pw-agency@example.test','5f000000-0000-4000-8000-000000000020','5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000003',true);
select public.set_agency_client_staff('5f000000-0000-4000-8000-000000000002','pw-agency@example.test','5f000000-0000-4000-8000-000000000020','5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000006',true);
-- Create as the direct owner in both modes, then test exact website update as staff.
create temp table pw_work as select * from public.claim_website_rebuild('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000001','pw-owner@example.test','provider-website-owner-fixture','owner-description','{}',
 '{"version":2,"revision":0,"title":"Owner website","createdBy":"5f000000-0000-4000-8000-000000000001","createdAt":"2026-10-07T00:00:00Z","history":[]}');
create function pg_temp.pw_update(product text default 'websites') returns void language plpgsql as $$declare item public.saved_product_work; begin
 select * into item from pw_work;
 perform public.update_bounded_product_work(item.id,item.workspace_id,'5f000000-0000-4000-8000-000000000003','pw-staff@example.test',product,0,
 item.payload || '{"revision":1,"history":[{"revision":1,"kind":"rebuild_checkpoint","actorId":"5f000000-0000-4000-8000-000000000003","at":"2026-10-07T00:00:01Z"}]}'); end$$;
\if :rollback_expected
-- Existing website draft access from acting-provider gates survives this rollback.
select public.website_document_assert_actor('5f000000-0000-4000-8000-000000000010',null,'5f000000-0000-4000-8000-000000000003','pw-staff@example.test',false,true);
select pg_temp.pw_expect('select pg_temp.pw_update()','workspace_access_denied');
\else
-- Scope: website-only, no invented membership, and owner-only live launch remains refused.
select pg_temp.pw_assert(not exists(select 1 from public.workspace_memberships where workspace_id='5f000000-0000-4000-8000-000000000010' and user_id='5f000000-0000-4000-8000-000000000003'),'staff has no direct client membership');
select public.website_document_assert_actor('5f000000-0000-4000-8000-000000000010',(select id from pw_work),'5f000000-0000-4000-8000-000000000003','pw-staff@example.test',true,true);
select pg_temp.pw_expect($$select public.website_document_assert_launch_owner('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000003')$$,'workspace_access_denied');
select pg_temp.pw_expect($$select pg_temp.pw_update('scheduling')$$,'workspace_access_denied');
select pg_temp.pw_update();
select pg_temp.pw_assert((select payload->>'revision'='1' from public.saved_product_work where id=(select id from pw_work)),'staff persisted real v2 checkpoint');
select pg_temp.pw_assert((select count(*)=1 from public.claim_website_rebuild('5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000003','pw-staff@example.test','provider-website-staff-fixture','staff-description','{}',
 '{"version":2,"revision":0,"title":"Staff website","createdBy":"5f000000-0000-4000-8000-000000000003","createdAt":"2026-10-07T00:00:00Z","history":[]}')),'staff creates real saved rebuild');
-- Every denied identity/context is rejected before website mutation.
select pg_temp.pw_expect($$select public.website_document_assert_actor('5f000000-0000-4000-8000-000000000010',null,'5f000000-0000-4000-8000-000000000004','pw-unstaffed@example.test',false,true)$$,'workspace_access_denied');
select pg_temp.pw_expect($$select public.website_document_assert_actor('5f000000-0000-4000-8000-000000000010',null,'5f000000-0000-4000-8000-000000000005','pw-other@example.test',false,true)$$,'workspace_access_denied');
select pg_temp.pw_expect($$select public.website_document_assert_actor('5f000000-0000-4000-8000-000000000010',null,'5f000000-0000-4000-8000-000000000006','pw-unverified@example.test',false,true)$$,'workspace_access_denied');
select pg_temp.pw_expect($$select public.website_document_assert_actor('5f000000-0000-4000-8000-000000000010',null,'5f000000-0000-4000-8000-000000000003','wrong@example.test',false,true)$$,'workspace_access_denied');
select public.set_agency_client_staff('5f000000-0000-4000-8000-000000000002','pw-agency@example.test','5f000000-0000-4000-8000-000000000020','5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000003',false);
select pg_temp.pw_expect($$select public.website_document_assert_actor('5f000000-0000-4000-8000-000000000010',null,'5f000000-0000-4000-8000-000000000003','pw-staff@example.test',false,true)$$,'workspace_access_denied');
select public.set_agency_client_staff('5f000000-0000-4000-8000-000000000002','pw-agency@example.test','5f000000-0000-4000-8000-000000000020','5f000000-0000-4000-8000-000000000010','5f000000-0000-4000-8000-000000000003',true);
delete from public.workspace_memberships where workspace_id='5f000000-0000-4000-8000-000000000020' and user_id='5f000000-0000-4000-8000-000000000003';
select pg_temp.pw_expect($$select public.website_document_assert_actor('5f000000-0000-4000-8000-000000000010',null,'5f000000-0000-4000-8000-000000000003','pw-staff@example.test',false,true)$$,'workspace_access_denied');
select public.end_business_provider('5f000000-0000-4000-8000-000000000001','pw-owner@example.test','5f000000-0000-4000-8000-000000000010','Fixture ended');
select pg_temp.pw_expect($$select public.website_document_assert_actor('5f000000-0000-4000-8000-000000000010',null,'5f000000-0000-4000-8000-000000000003','pw-staff@example.test',false,true)$$,'workspace_access_denied');
\endif
rollback;
