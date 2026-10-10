\set ON_ERROR_STOP on
-- Disposable local database only. Caller owns the transaction. Fictional
-- native Version and real inquiry→booking offer, with no provider effects.
insert into public.users(id,email,verified_at) values
 ('13230000-0000-4000-8000-000000000001','readonly-owner@example.test',now()),
 ('13230000-0000-4000-8000-000000000002','readonly-client-owner@example.test',now()),
 ('13230000-0000-4000-8000-000000000003','readonly-outsider@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('13230000-0000-4000-8000-000000000010','agency','Read-only agency','13230000-0000-4000-8000-000000000001'),
 ('13230000-0000-4000-8000-000000000011','customer','Read-only native client','13230000-0000-4000-8000-000000000002'),
 ('13230000-0000-4000-8000-000000000012','customer','Foreign client','13230000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('13230000-0000-4000-8000-000000000010','13230000-0000-4000-8000-000000000001','owner','13230000-0000-4000-8000-000000000001'),
 ('13230000-0000-4000-8000-000000000011','13230000-0000-4000-8000-000000000001','admin','13230000-0000-4000-8000-000000000002'),
 ('13230000-0000-4000-8000-000000000011','13230000-0000-4000-8000-000000000002','owner','13230000-0000-4000-8000-000000000002');
insert into public.super_admins(user_id,email) values ('13230000-0000-4000-8000-000000000001','readonly-owner@example.test');
-- The latest acting-provider gate requires a real staffed provider seat before
-- making the native client Version; an operator grant alone no longer does.
select public.choose_business_provider('13230000-0000-4000-8000-000000000002','readonly-client-owner@example.test',
 '13230000-0000-4000-8000-000000000011','13230000-0000-4000-8000-000000000010');
select public.set_agency_client_staff('13230000-0000-4000-8000-000000000001','readonly-owner@example.test',
 '13230000-0000-4000-8000-000000000010','13230000-0000-4000-8000-000000000011','13230000-0000-4000-8000-000000000001',true);
create temporary table vn_source(id uuid);
insert into vn_source select (public.create_system_version_source('13230000-0000-4000-8000-000000000010','13230000-0000-4000-8000-000000000001',
 'readonly-owner@example.test','{"name":"Source","kind":"internal_app"}','13230000-0000-4000-8000-000000000020',repeat('a',64))->'system'->>'id')::uuid;
create function pg_temp.vn_declaration() returns jsonb language plpgsql as $$ begin
 if to_regprocedure('public.system_package_behavior(jsonb,text[])') is null then return '{}'::jsonb; end if;
 return jsonb_build_object('declaration',public.system_package_behavior('{"kind":"internal_app","title":"Client intake","fields":[{"id":"problem","label":"Problem","type":"text","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}]}'::jsonb,'{}'::text[]));
end $$;
select public.publish_system_version_source_revision('13230000-0000-4000-8000-000000000001','readonly-owner@example.test',jsonb_build_object(
 'source',jsonb_build_object('businessId','13230000-0000-4000-8000-000000000010','systemId',(select id from vn_source),'revisionId','13230000-0000-4000-8000-000000000021','number',1),
 'definition','{"kind":"internal_app","title":"Client intake","fields":[{"id":"problem","label":"Problem","type":"text","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}]}'::jsonb,'summary','First','requires','{"bindingKinds":[]}'::jsonb,
 'publishedBy','13230000-0000-4000-8000-000000000001','publishedAt',now()) || pg_temp.vn_declaration());
-- The current package contract requires a real exact-revision qualification.
-- Historical phases predate that contract and retain their original behavior.
do $$ begin
 if to_regprocedure('public.record_system_revision_qualification(uuid,text,uuid)') is not null then
  insert into public.system_revision_reviewers(user_id,policy_version)
   values('13230000-0000-4000-8000-000000000003','fictional-readonly-proof-policy');
  perform public.record_system_revision_qualification('13230000-0000-4000-8000-000000000001','readonly-owner@example.test','13230000-0000-4000-8000-000000000021');
  perform public.review_system_revision_qualification('13230000-0000-4000-8000-000000000003','readonly-outsider@example.test','13230000-0000-4000-8000-000000000021',true,'Fictional local exact revision review');
 end if;
end $$;
select public.put_system_version_source('13230000-0000-4000-8000-000000000010','13230000-0000-4000-8000-000000000001','readonly-owner@example.test',(select id from vn_source),array['13230000-0000-4000-8000-000000000011'::uuid]);
create function pg_temp.vn_lineage() returns jsonb language sql as $$ select jsonb_build_object(
 'id',gen_random_uuid(),'version',jsonb_build_object('businessId','13230000-0000-4000-8000-000000000011','systemId','13230000-0000-4000-8000-000000000030'),
 'source',jsonb_build_object('businessId','13230000-0000-4000-8000-000000000010','systemId',(select id from vn_source)),
 'context','{"kind":"agency_client","label":"Client"}'::jsonb,'baseline','{"revision":1,"definition":{"kind":"internal_app","title":"Client intake","fields":[{"id":"problem","label":"Problem","type":"text","required":true}],"components":[{"kind":"form","fields":["problem"]},{"kind":"list","fields":["problem"]}]}}'::jsonb,
 'overrides','[]'::jsonb,'bindings','[]'::jsonb,'localData','{}'::jsonb,'releases','[]'::jsonb,'currentRelease',null,
 'decisions','[]'::jsonb,'grants','[]'::jsonb,'rowRevision',1,'createdBy','13230000-0000-4000-8000-000000000001','createdAt',now(),'updatedAt',now()) $$;

create function pg_temp.vn_payload() returns jsonb language sql as $$ select jsonb_build_object(
 'version',1,'revision',0,'title','Client intake','createdBy','13230000-0000-4000-8000-000000000001','createdAt',now(),
 'history','[]'::jsonb,'spec',((pg_temp.vn_lineage()->'baseline'->'definition')-'kind')||jsonb_build_object('maintenanceOwner','13230000-0000-4000-8000-000000000001'),
 'specVersion',1,'status','draft','versions',jsonb_build_array(jsonb_build_object('version',1,'spec',((pg_temp.vn_lineage()->'baseline'->'definition')-'kind')||jsonb_build_object('maintenanceOwner','13230000-0000-4000-8000-000000000001'))),
 'rehearsal',null,'records','[]'::jsonb) $$;
create temporary table vn_created(value jsonb);
insert into vn_created select public.create_version_system_command('13230000-0000-4000-8000-000000000001','readonly-owner@example.test',pg_temp.vn_lineage(),'Client intake','internal_app','13230000-0000-4000-8000-000000000030',pg_temp.vn_payload());

insert into public.tenants(id,stable_id,site_name,active) values('readonly-reader-site','1323ffff-0000-4000-8000-000000000010','Read-only inquiry client',true);
create temporary table handoff_ws as select (public.convert_tenant_to_business('readonly-owner@example.test','readonly-reader-site',
 '{"tenantId":"readonly-reader-site","tenantStableId":"1323ffff-0000-4000-8000-000000000010","workspaceName":"Read-only inquiry client","agencyWorkspaceId":"13230000-0000-4000-8000-000000000010","agencyStaffEmails":["readonly-owner@example.test"],"agencySelectionBasis":"existing_contract","billing":null,"account":null,"patch":{"facts":{"hours":{"value":{"timezone":"UTC","weekly":[{"day":5,"opens":"09:00","closes":"17:00"}]},"verified":false}},"services":[{"op":"upsert","name":"Consultation","durationMinutes":30,"active":true,"position":0,"externalRef":"consult"}]},"contacts":[]}',
 '1323ffff-0000-4000-8000-000000000020',repeat('a',64))->>'workspaceId')::uuid id;
-- The owner has confirmed the imported details (#509).
\ir confirm-working-record.sql
select pg_temp.confirm_working_record(id) from handoff_ws;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select id,'13230000-0000-4000-8000-000000000001','owner','13230000-0000-4000-8000-000000000001' from handoff_ws on conflict(workspace_id,user_id) do update set role='owner';
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select id,'13230000-0000-4000-8000-000000000002','member','13230000-0000-4000-8000-000000000001' from handoff_ws;
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) values('13230000-0000-4000-8000-000000000001','readonly-reader-site','1323ffff-0000-4000-8000-000000000010','owner');
insert into public.offering_website_bindings(business_workspace_id,tenant_stable_id,tenant_id_at_binding,site_name_at_binding,idempotency_key,command_digest,created_by,updated_by)
 select id,'1323ffff-0000-4000-8000-000000000010','readonly-reader-site','Read-only inquiry client','handoff',repeat('a',64),'13230000-0000-4000-8000-000000000001','13230000-0000-4000-8000-000000000001' from handoff_ws on conflict do nothing;
insert into public.systems(business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by)
 select id,'Bookings','booking',gen_random_uuid(),repeat('b',64),'13230000-0000-4000-8000-000000000001','13230000-0000-4000-8000-000000000001' from handoff_ws;
insert into public.system_revisions(system_id,business_workspace_id,number,implementation,command_id,command_digest,created_by)
 select s.id,s.business_workspace_id,1,'{"kind":"schedule","ref":"work:handoff"}',gen_random_uuid(),repeat('c',64),'13230000-0000-4000-8000-000000000001' from public.systems s where s.business_workspace_id=(select id from handoff_ws) and kind='booking';
update public.systems s set lifecycle='live',current_revision_id=r.id,current_revision_number=1 from public.system_revisions r where r.system_id=s.id and s.business_workspace_id=(select id from handoff_ws);
select public.upsert_tenant_booking_settings('readonly-reader-site','{"mode":"request","minNoticeMinutes":0,"bufferMinutes":0}','native');
select public.record_tenant_lead('readonly-reader-site',jsonb_build_object('leadId','lead_handoff','submissionHash','handoff','name','Dana','email','dana@example.test','message','Could we talk?','capturedAt',now()),'dual_write');
select public.after_tenant_lead_capture('readonly-reader-site','lead_handoff');
create temporary table handoff_lead as select id from public.tenant_leads where lead_id='lead_handoff';
create temporary table handoff_state as select public.read_inquiry_booking_handoff('readonly-reader-site','lead_handoff',null,null,null,null) state;
create temporary table handoff_slots as select jsonb_build_array(jsonb_build_object('start',now()+interval '2 days','end',now()+interval '2 days 30 minutes'),jsonb_build_object('start',now()+interval '2 days 1 hour','end',now()+interval '2 days 90 minutes')) slots;
create temporary table handoff_offer as select public.prepare_inquiry_booking_offer('readonly-reader-site','lead_handoff',(select state->'witness' from handoff_state),(select id from public.business_services where workspace_id=(select id from handoff_ws)),(select slots from handoff_slots),null,null) offer;

insert into public.inquiry_workspace_messages(workspace_id,lead_row_id,requested_by,request_id,digest,recipient,subject,body,status,provider_message_id,accepted_at)
 select (select id from handoff_ws),(select id from handoff_lead),'13230000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),'dana@example.test','Fixture reply','Synthetic local message','accepted','readonly-reader-message',now();
insert into public.operator_google_write_attempts(command_key,tenant_id,write_kind,request,acceptance)
 values('readonly-reader-attempt','readonly-reader-site','gbp_hours','{}','unknown');
insert into public.google_listing_receipts(workspace_id,location_id,action,status,authority,readback,idempotency_key)
 select id,'fictional','hours_patch','posted_unverified','{"kind":"owner_approval"}','failed','readonly-reader-listing' from handoff_ws;
select id as reader_workspace_id from handoff_ws \gset
select id as reader_lead_id from handoff_lead \gset
select (offer->>'id')::uuid as reader_offer_id from handoff_offer \gset
select (value->>'id')::uuid as reader_version_id from vn_created \gset
select id as reader_website_work_id from public.claim_website_rebuild(
 :'reader_workspace_id','13230000-0000-4000-8000-000000000001','readonly-owner@example.test',
 'readonly-website-reader','readonly-website-reader.example.test','{}',
 '{"version":2,"revision":0,"title":"Reader website","status":"building","createdBy":"13230000-0000-4000-8000-000000000001","history":[]}'
) \gset
