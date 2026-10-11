\set ON_ERROR_STOP on
begin;
create function pg_temp.ac_assert(v boolean,msg text) returns void language plpgsql as $$
begin if v is not true then raise exception 'Ask confirmed facts: %',msg; end if; end $$;
insert into public.users(id,email,verified_at) values
 ('a5250000-0000-4000-8000-000000000001','a525-owner@example.test',now()),
 ('a5250000-0000-4000-8000-000000000002','a525-admin@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('a5250000-0000-4000-8000-000000000010','customer','Ask confirmation fixture','a5250000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('a5250000-0000-4000-8000-000000000010','a5250000-0000-4000-8000-000000000001','owner','a5250000-0000-4000-8000-000000000001'),
 ('a5250000-0000-4000-8000-000000000010','a5250000-0000-4000-8000-000000000002','admin','a5250000-0000-4000-8000-000000000001');
select pg_temp.ac_assert(not has_function_privilege('service_role','public.confirm_ask_business_draft_entities(uuid,uuid,uuid)','execute'),'confirmation helper stays internal');
do $$
declare ws uuid:='a5250000-0000-4000-8000-000000000010'; own uuid:='a5250000-0000-4000-8000-000000000001'; adm uuid:='a5250000-0000-4000-8000-000000000002'; d jsonb; result jsonb; item jsonb; sid uuid; h text:=repeat('5',64);
begin
 perform public.patch_business_record(ws,own,'a525-owner@example.test','owner',0,'{"facts":{"owner_recipient":{"value":{"email":"a525-owner@example.test"}},"phone":{"value":"716-555-0100"}}}',gen_random_uuid(),h);
 -- An unrelated administrator edit remains unconfirmed when the owner approves Ask.
 perform public.patch_business_record(ws,adm,'a525-admin@example.test','agent',1,'{"facts":{"email":{"value":"pending@example.test"}}}',gen_random_uuid(),h);
 d:=public.save_ask_business_draft(ws,adm,'a525-admin@example.test',null,2,'{"facts":{"phone":{"value":"716-555-0125"}}}','Owner-approved phone','a525-session');
 result:=public.resolve_ask_business_draft(ws,own,'a525-owner@example.test',(d->>'id')::uuid,'approve');
 perform pg_temp.ac_assert((select state#>>'{value}'='716-555-0125' from public.business_record_confirmed where workspace_id=ws and entity='fact' and entity_id='phone'),'owner session confirms Ask phone without another decision');
 perform pg_temp.ac_assert(not exists(select 1 from public.business_record_confirmed where workspace_id=ws and entity_id='email'),'unrelated pending edit stays pending');
 perform pg_temp.ac_assert(public.resolve_ask_business_draft(ws,own,'a525-owner@example.test',(d->>'id')::uuid,'approve')=result,'session replay reuses original receipt');
 -- Admin approval remains a working edit and carries no owner authority.
 d:=public.save_ask_business_draft(ws,own,'a525-owner@example.test',null,3,'{"facts":{"description":{"value":"Admin-only edit"}}}','Description','a525-admin');
 perform public.resolve_ask_business_draft(ws,adm,'a525-admin@example.test',(d->>'id')::uuid,'approve');
 perform pg_temp.ac_assert(not exists(select 1 from public.business_record_confirmed where workspace_id=ws and entity_id='description'),'admin cannot confirm as owner');
 -- No account membership at the emailed address; an explicitly verified agency serves it.
 delete from public.workspace_memberships where workspace_id=ws and user_id=own;
 insert into public.workspaces(id,kind,name,created_by) values('a5250000-0000-4000-8000-000000000020','agency','Ask link agency',adm);
 insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by) values(ws,'a5250000-0000-4000-8000-000000000020','business_choice',adm);
 insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member)
 values('a5250000-0000-4000-8000-000000000020','email','verified','{"note":"fixture"}',own,false);
 -- Accountless owner link confirms exact draft under its existing bound service session.
 d:=public.save_ask_business_draft(ws,adm,'a525-admin@example.test',null,4,'{"facts":{"phone":{"value":"716-555-0525"}}}','Linked phone','a525-link');
 item:=public.open_owner_decision(ws,jsonb_build_object('kind','fact.inferred','route','owner_decides','title','Linked phone','approveEffect','Confirm phone','notYetEffect','No change','sourceLifecycle','business_record_draft','sourceId',d->>'id','revisionHash',h,'adminMayDecide',true));
 perform public.record_owner_decision_delivery(ws,(item->>'id')::uuid,'digest','sent','a525-owner@example.test','a525-fictional-mail',null);
 sid:=(public.strelva_owner_decision_link_session(ws,(item->>'id')::uuid,h,'a525-owner@example.test')->>'sessionId')::uuid;
 perform public.claim_owner_decision(ws,(item->>'id')::uuid,h,'approve','owner_link',null,null,'a525-owner@example.test');
 perform public.authorize_owner_decision_link_run(ws,sid,(item->>'id')::uuid,h,'a525-owner@example.test');
 result:=public.resolve_ask_business_draft_by_owner_link(ws,adm,'a525-admin@example.test',(d->>'id')::uuid,'approve',sid,(item->>'id')::uuid,h,'a525-owner@example.test');
 perform pg_temp.ac_assert((select state#>>'{value}'='716-555-0525' and decision_id=(item->>'id')::uuid from public.business_record_confirmed where workspace_id=ws and entity_id='phone'),'signed-link confirmation keeps exact owner decision');
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,own,'owner',own);
 -- A later owner edit must survive a replay of the old Ask decision.
 perform public.patch_business_record(ws,own,'a525-owner@example.test','owner',5,'{"facts":{"phone":{"value":"716-555-0999"}}}',gen_random_uuid(),h);
 perform public.resolve_ask_business_draft_by_owner_link(ws,adm,'a525-admin@example.test',(d->>'id')::uuid,'approve',sid,(item->>'id')::uuid,h,'a525-owner@example.test');
 perform pg_temp.ac_assert((select state#>>'{value}'='716-555-0999' from public.business_record_confirmed where workspace_id=ws and entity_id='phone'),'link replay never overwrites newer owner confirmation');
end $$;
rollback;
