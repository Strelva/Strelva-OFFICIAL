\set ON_ERROR_STOP on
\if :{?keep_fixture}
\else
\set keep_fixture false
\endif
-- New readers project current action eligibility. Commands stay unchanged.
begin;
\ir support/payer-transition-actions-fixture.sql
select pg_temp.pta_assert(not has_function_privilege(role,signature,'execute'),role||' denied '||signature)
from (values ('anon'),('authenticated')) roles(role) cross join (values
 ('public.workspace_payer_transition_snapshot_v2(uuid,uuid,text)'),
 ('public.workspace_payer_transition_inbox_v2(uuid,text)')) signatures(signature);
select pg_temp.pta_assert(has_function_privilege('service_role',signature,'execute'),'service-only reader '||signature)
from (values ('public.workspace_payer_transition_snapshot_v2(uuid,uuid,text)'),('public.workspace_payer_transition_inbox_v2(uuid,text)')) signatures(signature);
select pg_temp.pta_assert(not has_schema_privilege('service_role','release_rollback_baseline','usage')
 and not has_table_privilege('service_role','release_rollback_baseline.payer_transition_actions','select'),'rollback baseline private');
select pg_temp.pta_assert((select count(*)=2 and bool_and(provolatile='s' and prosecdef and proconfig=array['search_path=public, pg_temp'])
 from pg_proc where oid in ('public.workspace_payer_transition_snapshot_v2(uuid,uuid,text)'::regprocedure,
 'public.workspace_payer_transition_inbox_v2(uuid,text)'::regprocedure)), 'lock-free stable definers pin search path');

insert into public.accounts(name,workspace_id,billing_type) values ('Payer UI Business','b2780000-0000-4000-8000-000000000010','none');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('b2780000-0000-4000-8000-000000000030','b2780000-0000-4000-8000-000000000010','tracker','tracker','Old unknown-cost work','{}','b2780000-0000-4000-8000-000000000001'),
 ('b2780000-0000-4000-8000-000000000031','b2780000-0000-4000-8000-000000000010','tracker','tracker','New agency work','{}','b2780000-0000-4000-8000-000000000001'),
 ('b2780000-0000-4000-8000-000000000032','b2780000-0000-4000-8000-000000000010','tracker','tracker','New business work','{}','b2780000-0000-4000-8000-000000000001');
select id old_job from public.job_economics_create_with_payer_transition(jsonb_build_object(
 'action','create','workspaceId','b2780000-0000-4000-8000-000000000010','workId','b2780000-0000-4000-8000-000000000030','productId','tracker','resourceKind','tracker',
 'payerId','b2780000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',1000),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select * from public.job_economics_command_with_payer_authority(jsonb_build_object('action','accept','jobId',:'old_job'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test');
select * from public.job_economics_command(jsonb_build_object('action','reserve','jobId',:'old_job','idempotencyKey','old-hold','amountCents',200),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test');
select * from public.job_economics_command(jsonb_build_object('action','report_usage','jobId',:'old_job','idempotencyKey','old-unknown','kind','provider','attribution','normal','amountCents',null),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test');

-- Two pending clients for one agency; the workspace projection never crosses scope.
set local role service_role;
select id agency_transition from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000010','successorAgencyWorkspaceId','b2780000-0000-4000-8000-000000000020'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select id second_transition from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000011','successorAgencyWorkspaceId','b2780000-0000-4000-8000-000000000020'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select pg_temp.pta_assert((select count(*)=1 and bool_and(not can_respond and can_revoke)
 from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000001','pta-owner@example.test')),'business owner can revoke but cannot accept for the agency');
select pg_temp.pta_assert((select count(*)=1 and bool_and(can_respond and not can_revoke and workspace_id='b2780000-0000-4000-8000-000000000010')
 from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'agency admin gets exact workspace response rights without business access');
select pg_temp.pta_assert((select count(*)=2 and bool_and(can_respond and not can_revoke)
 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000002','pta-agency-owner@example.test')),'agency owner inbox includes both clients');
select pg_temp.pta_assert(not exists(select 1 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000004','pta-agency-member@example.test')),'ordinary agency member has no financial inbox');
select pg_temp.pta_assert(not exists(select 1 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000005','pta-other@example.test')),'wrong agency has no financial inbox');
select pg_temp.pta_expect($$select * from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000007','pta-business-admin@example.test')$$,'payer_transition_workspace_denied');
select pg_temp.pta_expect($$select * from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000008','pta-unverified@example.test')$$,'payer_transition_identity_denied');
select pg_temp.pta_expect($$select * from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000003','forged@example.test')$$,'payer_transition_identity_denied');
select pg_temp.pta_expect(format($$select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',%L),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test')$$,:'agency_transition'),'payer_transition_successor_required');
reset role;

-- A membership change after rendering removes authority. Historical signer is irrelevant.
update public.workspace_memberships set role='member' where workspace_id='b2780000-0000-4000-8000-000000000020' and user_id='b2780000-0000-4000-8000-000000000003';
set local role service_role;
select pg_temp.pta_assert(not exists(select 1 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'demotion removes inbox access');
select pg_temp.pta_expect(format($$select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',%L),'b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')$$,:'agency_transition'),'payer_transition_successor_required');
reset role;
-- Even a separate client ownership path cannot authorize acting for the agency.
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','owner','b2780000-0000-4000-8000-000000000001');
select pg_temp.pta_assert((select not can_respond and can_revoke from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'business ownership does not replace agency authority');
delete from public.workspace_memberships where workspace_id='b2780000-0000-4000-8000-000000000010' and user_id='b2780000-0000-4000-8000-000000000003';
delete from public.workspace_memberships where workspace_id='b2780000-0000-4000-8000-000000000020' and user_id='b2780000-0000-4000-8000-000000000003';
select pg_temp.pta_expect($$select * from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')$$,'payer_transition_workspace_denied');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000003','admin','b2780000-0000-4000-8000-000000000002');
set local role service_role;
select pg_temp.pta_assert((select can_respond from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'current reappointed admin may respond');
select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',:'agency_transition'),'b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test');
select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',:'agency_transition'),'b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test');
select pg_temp.pta_assert((select not can_respond and not can_revoke and status='accepted'
 from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000002','pta-agency-owner@example.test')),'accepted party row offers no mutation controls');
reset role;
select id agency_job from public.job_economics_create_with_payer_transition(jsonb_build_object(
 'action','create','workspaceId','b2780000-0000-4000-8000-000000000010','workId','b2780000-0000-4000-8000-000000000031','productId','tracker','resourceKind','tracker',
 'payerId','b2780000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',500),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select pg_temp.pta_assert((select payer_kind='agency' and payer_workspace_id='b2780000-0000-4000-8000-000000000020' and status='draft' and accepted_at is null from public.job_economics where id=:'agency_job'),'future job belongs to agency but still needs separate job acceptance');
select pg_temp.pta_assert((select payer_kind='business' and payer_id='b2780000-0000-4000-8000-000000000001' and max_authorized_cents=1000 and reserved_cents=200 and not actual_known from public.job_economics where id=:'old_job'),'old job unknown-cost hold and cap unchanged');

-- Returning to business appears in the owner's account inbox, never an admin's.
select id business_transition from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000010','successorKind','business'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
set local role service_role;
select pg_temp.pta_assert((select can_respond and can_revoke and successor_kind='business' from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000001','pta-owner@example.test') where id=:'business_transition'),'business owner sees business successor with controls');
select pg_temp.pta_assert((select can_respond and can_revoke from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000009','pta-second-owner@example.test') where id=:'business_transition'),'another current business owner may respond');
select pg_temp.pta_assert(not exists(select 1 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000007','pta-business-admin@example.test')),'business admin cannot accept business succession');
select pg_temp.pta_assert(not exists(select 1 from public.workspace_payer_transition_inbox('b2780000-0000-4000-8000-000000000001','pta-owner@example.test') where id=:'business_transition'),'v1 inbox contract remains untouched');
select pg_temp.pta_expect(format($$select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',%L),'b2780000-0000-4000-8000-000000000002','pta-agency-owner@example.test')$$,:'business_transition'),'payer_transition_successor_required');
select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',:'business_transition'),'b2780000-0000-4000-8000-000000000009','pta-second-owner@example.test');
select pg_temp.pta_assert((select status='accepted' and not can_respond and not can_revoke from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000001','pta-owner@example.test') where id=:'business_transition'),'business acceptance stays visible in inbox');
reset role;
select id business_job from public.job_economics_create_with_payer_transition(jsonb_build_object(
 'action','create','workspaceId','b2780000-0000-4000-8000-000000000010','workId','b2780000-0000-4000-8000-000000000032','productId','tracker','resourceKind','tracker',
 'payerId','b2780000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',500),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select pg_temp.pta_assert((select payer_kind='business' and payer_workspace_id is null from public.job_economics where id=:'business_job'),'new job returns to business');
select pg_temp.pta_assert((select payer_kind='agency' and payer_workspace_id='b2780000-0000-4000-8000-000000000020' from public.job_economics where id=:'agency_job'),'existing agency job is not reassigned');
select pg_temp.pta_assert((select count(*)=1 and bool_and(not is_current) from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000002','pta-agency-owner@example.test')),'former payer sees its old acceptance without a false current claim');
select pg_temp.pta_assert((select count(*)=1 and bool_and(id=:'business_transition') from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000001','pta-owner@example.test') where is_current),'business owner sees exact latest accepted party');

-- Personal compatibility and rejection still work without client membership.
select id person_transition from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000010','successorEmail','pta-person@example.test'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select pg_temp.pta_assert((select can_respond and not can_revoke and successor_kind='user' from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000006','pta-person@example.test')),'exact person can respond without membership');
select * from public.workspace_payer_transition_command(jsonb_build_object('action','reject','transitionId',:'person_transition'),'b2780000-0000-4000-8000-000000000006','pta-person@example.test');
select pg_temp.pta_assert((select status='rejected' and not can_respond and not can_revoke from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000006','pta-person@example.test')),'rejected person row has no controls');

-- Proposer departure permits rejection or an acceptance attempt resolving stale.
update public.workspace_memberships set role='admin' where workspace_id='b2780000-0000-4000-8000-000000000011' and user_id='b2780000-0000-4000-8000-000000000001';
select pg_temp.pta_assert((select can_respond from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000011','b2780000-0000-4000-8000-000000000002','pta-agency-owner@example.test')),'addressed actor may still resolve pending proposal after proposer departure');
select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',:'second_transition'),'b2780000-0000-4000-8000-000000000002','pta-agency-owner@example.test');
select pg_temp.pta_assert((select status='stale' and not can_respond and not can_revoke from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000011','b2780000-0000-4000-8000-000000000002','pta-agency-owner@example.test')),'stale outcome is durable and has no controls');
select pg_temp.pta_assert((select kind='business' from public.business_payer_party('b2780000-0000-4000-8000-000000000011')),'stale transition never changes payer');

-- Replaced and revoked proposals remain history with no response/revoke controls.
select id replaced_transition from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000010','successorEmail','pta-person@example.test'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select id revoked_transition from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000010','successorKind','business'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select * from public.workspace_payer_transition_command(jsonb_build_object('action','revoke','transitionId',:'revoked_transition'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test');
select pg_temp.pta_assert((select count(*)=2 and bool_and(not can_respond and not can_revoke) from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000001','pta-owner@example.test') where id in (:'replaced_transition',:'revoked_transition')),'stale/revoked rows are read-only history');
select pg_temp.pta_assert((select payer_kind='business' and payer_id='b2780000-0000-4000-8000-000000000001' and max_authorized_cents=1000 and reserved_cents=200 and not actual_known from public.job_economics where id=:'old_job'),'all proposal outcomes preserve original unresolved obligations');
\if :keep_fixture
commit;
\else
rollback;
\endif
\echo Payer transition actions: identity, role, revocation, party roundtrip, person compatibility and unresolved-cost boundaries passed.
