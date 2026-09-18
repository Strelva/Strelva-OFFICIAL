\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  not has_function_privilege('service_role', 'public.guard_standing_responsibility_claim()', 'EXECUTE'),
  'the standing claim guard is trigger-only'
);
select pg_temp.assert_true(
  exists(
    select 1
    from pg_trigger
    where tgrelid = 'public.saved_product_work'::regclass
      and tgname = 'standing_responsibility_claim_guard_trg'
      and not tgenabled = 'D'
  ),
  'finite work updates must have the standing claim guard'
);

do $$
declare
  owner_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  owner_email text := 'agency@example.com';
  workspace_id uuid;
  source_one_id uuid := gen_random_uuid();
  source_two_id uuid := gen_random_uuid();
  standing_id uuid := gen_random_uuid();
  finite_id uuid := gen_random_uuid();
  cancelled_finite_id uuid := gen_random_uuid();
  ordinary_finite_id uuid := gen_random_uuid();
  job_id uuid;
  cancelled_job_id uuid;
  standing_run_id uuid;
  policy public.standing_responsibilities%rowtype;
  finite public.saved_product_work%rowtype;
  changed public.saved_product_work%rowtype;
  policy_payload jsonb;
  paused_payload jsonb;
  resumed_payload jsonb;
  revoked_payload jsonb;
  finite_payload jsonb;
  claimed_payload jsonb;
  completed_payload jsonb;
  next_claim_payload jsonb;
  cancelled_claim_payload jsonb;
  ordinary_claim_payload jsonb;
  caught text;
  base_at timestamptz := clock_timestamp();
  approved_at timestamptz := clock_timestamp();
  claimed_at timestamptz := clock_timestamp();
  paused_at timestamptz := clock_timestamp();
  finished_at timestamptz := clock_timestamp();
  resumed_at timestamptz := clock_timestamp();
  revoked_at timestamptz := clock_timestamp();
begin
  select id into workspace_id
  from public.workspaces
  where created_by = owner_id and kind = 'personal'
  order by created_at
  limit 1;
  perform pg_temp.assert_true(workspace_id is not null, 'standing execution needs an owner workspace');
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
    values (workspace_id, owner_id, 'owner', owner_id)
    on conflict on constraint workspace_memberships_pkey do update set role = 'owner';

  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values
      (source_one_id, workspace_id, 'investigations', 'investigation', 'First saved check', '{}'::jsonb, owner_id),
      (source_two_id, workspace_id, 'investigations', 'investigation', 'Second saved check', '{}'::jsonb, owner_id);

  policy_payload := jsonb_build_object(
    'version', 1,
    'revision', 0,
    'title', 'Run saved checks',
    'intent', 'Run the approved saved checks in order.',
    'ownerId', owner_id::text,
    'status', 'proposed',
    'scope', jsonb_build_object('steps', jsonb_build_array(
      jsonb_build_object('id', 'first', 'operation', 'investigation.run', 'workId', source_one_id::text,
        'input', '{}'::jsonb, 'dependsOn', jsonb_build_array(), 'maximumCents', 0),
      jsonb_build_object('id', 'second', 'operation', 'investigation.run', 'workId', source_two_id::text,
        'input', '{}'::jsonb, 'dependsOn', jsonb_build_array('first'), 'maximumCents', 0)
    )),
    'trigger', jsonb_build_object('kind', 'manual'),
    'limits', jsonb_build_object('maxConcurrentJobs', 2, 'maxRuns', null),
    'exclusions', jsonb_build_array(),
    'createdAt', base_at,
    'updatedAt', base_at,
    'history', jsonb_build_array()
  );
  insert into public.standing_responsibilities(
    id, workspace_id, owner_id, version, revision, status, payload
  ) values (
    standing_id, workspace_id, owner_id, 1, 0, 'proposed', policy_payload
  );

  policy_payload := policy_payload || jsonb_build_object(
    'revision', 1,
    'status', 'active',
    'approvedBy', owner_id::text,
    'approvedAt', approved_at,
    'updatedAt', approved_at,
    'history', jsonb_build_array(jsonb_build_object(
      'revision', 1, 'kind', 'approve', 'actorId', owner_id::text, 'at', approved_at
    ))
  );
  select * into policy from public.update_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 0, policy_payload
  );

  finite_payload := jsonb_build_object(
    'version', 1,
    'revision', 1,
    'title', 'Run saved checks',
    'intent', 'Run the approved saved checks in order.',
    'ownerId', owner_id::text,
    'status', 'ready',
    'approvedBy', owner_id::text,
    'approvedAt', approved_at,
    'createdAt', approved_at,
    'updatedAt', approved_at,
    'steps', jsonb_build_array(
      jsonb_build_object('id', 'first', 'operation', 'investigation.run', 'workId', source_one_id::text,
        'input', jsonb_build_object('expectedRevision', 0, 'requestId', 'standing-execution-first'),
        'dependsOn', jsonb_build_array(), 'maximumCents', 0, 'status', 'pending', 'attempt', 0),
      jsonb_build_object('id', 'second', 'operation', 'investigation.run', 'workId', source_two_id::text,
        'input', jsonb_build_object('expectedRevision', 0, 'requestId', 'standing-execution-second'),
        'dependsOn', jsonb_build_array('first'), 'maximumCents', 0, 'status', 'pending', 'attempt', 0)
    ),
    'history', jsonb_build_array(jsonb_build_object(
      'revision', 1, 'kind', 'approve', 'actorId', owner_id::text, 'at', approved_at
    ))
  );
  insert into public.saved_product_work(
    id, workspace_id, product_id, resource_kind, title, payload, created_by
  ) values (
    finite_id, workspace_id, 'operations', 'responsibility', 'Run saved checks', finite_payload, owner_id
  ) returning * into finite;
  insert into public.standing_responsibility_jobs(
    id, standing_responsibility_id, workspace_id, finite_work_id, trigger_key, policy_version, status
  ) values (
    gen_random_uuid(), standing_id, workspace_id, finite_id, 'manual:claim', 1, 'accepted'
  ) returning id into job_id;
  insert into public.standing_responsibility_runs(
    id, standing_responsibility_id, job_id, workspace_id, finite_work_id, trigger_key, policy_version, status
  ) values (
    gen_random_uuid(), standing_id, job_id, workspace_id, finite_id, 'manual:claim', 1, 'admitted'
  ) returning id into standing_run_id;

  claimed_payload := jsonb_set(finite.payload, '{revision}', '2'::jsonb);
  claimed_payload := jsonb_set(claimed_payload, '{status}', '"running"'::jsonb);
  claimed_payload := jsonb_set(claimed_payload, '{updatedAt}', to_jsonb(claimed_at));
  claimed_payload := jsonb_set(claimed_payload, '{steps,0}',
    (claimed_payload->'steps'->0) || jsonb_build_object(
      'status', 'running', 'attempt', 1, 'leaseId', 'standing-lease-first', 'startedAt', claimed_at
    ));
  claimed_payload := jsonb_set(claimed_payload, '{history}', claimed_payload->'history' || jsonb_build_array(
    jsonb_build_object('revision', 2, 'kind', 'started', 'actorId', owner_id::text, 'at', claimed_at, 'detail', 'first')
  ));
  select * into changed from public.update_work_responsibility(
    finite_id, workspace_id, owner_id, owner_email, 1, claimed_payload
  );
  perform pg_temp.assert_true(
    changed.payload->>'revision' = '2' and changed.payload->>'status' = 'running'
      and changed.payload->'steps'->0->>'status' = 'running',
    'an accepted active standing job can claim its first step'
  );

  paused_payload := policy.payload || jsonb_build_object(
    'revision', 2,
    'status', 'paused',
    'updatedAt', paused_at,
    'history', policy.payload->'history' || jsonb_build_array(jsonb_build_object(
      'revision', 2, 'kind', 'pause', 'actorId', owner_id::text, 'at', paused_at
    ))
  );
  select * into policy from public.update_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 1, paused_payload
  );

  -- A pause committed after the first claim does not cancel the provider
  -- effect. Its finite checkpoint and standing receipt remain writeable.
  completed_payload := changed.payload;
  completed_payload := jsonb_set(completed_payload, '{revision}', '3'::jsonb);
  completed_payload := jsonb_set(completed_payload, '{status}', '"running"'::jsonb);
  completed_payload := jsonb_set(completed_payload, '{updatedAt}', to_jsonb(finished_at));
  completed_payload := jsonb_set(completed_payload, '{steps,0}',
    (completed_payload->'steps'->0) || jsonb_build_object(
      'status', 'completed', 'effect', 'none', 'result', jsonb_build_object('receipt', 'no-effect'),
      'finishedAt', finished_at
    ));
  completed_payload := jsonb_set(completed_payload, '{history}', completed_payload->'history' || jsonb_build_array(
    jsonb_build_object('revision', 3, 'kind', 'outcome', 'actorId', owner_id::text, 'at', finished_at, 'detail', 'first: completed')
  ));
  select * into changed from public.update_work_responsibility(
    finite_id, workspace_id, owner_id, owner_email, 2, completed_payload
  );
  perform pg_temp.assert_true(
    changed.payload->>'revision' = '3' and changed.payload->'steps'->0->>'status' = 'completed',
    'an in-flight standing action can finish after pause'
  );
  perform public.record_standing_responsibility_run(
    standing_run_id, owner_id, owner_email, 'running', 1, null, null, null,
    jsonb_build_array(jsonb_build_object(
      'stepId', 'first', 'attempt', 1, 'status', 'completed', 'effect', 'none',
      'result', jsonb_build_object('receipt', 'no-effect'), 'finishedAt', finished_at
    ))
  );
  perform pg_temp.assert_true(
    exists(select 1 from public.standing_responsibility_receipts receipt
      where receipt.run_id = standing_run_id and receipt.step_id = 'first'
        and receipt.attempt = 1 and receipt.status = 'completed'),
    'an in-flight completion receipt remains recordable after pause'
  );

  next_claim_payload := changed.payload;
  next_claim_payload := jsonb_set(next_claim_payload, '{revision}', '4'::jsonb);
  next_claim_payload := jsonb_set(next_claim_payload, '{status}', '"running"'::jsonb);
  next_claim_payload := jsonb_set(next_claim_payload, '{updatedAt}', to_jsonb(finished_at));
  next_claim_payload := jsonb_set(next_claim_payload, '{steps,1}',
    (next_claim_payload->'steps'->1) || jsonb_build_object(
      'status', 'running', 'attempt', 1, 'leaseId', 'standing-lease-second', 'startedAt', finished_at
    ));
  next_claim_payload := jsonb_set(next_claim_payload, '{history}', next_claim_payload->'history' || jsonb_build_array(
    jsonb_build_object('revision', 4, 'kind', 'started', 'actorId', owner_id::text, 'at', finished_at, 'detail', 'second')
  ));
  caught := null;
  begin
    perform public.update_work_responsibility(
      finite_id, workspace_id, owner_id, owner_email, 3, next_claim_payload
    );
    raise exception 'paused standing policy allowed a later claim';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_execution_blocked', 'paused policy blocks the next claim');
  select * into changed from public.saved_product_work where id = finite_id;
  perform pg_temp.assert_true(
    changed.payload->>'revision' = '3' and changed.payload->'steps'->1->>'status' = 'pending',
    'a blocked standing claim leaves the finite payload unchanged'
  );

  resumed_payload := policy.payload || jsonb_build_object(
    'revision', 3,
    'status', 'active',
    'updatedAt', resumed_at,
    'history', policy.payload->'history' || jsonb_build_array(jsonb_build_object(
      'revision', 3, 'kind', 'resume', 'actorId', owner_id::text, 'at', resumed_at
    ))
  );
  select * into policy from public.update_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 2, resumed_payload
  );

  -- A cancelled accepted job is not an execution authority, even while its
  -- policy remains active.
  cancelled_claim_payload := finite_payload;
  cancelled_claim_payload := jsonb_set(cancelled_claim_payload, '{steps,0,input,requestId}', '"standing-execution-cancelled"');
  insert into public.saved_product_work(
    id, workspace_id, product_id, resource_kind, title, payload, created_by
  ) values (
    cancelled_finite_id, workspace_id, 'operations', 'responsibility', 'Cancelled standing work', cancelled_claim_payload, owner_id
  );
  insert into public.standing_responsibility_jobs(
    id, standing_responsibility_id, workspace_id, finite_work_id, trigger_key, policy_version, status
  ) values (
    gen_random_uuid(), standing_id, workspace_id, cancelled_finite_id, 'manual:cancelled', 1, 'accepted'
  ) returning id into cancelled_job_id;
  update public.standing_responsibility_jobs
    set status = 'cancelled', cancelled_at = clock_timestamp()
    where id = cancelled_job_id;
  cancelled_claim_payload := jsonb_set(cancelled_claim_payload, '{revision}', '2'::jsonb);
  cancelled_claim_payload := jsonb_set(cancelled_claim_payload, '{status}', '"running"'::jsonb);
  cancelled_claim_payload := jsonb_set(cancelled_claim_payload, '{updatedAt}', to_jsonb(resumed_at));
  cancelled_claim_payload := jsonb_set(cancelled_claim_payload, '{steps,0}',
    (cancelled_claim_payload->'steps'->0) || jsonb_build_object(
      'status', 'running', 'attempt', 1, 'leaseId', 'cancelled-lease', 'startedAt', resumed_at
    ));
  cancelled_claim_payload := jsonb_set(cancelled_claim_payload, '{history}', cancelled_claim_payload->'history' || jsonb_build_array(
    jsonb_build_object('revision', 2, 'kind', 'started', 'actorId', owner_id::text, 'at', resumed_at, 'detail', 'cancelled')
  ));
  caught := null;
  begin
    perform public.update_work_responsibility(
      cancelled_finite_id, workspace_id, owner_id, owner_email, 1, cancelled_claim_payload
    );
    raise exception 'cancelled standing job allowed a claim';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_execution_blocked', 'cancelled job blocks a claim');

  revoked_payload := policy.payload || jsonb_build_object(
    'revision', 4,
    'status', 'revoked',
    'updatedAt', revoked_at,
    'history', policy.payload->'history' || jsonb_build_array(jsonb_build_object(
      'revision', 4, 'kind', 'revoke', 'actorId', owner_id::text, 'at', revoked_at
    ))
  );
  select * into policy from public.update_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 3, revoked_payload
  );

  caught := null;
  begin
    perform public.update_work_responsibility(
      finite_id, workspace_id, owner_id, owner_email, 3, next_claim_payload
    );
    raise exception 'revoked standing policy allowed a later claim';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_execution_blocked', 'revoked policy blocks the next claim');

  -- The trigger is scoped to accepted standing jobs. Existing ordinary
  -- responsibilities continue to use the generic CAS/member/owner contract.
  insert into public.saved_product_work(
    id, workspace_id, product_id, resource_kind, title, payload, created_by
  ) values (
    ordinary_finite_id, workspace_id, 'operations', 'responsibility', 'Ordinary work', finite_payload, owner_id
  );
  ordinary_claim_payload := jsonb_set(finite_payload, '{revision}', '2'::jsonb);
  ordinary_claim_payload := jsonb_set(ordinary_claim_payload, '{status}', '"running"'::jsonb);
  ordinary_claim_payload := jsonb_set(ordinary_claim_payload, '{updatedAt}', to_jsonb(revoked_at));
  ordinary_claim_payload := jsonb_set(ordinary_claim_payload, '{steps,0}',
    (ordinary_claim_payload->'steps'->0) || jsonb_build_object(
      'status', 'running', 'attempt', 1, 'leaseId', 'ordinary-lease', 'startedAt', revoked_at
    ));
  ordinary_claim_payload := jsonb_set(ordinary_claim_payload, '{history}', ordinary_claim_payload->'history' || jsonb_build_array(
    jsonb_build_object('revision', 2, 'kind', 'started', 'actorId', owner_id::text, 'at', revoked_at, 'detail', 'ordinary')
  ));
  select * into changed from public.update_work_responsibility(
    ordinary_finite_id, workspace_id, owner_id, owner_email, 1, ordinary_claim_payload
  );
  perform pg_temp.assert_true(
    changed.payload->>'status' = 'running' and changed.payload->'steps'->0->>'status' = 'running',
    'ordinary finite responsibilities remain unaffected'
  );
end;
$$;
