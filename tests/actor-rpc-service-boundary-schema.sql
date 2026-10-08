\set ON_ERROR_STOP on
-- Real PostgreSQL roles, unrelated JWT, supplied verified actor arguments.
-- Every fictional fixture and saved assessment is rolled back.
begin;
create function pg_temp.ars_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'actor RPC boundary: %',message; end if; end $$;
create function pg_temp.ars_expect_acl_denial(statement text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when insufficient_privilege then return;
  end;
  raise exception 'browser executed supplied-actor RPC: %',statement;
end $$;
select format('grant usage on schema %I to service_role,anon,authenticated',nspname)
  from pg_namespace where oid=pg_my_temp_schema() \gexec
insert into public.users(id,email,verified_at) values
 ('af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('af070000-0000-4000-8000-000000000010','agency','Fictional boundary agency','af070000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('af070000-0000-4000-8000-000000000010','af070000-0000-4000-8000-000000000001','owner','af070000-0000-4000-8000-000000000001');

set local request.jwt.claims='{"role":"anon","sub":"af070000-0000-4000-8000-000000000099"}';
set local role anon;
select pg_temp.ars_expect_acl_denial($q$select public.workspace_operation('claim','af070000-0000-4000-8000-000000000020','af070000-0000-4000-8000-000000000010','af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test','ai_visibility','{"domain":"fictional.example.test"}','af070000-0000-4000-8000-000000000030')$q$);
select pg_temp.ars_expect_acl_denial($q$select public.grant_agency_application_draft_edit('af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test','af070000-0000-4000-8000-000000000040','af070000-0000-4000-8000-000000000050')$q$);
select pg_temp.ars_expect_acl_denial($q$select public.update_application_candidate('af070000-0000-4000-8000-000000000050','af070000-0000-4000-8000-000000000010','af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test',0,'{}')$q$);
reset role;
set local request.jwt.claims='{"role":"authenticated","sub":"af070000-0000-4000-8000-000000000099"}';
set local role authenticated;
select pg_temp.ars_expect_acl_denial($q$select public.workspace_operation('claim','af070000-0000-4000-8000-000000000020','af070000-0000-4000-8000-000000000010','af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test','ai_visibility','{"domain":"fictional.example.test"}','af070000-0000-4000-8000-000000000030')$q$);
select pg_temp.ars_expect_acl_denial($q$select public.grant_agency_application_draft_edit('af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test','af070000-0000-4000-8000-000000000040','af070000-0000-4000-8000-000000000050')$q$);
select pg_temp.ars_expect_acl_denial($q$select public.update_application_candidate('af070000-0000-4000-8000-000000000050','af070000-0000-4000-8000-000000000010','af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test',0,'{}')$q$);
reset role;

set local role service_role;
select pg_temp.ars_assert((select count(*)=1 from public.workspace_operation('claim','af070000-0000-4000-8000-000000000020','af070000-0000-4000-8000-000000000010','af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test','ai_visibility','{"domain":"fictional.example.test"}','af070000-0000-4000-8000-000000000030')),'server claims genuine agency operation');
select public.workspace_operation('checkpoint','af070000-0000-4000-8000-000000000020','af070000-0000-4000-8000-000000000010','af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test',p_lease_id=>'af070000-0000-4000-8000-000000000030',p_result=>'{}');
select public.workspace_operation('complete','af070000-0000-4000-8000-000000000020','af070000-0000-4000-8000-000000000010','af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test',p_resource_kind=>'private_ai_visibility_work',p_title=>'Fictional boundary assessment');
select public.workspace_operation('complete','af070000-0000-4000-8000-000000000020','af070000-0000-4000-8000-000000000010','af070000-0000-4000-8000-000000000001','aw-boundary@agency.example.test',p_resource_kind=>'private_ai_visibility_work',p_title=>'Fictional boundary assessment');
select pg_temp.ars_assert((select count(*)=1 from public.saved_product_work where workspace_id='af070000-0000-4000-8000-000000000010'),'server completion replay saves one result');
-- Keep direct fixture inserts privileged: the local shim deliberately lacks
-- hosted service-role default table grants. Reuse the installed-app fixture,
-- then exercise its real RPCs as service_role with a fresh accepted delivery.
reset role;
\ir agency-application-authoring-schema.sql
set local role service_role;
do $$
declare assignment public.operational_assignments%rowtype;
  delivery public.offering_provider_deliveries%rowtype;
  draft_grant public.agency_application_draft_grants%rowtype;
  candidate public.application_states%rowtype;
begin
  select * into assignment from public.offer_agency_operational_assignment(
    'a3020000-0000-4000-8000-000000000001','agency-authoring-owner@example.test',
    'a3020000-0000-4000-8000-000000000030','a3020000-0000-4000-8000-000000000011',
    'agency-authoring-operator@example.test','agency',clock_timestamp()+interval '7 days','actor-rpc-service-assignment');
  select * into assignment from public.accept_operational_assignment(
    'a3020000-0000-4000-8000-000000000002','agency-authoring-operator@example.test',assignment.id);
  select * into delivery from public.request_provider_delivery(
    'a3020000-0000-4000-8000-000000000001','agency-authoring-owner@example.test',
    'a3020000-0000-4000-8000-000000000010','a3020000-0000-4000-8000-000000000040',
    assignment.id,'actor-rpc-service-delivery',repeat('c',64));
  select * into delivery from public.accept_provider_delivery(
    'a3020000-0000-4000-8000-000000000002','agency-authoring-operator@example.test',delivery.id);
  select * into draft_grant from public.grant_agency_application_draft_edit(
    'a3020000-0000-4000-8000-000000000001','agency-authoring-owner@example.test',
    delivery.id,'a3020000-0000-4000-8000-000000000020');
  perform pg_temp.ars_assert(draft_grant.status='active','server grants exact installed application');
  select * into candidate from public.application_states
    where work_id='a3020000-0000-4000-8000-000000000020';
  select * into candidate from public.update_application_candidate(
    'a3020000-0000-4000-8000-000000000020','a3020000-0000-4000-8000-000000000010',
    'a3020000-0000-4000-8000-000000000002','agency-authoring-operator@example.test',
    candidate.candidate_design_revision,candidate.candidate_spec||'{"title":"Server-authorized candidate"}'::jsonb);
  perform pg_temp.ars_assert(candidate.candidate_design_revision=2,'server saves exact authorized application candidate');
end;
$$;
reset role;
rollback;
\echo 'Actor RPC boundary passed: anonymous/authenticated spoof denied; service-role assessment and application authority preserved.'
