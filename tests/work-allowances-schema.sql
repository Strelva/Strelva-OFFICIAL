\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean,message text) returns void
language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end; $$;

select pg_temp.assert_true(
  has_function_privilege('service_role','public.work_allowance_operator_command(uuid,text,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.work_allowance_accept_cap(uuid,text,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.work_allowance_execution_command(uuid,text,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.read_work_allowances(uuid,text,uuid,uuid)','EXECUTE'),
  'service role executes allowance functions');
select pg_temp.assert_true(
  not has_function_privilege('authenticated','public.work_allowance_execution_command(uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.work_allowance_operator_command(uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('public','public.work_allowance_accept_cap(uuid,text,uuid)','EXECUTE'),
  'browser roles cannot call allowance functions');
select pg_temp.assert_true(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.work_allowances'::regclass,'public.work_allowance_ledger'::regclass,
    'public.work_allowance_reservations'::regclass)),
  'all allowance tables use deny-by-default RLS');

insert into public.workspaces(id,kind,name,created_by) values
  ('51515151-5151-4151-8151-515151515151','customer','Allowance Test Business','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('51515151-5151-4151-8151-515151515151','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('51515151-5151-4151-8151-515151515151','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('51515151-5151-4151-8151-515151515151','cccccccc-cccc-4ccc-8ccc-cccccccccccc','member','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
  ('61616161-6161-4161-8161-616161616161','51515151-5151-4151-8151-515151515151','tracker','tracker','Allowance tracker','{}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('71717171-7171-4171-8171-717171717171','51515151-5151-4151-8151-515151515151','tracker','tracker','Retry tracker','{}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- An earlier aggregate fixture proves revoked operator denial and deliberately
-- leaves this fictional operator revoked. Restore the next fixture explicitly.
update public.super_admins set revoked_at=null
where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

do $$
declare
  allowance_id uuid;
  replay_id uuid;
  job_id uuid;
  retry_job_id uuid;
  response jsonb;
  caught text;
  inspection jsonb;
begin
  begin
    perform public.work_allowance_operator_command(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
      jsonb_build_object('action','award_period','workspaceId','51515151-5151-4151-8151-515151515151',
        'payerId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','periodStart',clock_timestamp()-interval '1 day',
        'periodEnd',clock_timestamp()+interval '30 days','spendingCapCents',0,
        'grants',jsonb_build_array(jsonb_build_object('unitKind','completed_tracker_change','units',2)),
        'idempotencyKey','allowance-period-member-denied'));
    raise exception 'member awarded subscription allowance';
  exception when others then caught:=sqlerrm;
    perform pg_temp.assert_true(caught='work_allowance_operator_required','only operator awards allowances');
  end;

  select public.work_allowance_operator_command(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',
    jsonb_build_object('action','award_period','workspaceId','51515151-5151-4151-8151-515151515151',
      'payerId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','periodStart','2026-09-01T00:00:00Z',
      'periodEnd','2027-08-31T00:00:00Z','spendingCapCents',0,
      'grants',jsonb_build_array(jsonb_build_object('unitKind','completed_tracker_change','units',2)),
      'idempotencyKey','allowance-period-2026')) into allowance_id;
  select public.work_allowance_operator_command(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',
    jsonb_build_object('action','award_period','workspaceId','51515151-5151-4151-8151-515151515151',
      'payerId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','periodStart','2026-09-01T00:00:00Z',
      'periodEnd','2027-08-31T00:00:00Z','spendingCapCents',0,
      'grants',jsonb_build_array(jsonb_build_object('unitKind','completed_tracker_change','units',2)),
      'idempotencyKey','allowance-period-2026')) into replay_id;
  perform pg_temp.assert_true(allowance_id=replay_id,'period grant is idempotent');
  perform pg_temp.assert_true((select spending_cap_cents=0 from public.work_allowances where id=allowance_id),
    'zero-dollar operational cap is explicit, not unlimited');

  begin
    perform public.work_allowance_operator_command(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',
      jsonb_build_object('action','award_period','workspaceId','51515151-5151-4151-8151-515151515151',
        'payerId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','periodStart','2026-10-01T00:00:00Z',
        'periodEnd','2026-11-01T00:00:00Z','spendingCapCents',0,
        'grants',jsonb_build_array(jsonb_build_object('unitKind','completed_tracker_change','units',1)),
        'idempotencyKey','overlapping-period'));
    raise exception 'overlapping payer period accepted';
  exception when others then caught:=sqlerrm;
    perform pg_temp.assert_true(caught='work_allowance_period_overlap','one payer has one applicable period');
  end;

  begin
    perform public.work_allowance_accept_cap('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',allowance_id);
    raise exception 'nonpayer accepted spending cap';
  exception when others then caught:=sqlerrm;
    perform pg_temp.assert_true(caught='work_allowance_payer_required','only named payer accepts cap');
  end;

  select id into job_id from public.job_economics_command(jsonb_build_object(
    'action','create','productId','tracker','resourceKind','tracker',
    'workspaceId','51515151-5151-4151-8151-515151515151','workId','61616161-6161-4161-8161-616161616161',
    'payerId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','estimateCents',0,'maxAuthorizedCents',0),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',job_id),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',job_id,
    'executionKey','change-1','maximumCents',0,'kind','tool','attribution','normal'),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  begin
    perform public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
      jsonb_build_object('action','reserve','jobId',job_id,'executionKey','change-1',
        'unitKind','completed_tracker_change','units',1));
    raise exception 'unaccepted period cap admitted work';
  exception when others then caught:=sqlerrm;
    perform pg_temp.assert_true(caught='work_allowance_cap_not_accepted','cap acceptance precedes allowance use');
  end;
  perform public.work_allowance_accept_cap('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com',allowance_id);
  response:=public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','reserve','jobId',job_id,'executionKey','change-1',
      'unitKind','completed_tracker_change','units',1));
  perform pg_temp.assert_true((response->>'reservedUnits')::integer=1 and (response->>'reservedCapCents')::integer=0,
    'zero-cost execution reserves one named outcome and no dollars');
  response:=public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','reserve','jobId',job_id,'executionKey','change-1',
      'unitKind','completed_tracker_change','units',1));
  perform pg_temp.assert_true((response->>'disposition')='reserved'
      and (select count(*)=1 from public.work_allowance_reservations
        where work_allowance_reservations.job_id=(response->>'jobId')::uuid and execution_key='change-1'),
    'an exact reservation retry returns the one durable reservation');
  begin
    perform public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
      jsonb_build_object('action','reserve','jobId',job_id,'executionKey','change-1',
        'unitKind','completed_tracker_change','units',2));
    raise exception 'same execution changed unit quantity';
  exception when others then caught:=sqlerrm;
    perform pg_temp.assert_true(caught='work_allowance_idempotency_conflict','job and execution bind consumption once');
  end;
  perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',job_id,'executionKey','change-1'),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',job_id,'executionKey','change-1',
    'effect','accepted','amountCents',0),'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  response:=public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','settle','jobId',job_id,'executionKey','change-1'));
  perform pg_temp.assert_true(response->>'disposition'='consumed' and (response->>'actualCostCents')::integer=0,
    'trusted completed receipt consumes one outcome separately from actual cost');
  perform public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','settle','jobId',job_id,'executionKey','change-1'));
  perform pg_temp.assert_true((select count(*)=1 from public.work_allowance_ledger where reservation_id is not null),
    'settlement replay cannot duplicate consumption');

  perform public.work_allowance_operator_command('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',
    jsonb_build_object('action','award_contribution_credit','allowanceId',allowance_id,
      'contributionReference','contribution:fixture:1','unitKind','completed_tracker_change','units',1,
      'idempotencyKey','credit-contribution-1'));
  perform public.work_allowance_operator_command('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',
    jsonb_build_object('action','award_contribution_credit','allowanceId',allowance_id,
      'contributionReference','contribution:fixture:1','unitKind','completed_tracker_change','units',1,
      'idempotencyKey','credit-contribution-1'));
  begin
    perform public.work_allowance_operator_command('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com',
      jsonb_build_object('action','award_contribution_credit','allowanceId',allowance_id,
        'contributionReference','contribution:fixture:1','unitKind','completed_tracker_change','units',1,
        'idempotencyKey','credit-contribution-duplicate'));
    raise exception 'one contribution earned twice';
  exception when others then caught:=sqlerrm;
    perform pg_temp.assert_true(caught='work_allowance_idempotency_conflict','one contribution reference earns once');
  end;

  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',job_id,
    'executionKey','change-2','maximumCents',0,'kind','tool','attribution','normal'),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  begin
    perform public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
      jsonb_build_object('action','reserve','jobId',job_id,'executionKey','change-2',
        'unitKind','completed_tracker_change','units',3));
    raise exception 'over-allowance units reserved';
  exception when others then caught:=sqlerrm;
    perform pg_temp.assert_true(caught='work_allowance_capacity_exceeded','grant plus credit caps units atomically');
  end;
  response:=public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','reserve','jobId',job_id,'executionKey','change-2',
      'unitKind','completed_tracker_change','units',2));
  perform pg_temp.assert_true((response->>'reservedUnits')::integer=2,'remaining concrete units can be reserved');
  perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',job_id,'executionKey','change-2',
    'effect','none','amountCents',0),'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  response:=public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','settle','jobId',job_id,'executionKey','change-2'));
  perform pg_temp.assert_true(response->>'disposition'='released','proven no effect releases unit and cap');

  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',job_id,
    'executionKey','change-unknown','maximumCents',0,'kind','tool','attribution','normal'),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  perform public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','reserve','jobId',job_id,'executionKey','change-unknown',
      'unitKind','completed_tracker_change','units',1));
  perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',job_id,'executionKey','change-unknown'),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',job_id,'executionKey','change-unknown',
    'effect','unknown','amountCents',null),'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  response:=public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','settle','jobId',job_id,'executionKey','change-unknown'));
  perform pg_temp.assert_true(response->>'disposition'='held_unknown' and response->>'status'='reserved',
    'uncertain receipt retains unit and dollar reservations');

  select id into retry_job_id from public.job_economics_command(jsonb_build_object(
    'action','create','productId','tracker','resourceKind','tracker',
    'workspaceId','51515151-5151-4151-8151-515151515151','workId','71717171-7171-4171-8171-717171717171',
    'payerId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','estimateCents',25,'maxAuthorizedCents',100),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','agency@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action','accept','jobId',retry_job_id),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','claim','jobId',retry_job_id,
    'executionKey','strelva-retry','maximumCents',100,'kind','model','attribution','strelva_retry'),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  response:=public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','reserve','jobId',retry_job_id,'executionKey','strelva-retry',
      'unitKind','completed_tracker_change','units',1));
  perform pg_temp.assert_true((response->>'reservedUnits')::integer=0 and (response->>'reservedCapCents')::integer=0,
    'Strelva retry reserves no customer allowance despite a zero-dollar cap');
  perform public.job_economics_execution_command(jsonb_build_object('action','start','jobId',retry_job_id,'executionKey','strelva-retry'),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  perform public.job_economics_execution_command(jsonb_build_object('action','finish','jobId',retry_job_id,'executionKey','strelva-retry',
    'effect','accepted','amountCents',25),'cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com');
  response:=public.work_allowance_execution_command('cccccccc-cccc-4ccc-8ccc-cccccccccccc','other@example.com',
    jsonb_build_object('action','settle','jobId',retry_job_id,'executionKey','strelva-retry'));
  perform pg_temp.assert_true(response->>'disposition'='released' and (response->>'actualCostCents')::integer=25
    and (response->>'capCostCents')::integer=0,'retry cost remains Strelva evidence and consumes no customer allowance');

  inspection:=public.read_work_allowances('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com',allowance_id,null);
  perform pg_temp.assert_true(inspection#>>'{allowances,0,businessName}'='Allowance Test Business'
    and (inspection#>>'{allowances,0,actualCostCents}')::integer=25
    and (inspection#>>'{allowances,0,consumedCapCents}')::integer=0
    and (inspection#>>'{allowances,0,buckets,0,consumedUnits}')::integer=1,
    'payer reads explicit business, unit usage and separate actual/cap costs');

  delete from public.workspace_memberships where workspace_id='51515151-5151-4151-8151-515151515151'
    and user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  begin
    perform public.read_work_allowances('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','recipient@example.com',allowance_id,null);
    raise exception 'former payer read business allowance';
  exception when others then caught:=sqlerrm;
    perform pg_temp.assert_true(caught='work_allowance_access_denied','current business membership is rechecked');
  end;
end;
$$;
