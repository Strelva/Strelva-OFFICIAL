\set ON_ERROR_STOP on
begin;
create function pg_temp.ioa_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry operator authority: %',message; end if; end $$;
insert into public.users(id,email,verified_at) values('c9350000-0000-4000-8000-000000000001','ioa@example.test',now());
insert into public.super_admins(user_id,email) values('c9350000-0000-4000-8000-000000000001','ioa@example.test');
insert into public.tenants(id,stable_id,site_name) values('ioa-site','c9350000-0000-4000-8000-000000000002','Inquiry authority fixture');
select pg_temp.ioa_assert(not public.authorize_inquiry_operator_actor('ioa-site','c9350000-0000-4000-8000-000000000001'),'operator must hold tenant authority');
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) values('c9350000-0000-4000-8000-000000000001','ioa-site','c9350000-0000-4000-8000-000000000002','admin');
select pg_temp.ioa_assert(public.authorize_inquiry_operator_actor('ioa-site','c9350000-0000-4000-8000-000000000001'),'current verified operator and tenant membership authorized');
select pg_temp.ioa_assert(not public.authorize_inquiry_operator_actor('other-site','c9350000-0000-4000-8000-000000000001'),'wrong tenant refused');
update public.users set verified_at=null where id='c9350000-0000-4000-8000-000000000001';
select pg_temp.ioa_assert(not public.authorize_inquiry_operator_actor('ioa-site','c9350000-0000-4000-8000-000000000001'),'revoked verification refused');
update public.users set verified_at=now() where id='c9350000-0000-4000-8000-000000000001';
delete from public.super_admins where user_id='c9350000-0000-4000-8000-000000000001';
select pg_temp.ioa_assert(not public.authorize_inquiry_operator_actor('ioa-site','c9350000-0000-4000-8000-000000000001'),'revoked operator refused');
select pg_temp.ioa_assert(not has_function_privilege('authenticated','public.authorize_inquiry_operator_actor(text,uuid)','execute'),'service only');
insert into public.workspaces(id,kind,name,created_by) values('c9350000-0000-4000-8000-000000000003','customer','Policy read fixture','c9350000-0000-4000-8000-000000000001');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values('c9350000-0000-4000-8000-000000000002','ioa-site','c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000001','c9350000-0000-4000-8000-000000000004',repeat('a',64),'{}');
insert into public.inquiry_workspaces(id,tenant_id,business_id,state) values('c9350000-0000-4000-8000-000000000005','ioa-site','policy-business','{"inquiries":[]}');
insert into public.decision_policies(workspace_id,change_kind,layer,route,set_by,set_reason,version)
 values('c9350000-0000-4000-8000-000000000003','customer.message','owner','owner_decides','c9350000-0000-4000-8000-000000000001','owner_setting',1);
select pg_temp.ioa_assert(public.read_inquiry_message_owner_policy('ioa-site','policy-business')->>'workspaceId'='c9350000-0000-4000-8000-000000000003','policy read bound to canonical business');
select pg_temp.ioa_assert(public.read_inquiry_message_owner_policy('ioa-site','policy-business')->>'inquiryWorkspaceId'='c9350000-0000-4000-8000-000000000005','stable inquiry System origin returned');
select pg_temp.ioa_assert(public.read_inquiry_message_owner_policy('ioa-site','policy-business')->'policies'->0->>'route'='owner_decides','current stricter owner policy returned');
select pg_temp.ioa_assert(public.read_inquiry_message_owner_policy('ioa-site','other-business') is null,'other business does not receive owner policy');
select pg_temp.ioa_assert(not has_function_privilege('authenticated','public.read_inquiry_message_owner_policy(text,text)','execute'),'policy read service-only');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
 values('c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000001','admin','c9350000-0000-4000-8000-000000000001');
insert into public.inquiry_publication_claims(id,tenant_id,business_id,request_id,capability_id,change_id,action,version,idempotency_key,command_digest,claim_token_hash,actor_id,governance_event_id)
 values('c9350000-0000-4000-8000-000000000006','ioa-site','policy-business','request','cap','change','make_live',1,'key',repeat('a',64),repeat('b',64),'c9350000-0000-4000-8000-000000000001','publication-event');
select pg_temp.ioa_assert(not public.authorize_inquiry_publication_actor('ioa-site','c9350000-0000-4000-8000-000000000001','c9350000-0000-4000-8000-000000000006','publication-event'),'admin cannot publish');
update public.memberships set role='owner' where user_id='c9350000-0000-4000-8000-000000000001';
update public.workspace_memberships set role='owner' where user_id='c9350000-0000-4000-8000-000000000001';
select pg_temp.ioa_assert(public.authorize_inquiry_publication_actor('ioa-site','c9350000-0000-4000-8000-000000000001','c9350000-0000-4000-8000-000000000006','publication-event'),'current claim owner may publish');
select pg_temp.ioa_assert(not public.authorize_inquiry_publication_actor('ioa-site','c9350000-0000-4000-8000-000000000001','c9350000-0000-4000-8000-000000000006','wrong-event'),'event binding required');
insert into public.business_records(workspace_id,created_by,updated_by) values('c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000001','c9350000-0000-4000-8000-000000000001');
-- Establish the recipient through the verified owner's write, including the
-- confirmed trust audit on the complete schema.
select public.patch_business_record('c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000001','ioa@example.test','owner',0::bigint,
  '{"facts":{"owner_recipient":{"value":{"email":"ioa@example.test"},"verified":true}}}'::jsonb,
  'c9350000-0000-4000-8000-000000000010'::uuid,repeat('c',64));
insert into public.owner_decisions(id,workspace_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,urgent,sign_in_required,expires_at)
 values('c9350000-0000-4000-8000-000000000007','c9350000-0000-4000-8000-000000000003','system.go_live','owner_decides','Publish','Form goes live','Nothing publishes','tenant_event','ioa-site:publication-event',repeat('a',64),false,false,now()+interval '14 days');
select pg_temp.ioa_assert(not public.authorize_inquiry_owner_link_publication('ioa-site','publication-event',repeat('a',64),'ioa@example.test','c9350000-0000-4000-8000-000000000006'),'unclaimed signed publication refused');
select public.record_owner_decision_delivery('c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000007','digest','sent','ioa@example.test','ioa-fictional-accepted-007',null);
select public.claim_owner_decision('c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000007',repeat('a',64),'approve','owner_link',null,null,'ioa@example.test');
select pg_temp.ioa_assert(public.authorize_inquiry_owner_link_publication('ioa-site','publication-event',repeat('a',64),'ioa@example.test','c9350000-0000-4000-8000-000000000006'),'exact approved signed publication accepted');
select pg_temp.ioa_assert(not public.authorize_inquiry_owner_link_publication('ioa-site','publication-event',repeat('b',64),'ioa@example.test','c9350000-0000-4000-8000-000000000006'),'stale publication revision refused');
select pg_temp.ioa_assert(not public.authorize_inquiry_owner_link_publication('ioa-site','publication-event',repeat('a',64),'other@example.test','c9350000-0000-4000-8000-000000000006'),'other recipient refused');
update public.workspace_memberships set role='admin' where user_id='c9350000-0000-4000-8000-000000000001';
select pg_temp.ioa_assert(not public.authorize_inquiry_publication_actor('ioa-site','c9350000-0000-4000-8000-000000000001','c9350000-0000-4000-8000-000000000006','publication-event'),'revoked workspace owner refused');
select pg_temp.ioa_assert(not has_function_privilege('authenticated','public.authorize_inquiry_owner_link_publication(text,text,text,text,uuid,text)','execute'),'publication signed authorization service-only');
insert into public.owner_decisions(id,workspace_id,change_kind,route,title,approve_effect,not_yet_effect,source_lifecycle,source_id,revision_hash,urgent,sign_in_required,expires_at)
 values('c9350000-0000-4000-8000-000000000008','c9350000-0000-4000-8000-000000000003','system.go_live','owner_decides','Decline revised publication','Form goes live','Nothing publishes','tenant_event','ioa-site:publication-event',repeat('b',64),false,false,now()+interval '14 days'),
 ('c9350000-0000-4000-8000-000000000009','c9350000-0000-4000-8000-000000000003','customer.message','owner_decides','Decline message','Sends','Nothing sends','tenant_event','ioa-site:message-event',repeat('a',64),true,false,now()+interval '14 days');
select public.record_owner_decision_delivery('c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000008','digest','sent','ioa@example.test','ioa-fictional-accepted-008',null);
select public.claim_owner_decision('c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000008',repeat('b',64),'not_yet','owner_link',null,null,'ioa@example.test');
select public.record_owner_decision_delivery('c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000009','digest','sent','ioa@example.test','ioa-fictional-accepted-009',null);
select public.claim_owner_decision('c9350000-0000-4000-8000-000000000003','c9350000-0000-4000-8000-000000000009',repeat('a',64),'not_yet','owner_link',null,null,'ioa@example.test');
select pg_temp.ioa_assert(public.authorize_inquiry_owner_link_publication('ioa-site','publication-event',repeat('b',64),'ioa@example.test','c9350000-0000-4000-8000-000000000006','dismissed'),'signed Not yet may close publication');
select pg_temp.ioa_assert(not public.authorize_inquiry_owner_link_publication('ioa-site','publication-event',repeat('b',64),'ioa@example.test','c9350000-0000-4000-8000-000000000006','approved'),'signed decline never authorizes publication');
select pg_temp.ioa_assert(public.authorize_inquiry_owner_link_message_action('ioa-site','message-event',repeat('a',64),'ioa@example.test','dismissed'),'signed Not yet may close message');
select pg_temp.ioa_assert(not public.authorize_inquiry_owner_link_message_action('ioa-site','message-event',repeat('a',64),'ioa@example.test','approved'),'signed decline never authorizes send');
rollback;
