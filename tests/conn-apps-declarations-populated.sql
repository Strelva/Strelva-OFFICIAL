-- Ordinary immutable new publication must make the inverse refuse.
\set ON_ERROR_STOP on
select public.publish_system_version_source_revision('ca000000-0000-4000-8000-000000000001','conn-apps@example.test',jsonb_build_object(
 'source',jsonb_build_object('businessId',creator_workspace_id,'systemId',source_system_id,'revisionId','ca000000-0000-4000-8000-000000000022','number',2),
 'definition',definition,'declaration',public.system_package_behavior(definition,requires_binding_kinds),
 'summary','Explicit outside accounts','requires',jsonb_build_object('bindingKinds',to_jsonb(requires_binding_kinds)),
 'publishedBy','ca000000-0000-4000-8000-000000000001','publishedAt',now()))
from public.system_version_source_revisions where id='ca000000-0000-4000-8000-000000000021';
