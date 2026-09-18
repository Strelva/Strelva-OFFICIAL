\set ON_ERROR_STOP on

insert into public.users(id,email,verified_at) values
 ('a1000000-0000-4000-8000-000000000001','owner@payer.test',now()),
 ('a1000000-0000-4000-8000-000000000002','successor@payer.test',now()),
 ('a1000000-0000-4000-8000-000000000003','wrong@payer.test',now()),
 ('a1000000-0000-4000-8000-000000000005','ordinary@payer.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('a1000000-0000-4000-8000-000000000010','customer','Payer boundary business','a1000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000001','owner','a1000000-0000-4000-8000-000000000001'),
 ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000002','member','a1000000-0000-4000-8000-000000000001'),
 ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000003','member','a1000000-0000-4000-8000-000000000001'),
 ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000005','member','a1000000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('a1000000-0000-4000-8000-000000000020','a1000000-0000-4000-8000-000000000010','tracker','tracker','Before acceptance','{}','a1000000-0000-4000-8000-000000000001'),
 ('a1000000-0000-4000-8000-000000000021','a1000000-0000-4000-8000-000000000010','tracker','tracker','After acceptance','{}','a1000000-0000-4000-8000-000000000001');

select * from public.job_economics_create_with_payer_transition(
 jsonb_build_object('action','create','workspaceId','a1000000-0000-4000-8000-000000000010','workId','a1000000-0000-4000-8000-000000000020','productId','tracker','resourceKind','tracker','payerId','a1000000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',500),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');

select * from public.workspace_payer_transition_command(
 jsonb_build_object('action','propose','workspaceId','a1000000-0000-4000-8000-000000000010','successorEmail','successor@payer.test'),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');

do $$
declare transition_id uuid;
begin
  select id into transition_id from public.workspace_payer_transitions where status='pending';
  begin
    perform * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',transition_id),'a1000000-0000-4000-8000-000000000003','wrong@payer.test');
    raise exception 'wrong addressed account accepted';
  exception when others then
    if sqlerrm not like '%payer_transition_successor_required%' then raise; end if;
  end;
  perform * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',transition_id),'a1000000-0000-4000-8000-000000000002','successor@payer.test');
  -- Exact acceptance replay is idempotent and cannot move the boundary.
  perform * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',transition_id),'a1000000-0000-4000-8000-000000000002','successor@payer.test');
end $$;

do $$ begin
  begin
    perform * from public.workspace_payer_transition_snapshot('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000005','ordinary@payer.test');
    raise exception 'ordinary member read payer email history';
  exception when others then
    if sqlerrm not like '%payer_transition_workspace_denied%' then raise; end if;
  end;
end $$;

select * from public.job_economics_create_with_payer_transition(
 jsonb_build_object('action','create','workspaceId','a1000000-0000-4000-8000-000000000010','workId','a1000000-0000-4000-8000-000000000021','productId','tracker','resourceKind','tracker','payerId','a1000000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',700),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');

-- A retry for the pre-boundary target still returns its original payer/job.
select * from public.job_economics_create_with_payer_transition(
 jsonb_build_object('action','create','workspaceId','a1000000-0000-4000-8000-000000000010','workId','a1000000-0000-4000-8000-000000000020','productId','tracker','resourceKind','tracker','payerId','a1000000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',500),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');

do $$
declare before_job public.job_economics%rowtype; after_job public.job_economics%rowtype; first_at timestamptz;
begin
  select * into before_job from public.job_economics where work_id='a1000000-0000-4000-8000-000000000020';
  select * into after_job from public.job_economics where work_id='a1000000-0000-4000-8000-000000000021';
  if before_job.payer_id<>'a1000000-0000-4000-8000-000000000001' or before_job.max_authorized_cents<>500 then raise exception 'old job changed payer or limit'; end if;
  if after_job.payer_id<>'a1000000-0000-4000-8000-000000000002' or after_job.max_authorized_cents<>700 then raise exception 'new job did not use accepted successor'; end if;
  select accepted_at into first_at from public.workspace_payer_transitions where status='accepted';
  if first_at is null or (select count(*) from public.workspace_payer_transitions where status='accepted')<>1 then raise exception 'accept replay duplicated boundary'; end if;
end $$;

-- A payer-only successor needs no workspace membership. Acceptance still
-- rechecks that the proposer remains a current owner and durably stales an
-- abandoned owner's pending proposal.
delete from public.workspace_memberships where workspace_id='a1000000-0000-4000-8000-000000000010' and user_id='a1000000-0000-4000-8000-000000000003';
select * from public.workspace_payer_transition_command(
 jsonb_build_object('action','propose','workspaceId','a1000000-0000-4000-8000-000000000010','successorEmail','wrong@payer.test'),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');
delete from public.workspace_memberships where workspace_id='a1000000-0000-4000-8000-000000000010' and user_id='a1000000-0000-4000-8000-000000000001';
do $$ declare transition_id uuid; item public.workspace_payer_transitions%rowtype; begin
  select id into transition_id from public.workspace_payer_transitions where status='pending';
  select * into item from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',transition_id),'a1000000-0000-4000-8000-000000000003','wrong@payer.test');
  if item.status<>'stale' or item.accepted_at is not null then raise exception 'removed owner proposal was accepted'; end if;
end $$;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000001','owner','a1000000-0000-4000-8000-000000000001');

-- A successor without workspace membership can become payer, accept the
-- bounded job receipt, and fund runtime work without gaining saved-work access.
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('a1000000-0000-4000-8000-000000000026','a1000000-0000-4000-8000-000000000010','tracker','tracker','Payer-only job','{}','a1000000-0000-4000-8000-000000000001');
select * from public.workspace_payer_transition_command(
 jsonb_build_object('action','propose','workspaceId','a1000000-0000-4000-8000-000000000010','successorEmail','wrong@payer.test'),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');
select * from public.workspace_payer_transition_command(
 jsonb_build_object('action','accept','transitionId',(select id from public.workspace_payer_transitions where status='pending')),
 'a1000000-0000-4000-8000-000000000003','wrong@payer.test');
select * from public.job_economics_create_with_payer_transition(
 jsonb_build_object('action','create','workspaceId','a1000000-0000-4000-8000-000000000010','workId','a1000000-0000-4000-8000-000000000026','productId','tracker','resourceKind','tracker','payerId','a1000000-0000-4000-8000-000000000001','estimateCents',100,'maxAuthorizedCents',300),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');
select * from public.job_economics_command_with_payer_authority(
 jsonb_build_object('action','accept','jobId',(select id from public.job_economics where work_id='a1000000-0000-4000-8000-000000000026')),
 'a1000000-0000-4000-8000-000000000003','wrong@payer.test');
do $$ declare receipt jsonb; begin
  if (select payer_id from public.job_economics where work_id='a1000000-0000-4000-8000-000000000026')<>'a1000000-0000-4000-8000-000000000003' then raise exception 'payer-only successor not bound'; end if;
  receipt:=public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',(select id from public.job_economics where work_id='a1000000-0000-4000-8000-000000000026'),'executionKey','payer-only','maximumCents',50,'kind','model','attribution','normal'),'a1000000-0000-4000-8000-000000000001','owner@payer.test');
  if (receipt->>'claimed')::boolean is not true then raise exception 'payer-only runtime claim failed'; end if;
end $$;

-- A later proposal supersedes the prior pending proposal. The stale addressed
-- person cannot accept it, while the new exact addressee still can.
select * from public.workspace_payer_transition_command(
 jsonb_build_object('action','propose','workspaceId','a1000000-0000-4000-8000-000000000010','successorEmail','wrong@payer.test'),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');
select * from public.workspace_payer_transition_command(
 jsonb_build_object('action','propose','workspaceId','a1000000-0000-4000-8000-000000000010','successorEmail','owner@payer.test'),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');
do $$ declare stale_id uuid; active_id uuid; begin
  select id into stale_id from public.workspace_payer_transitions where successor_user_id='a1000000-0000-4000-8000-000000000003' and status='stale' order by proposed_at desc limit 1;
  if stale_id is null then raise exception 'superseded proposal did not become stale'; end if;
  begin
    perform * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',stale_id),'a1000000-0000-4000-8000-000000000003','wrong@payer.test');
    raise exception 'stale proposal accepted';
  exception when others then
    if sqlerrm not like '%payer_transition_not_pending%' then raise; end if;
  end;
  select id into active_id from public.workspace_payer_transitions where successor_user_id='a1000000-0000-4000-8000-000000000001' and status='pending' order by proposed_at desc limit 1;
  perform * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',active_id),'a1000000-0000-4000-8000-000000000001','owner@payer.test');
end $$;

-- Owner revocation is durable and blocks later acceptance.
select * from public.workspace_payer_transition_command(
 jsonb_build_object('action','propose','workspaceId','a1000000-0000-4000-8000-000000000010','successorEmail','successor@payer.test'),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');
do $$ declare transition_id uuid; begin
  select id into transition_id from public.workspace_payer_transitions where status='pending';
  perform * from public.workspace_payer_transition_command(jsonb_build_object('action','revoke','transitionId',transition_id),'a1000000-0000-4000-8000-000000000001','owner@payer.test');
  begin
    perform * from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',transition_id),'a1000000-0000-4000-8000-000000000002','successor@payer.test');
    raise exception 'revoked proposal accepted';
  exception when others then
    if sqlerrm not like '%payer_transition_not_pending%' then raise; end if;
  end;
end $$;
