\set ON_ERROR_STOP on
-- PREPARED UNRUN: fresh qualified owned disposable clone only. Fictional rows.
begin;
insert into public.users(id,email,verified_at) values
 ('d1720000-0000-4000-8000-000000000001','gm-owner@example.test',clock_timestamp()),
 ('d1720000-0000-4000-8000-000000000002','gm-operator@example.test',clock_timestamp()),
 ('d1720000-0000-4000-8000-000000000003','gm-admin@example.test',clock_timestamp()),
 ('d1720000-0000-4000-8000-000000000004','gm-stranger@example.test',clock_timestamp()),
 ('d1720000-0000-4000-8000-000000000005','gm-reviewer@example.test',clock_timestamp());
insert into public.super_admins(user_id,email) values('d1720000-0000-4000-8000-000000000002','gm-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('d1720000-0000-4000-8000-000000000010','customer','Fictional governed preparation business','d1720000-0000-4000-8000-000000000001'),
 ('d1720000-0000-4000-8000-000000000020','agency','Fictional governed preparation creator','d1720000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('d1720000-0000-4000-8000-000000000010','d1720000-0000-4000-8000-000000000001','owner','d1720000-0000-4000-8000-000000000001'),
 ('d1720000-0000-4000-8000-000000000010','d1720000-0000-4000-8000-000000000003','admin','d1720000-0000-4000-8000-000000000001'),
 ('d1720000-0000-4000-8000-000000000020','d1720000-0000-4000-8000-000000000002','owner','d1720000-0000-4000-8000-000000000002');
create temporary table gm_agreement as select jsonb_build_object('action','record_agreement','workspaceId','d1720000-0000-4000-8000-000000000020','kind','creator','version','fictional-gm-written-agreement','rateReference','fictional-gm-written-rate','rateBps',171,'effectiveFrom',clock_timestamp()-interval '1 minute','effectiveUntil',null) command;
select public.record_governed_money_configuration('d1720000-0000-4000-8000-000000000002','gm-operator@example.test',command) from gm_agreement;
-- Actual source creation/qualification/review, with explicit fictional local
-- reviewer policy. This selects no production reviewer or royalty agreement.
select public.set_platform_workspace('gm-operator@example.test','strelva_agency','d1720000-0000-4000-8000-000000000020');
select public.register_offering_package_source('gm-operator@example.test','private_staff_requests','1.0.0');
insert into public.system_revision_reviewers(user_id,policy_version) values('d1720000-0000-4000-8000-000000000005','fictional-governed-native-review-only');
select public.review_system_revision_qualification('d1720000-0000-4000-8000-000000000005','gm-reviewer@example.test',source_revision_id,true,'Fictional native declaration/rehearsal source review; no commercial qualification') from public.offering_package_sources where definition_id='private_staff_requests' and definition_version='1.0.0';
commit;
