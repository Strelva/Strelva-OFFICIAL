\set ON_ERROR_STOP on
-- Independent adversarial authority checks for the additive v2 payer readers.
-- Fictional data and the PUBLIC-only test role are transaction-local.
begin;
\ir support/payer-transition-actions-fixture.sql

create role ptaa_public_only nologin noinherit;
create function pg_temp.ptaa_denied(statement text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when insufficient_privilege then return;
  end;
  raise exception 'expected SQLSTATE 42501, but statement succeeded: %', statement;
end $$;

-- Real role execution, including a role whose only rights come from PUBLIC.
-- Supplying a real verified owner's UUID/email cannot bypass EXECUTE denial.
set local role ptaa_public_only;
select pg_temp.ptaa_denied($$select * from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000001','pta-owner@example.test')$$);
select pg_temp.ptaa_denied($$select * from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000001','pta-owner@example.test')$$);
select pg_temp.ptaa_denied($$select * from public.workspace_payer_transitions$$);
select pg_temp.ptaa_denied($$select * from release_rollback_baseline.payer_transition_actions$$);
reset role;
set local role anon;
select pg_temp.ptaa_denied($$select * from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000001','pta-owner@example.test')$$);
select pg_temp.ptaa_denied($$select * from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000001','pta-owner@example.test')$$);
select pg_temp.ptaa_denied($$select * from public.workspace_payer_transitions$$);
select pg_temp.ptaa_denied($$select * from release_rollback_baseline.payer_transition_actions$$);
reset role;
set local role authenticated;
select pg_temp.ptaa_denied($$select * from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000001','pta-owner@example.test')$$);
select pg_temp.ptaa_denied($$select * from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000001','pta-owner@example.test')$$);
select pg_temp.ptaa_denied($$select * from public.workspace_payer_transitions$$);
select pg_temp.ptaa_denied($$select * from release_rollback_baseline.payer_transition_actions$$);
reset role;
set local role service_role;
select pg_temp.ptaa_denied($$select * from release_rollback_baseline.payer_transition_actions$$);
reset role;

insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('b2780000-0000-4000-8000-000000000090','b2780000-0000-4000-8000-000000000010','tracker','tracker',
  'PRIVATE PAYER CONTENT SENTINEL','{"privateCustomerData":"PRIVATE PAYER PAYLOAD SENTINEL"}','b2780000-0000-4000-8000-000000000001');

-- Accepting for an agency creates paying authority alone, not client authority.
set local role service_role;
select id ptaa_first from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000010','successorAgencyWorkspaceId','b2780000-0000-4000-8000-000000000020'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',:'ptaa_first'),'b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test');
select id ptaa_second from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000011','successorAgencyWorkspaceId','b2780000-0000-4000-8000-000000000021'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',:'ptaa_second'),'b2780000-0000-4000-8000-000000000005','pta-other@example.test');
select pg_temp.pta_assert((select count(*)=1 and bool_and(workspace_id='b2780000-0000-4000-8000-000000000010' and id=:'ptaa_first')
 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'first paying agency cannot see the second agency client');
select pg_temp.pta_assert((select count(*)=1 and bool_and(workspace_id='b2780000-0000-4000-8000-000000000011' and id=:'ptaa_second')
 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000005','pta-other@example.test')),'second paying agency cannot see the first agency client');
select pg_temp.pta_expect($$select * from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000011','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')$$,'payer_transition_workspace_denied');
select pg_temp.pta_assert((select bool_and(to_jsonb(t)::text not like '%PRIVATE PAYER%'
 and not (to_jsonb(t) ?| array['title','payload','work_id','workId','saved_work','customerData']))
 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test') t),'financial projection contains no saved content');
select pg_temp.pta_assert(not (public.read_version_actor('b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')->'memberships'
 @> '[{"businessId":"b2780000-0000-4000-8000-000000000010"}]'::jsonb),'payer acceptance grants no client navigation membership');
reset role;
select pg_temp.pta_assert(not exists(select 1 from public.workspace_memberships where workspace_id='b2780000-0000-4000-8000-000000000010' and user_id='b2780000-0000-4000-8000-000000000003')
 and public.provider_seat_role('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003',false) is null,
 'payer acceptance grants neither membership nor provider authority');
select pg_temp.pta_assert(not exists(select 1 from public.workspace_providers where customer_workspace_id='b2780000-0000-4000-8000-000000000010')
 and not exists(select 1 from public.provider_seats where customer_workspace_id='b2780000-0000-4000-8000-000000000010')
 and not exists(select 1 from public.agency_client_staff where customer_workspace_id='b2780000-0000-4000-8000-000000000010'),
 'payer acceptance creates no provider or staff grants');
select pg_temp.pta_expect($$select public.business_record_assert_actor('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test',false)$$,'business_record_access_denied');
select pg_temp.pta_expect($$select public.system_actor_scope('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test',false)$$,'business_record_access_denied');
select pg_temp.pta_expect($$select public.system_actor_scope('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test',true)$$,'business_record_access_denied');

-- Separately staffed provider members still have no paying-agency authority.
select public.choose_business_provider('b2780000-0000-4000-8000-000000000001','pta-owner@example.test','b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('b2780000-0000-4000-8000-000000000002','pta-agency-owner@example.test','b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000004',true);
select pg_temp.pta_assert(public.provider_seat_role('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000004',false) is not null,'staff fixture has actual provider authority');
set local role service_role;
select pg_temp.pta_assert(not exists(select 1 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000004','pta-agency-member@example.test')),'provider staff still have no payer inbox');
select pg_temp.pta_expect($$select * from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000004','pta-agency-member@example.test')$$,'payer_transition_workspace_denied');
select pg_temp.pta_expect(format($$select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',%L),'b2780000-0000-4000-8000-000000000004','pta-agency-member@example.test')$$,:'ptaa_first'),'payer_transition_successor_required');

-- Switching payer agencies reveals only each party's own historical proposals.
select id ptaa_replacement from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','b2780000-0000-4000-8000-000000000010','successorAgencyWorkspaceId','b2780000-0000-4000-8000-000000000021'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test') \gset
select * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',:'ptaa_replacement'),'b2780000-0000-4000-8000-000000000005','pta-other@example.test');
select pg_temp.pta_assert((select count(*)=1 and bool_and(id=:'ptaa_first') from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'former payer retains its own history but cannot read replacement party');
select pg_temp.pta_assert((select count(*)=1 and bool_and(id=:'ptaa_replacement') from public.workspace_payer_transition_snapshot_v2('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000005','pta-other@example.test')),'new payer cannot read previous party history');
reset role;
delete from public.workspace_memberships where workspace_id='b2780000-0000-4000-8000-000000000020' and user_id='b2780000-0000-4000-8000-000000000003';
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b2780000-0000-4000-8000-000000000021','b2780000-0000-4000-8000-000000000003','admin','b2780000-0000-4000-8000-000000000005');
set local role service_role;
select pg_temp.pta_assert((select count(*)=2 and bool_and(successor_workspace_id='b2780000-0000-4000-8000-000000000021' and id<>:'ptaa_first')
 from public.workspace_payer_transition_inbox_v2('b2780000-0000-4000-8000-000000000003','pta-agency-admin@example.test')),'switching membership follows current agency; old signer authority disappears');
reset role;
rollback;
\echo Payer v2 adversarial checks passed: actual PUBLIC/anon/auth denial, private baseline, no content/provider grants, provider-staff denial and agency switching isolation.
