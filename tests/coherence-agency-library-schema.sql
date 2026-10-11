\set ON_ERROR_STOP on
-- Isolated fictional identities. The nested fixture exercises existing draft
-- authority first; every row and temporary helper is rolled back afterward.
begin;
-- The historical native website fixture predates staffed seats. Supply the
-- current agency-client scope before it exercises accepted assignments.
insert into public.users(id,email,verified_at) values
 ('a3021200-0000-4000-8000-000000000001','website-draft-owner@example.test',now()),
 ('a3021200-0000-4000-8000-000000000002','website-draft-operator@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('a3021200-0000-4000-8000-000000000010','customer','Website draft customer','a3021200-0000-4000-8000-000000000001'),
 ('a3021200-0000-4000-8000-000000000011','agency','Website draft agency','a3021200-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('a3021200-0000-4000-8000-000000000010','a3021200-0000-4000-8000-000000000001','owner','a3021200-0000-4000-8000-000000000001'),
 ('a3021200-0000-4000-8000-000000000011','a3021200-0000-4000-8000-000000000002','member','a3021200-0000-4000-8000-000000000002');
insert into public.provider_seats(customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values
 ('a3021200-0000-4000-8000-000000000010','a3021200-0000-4000-8000-000000000011','owner','a3021200-0000-4000-8000-000000000001');
insert into public.agency_client_staff(customer_workspace_id,agency_workspace_id,user_id,assigned_by) values
 ('a3021200-0000-4000-8000-000000000010','a3021200-0000-4000-8000-000000000011','a3021200-0000-4000-8000-000000000002','a3021200-0000-4000-8000-000000000002');
\ir agency-managed-website-draft-schema.sql
do $$
declare g public.agency_managed_website_draft_grants; context jsonb; caught text;
begin
 select * into g from public.agency_managed_website_draft_grants where managed_website_binding_id='a3021200-0000-4000-8000-000000000020';
 update public.operational_assignments set expires_at=clock_timestamp()+interval '1 day' where id=g.assignment_id;
 context:=public.read_agency_website_preparation_context(g.granted_by,'website-draft-owner@example.test',g.managed_website_binding_id,g.delivery_id);
 perform pg_temp.assert_true(context->>'agencyName'='Website draft agency' and context->>'personName'='website-draft-operator@example.test' and context->>'operatorUserId'=g.operator_user_id::text,'owner reads actual assigned agency and person');
 perform pg_temp.assert_true(public.read_agency_website_preparation_context(g.operator_user_id,'website-draft-operator@example.test',g.managed_website_binding_id,g.delivery_id)=context,'assigned agency person and owner get the same identity');
 begin perform public.read_agency_website_preparation_context('a3021200-0000-4000-8000-000000000003','website-draft-outsider@example.test',g.managed_website_binding_id,g.delivery_id); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='agency_managed_website_draft_denied','unrelated viewer cannot read assignment identity');
 caught:=null;
 begin perform public.read_agency_website_preparation_context(g.granted_by,'wrong@example.test',g.managed_website_binding_id,g.delivery_id); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='agency_managed_website_draft_denied','stale verified email cannot read assignment identity');
 perform public.revoke_agency_managed_website_draft_edit(g.granted_by,'website-draft-owner@example.test',g.id);
 caught:=null;
 begin perform public.grant_named_agency_website_draft_edit_server(g.granted_by,'website-draft-owner@example.test',g.delivery_id,g.managed_website_binding_id,false,g.agency_workspace_id,g.granted_by); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='agency_managed_website_draft_conflict' and (select status='revoked' from public.agency_managed_website_draft_grants where id=g.id),'mismatched person rolls back the grant');
 select * into g from public.grant_named_agency_website_draft_edit_server(g.granted_by,'website-draft-owner@example.test',g.delivery_id,g.managed_website_binding_id,false,g.agency_workspace_id,g.operator_user_id);
 perform pg_temp.assert_true(g.status='active','exact displayed agency and person can receive the existing scoped grant');
 perform pg_temp.assert_true(not has_function_privilege('authenticated','public.read_agency_website_preparation_context(uuid,text,uuid,uuid)','EXECUTE') and not has_function_privilege('anon','public.grant_named_agency_website_draft_edit_server(uuid,text,uuid,uuid,boolean,uuid,uuid)','EXECUTE'),'new identity functions retain service-only boundary');
end $$;
rollback;

create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'coherence assertion: %',message; end if; end $$;
-- Source attribution uses the source's existing owner/admin read authority.
begin;
insert into public.users(id,email,verified_at) values
 ('ce110000-0000-4000-8000-000000000001','coherence-creator@example.test',now()),
 ('ce110000-0000-4000-8000-000000000002','coherence-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ce110000-0000-4000-8000-000000000010','agency','Coherence Creator','ce110000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ce110000-0000-4000-8000-000000000010','ce110000-0000-4000-8000-000000000001','owner','ce110000-0000-4000-8000-000000000001');
do $$
declare source_id uuid; definition jsonb:='{"kind":"internal_app","title":"Shared intake","fields":[{"id":"request","label":"Request","type":"text","required":true}],"components":[{"kind":"form","fields":["request"]}]}'; creator jsonb; caught text;
begin
 source_id:=(public.create_system_version_source('ce110000-0000-4000-8000-000000000010','ce110000-0000-4000-8000-000000000001','coherence-creator@example.test','{"name":"Shared intake","kind":"internal_app"}','ce110000-0000-4000-8000-000000000020',repeat('a',64))->'system'->>'id')::uuid;
 perform public.publish_system_version_source_revision('ce110000-0000-4000-8000-000000000001','coherence-creator@example.test',jsonb_build_object('source',jsonb_build_object('businessId','ce110000-0000-4000-8000-000000000010','systemId',source_id,'revisionId','ce110000-0000-4000-8000-000000000021','number',1),'definition',definition,'declaration',public.system_package_behavior(definition,'{}'::text[]),'summary','Shared intake','requires','{"bindingKinds":[]}'::jsonb,'publishedBy','ce110000-0000-4000-8000-000000000001','publishedAt',now()));
 creator:=public.read_system_package_creator('ce110000-0000-4000-8000-000000000010','ce110000-0000-4000-8000-000000000001','coherence-creator@example.test',source_id);
 perform pg_temp.assert_true(creator->>'creatorName'='Coherence Creator' and creator->>'sourceRevisionId'='ce110000-0000-4000-8000-000000000021','Library source resolves its actual creator and source revision');
 begin perform public.read_system_package_creator('ce110000-0000-4000-8000-000000000010','ce110000-0000-4000-8000-000000000002','coherence-stranger@example.test',source_id); exception when others then caught:=sqlerrm; end;
 perform pg_temp.assert_true(caught='business_record_access_denied','unrelated viewer cannot read source attribution');
end $$;
rollback;
