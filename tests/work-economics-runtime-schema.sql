\set ON_ERROR_STOP on
create function pg_temp.assert_true(condition boolean, message text) returns void
language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end; $$;
-- Public runtime RPC behavior against the isolated workspace fixtures.
select public.job_economics_command(jsonb_build_object('action','cancel','jobId',id),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com')
from public.job_economics where workspace_id='11111111-1111-4111-8111-111111111111'
  and work_id='88888888-8888-4888-8888-888888888888' and status not in ('settled','cancelled');
do $$
declare
  j uuid;
  x jsonb;
  failed boolean;
begin
  select id into j from public.job_economics_command(jsonb_build_object(
    'action','create','productId','tracker','resourceKind','tracker',
    'workspaceId','11111111-1111-4111-8111-111111111111',
    'workId','88888888-8888-4888-8888-888888888888',
    'payerId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'estimateCents',100,'maxAuthorizedCents',100
  ),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',j),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  x := public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
    'executionKey','first','maximumCents',80,'kind','tool','attribution','normal'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((x->>'claimed')::boolean,'first claimant owns execution');
  x := public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
    'executionKey','first','maximumCents',80,'kind','tool','attribution','normal'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true(not (x->>'claimed')::boolean,'replay does not own execution');
  failed := false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
      'executionKey','second','maximumCents',20,'kind','tool','attribution','normal'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  exception when others then
    failed := sqlerrm = 'job_economics_concurrency_exceeded';
  end;
  perform pg_temp.assert_true(failed,'second live action is blocked by concurrency cap');
  perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',j,'executionKey','first'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  x := public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',j,'executionKey','first',
    'effect','accepted','amountCents',30),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((x->'execution'->>'billable_cents')::integer = 30,'measured accepted action bills known use');
  -- A later action can spend the released 50 cents plus the previously free 20.
  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
    'executionKey','second','maximumCents',70,'kind','tool','attribution','normal'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',j,'executionKey','second',
    'effect','none','amountCents',0),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');

  -- Unknown costs never become zero and still consume their maximum.
  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
    'executionKey','unknown','maximumCents',70,'kind','provider','attribution','normal'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',j,'executionKey','unknown'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',j,'executionKey','unknown',
    'effect','unknown','amountCents',null),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  failed:=false;
  begin
    perform * from public.job_economics_command(jsonb_build_object('action','settle','jobId',j,'actualCents',30),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  exception when others then failed:=sqlerrm='job_economics_unknown_settlement'; end;
  perform pg_temp.assert_true(failed,'unknown provider usage blocks measured settlement');
  failed:=false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
      'executionKey','over-cap','maximumCents',1,'kind','tool','attribution','normal'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  exception when others then failed:=sqlerrm='job_economics_reservation_exceeded'; end;
  perform pg_temp.assert_true(failed,'unknown cost holds all reserved funds');
  failed:=false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object('action','reconcile','jobId',j,
      'executionKey','unknown','maximumCents',70,'kind','provider','attribution','normal',
      'amountCents',20,'effect','accepted','evidenceReference','untrusted-member-assertion'),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com');
  exception when others then failed:=sqlerrm='job_economics_workspace_denied'; end;
  perform pg_temp.assert_true(failed,'another workspace member cannot assert provider cost for the admitting actor');
  failed:=false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object('action','reconcile','jobId',j,
      'executionKey','unknown','maximumCents',70,'kind','provider','attribution','normal',
      'amountCents',20,'effect','accepted','evidenceReference','cross-workspace-assertion'),
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  exception when others then failed:=sqlerrm='job_economics_workspace_denied'; end;
  perform pg_temp.assert_true(failed,'an actor outside the budget workspace cannot reconcile its provider receipt');
  failed:=false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object('action','reconcile','jobId',j,
      'executionKey','unknown','maximumCents',69,'kind','tool','attribution','normal',
      'amountCents',20,'effect','accepted','evidenceReference','mismatched-execution-identity'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  exception when others then failed:=sqlerrm='job_economics_idempotency_conflict'; end;
  perform pg_temp.assert_true(failed,'reconciliation must match the admitted maximum, kind and attribution');
  -- A Strelva-caused retry costs the payer nothing even at the customer cap.
  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
    'executionKey','strelva-retry','maximumCents',20,'kind','provider','attribution','strelva_retry'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',j,'executionKey','strelva-retry'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',j,'executionKey','strelva-retry',
    'effect','accepted','amountCents',15),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((select used_cents=30 and strelva_retry_cents=15 from public.get_job_economics(j,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com')),'Strelva retry is accounted separately');
  perform * from public.job_economics_command(jsonb_build_object('action','cancel','jobId',j),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((select reserved_cents=100 and status='cancelled' from public.get_job_economics(j,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com')),'cancellation preserves unresolved provider cost');
  x := public.job_economics_execution_command(jsonb_build_object('action','reconcile','jobId',j,
    'executionKey','unknown','maximumCents',70,'kind','provider','attribution','normal',
    'amountCents',20,'effect','accepted','evidenceReference','provider-receipt-fixture-1'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((x->'execution'->>'billable_cents')::integer=20,'verified cost resolves held usage');
  perform public.job_economics_execution_command(jsonb_build_object('action','reconcile','jobId',j,
    'executionKey','unknown','maximumCents',70,'kind','provider','attribution','normal',
    'amountCents',20,'effect','accepted','evidenceReference','provider-receipt-fixture-1'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((select reserved_cents=50 and used_cents=50 and strelva_retry_cents=15 from public.get_job_economics(j,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com')),'reconciliation releases unused hold exactly once after cancellation');
  failed:=false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object('action','reconcile','jobId',j,
      'executionKey','unknown','maximumCents',70,'kind','provider','attribution','normal',
      'amountCents',0,'effect','none','evidenceReference','contradiction'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  exception when others then failed:=sqlerrm='job_economics_idempotency_conflict'; end;
  perform pg_temp.assert_true(failed,'reconciliation cannot rewrite known provider cost');

end;
$$;

-- A responsibility is an explicit native target. No arbitrary product pair is admitted.
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111',
  'operations','responsibility','Fictional coordination','{}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$
declare j uuid; failed boolean; x jsonb;
begin
  select id into j from public.job_economics_command(jsonb_build_object('action','create',
    'productId','operations','resourceKind','responsibility','workspaceId','11111111-1111-4111-8111-111111111111',
    'workId','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','payerId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'estimateCents',0,'maxAuthorizedCents',100),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  failed:=false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
      'executionKey','unaccepted','maximumCents',50,'kind','tool','attribution','normal'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  exception when others then failed:=sqlerrm='job_economics_payer_required'; end;
  perform pg_temp.assert_true(failed,'runtime cannot accept a budget on behalf of its payer');
  perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',j),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
    'executionKey','revoked','maximumCents',50,'kind','tool','attribution','normal'),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com');
  delete from public.workspace_memberships where workspace_id='11111111-1111-4111-8111-111111111111'
    and user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  failed:=false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',j,'executionKey','revoked'),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com');
  exception when others then failed:=sqlerrm='job_economics_payer_required'; end;
  perform pg_temp.assert_true(failed,'payer membership is rechecked immediately before action');
  perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',j,'executionKey','revoked',
    'effect','none','amountCents',0),'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com');
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
    values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
    'executionKey','cancel-before-start','maximumCents',100,'kind','tool','attribution','normal'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action','cancel','jobId',j),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((select reserved_cents=0 from public.get_job_economics(j,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com')),'cancel before start releases reservation');
  failed:=false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',j,'executionKey','cancel-before-start'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  exception when others then failed:=sqlerrm='job_economics_invalid_transition'; end;
  perform pg_temp.assert_true(failed,'cancelled reservation cannot start');
end;
$$;

do $$
declare j uuid;
begin
  select id into j from public.job_economics_command(jsonb_build_object('action','create',
    'productId','operations','resourceKind','responsibility','workspaceId','11111111-1111-4111-8111-111111111111',
    'workId','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','payerId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'estimateCents',0,'maxAuthorizedCents',100),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',j),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',j,
    'executionKey','unknown-effect-known-cost','maximumCents',80,'kind','tool','attribution','normal'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',j,'executionKey','unknown-effect-known-cost'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',j,'executionKey','unknown-effect-known-cost',
    'effect','unknown','amountCents',20),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','reconcile','jobId',j,
    'executionKey','unknown-effect-known-cost','maximumCents',80,'kind','tool','attribution','normal',
    'amountCents',20,'effect','accepted','evidenceReference','verified-outcome-fixture'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((select used_cents=20 and reserved_cents=20 from public.get_job_economics(j,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com')),'outcome verification does not record known cost twice');
  perform * from public.job_economics_command(jsonb_build_object('action','settle','jobId',j,'actualCents',20),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action','settle','jobId',j,'actualCents',20),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((select status='settled' and actual_cents=20 from public.get_job_economics(j,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com')),'settlement is factual and idempotent');
end;
$$;

-- A sponsor can stop their cancelled responsibility's funding, but cannot
-- revoke another payer's budget while that native responsibility remains live.
update public.saved_product_work set payload='{"ownerId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","status":"proposed"}'
where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
do $$
declare j uuid; failed boolean;
begin
  select id into j from public.job_economics_command(jsonb_build_object('action','create',
    'productId','operations','resourceKind','responsibility','workspaceId','11111111-1111-4111-8111-111111111111',
    'workId','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','payerId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'estimateCents',0,'maxAuthorizedCents',100),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',j),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com');
  failed:=false;
  begin
    perform * from public.job_economics_command(jsonb_build_object('action','cancel','jobId',j),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  exception when others then failed:=sqlerrm='job_economics_payer_required'; end;
  perform pg_temp.assert_true(failed,'sponsor cannot cancel an unrelated live budget');
  update public.saved_product_work set payload=jsonb_set(payload,'{status}','"cancelled"') where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  perform * from public.job_economics_command(jsonb_build_object('action','cancel','jobId',j),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((select status='cancelled' and reserved_cents=0 from public.get_job_economics(j,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com')),'sponsor can stop funding only their own cancelled native responsibility');
end;
$$;

-- Planning is admitted against the workspace before a plan row exists. The
-- same payer/reservation/runtime boundary supplies concurrency and unknown-cost
-- proof; no model provider is called by this SQL fixture.
do $$
declare
  j uuid;
  x jsonb;
  failed boolean;
begin
  select id into j from public.job_economics_command(jsonb_build_object(
    'action','create','productId','work_plans','resourceKind','plan',
    'workspaceId','11111111-1111-4111-8111-111111111111',
    'payerId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'estimateCents',null,'maxAuthorizedCents',100
  ),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',j),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  x := public.job_economics_execution_command(jsonb_build_object(
    'action','claim','jobId',j,'executionKey','plan-call-1','maximumCents',100,
    'kind','model','attribution','normal'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((x->>'claimed')::boolean,'planning call reserves before provider invocation');
  x := public.job_economics_execution_command(jsonb_build_object(
    'action','claim','jobId',j,'executionKey','plan-call-1','maximumCents',100,
    'kind','model','attribution','normal'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true(not (x->>'claimed')::boolean,'planning claim is idempotent');
  failed:=false;
  begin
    perform public.job_economics_execution_command(jsonb_build_object(
      'action','claim','jobId',j,'executionKey','plan-call-2','maximumCents',1,
      'kind','model','attribution','normal'),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  exception when others then failed:=sqlerrm='job_economics_concurrency_exceeded'; end;
  perform pg_temp.assert_true(failed,'a second planning call cannot run concurrently');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action','start','jobId',j,'executionKey','plan-call-1'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action','finish','jobId',j,'executionKey','plan-call-1',
    'effect','accepted','amountCents',null),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true((select reserved_cents=100 and used_cents=0 and status='reserved'
    from public.get_job_economics(j,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com')),
    'unknown planning cost retains the accepted maximum');
  x := public.job_economics_execution_command(jsonb_build_object(
    'action','claim','jobId',j,'executionKey','plan-call-1','maximumCents',100,
    'kind','model','attribution','normal'),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform pg_temp.assert_true(not (x->>'claimed')::boolean,'finished planning receipt cannot replay the provider call');
end;
$$;
