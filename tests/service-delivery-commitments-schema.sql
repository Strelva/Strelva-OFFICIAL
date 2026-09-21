\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.delivery_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'delivery assertion failed: %',message; end if; end; $$;
select pg_temp.delivery_assert(
  not has_function_privilege('anon','public.change_service_delivery_commitment(uuid,text,uuid,bigint,jsonb,text,text)','EXECUTE')
  and not has_function_privilege('authenticated','public.read_service_delivery_permissions(uuid,text,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.change_service_delivery_commitment(uuid,text,uuid,bigint,jsonb,text,text)','EXECUTE'),
  'new functions require actor-checked server calls');
insert into public.users(id,email,verified_at) values
 ('a9100000-0000-4000-8000-000000000001','delivery-owner@example.test',now()),
 ('a9100000-0000-4000-8000-000000000002','delivery-member@example.test',now()),
 ('a9100000-0000-4000-8000-000000000003','delivery-provider@example.test',now()),
 ('a9100000-0000-4000-8000-000000000004','delivery-outsider@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('a9100000-0000-4000-8000-000000000010','customer','Delivery test business','a9100000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('a9100000-0000-4000-8000-000000000010','a9100000-0000-4000-8000-000000000001','owner','a9100000-0000-4000-8000-000000000001'),
 ('a9100000-0000-4000-8000-000000000010','a9100000-0000-4000-8000-000000000002','member','a9100000-0000-4000-8000-000000000001');
insert into public.super_admins(user_id,email) values ('a9100000-0000-4000-8000-000000000003','delivery-provider@example.test');
insert into public.tenants(id,site_name,active) values ('delivery-launch-test','Delivery launch test',true);
insert into public.offering_website_bindings(id,business_workspace_id,tenant_stable_id,tenant_id_at_binding,site_name_at_binding,idempotency_key,command_digest,created_by,updated_by)
select 'a9100000-0000-4000-8000-000000000020','a9100000-0000-4000-8000-000000000010',stable_id,id,site_name,'delivery-test-binding',repeat('f',64),
 'a9100000-0000-4000-8000-000000000001','a9100000-0000-4000-8000-000000000001' from public.tenants where id='delivery-launch-test';
do $$
declare
  owner_id uuid := 'a9100000-0000-4000-8000-000000000001';
  member_id uuid := 'a9100000-0000-4000-8000-000000000002';
  provider_id uuid := 'a9100000-0000-4000-8000-000000000003';
  outsider_id uuid := 'a9100000-0000-4000-8000-000000000004';
  business_id uuid := 'a9100000-0000-4000-8000-000000000010';
  binding_id uuid := 'a9100000-0000-4000-8000-000000000020';
  saved public.service_requests; replay public.service_requests; second public.service_requests;
  caught text; first_deadline text; first_start text; accepted_revision bigint; proposal_revision bigint;
  proposal jsonb := '{"kind":"propose","termsReference":"Accepted quote Q-TEST, no live billing","deliveryDefinition":"Complete tested website at the review URL; domain publication separately approved","inputsReady":true}';
  evidence jsonb;
begin
  select * into saved from public.save_service_request(owner_id,'delivery-owner@example.test',business_id,null,null,'requested',
    'Have Strelva build our website','A tested website at a review URL','{}',array['website_delivery'],'{"kind":"strelva"}','delivery-request',repeat('a',64));
  perform pg_temp.delivery_assert(saved.delivery_commitment is null,'creating a request never starts a deadline');
  select * into saved from public.respond_service_request(provider_id,'delivery-provider@example.test',saved.id,saved.revision,'accepted',null,'delivery-review',repeat('b',64));
  perform pg_temp.delivery_assert(saved.delivery_commitment is null,'provider review does not promise delivery');
  perform pg_temp.delivery_assert((select count(*)=1 from public.read_service_delivery_work(provider_id,'delivery-provider@example.test','strelva',null) where id=saved.id),'accepted requests remain in the work queue');
  caught:=null;
  begin perform public.change_service_delivery_commitment(owner_id,'delivery-owner@example.test',saved.id,saved.revision,proposal,'wrong-proposer',repeat('c',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.delivery_assert(caught='service_request_provider_ineligible','customer cannot impersonate provider commitment');
  caught:=null;
  begin perform public.change_service_delivery_commitment(provider_id,'delivery-provider@example.test',saved.id,saved.revision,proposal||'{"inputsReady":false}','missing-inputs',repeat('c',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.delivery_assert(caught='service_request_commitment_invalid','provider cannot offer an unready brief');
  select * into saved from public.change_service_delivery_commitment(provider_id,'delivery-provider@example.test',saved.id,saved.revision,proposal,'delivery-propose',repeat('c',64));
  proposal_revision:=saved.revision;
  perform pg_temp.delivery_assert(saved.delivery_commitment->>'status'='proposed' and saved.delivery_commitment->>'dueAt' is null,'proposal does not silently start the clock');
  caught:=null;
  begin perform public.change_service_delivery_commitment(member_id,'delivery-member@example.test',saved.id,saved.revision,'{"kind":"agree"}','member-agree',repeat('d',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.delivery_assert(caught='service_request_access_denied','ordinary members cannot accept business terms');
  select * into saved from public.change_service_delivery_commitment(owner_id,'delivery-owner@example.test',saved.id,saved.revision,'{"kind":"agree"}','delivery-agree',repeat('d',64));
  first_deadline:=saved.delivery_commitment->>'dueAt'; first_start:=saved.delivery_commitment->>'startedAt'; accepted_revision:=saved.revision;
  perform pg_temp.delivery_assert(first_deadline::timestamptz-first_start::timestamptz=interval '24 hours','deadline uses 24 elapsed hours');
  select * into replay from public.change_service_delivery_commitment(owner_id,'delivery-owner@example.test',saved.id,proposal_revision,'{"kind":"agree"}','delivery-agree',repeat('d',64));
  perform pg_temp.delivery_assert(replay.revision=saved.revision and replay.delivery_commitment->>'dueAt'=first_deadline,'accepted response loss never restarts deadline');
  caught:=null;
  begin perform public.change_service_delivery_commitment(owner_id,'delivery-owner@example.test',saved.id,proposal_revision,'{"kind":"agree"}','delivery-agree',repeat('e',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.delivery_assert(caught='service_request_idempotency_conflict','same key cannot carry a changed command');
  caught:=null;
  begin perform public.change_service_delivery_commitment(provider_id,'delivery-provider@example.test',saved.id,proposal_revision,'{"kind":"blocker","note":"stale"}','stale-command',repeat('e',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.delivery_assert(caught='service_request_revision_conflict','stale commands do not overwrite accepted state');
  select * into saved from public.change_service_delivery_commitment(provider_id,'delivery-provider@example.test',saved.id,saved.revision,'{"kind":"blocker","note":"Waiting on approved logo"}','delivery-blocker',repeat('e',64));
  perform pg_temp.delivery_assert(saved.delivery_commitment->>'dueAt'=first_deadline,'blockers cannot pause the promise silently');
  update public.super_admins set revoked_at=now() where user_id=provider_id;
  caught:=null;
  begin perform public.change_service_delivery_commitment(provider_id,'delivery-provider@example.test',saved.id,accepted_revision,'{"kind":"blocker","note":"Waiting on approved logo"}','delivery-blocker',repeat('e',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.delivery_assert(caught='service_request_provider_ineligible','replay still requires current provider authority');
  update public.super_admins set revoked_at=null where user_id=provider_id;
  evidence:=jsonb_build_object('websiteBindingId',binding_id,'repository','example/customer-site','commitSha',repeat('a',40),'reviewUrl','https://review.example.com',
    'desktopChecked',true,'mobileChecked',true,'primaryActionChecked',true);
  caught:=null;
  begin perform public.change_service_delivery_commitment(provider_id,'delivery-provider@example.test',saved.id,saved.revision,jsonb_build_object('kind','submit','result',evidence||'{"websiteBindingId":"a9100000-0000-4000-8000-000000000099"}'),'wrong-binding',repeat('f',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.delivery_assert(caught='service_request_delivery_binding_invalid','a result must name an active website in this business');
  select * into saved from public.change_service_delivery_commitment(provider_id,'delivery-provider@example.test',saved.id,saved.revision,jsonb_build_object('kind','submit','result',evidence),'delivery-submit',repeat('f',64));
  perform pg_temp.delivery_assert(saved.delivery_commitment->>'status'='submitted' and saved.delivery_commitment->>'dueAt'=first_deadline,'provider submission is not customer acceptance');
  select * into saved from public.change_service_delivery_commitment(owner_id,'delivery-owner@example.test',saved.id,saved.revision,'{"kind":"request_changes","note":"Correct the opening hours"}','delivery-correct',repeat('1',64));
  perform pg_temp.delivery_assert(saved.delivery_commitment->>'status'='changes_requested' and saved.delivery_commitment->>'dueAt'=first_deadline,'corrections preserve the deadline and prior result');
  select * into saved from public.change_service_delivery_commitment(provider_id,'delivery-provider@example.test',saved.id,saved.revision,jsonb_build_object('kind','submit','result',evidence||jsonb_build_object('commitSha',repeat('b',40))),'delivery-resubmit',repeat('2',64));
  caught:=null;
  begin perform public.change_service_delivery_commitment(outsider_id,'delivery-outsider@example.test',saved.id,saved.revision,'{"kind":"accept_result","note":"Forged acceptance"}','outsider-accept',repeat('3',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.delivery_assert(caught='service_request_access_denied','unrelated users cannot accept a result');
  select * into saved from public.change_service_delivery_commitment(owner_id,'delivery-owner@example.test',saved.id,saved.revision,'{"kind":"accept_result","note":"Reviewed the exact submitted revision"}','delivery-accept-result',repeat('3',64));
  perform pg_temp.delivery_assert(saved.delivery_commitment->>'status'='accepted' and saved.delivery_commitment->'result'->>'commitSha'=repeat('b',40),'customer acceptance binds the submitted commit');
  perform pg_temp.delivery_assert(saved.delivery_commitment->>'startedAt'=first_start and saved.delivery_commitment->>'dueAt'=first_deadline,'all transitions retained original promise times');
  perform pg_temp.delivery_assert((select count(*) from public.workspace_delegations where customer_workspace_id=business_id)=0,'delivery lifecycle grants no new workspace access');
  select * into second from public.save_service_request(owner_id,'delivery-owner@example.test',business_id,null,null,'requested','Another website','Review URL','{}',array['website_delivery'],'{"kind":"strelva"}','delivery-second',repeat('4',64));
  select * into second from public.respond_service_request(provider_id,'delivery-provider@example.test',second.id,second.revision,'accepted',null,'delivery-second-review',repeat('5',64));
  select * into second from public.change_service_delivery_commitment(provider_id,'delivery-provider@example.test',second.id,second.revision,proposal,'delivery-second-propose',repeat('6',64));
  caught:=null;
  begin perform public.withdraw_service_request(owner_id,'delivery-owner@example.test',business_id,second.id,second.revision,'old-withdrawal',repeat('7',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.delivery_assert(caught='service_request_commitment_cancel_required','old withdrawal cannot strand a promise');
  select * into second from public.change_service_delivery_commitment(owner_id,'delivery-owner@example.test',second.id,second.revision,'{"kind":"cancel","note":"Scope no longer needed"}','delivery-second-cancel',repeat('8',64));
  perform pg_temp.delivery_assert(second.status='withdrawn' and second.delivery_commitment->>'status'='cancelled','cancellation retains the request and commitment');
end; $$;
rollback;
