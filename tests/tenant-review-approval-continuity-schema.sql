\set ON_ERROR_STOP on
-- Exact forward migration on the ordered local history. All fictional rows roll back.
begin;
create function pg_temp.ra_assert(v boolean, why text) returns void language plpgsql as $$
begin if v is not true then raise exception 'review approval continuity: %',why; end if; end $$;
select pg_temp.ra_assert(not has_table_privilege('service_role','public.tenant_review_approval_epochs','select'), 'epoch rows private');
select pg_temp.ra_assert(has_function_privilege('service_role','public.read_tenant_review_approval_authority(text)','execute')
  and not has_function_privilege('anon','public.read_tenant_review_approval_authority(text)','execute')
  and not has_function_privilege('service_role','public.rotate_tenant_review_approval_epoch(uuid,uuid,boolean)','execute'), 'server-only reader, internal writes');
do $$
declare op uuid:='90300000-0000-4000-8000-000000000001'; owner_id uuid:='90300000-0000-4000-8000-000000000002';
 stable uuid:='90300000-0000-4000-8000-000000000003'; agency uuid; ws uuid; result jsonb; initial jsonb; previous jsonb; changed jsonb;
begin
 insert into public.users(id,email,verified_at) values(op,'ra-operator@strelva.example.test',now()),(owner_id,'ra-owner@example.test',now());
 insert into public.super_admins(user_id,email) values(op,'ra-operator@strelva.example.test');
 select id into agency from public.create_owned_workspace(op,'ra-operator@strelva.example.test','agency','Review fixture agency');
 insert into public.tenants(id,stable_id,site_name,active,owner_email) values('ra-site',stable,'Review fixture',true,'ra-owner@example.test');
 initial:=public.read_tenant_review_approval_authority('ra-site');
 perform pg_temp.ra_assert(initial->'workspaceId'='null'::jsonb and initial->'legacyAllowed'='true'::jsonb,'unconverted unchanged identity');
 update public.tenants set owner_email='ra-updated@example.test' where stable_id=stable;
 perform pg_temp.ra_assert(public.read_tenant_review_approval_authority('ra-site')->'legacyAllowed'='true'::jsonb,
   'unconverted owner edit keeps future legacy mail working');
 update public.tenants set owner_email='ra-owner@example.test' where stable_id=stable;
 result:=public.convert_tenant_to_business('ra-operator@strelva.example.test','ra-site',jsonb_build_object(
 'tenantId','ra-site','tenantStableId',stable,'workspaceName','Review fixture','agencyWorkspaceId',agency,
 'agencyStaffEmails',jsonb_build_array('ra-operator@strelva.example.test'),'agencySelectionBasis','owner_choice',
 'billing',null,'account',null,'contacts',jsonb_build_array(),
 'patch',jsonb_build_object('facts',jsonb_build_object('owner_recipient',jsonb_build_object('value',jsonb_build_object('email','ra-owner@example.test'),'verified',false)))),
 '90300000-0000-4000-8000-000000000004',repeat('a',64));
 ws:=(result->>'workspaceId')::uuid;
 initial:=public.read_tenant_review_approval_authority('ra-site');
 perform pg_temp.ra_assert(initial->>'workspaceId'=ws::text and initial->>'recipient'='ra-owner@example.test'
   and initial->'legacyAllowed'='true'::jsonb and initial->>'conversionAt' is not null,'silent conversion keeps original old links');
 perform pg_temp.ra_assert(public.read_tenant_review_approval_authority('ra-site')=initial,'reader has no writes');
 perform pg_temp.ra_assert(public.read_tenant_review_approval_authority('missing-site') is null,'unknown tenant denied');

 -- Deprovisioned sites retain nullable audit links. Their presence must not
 -- prevent authority rotation for a surviving sibling in the same workspace.
 insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values(null,'ra-deprovisioned',ws,op,'90300000-0000-4000-8000-000000000007',repeat('d',64),result);

 -- Operator proposals do not rotate trusted authority or redirect mail.
 perform public.business_record_apply(ws,op,'operator','operator','{"facts":{"owner_recipient":{"value":{"email":"ra-proposed@example.test"},"verified":false}}}',null,null,
   '90300000-0000-4000-8000-000000000005',repeat('b',64));
 perform pg_temp.ra_assert(public.read_tenant_review_approval_authority('ra-site')=initial,'pending operator edit leaves authority unchanged');

 -- Current email, trust, owner membership and verified identity change-back
 -- must permanently rotate bound authority and never resurrect old links.
 update public.tenants set owner_email='ra-other@example.test' where stable_id=stable;
 perform pg_temp.ra_assert(not (public.read_tenant_review_approval_authority('ra-site')->>'legacyAllowed')::boolean,'tenant owner change revokes old links');
 update public.tenants set owner_email='ra-owner@example.test' where stable_id=stable;
 changed:=public.read_tenant_review_approval_authority('ra-site');
 perform pg_temp.ra_assert(changed->>'version'<>initial->>'version' and changed->'legacyAllowed'='false'::jsonb,'tenant email change-back stays revoked');
 previous:=changed;
 update public.business_owner_recipient_trust set email='ra-other@example.test',trusted_via='owner_write',trusted_at=clock_timestamp() where workspace_id=ws;
 update public.business_owner_recipient_trust set email='ra-owner@example.test',trusted_via='conversion',trusted_at=clock_timestamp() where workspace_id=ws;
 changed:=public.read_tenant_review_approval_authority('ra-site');
 perform pg_temp.ra_assert(changed->>'version'<>previous->>'version' and changed->'legacyAllowed'='false'::jsonb,'trust change-back version never repeats');
 previous:=changed;
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',op);
 update public.workspace_memberships set role='member' where workspace_id=ws and user_id=owner_id;
 update public.workspace_memberships set role='owner' where workspace_id=ws and user_id=owner_id;
 changed:=public.read_tenant_review_approval_authority('ra-site');
 perform pg_temp.ra_assert(changed->>'version'<>previous->>'version','owner demotion/restoration rotates version');
 previous:=changed;
 update public.users set verified_at=null where id=owner_id;
 perform pg_temp.ra_assert(public.read_tenant_review_approval_authority('ra-site') is null,'unverified owner denied');
 update public.users set verified_at=now() where id=owner_id;
 changed:=public.read_tenant_review_approval_authority('ra-site');
 perform pg_temp.ra_assert(changed->>'version'<>previous->>'version','verification change-back rotates version');
 previous:=changed;
 update public.users set email='ra-new@example.test' where id=owner_id;
 perform pg_temp.ra_assert(public.read_tenant_review_approval_authority('ra-site') is null,'mismatched verified owner denied');
 update public.users set email='ra-owner@example.test' where id=owner_id;
 changed:=public.read_tenant_review_approval_authority('ra-site');
 perform pg_temp.ra_assert(changed->>'version'<>previous->>'version','user email change-back rotates version');
 previous:=changed;
 delete from public.workspace_memberships where workspace_id=ws and user_id=owner_id;
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,owner_id,'owner',op);
 changed:=public.read_tenant_review_approval_authority('ra-site');
 perform pg_temp.ra_assert(changed->>'version'<>previous->>'version','delete/readd rotates version');
 -- Real unlink contract, without restoring removed authority.
 perform public.unlink_tenant_from_business('ra-operator@strelva.example.test','ra-site',ws,
   '90300000-0000-4000-8000-000000000006',repeat('c',64));
 perform pg_temp.ra_assert(public.read_tenant_review_approval_authority('ra-site') is null,'unlink does not resurrect old tokens');
end $$;
rollback;
