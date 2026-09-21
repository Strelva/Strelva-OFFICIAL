\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end;
$$;

select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.operational_assignments','SELECT'),
  'assignments are not browser-readable'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated','public.checkpoint_operational_assignment(uuid,text,uuid,integer,jsonb,text)','EXECUTE'),
  'assigned execution stays behind the server boundary'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated','public.read_operational_assignment_for_work(uuid,text,uuid)','EXECUTE'),
  'owner assignment discovery stays behind the server boundary'
);

do $$
declare
  owner_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  operator_id uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  guest_id uuid := '91919191-9191-4919-8919-919191919191';
  test_workspace_id uuid;
  target_one uuid := gen_random_uuid();
  target_two uuid := gen_random_uuid();
  responsibility public.saved_product_work;
  assignment public.operational_assignments;
  assignment_a public.operational_assignments;
  assignment_b public.operational_assignments;
  assignment_replay public.operational_assignments;
  changed public.saved_product_work;
  payload jsonb;
  next_payload jsonb;
  bad_payload jsonb;
  accepted_at timestamptz := clock_timestamp();
  started_at timestamptz := clock_timestamp();
  finished_at timestamptz := clock_timestamp();
  offer_expires_at timestamptz := clock_timestamp()+interval '1 day';
begin
  select id into test_workspace_id from public.workspaces
    where created_by=owner_id and kind='personal' order by created_at limit 1;
  perform pg_temp.assert_true(test_workspace_id is not null,'assignment proof needs the owner workspace');
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
    values(test_workspace_id,owner_id,'owner',owner_id)
    on conflict on constraint workspace_memberships_pkey do update set role='owner';
  insert into public.users(id,email,verified_at)
    values(guest_id,'operational-assignment-outsider@example.com',clock_timestamp());

  payload := jsonb_build_object(
    'version',1,'revision',1,'title','Check current records','intent','Run only the approved checks.',
    'ownerId',owner_id::text,'approvedBy',owner_id::text,'approvedAt',accepted_at,
    'status','ready','createdAt',accepted_at,'updatedAt',accepted_at,
    'steps',jsonb_build_array(
      jsonb_build_object('id','first','operation','investigation.run','workId',target_one::text,
        'input',jsonb_build_object('expectedRevision',0,'requestId','assignment-first'),
        'dependsOn',jsonb_build_array(),'maximumCents',0,'capabilityVersion',1,'status','pending','attempt',0),
      jsonb_build_object('id','second','operation','investigation.run','workId',target_two::text,
        'input',jsonb_build_object('expectedRevision',0,'requestId','assignment-second'),
        'dependsOn',jsonb_build_array('first'),'maximumCents',0,'capabilityVersion',1,'status','pending','attempt',0)
    ),
    'history',jsonb_build_array(jsonb_build_object(
      'revision',1,'kind','approve','actorId',owner_id::text,'at',accepted_at
    ))
  );
  insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
    values(test_workspace_id,'operations','responsibility','Check current records',payload,owner_id)
    returning * into responsibility;

  begin
    perform public.offer_operational_assignment(
      owner_id,'agency@example.com',responsibility.id,'operational-assignment-outsider@example.com','agency',offer_expires_at,'outsider-offer'
    );
    raise exception 'outside guest received operate authority';
  exception when others then if sqlerrm<>'operational_assignment_denied' then raise; end if; end;

  insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
    values(test_workspace_id,operator_id,'member',owner_id) on conflict do nothing;
  select * into assignment from public.offer_operational_assignment(
    owner_id,'agency@example.com',responsibility.id,'recipient@example.com','staff',offer_expires_at,'first-offer'
  );
  perform pg_temp.assert_true(assignment.status='offered' and assignment.scope='["operate"]','owner offers one operate scope');
  select * into assignment_replay from public.read_operational_assignment_for_work(
    owner_id,'agency@example.com',responsibility.id
  );
  perform pg_temp.assert_true(assignment_replay.id=assignment.id,'owner can recover the stable assignment link from its exact work');
  begin
    perform public.read_operational_assignment_for_work(operator_id,'recipient@example.com',responsibility.id);
    raise exception 'assignee discovered owner assignment history by work';
  exception when others then if sqlerrm<>'operational_assignment_denied' then raise; end if; end;
  select * into assignment_replay from public.offer_operational_assignment(
    owner_id,'agency@example.com',responsibility.id,'recipient@example.com','staff',offer_expires_at,'first-offer'
  );
  perform pg_temp.assert_true(assignment_replay.id=assignment.id,'an identical offer retry returns the original assignment');
  begin
    perform public.offer_operational_assignment(
      owner_id,'agency@example.com',responsibility.id,'recipient@example.com','agency',offer_expires_at,'first-offer'
    );
    raise exception 'an offer retry changed its meaning';
  exception when others then if sqlerrm<>'operational_assignment_conflict' then raise; end if; end;
  perform pg_temp.assert_true(
    (public.read_operational_assignment(operator_id,'recipient@example.com',assignment.id,'inspect')->'assignment'->>'status')='offered',
    'assignee can inspect the exact offer before accepting'
  );
  begin
    perform public.checkpoint_operational_assignment(operator_id,'recipient@example.com',assignment.id,1,payload,'start');
    raise exception 'unaccepted assignment started work';
  exception when others then if sqlerrm not in ('operational_assignment_denied','operational_assignment_conflict') then raise; end if; end;
  select * into assignment from public.accept_operational_assignment(operator_id,'recipient@example.com',assignment.id);
  perform pg_temp.assert_true(assignment.status='accepted' and assignment.accepted_at is not null,'assignee acceptance is explicit');
  select * into assignment_replay from public.accept_operational_assignment(operator_id,'recipient@example.com',assignment.id);
  perform pg_temp.assert_true(assignment_replay.id=assignment.id and assignment_replay.accepted_at=assignment.accepted_at,
    'an acceptance retry returns the accepted assignment');

  next_payload := payload || jsonb_build_object('revision',2,'status','running','updatedAt',started_at);
  next_payload := jsonb_set(next_payload,'{steps,0}',next_payload->'steps'->0 || jsonb_build_object(
    'status','running','attempt',1,'leaseId','assigned-first','startedAt',started_at
  ));
  next_payload := jsonb_set(next_payload,'{history}',next_payload->'history' || jsonb_build_array(jsonb_build_object(
    'revision',2,'kind','started','actorId',operator_id::text,'at',started_at,'detail','first'
  )));
  select * into changed from public.checkpoint_operational_assignment(
    operator_id,'recipient@example.com',assignment.id,1,next_payload,'start'
  );
  perform pg_temp.assert_true(changed.payload->'history'->1->>'actorId'=operator_id::text,'claim records the acting person');

  select * into assignment from public.revoke_operational_assignment(
    owner_id,'agency@example.com',assignment.id
  );
  assignment_a:=assignment;
  perform pg_temp.assert_true(assignment.status='revoked','owner can revoke an accepted assignment');
  begin
    perform public.read_operational_assignment(operator_id,'recipient@example.com',assignment.id,'normal');
    raise exception 'revoked assignment admitted an effect';
  exception when others then if sqlerrm<>'operational_assignment_denied' then raise; end if; end;
  perform pg_temp.assert_true(
    (public.read_operational_assignment(operator_id,'recipient@example.com',assignment.id,'inspect')->'assignment'->>'status')='revoked',
    'assignee can see that an assignment was revoked'
  );

  -- The exact active claim can still persist its no-duplicate outcome receipt.
  next_payload := changed.payload || jsonb_build_object('revision',3,'status','ready','updatedAt',finished_at);
  next_payload := jsonb_set(next_payload,'{steps,0}',next_payload->'steps'->0 || jsonb_build_object(
    'status','completed','effect','none','result',jsonb_build_object('checked',true),'finishedAt',finished_at
  ));
  next_payload := jsonb_set(next_payload,'{history}',next_payload->'history' || jsonb_build_array(jsonb_build_object(
    'revision',3,'kind','outcome','actorId',operator_id::text,'at',finished_at,'detail','first: completed'
  )));
  select * into changed from public.checkpoint_operational_assignment(
    operator_id,'recipient@example.com',assignment.id,2,next_payload,'outcome'
  );
  perform pg_temp.assert_true(changed.payload->>'ownerId'=owner_id::text
    and changed.payload->'history'->2->>'actorId'=operator_id::text,'sponsor and actor stay distinct');

  -- Neither the assignment nor a forged checkpoint can change approval or broaden the exact work.
  begin
    perform public.checkpoint_operational_assignment(
      operator_id,'recipient@example.com',assignment.id,3,changed.payload,'command'
    );
    raise exception 'operator reached an owner command';
  exception when others then if sqlerrm<>'operational_assignment_denied' then raise; end if; end;
  bad_payload := jsonb_set(changed.payload,'{steps,1,operation}','"application.command"');
  begin
    perform public.checkpoint_operational_assignment(
      operator_id,'recipient@example.com',assignment.id,3,bad_payload,'start'
    );
    raise exception 'operator broadened the accepted operation';
  exception when others then if sqlerrm not in ('operational_assignment_denied','operational_assignment_conflict') then raise; end if; end;

  -- A revoked assignment cannot checkpoint a later claim from a new assignment,
  -- even when both assignments belong to the same verified person.
  select * into assignment_b from public.offer_operational_assignment(
    owner_id,'agency@example.com',responsibility.id,'recipient@example.com','staff',offer_expires_at,'replacement-offer'
  );
  select * into assignment_b from public.accept_operational_assignment(operator_id,'recipient@example.com',assignment_b.id);
  next_payload := changed.payload || jsonb_build_object('revision',4,'status','running','updatedAt',started_at);
  next_payload := jsonb_set(next_payload,'{steps,1}',next_payload->'steps'->1 || jsonb_build_object(
    'status','running','attempt',1,'leaseId','assigned-second','startedAt',started_at
  ));
  next_payload := jsonb_set(next_payload,'{history}',next_payload->'history' || jsonb_build_array(jsonb_build_object(
    'revision',4,'kind','started','actorId',operator_id::text,'at',started_at,'detail','second'
  )));
  select * into changed from public.checkpoint_operational_assignment(
    operator_id,'recipient@example.com',assignment_b.id,3,next_payload,'start'
  );
  next_payload := changed.payload || jsonb_build_object('revision',5,'status','completed','updatedAt',finished_at);
  next_payload := jsonb_set(next_payload,'{steps,1}',next_payload->'steps'->1 || jsonb_build_object(
    'status','completed','effect','none','result',jsonb_build_object('checked',true),'finishedAt',finished_at
  ));
  next_payload := jsonb_set(next_payload,'{history}',next_payload->'history' || jsonb_build_array(jsonb_build_object(
    'revision',5,'kind','outcome','actorId',operator_id::text,'at',finished_at,'detail','second: completed'
  )));
  begin
    perform public.checkpoint_operational_assignment(
      operator_id,'recipient@example.com',assignment_a.id,4,next_payload,'outcome'
    );
    raise exception 'a revoked assignment checkpointed a replacement assignment claim';
  exception when others then if sqlerrm<>'operational_assignment_conflict' then raise; end if; end;
  select * into changed from public.checkpoint_operational_assignment(
    operator_id,'recipient@example.com',assignment_b.id,4,next_payload,'outcome'
  );
  perform pg_temp.assert_true(changed.payload->>'status'='completed','the exact replacement assignment checkpoints its own claim');

  -- A verified member still loses assignment authority when the sponsor is no longer an owner.
  insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
    values(test_workspace_id,'operations','responsibility','Second check',payload,owner_id)
    returning * into responsibility;
  select * into assignment from public.offer_operational_assignment(
    owner_id,'agency@example.com',responsibility.id,'recipient@example.com','strelva',clock_timestamp()+interval '1 day','sponsor-removal-offer'
  );
  perform public.accept_operational_assignment(operator_id,'recipient@example.com',assignment.id);
  update public.workspace_memberships membership set role='admin' where membership.workspace_id=test_workspace_id and membership.user_id=owner_id;
  begin
    perform public.read_operational_assignment(operator_id,'recipient@example.com',assignment.id,'normal');
    raise exception 'revoked sponsor authority admitted an effect';
  exception when others then if sqlerrm<>'operational_assignment_denied' then raise; end if; end;
  update public.workspace_memberships membership set role='owner' where membership.workspace_id=test_workspace_id and membership.user_id=owner_id;

  -- Expiry is checked at the same read used immediately before a native effect.
  update public.operational_assignments set
    offered_at=clock_timestamp()-interval '2 seconds',expires_at=clock_timestamp()-interval '1 second'
    where id=assignment.id;
  perform pg_temp.assert_true(
    (public.read_operational_assignment(operator_id,'recipient@example.com',assignment.id,'inspect')->'assignment'->>'expires_at')::timestamptz<=clock_timestamp(),
    'assignee can see that the offer expired'
  );
  begin
    perform public.read_operational_assignment(operator_id,'recipient@example.com',assignment.id,'normal');
    raise exception 'expired assignment passed the immediate effect recheck';
  exception when others then if sqlerrm<>'operational_assignment_denied' then raise; end if; end;
  begin
    perform public.checkpoint_operational_assignment(operator_id,'recipient@example.com',assignment.id,1,payload,'start');
    raise exception 'expired assignment admitted an effect';
  exception when others then if sqlerrm<>'operational_assignment_denied' then raise; end if; end;

  -- Paid and release-control responsibilities cannot be offered.
  bad_payload := jsonb_set(payload,'{steps,0,maximumCents}','1');
  insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
    values(test_workspace_id,'operations','responsibility','Paid check',bad_payload,owner_id)
    returning * into responsibility;
  begin
    perform public.offer_operational_assignment(owner_id,'agency@example.com',responsibility.id,'recipient@example.com','agent',clock_timestamp()+interval '1 day','paid-offer');
    raise exception 'paid responsibility was assigned';
  exception when others then if sqlerrm<>'operational_assignment_denied' then raise; end if; end;
  bad_payload := jsonb_set(payload,'{steps,0,operation}','"application.command"');
  insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
    values(test_workspace_id,'operations','responsibility','Release control',bad_payload,owner_id)
    returning * into responsibility;
  begin
    perform public.offer_operational_assignment(owner_id,'agency@example.com',responsibility.id,'recipient@example.com','agent',clock_timestamp()+interval '1 day','release-offer');
    raise exception 'release control was assigned';
  exception when others then if sqlerrm<>'operational_assignment_denied' then raise; end if; end;
end $$;
