\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values
 ('a9050000-0000-4000-8000-000000000001','payer-race-business@example.test',now()),
 ('a9050000-0000-4000-8000-000000000002','payer-race-agency@example.test',now()),
 ('a9050000-0000-4000-8000-000000000003','payer-race-operator@example.test',now());
insert into public.super_admins(user_id,email) values('a9050000-0000-4000-8000-000000000003','payer-race-operator@example.test');
insert into public.workspaces(id,kind,name,created_by) values
 ('a9050000-0000-4000-8000-000000000010','customer','Fictional race business','a9050000-0000-4000-8000-000000000001'),
 ('a9050000-0000-4000-8000-000000000020','agency','Fictional race agency','a9050000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('a9050000-0000-4000-8000-000000000010','a9050000-0000-4000-8000-000000000001','owner','a9050000-0000-4000-8000-000000000001'),
 ('a9050000-0000-4000-8000-000000000020','a9050000-0000-4000-8000-000000000002','admin','a9050000-0000-4000-8000-000000000002');
insert into public.accounts(name,workspace_id,billing_type) values('Fictional race account','a9050000-0000-4000-8000-000000000010','subscription');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('a9050000-0000-4000-8000-000000000030','a9050000-0000-4000-8000-000000000010','tracker','tracker','Fictional race work','{}','a9050000-0000-4000-8000-000000000001');
do $$declare t uuid;begin
 select id into t from public.workspace_payer_transition_command('{"action":"propose","workspaceId":"a9050000-0000-4000-8000-000000000010","successorAgencyWorkspaceId":"a9050000-0000-4000-8000-000000000020"}','a9050000-0000-4000-8000-000000000001','payer-race-business@example.test');
 perform public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',t),'a9050000-0000-4000-8000-000000000002','payer-race-agency@example.test');
end $$;
select public.work_allowance_operator_command('a9050000-0000-4000-8000-000000000003','payer-race-operator@example.test',jsonb_build_object('action','award_period','workspaceId','a9050000-0000-4000-8000-000000000010','payerId','a9050000-0000-4000-8000-000000000002','payerKind','agency','payerWorkspaceId','a9050000-0000-4000-8000-000000000020','periodStart',now()-interval '1 day','periodEnd',now()+interval '1 month','spendingCapCents',1000,'grants','[{"unitKind":"completed_tracker_change","units":10}]'::jsonb,'idempotencyKey','payer-race-allowance'));
select public.job_economics_create_with_payer_transition('{"action":"create","workspaceId":"a9050000-0000-4000-8000-000000000010","workId":"a9050000-0000-4000-8000-000000000030","productId":"tracker","resourceKind":"tracker","payerId":"a9050000-0000-4000-8000-000000000001","estimateCents":null,"maxAuthorizedCents":500}','a9050000-0000-4000-8000-000000000001','payer-race-business@example.test');
select public.workspace_payer_transition_command('{"action":"propose","workspaceId":"a9050000-0000-4000-8000-000000000010","successorAgencyWorkspaceId":"a9050000-0000-4000-8000-000000000020"}','a9050000-0000-4000-8000-000000000001','payer-race-business@example.test');
-- Timing instrumentation only: no authority function is replaced. A real
-- cap UPDATE pauses after authorization so role loss can race with its commit.
create schema payer_race_fixture;
revoke all on schema payer_race_fixture from public;
create function payer_race_fixture.pause_cap_update() returns trigger language plpgsql as $$begin
 if old.award_key='payer-race-allowance' and old.status='pending_cap_acceptance' and new.status='active' then perform pg_advisory_xact_lock(16090501);end if;
 return new;
end $$;
create trigger payer_race_timing before update on public.work_allowances for each row execute function payer_race_fixture.pause_cap_update();
commit;
