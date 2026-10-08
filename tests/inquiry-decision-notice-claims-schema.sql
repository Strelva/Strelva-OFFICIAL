\set ON_ERROR_STOP on
begin;
create function pg_temp.idn_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry decision notice: %',message; end if; end $$;
create function pg_temp.idn_expect(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then if sqlerrm<>expected then raise exception 'expected % got %',expected,sqlerrm; end if; return; end;
  raise exception 'expected rejection: %',expected;
end $$;
select pg_temp.idn_assert(not has_table_privilege('service_role','public.inquiry_decision_notice_claims','select')
  and not has_function_privilege('authenticated','public.claim_inquiry_decision_notice(uuid,uuid,text,text)','execute')
  and has_function_privilege('service_role','public.finish_inquiry_decision_notice(uuid,uuid,text,text,timestamptz,text)','execute'), 'service-only RPCs and no table grants');
insert into public.users(id,email,verified_at) values ('c1700000-0000-4000-8000-000000000001','idn-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values ('c1700000-0000-4000-8000-000000000002','customer','Notice fixture','c1700000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000001','owner','c1700000-0000-4000-8000-000000000001');
insert into public.business_records(workspace_id,created_by,updated_by) values ('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000001','c1700000-0000-4000-8000-000000000001');
insert into public.business_record_facts(workspace_id,fact_key,value,source,verified,updated_by) values
  ('c1700000-0000-4000-8000-000000000002','owner_recipient','{"email":"idn-owner@example.test"}','owner',true,'c1700000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,active,owner_email) values ('fixture','c1700000-0000-4000-8000-000000000006','Notice fixture',true,'idn-owner@example.test');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values
  ('c1700000-0000-4000-8000-000000000006','fixture','c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000001','c1700000-0000-4000-8000-000000000007',repeat('3',64),'{}');
insert into public.owner_decisions(id,workspace_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,urgent,sign_in_required,expires_at)
  values ('c1700000-0000-4000-8000-000000000003','c1700000-0000-4000-8000-000000000002','customer.commitment','owner_decides','Reply to inquiry','Reply sends','Nothing sends','tenant_event','fixture:evt-1',repeat('1',64),true,false,now()+interval '14 days'),
  ('c1700000-0000-4000-8000-000000000004','c1700000-0000-4000-8000-000000000002','customer.commitment','owner_decides','Reply to another inquiry','Reply sends','Nothing sends','tenant_event','fixture:evt-2',repeat('2',64),true,false,now()+interval '14 days');
select pg_temp.idn_expect($$select public.claim_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000003',repeat('2',64),'idn-owner@example.test')$$,'owner_decision_not_open');
select pg_temp.idn_expect($$select public.claim_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000003',repeat('1',64),'stranger@example.test')$$,'owner_decision_recipient_not_owner');
select pg_temp.idn_expect($$select public.claim_inquiry_decision_notice('c1700000-0000-4000-8000-000000000005','c1700000-0000-4000-8000-000000000003',repeat('1',64),'idn-owner@example.test')$$,'owner_decision_invalid');
select pg_temp.idn_assert(public.claim_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000003',repeat('1',64),'idn-owner@example.test')->>'acquired'='true','first claim wins');
select pg_temp.idn_assert(public.claim_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000003',repeat('1',64),'idn-owner@example.test')->>'acquired'='false','sending is never reacquired');
select public.finish_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000003','unknown',null,null,'provider timeout');
select pg_temp.idn_assert(public.claim_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000003',repeat('1',64),'idn-owner@example.test')->>'status'='unknown','unknown never reacquired');
select pg_temp.idn_assert(not public.finish_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000003','suppressed',null,null,null),'unknown outcome cannot be overwritten');
select public.claim_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000004',repeat('2',64),'idn-owner@example.test');
select public.finish_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000004','accepted','idn-msg',clock_timestamp(),null);
select pg_temp.idn_assert(public.claim_inquiry_decision_notice('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000004',repeat('2',64),'idn-owner@example.test')->>'status'='accepted','accepted never reacquired');
select pg_temp.idn_assert((select delivery_state='sent' from public.owner_decisions where id='c1700000-0000-4000-8000-000000000004'),'acceptance records delivery atomically');
select pg_temp.idn_assert(not public.authorize_inquiry_owner_link_decision('fixture','evt-1',repeat('1',64),'idn-owner@example.test'),'actor label alone grants no owner authority');
-- An ambiguous notice has no accepted delivery to bind its link after recipient trust.
-- Preserve its non-retry evidence above; the second notice was accepted and is
-- the fixture's valid signed-owner decision.
do $$ begin
  if to_regclass('public.owner_decision_link_bindings') is not null then
    perform pg_temp.idn_expect($q$select public.claim_owner_decision('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000003',repeat('1',64),'approve','owner_link',null,null,'idn-owner@example.test')$q$,'owner_decision_recipient_not_owner');
  end if;
end $$;
select public.claim_owner_decision('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000004',repeat('2',64),'approve','owner_link',null,null,'idn-owner@example.test');
select pg_temp.idn_assert(public.authorize_inquiry_owner_link_decision('fixture','evt-2',repeat('2',64),'idn-owner@example.test'),'exact accepted signed decision authorizes its event');
select pg_temp.idn_assert(not public.authorize_inquiry_owner_link_decision('fixture','evt-2',repeat('1',64),'idn-owner@example.test')
  and not public.authorize_inquiry_owner_link_decision('other-fixture','evt-2',repeat('2',64),'idn-owner@example.test')
  and not public.authorize_inquiry_owner_link_decision('fixture','evt-1',repeat('2',64),'idn-owner@example.test')
  and not public.authorize_inquiry_owner_link_decision('fixture','evt-2',repeat('2',64),'other@example.test'),'revision, business, event and recipient all bind');
-- Rotate through the owner's write, which also updates confirmed recipient trust.
-- A direct working-row overwrite is pending after #509 and cannot revoke it.
select public.patch_business_record('c1700000-0000-4000-8000-000000000002','c1700000-0000-4000-8000-000000000001','idn-owner@example.test','owner',0,
  '{"facts":{"owner_recipient":{"value":{"email":"new-owner@example.test"}}}}', 'c1700000-0000-4000-8000-000000000008', repeat('8',64));
select pg_temp.idn_assert(not public.authorize_inquiry_owner_link_decision('fixture','evt-2',repeat('2',64),'idn-owner@example.test'),'revoked owner recipient cannot reuse old authority');
rollback;
