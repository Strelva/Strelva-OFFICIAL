\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.update_standing_responsibility(uuid,uuid,uuid,text,integer,jsonb)', 'EXECUTE'),
  'service_role must execute standing policy updates'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.admit_standing_responsibility(uuid,uuid,uuid,text,integer,text,jsonb,timestamptz)', 'EXECUTE'),
  'service_role must execute standing admissions'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.record_standing_responsibility_run(uuid,uuid,text,text,integer,timestamptz,text,timestamptz,jsonb)', 'EXECUTE'),
  'service_role must record standing runs'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.admit_standing_responsibility(uuid,uuid,uuid,text,integer,text,jsonb,timestamptz)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.admit_standing_responsibility(uuid,uuid,uuid,text,integer,text,jsonb,timestamptz)', 'EXECUTE'),
  'browser roles must not execute standing admission'
);
select pg_temp.assert_true(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.standing_responsibilities'::regclass,
      'public.standing_responsibility_jobs'::regclass,
      'public.standing_responsibility_runs'::regclass,
      'public.standing_responsibility_receipts'::regclass
    )
  ),
  'standing tables must have RLS enabled'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.standing_responsibilities', 'SELECT')
    and not has_table_privilege('anon', 'public.standing_responsibility_jobs', 'SELECT'),
  'browser roles must not read standing tables directly'
);
select pg_temp.assert_true(
  has_table_privilege('service_role', 'public.standing_responsibilities', 'INSERT')
    and not has_table_privilege('service_role', 'public.standing_responsibilities', 'UPDATE')
    and not has_table_privilege('service_role', 'public.standing_responsibilities', 'DELETE')
    and not has_table_privilege('service_role', 'public.standing_responsibility_jobs', 'INSERT')
    and not has_table_privilege('service_role', 'public.standing_responsibility_jobs', 'UPDATE')
    and not has_table_privilege('service_role', 'public.standing_responsibility_runs', 'INSERT')
    and not has_table_privilege('service_role', 'public.standing_responsibility_runs', 'UPDATE')
    and not has_table_privilege('service_role', 'public.standing_responsibility_receipts', 'INSERT')
    and not has_table_privilege('service_role', 'public.standing_responsibility_receipts', 'UPDATE'),
  'service role writes must stay behind policy and run RPCs'
);

do $$
<<standing_fixture>>
declare
  owner_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  member_id uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  owner_email text := 'agency@example.com';
  workspace_id uuid;
  foreign_workspace_id uuid;
  source_id uuid := gen_random_uuid();
  foreign_source_id uuid := gen_random_uuid();
  standing_id uuid := gen_random_uuid();
  first_finite_work_id uuid;
  policy public.standing_responsibilities%rowtype;
  job public.standing_responsibility_jobs%rowtype;
  run public.standing_responsibility_runs%rowtype;
  admission_row record;
  replayed boolean;
  policy_payload jsonb;
  finite_payload jsonb;
  caught text;
  first_at timestamptz;
  first_next timestamptz;
  second_next timestamptz;
  third_next timestamptz;
  fourth_next timestamptz;
  approved_at timestamptz;
  wake_at timestamptz;
  cancelled_finite_work_id uuid;
  cancelled_run_id uuid;
  stale_finite_work_id uuid;
  stale_run_id uuid;
begin
  first_at := clock_timestamp() - interval '1 day';
  first_next := first_at + interval '60 seconds';
  second_next := first_at + interval '120 seconds';
  third_next := first_at + interval '180 seconds';
  fourth_next := first_at + interval '240 seconds';
  approved_at := clock_timestamp();
  wake_at := clock_timestamp() + interval '5 minutes';
  select id into workspace_id
  from public.workspaces
  where created_by = owner_id and kind = 'personal'
  order by created_at
  limit 1;
  perform pg_temp.assert_true(workspace_id is not null, 'standing fixture needs an owner workspace');

  insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
    values (workspace_id, member_id, 'member', owner_id)
    on conflict do nothing;
  update public.workspace_memberships as membership
    set role = 'member'
    where membership.workspace_id = standing_fixture.workspace_id and membership.user_id = member_id;

  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values (source_id, workspace_id, 'investigations', 'investigation', 'Supplier document check', '{}'::jsonb, owner_id);
  select id into foreign_workspace_id
  from public.workspaces
  where id <> workspace_id and created_by = owner_id and kind = 'agency'
  order by created_at
  limit 1;
  perform pg_temp.assert_true(foreign_workspace_id is not null, 'standing fixture needs a second owner workspace');
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
    values (foreign_workspace_id, owner_id, 'owner', owner_id)
    on conflict on constraint workspace_memberships_pkey do update set role = excluded.role;
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values (foreign_source_id, foreign_workspace_id, 'investigations', 'investigation', 'Foreign supplier check', '{}'::jsonb, owner_id);

  policy_payload := jsonb_build_object(
    'version', 1,
    'revision', 0,
    'title', 'Check supplier documents',
    'intent', 'Compare the saved supplier records on each approved interval.',
    'ownerId', owner_id::text,
    'status', 'proposed',
    'scope', jsonb_build_object(
      'steps', jsonb_build_array(jsonb_build_object(
        'id', 'check', 'operation', 'investigation.run', 'workId', source_id::text,
        'input', '{}'::jsonb, 'dependsOn', jsonb_build_array(), 'maximumCents', 0
      ))
    ),
    'trigger', jsonb_build_object('kind', 'interval', 'everySeconds', 60, 'nextAt', first_at),
    'limits', jsonb_build_object('maxConcurrentJobs', 1, 'maxRuns', null),
    'exclusions', jsonb_build_array(),
    'createdAt', first_at,
    'updatedAt', first_at,
    'history', jsonb_build_array()
  );
  insert into public.standing_responsibilities(
    id, workspace_id, owner_id, version, revision, status, payload, next_trigger_at
  ) values (
    standing_id, workspace_id, owner_id, 1, 0, 'proposed', policy_payload, first_at
  );

  caught := null;
  begin
    insert into public.standing_responsibilities(
      id, workspace_id, owner_id, version, revision, status, payload, next_trigger_at
    ) values (
      gen_random_uuid(), workspace_id, owner_id, 1, 0, 'proposed',
      jsonb_set(policy_payload, '{scope,steps,0,input}', '{"unexpected":"value"}'::jsonb), first_at
    );
    raise exception 'nonempty standing scope input was accepted';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_scope_invalid', 'standing scope input must be resolved at admission');

  caught := null;
  begin
    insert into public.standing_responsibilities(
      id, workspace_id, owner_id, version, revision, status, payload, next_trigger_at
    ) values (
      gen_random_uuid(), workspace_id, owner_id, 1, 1, 'active',
      policy_payload || jsonb_build_object(
        'revision', 1, 'status', 'active', 'approvedBy', owner_id::text,
        'approvedAt', approved_at,
        'history', jsonb_build_array(jsonb_build_object(
          'revision', 1, 'kind', 'approve', 'actorId', owner_id::text, 'at', approved_at
        ))
      ), first_at
    );
    raise exception 'direct active standing policy insert was accepted';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_payload_invalid', 'policy insert must start as an unapproved proposal');

  caught := null;
  begin
    insert into public.standing_responsibilities(
      id, workspace_id, owner_id, version, revision, status, payload, next_trigger_at
    ) values (
      gen_random_uuid(), workspace_id, owner_id, 1, 0, 'proposed',
      jsonb_set(policy_payload, '{scope,steps,0,workId}', to_jsonb(foreign_source_id::text)), first_at
    );
    raise exception 'cross-workspace standing scope was accepted';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_scope_workspace_invalid', 'standing scope must stay in its policy workspace');

  policy_payload := policy_payload || jsonb_build_object(
    'revision', 1, 'status', 'active', 'approvedBy', owner_id::text,
    'approvedAt', approved_at, 'updatedAt', approved_at,
    'history', jsonb_build_array(jsonb_build_object(
      'revision', 1, 'kind', 'approve', 'actorId', owner_id::text, 'at', approved_at
    ))
  );
  select * into policy from public.update_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 0, policy_payload
  );

  begin
    perform public.update_standing_responsibility(
      standing_id, workspace_id, member_id, 'other@example.com', 1, policy_payload
    );
    raise exception 'standing member mutation was accepted';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_workspace_denied', 'member cannot approve or mutate ongoing work');

  finite_payload := jsonb_build_object(
    'version', 1, 'revision', 1, 'title', 'Check supplier documents',
    'intent', 'Compare the saved supplier records on each approved interval.',
    'ownerId', owner_id::text, 'status', 'ready', 'approvedBy', owner_id::text,
    'approvedAt', approved_at, 'createdAt', approved_at, 'updatedAt', approved_at,
    'steps', jsonb_build_array(jsonb_build_object(
      'id', 'check', 'operation', 'investigation.run', 'workId', source_id::text,
      'input', jsonb_build_object('expectedRevision', 0, 'requestId', 'standing-test-1'),
      'dependsOn', jsonb_build_array(), 'maximumCents', 0, 'status', 'pending', 'attempt', 0
    )),
    'history', jsonb_build_array(jsonb_build_object(
      'revision', 1, 'kind', 'approve', 'actorId', owner_id::text, 'at', approved_at
    ))
  );
  select * into admission_row from public.admit_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 1, 'interval:first', finite_payload, first_next
  );
  job := admission_row.job;
  run := admission_row.run;
  replayed := admission_row.replayed;
  first_finite_work_id := job.finite_work_id;
  perform pg_temp.assert_true(not replayed, 'first trigger creates a new accepted job');

  update public.saved_product_work
    set payload = jsonb_set(
      jsonb_set(payload, '{status}', '"waiting"'::jsonb),
      '{steps,0}',
      (payload->'steps'->0) || jsonb_build_object('status', 'waiting', 'attempt', 1, 'wakeAt', wake_at)
    )
    where id = job.finite_work_id;
  select * into run from public.record_standing_responsibility_run(
    run.id, owner_id, owner_email, 'waiting', 1, wake_at, null, null,
    jsonb_build_array(jsonb_build_object('stepId', 'check', 'attempt', 1, 'status', 'waiting', 'effect', 'none'))
  );
  update public.saved_product_work
    set payload = jsonb_set(
      jsonb_set(payload, '{status}', '"completed"'::jsonb),
      '{steps,0}',
      (payload->'steps'->0) || jsonb_build_object('status', 'completed', 'attempt', 2, 'effect', 'none')
    )
    where id = job.finite_work_id;
  select * into run from public.record_standing_responsibility_run(
    run.id, owner_id, owner_email, 'completed', 2, null, null, null,
    jsonb_build_array(jsonb_build_object('stepId', 'check', 'attempt', 2, 'status', 'completed', 'effect', 'none'))
  );
  caught := null;
  begin
    update public.standing_responsibility_receipts
      set effect = 'unknown'
      where run_id = run.id and step_id = 'check' and attempt = 2;
    raise exception 'standing receipt was mutable';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_receipt_immutable', 'standing receipts retain exact effects');

  finite_payload := jsonb_set(finite_payload, '{steps,0,input,requestId}', '"standing-test-2"');
  select * into admission_row from public.admit_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 1, 'interval:second', finite_payload, second_next
  );
  job := admission_row.job;
  run := admission_row.run;
  replayed := admission_row.replayed;
  perform pg_temp.assert_true(not replayed, 'second trigger creates a distinct accepted job');
  update public.saved_product_work
    set payload = jsonb_set(
      jsonb_set(payload, '{status}', '"completed"'::jsonb),
      '{steps,0}',
      (payload->'steps'->0) || jsonb_build_object('status', 'completed', 'attempt', 1, 'effect', 'none')
    )
    where id = job.finite_work_id;
  select * into run from public.record_standing_responsibility_run(
    run.id, owner_id, owner_email, 'completed', 1, null, null, null,
    jsonb_build_array(jsonb_build_object('stepId', 'check', 'attempt', 1, 'status', 'completed', 'effect', 'none'))
  );

  caught := null;
  begin
    perform * from public.admit_standing_responsibility(
      standing_id, workspace_id, owner_id, owner_email, 1, 'interval:bad-capability',
      jsonb_set(finite_payload, '{steps,0,capabilityVersion}', '2'), third_next
    );
    raise exception 'admission changed the pinned capability version';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_scope_conflict', 'admission must pin the standing capability version');

  -- Replaying a trigger key remains the first finite job even if the source
  -- record has since changed and a fresh admission would resolve another revision.
  finite_payload := jsonb_set(finite_payload, '{steps,0,input,expectedRevision}', '99');
  select * into admission_row from public.admit_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 1, 'interval:first', finite_payload, null
  );
  job := admission_row.job;
  run := admission_row.run;
  replayed := admission_row.replayed;
  perform pg_temp.assert_true(replayed, 'duplicate trigger replays the accepted job');
  perform pg_temp.assert_true(
    (select count(*) from public.standing_responsibility_jobs where standing_responsibility_id = standing_id) = 2
      and (select count(distinct finite_work_id) from public.standing_responsibility_jobs where standing_responsibility_id = standing_id) = 2,
    'two triggers produce two finite jobs and a duplicate produces no third job'
  );
  perform pg_temp.assert_true(
    (select count(*) from public.standing_responsibility_runs where standing_responsibility_id = standing_id and status = 'completed') = 2,
    'both accepted jobs retain independent completed run projections'
  );

  select * into policy from public.standing_responsibilities where id = standing_id;
  policy_payload := jsonb_set(policy.payload, '{trigger,nextAt}', to_jsonb(policy.next_trigger_at)) || jsonb_build_object(
    'revision', 2, 'status', 'paused', 'updatedAt', clock_timestamp(),
    'history', policy.payload->'history' || jsonb_build_array(jsonb_build_object(
      'revision', 2, 'kind', 'pause', 'actorId', owner_id::text, 'at', clock_timestamp()
    ))
  );
  select * into policy from public.update_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 1, policy_payload
  );
  update public.saved_product_work
    set payload = jsonb_set(payload, '{status}', '"ready"'::jsonb)
    where id = first_finite_work_id;
  perform pg_temp.assert_true(
    not exists(select 1 from public.due_workspace_work(30) due where due.id = first_finite_work_id),
    'paused standing jobs are not redispatched by generic due work'
  );
  update public.saved_product_work
    set payload = jsonb_set(payload, '{status}', '"completed"'::jsonb)
    where id = first_finite_work_id;
  caught := null;
  begin
    perform * from public.admit_standing_responsibility(
      standing_id, workspace_id, owner_id, owner_email, 1, 'interval:paused', finite_payload, third_next
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_admission_blocked', 'paused policy cannot admit new work');

  policy_payload := policy.payload || jsonb_build_object(
    'revision', 3, 'status', 'active', 'updatedAt', clock_timestamp(),
    'history', policy.payload->'history' || jsonb_build_array(jsonb_build_object(
      'revision', 3, 'kind', 'resume', 'actorId', owner_id::text, 'at', clock_timestamp()
    ))
  );
  select * into policy from public.update_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 2, policy_payload
  );
  finite_payload := jsonb_set(finite_payload, '{steps,0,input,requestId}', '"standing-test-3"');
  select * into admission_row from public.admit_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 1, 'interval:resumed', finite_payload, third_next
  );
  job := admission_row.job;
  run := admission_row.run;
  replayed := admission_row.replayed;
  perform pg_temp.assert_true(not replayed, 'resumed policy admits a new trigger');
  cancelled_finite_work_id := job.finite_work_id;
  cancelled_run_id := run.id;

  update public.saved_product_work
    set payload = jsonb_set(
      jsonb_set(payload, '{status}', '"cancelled"'::jsonb),
      '{steps,0}',
      (payload->'steps'->0) || jsonb_build_object('status', 'completed', 'attempt', 1, 'effect', 'accepted')
    )
    where id = cancelled_finite_work_id;
  select * into run from public.record_standing_responsibility_run(
    cancelled_run_id, owner_id, owner_email, 'cancelled', 1, null, null, clock_timestamp(),
    jsonb_build_array(jsonb_build_object('stepId', 'check', 'attempt', 1, 'status', 'accepted', 'effect', 'accepted', 'result', jsonb_build_object('receipt', 'provider-accepted')))
  );
  select * into run from public.record_standing_responsibility_run(
    cancelled_run_id, owner_id, owner_email, 'cancelled', 2, null, 'late response retained', null,
    jsonb_build_array(jsonb_build_object('stepId', 'check', 'attempt', 2, 'status', 'unknown', 'effect', 'unknown', 'result', jsonb_build_object('receipt', 'provider-unknown')))
  );
  perform pg_temp.assert_true(
    (select count(*) from public.standing_responsibility_receipts where run_id = run.id) = 2
      and (select count(*) from public.standing_responsibility_receipts where run_id = run.id and effect = 'accepted') = 1
      and (select count(*) from public.standing_responsibility_receipts where run_id = run.id and effect = 'unknown') = 1,
    'cancellation preserves accepted and unknown effects'
  );

  -- Leave one run waiting while its finite responsibility reaches a terminal
  -- state. This is the crash-recovery projection that due work must surface
  -- for repair, even after the policy is later revoked.
  finite_payload := jsonb_set(finite_payload, '{steps,0,input,expectedRevision}', '0');
  finite_payload := jsonb_set(finite_payload, '{steps,0,input,requestId}', '"standing-test-stale"');
  select * into admission_row from public.admit_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 1, 'interval:stale', finite_payload, fourth_next
  );
  job := admission_row.job;
  run := admission_row.run;
  stale_finite_work_id := job.finite_work_id;
  stale_run_id := run.id;
  update public.saved_product_work
    set payload = jsonb_set(
      jsonb_set(payload, '{status}', '"waiting"'::jsonb),
      '{steps,0}',
      (payload->'steps'->0) || jsonb_build_object('status', 'waiting', 'attempt', 1, 'wakeAt', wake_at)
    )
    where id = stale_finite_work_id;
  select * into run from public.record_standing_responsibility_run(
    stale_run_id, owner_id, owner_email, 'waiting', 1, wake_at, null, null,
    jsonb_build_array(jsonb_build_object('stepId', 'check', 'attempt', 1, 'status', 'waiting', 'effect', 'none'))
  );
  update public.saved_product_work
    set payload = jsonb_set(
      jsonb_set(payload, '{status}', '"completed"'::jsonb),
      '{steps,0}',
      (payload->'steps'->0) || jsonb_build_object('status', 'completed', 'attempt', 1, 'effect', 'none')
    )
    where id = stale_finite_work_id;

  policy_payload := policy.payload || jsonb_build_object(
    'revision', 4, 'status', 'revoked', 'updatedAt', clock_timestamp(),
    'history', policy.payload->'history' || jsonb_build_array(jsonb_build_object(
      'revision', 4, 'kind', 'revoke', 'actorId', owner_id::text, 'at', clock_timestamp()
    ))
  );
  select * into policy from public.update_standing_responsibility(
    standing_id, workspace_id, owner_id, owner_email, 3, policy_payload
  );
  caught := null;
  begin
    perform * from public.admit_standing_responsibility(
      standing_id, workspace_id, owner_id, owner_email, 1, 'interval:revoked', finite_payload, third_next
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'standing_admission_blocked', 'revoked policy cannot admit new work');
  perform pg_temp.assert_true(
    exists(select 1 from public.due_workspace_work(30) due where due.id = stale_finite_work_id and due.product_id = 'operations'),
    'terminal finite work with a stale standing projection is due for repair'
  );
  perform pg_temp.assert_true(
    not exists(select 1 from public.due_workspace_work(30) due where due.id = standing_id),
    'paused or revoked standing policy is not due for dispatch'
  );
end;
$$;

select 'standing responsibility checks passed' as result;
