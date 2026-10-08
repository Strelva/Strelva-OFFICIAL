\set ON_ERROR_STOP on
-- Commit fictional rows only in the disposable local database so real READ ONLY
-- service-role transactions can exercise successful reads with durable data.
begin;
\ir support/payer-transition-actions-fixture.sql
select * from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000010','successorAgencyWorkspaceId','b2780000-0000-4000-8000-000000000020'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test');
select * from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000011','successorKind','business'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test');
commit;
begin read only;
set local role service_role;
select pg_temp.pta_assert((select count(*)=1 and bool_and(can_respond and not can_revoke and not is_current) from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'actual read-only agency snapshot succeeds');
select pg_temp.pta_assert((select count(*)=1 and bool_and(can_respond and not can_revoke and not is_current) from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'actual read-only agency inbox succeeds');
select pg_temp.pta_assert((select count(*)=1 and bool_and(can_respond and can_revoke and successor_kind='business') from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000001','pta-owner@example.test')),'actual read-only business inbox succeeds');
select pg_temp.pta_assert(not exists(select 1 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000005','pta-other@example.test')),'read-only stranger sees no rows');
select pg_temp.pta_expect($$select * from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000005','pta-other@example.test')$$,'payer_transition_workspace_denied');
rollback;
-- Committed demotion is visible on the next read-only request.
update public.workspace_memberships set role='member' where workspace_id='b2780000-0000-4000-8000-000000000020' and user_id='b2780000-0000-4000-8000-000000000003';
begin read only;
set local role service_role;
select pg_temp.pta_assert(not exists(select 1 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'next request reflects committed demotion');
rollback;
begin;
delete from public.workspace_payer_transitions where workspace_id in ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000011');
delete from public.workspace_memberships where workspace_id in ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000011','b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000021');
delete from public.workspaces where id in ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000011','b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000021');
delete from public.users where id in ('b2780000-0000-4000-8000-000000000001','b2780000-0000-4000-8000-000000000002','b2780000-0000-4000-8000-000000000003','b2780000-0000-4000-8000-000000000004','b2780000-0000-4000-8000-000000000005','b2780000-0000-4000-8000-000000000006','b2780000-0000-4000-8000-000000000007','b2780000-0000-4000-8000-000000000008','b2780000-0000-4000-8000-000000000009');
commit;
\echo Payer transition v2 actual READ ONLY service-role projections and committed demotion passed.
