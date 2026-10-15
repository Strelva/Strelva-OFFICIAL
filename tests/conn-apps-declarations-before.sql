-- Fictional retained publication, created through ordinary actor-checked commands.
\set ON_ERROR_STOP on
insert into public.users(id,email,verified_at) values('ca000000-0000-4000-8000-000000000001','conn-apps@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('ca000000-0000-4000-8000-000000000010','agency','North Studio','ca000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('ca000000-0000-4000-8000-000000000010','ca000000-0000-4000-8000-000000000001','owner','ca000000-0000-4000-8000-000000000001');
create temporary table conn_apps_source(id uuid);
insert into conn_apps_source select (public.create_system_version_source('ca000000-0000-4000-8000-000000000010','ca000000-0000-4000-8000-000000000001','conn-apps@example.test','{"name":"Harbor Dental requests","kind":"internal_app"}','ca000000-0000-4000-8000-000000000020',repeat('a',64))->'system'->>'id')::uuid;
select public.publish_system_version_source_revision('ca000000-0000-4000-8000-000000000001','conn-apps@example.test',jsonb_build_object(
 'source',jsonb_build_object('businessId','ca000000-0000-4000-8000-000000000010','systemId',(select id from conn_apps_source),'revisionId','ca000000-0000-4000-8000-000000000021','number',1),
 'definition','{"kind":"internal_app","title":"Requests","fields":[{"id":"request","label":"Request","type":"text","required":true}],"components":[{"kind":"form","fields":["request"]},{"kind":"list","fields":["request"]}]}'::jsonb,
 'declaration',public.system_package_behavior('{"kind":"internal_app","title":"Requests","fields":[{"id":"request","label":"Request","type":"text","required":true}],"components":[{"kind":"form","fields":["request"]},{"kind":"list","fields":["request"]}]}','{}'),
 'summary','Legacy immutable publication','requires','{"bindingKinds":[]}'::jsonb,'publishedBy','ca000000-0000-4000-8000-000000000001','publishedAt',now()));
