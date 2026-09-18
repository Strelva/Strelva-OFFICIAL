\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege(
    'service_role',
    'public.accept_workspace_handoff(text,uuid,text,uuid,text,boolean)',
    'EXECUTE'
  ),
  'service_role must execute the destination-aware handoff RPC'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.accept_workspace_handoff(text,uuid,text,uuid,text,boolean)',
    'EXECUTE'
  ),
  'authenticated must not execute the destination-aware handoff RPC'
);
select pg_temp.assert_true(
  has_function_privilege(
    'service_role',
    'public.accept_workspace_handoff(text,uuid,text,boolean)',
    'EXECUTE'
  ),
  'legacy service callers must remain able to fail closed'
);

insert into public.users (id, email, verified_at) values
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'business-owner@example.com', now()),
  ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'foreign-owner@example.com', now())
on conflict (id) do nothing;

insert into public.workspaces (id, kind, name, created_by) values
  ('70000000-0000-4000-8000-000000000001', 'agency', 'Destination test agency', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('70000000-0000-4000-8000-000000000002', 'customer', 'First business', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('70000000-0000-4000-8000-000000000003', 'customer', 'Second business', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('70000000-0000-4000-8000-000000000004', 'customer', 'Foreign business', 'ffffffff-ffff-4fff-8fff-ffffffffffff');

insert into public.workspace_memberships (workspace_id, user_id, role, created_by) values
  ('70000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('70000000-0000-4000-8000-000000000002', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'owner', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('70000000-0000-4000-8000-000000000003', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'admin', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),
  ('70000000-0000-4000-8000-000000000004', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'owner', 'ffffffff-ffff-4fff-8fff-ffffffffffff');

insert into public.saved_product_work (
  id, workspace_id, product_id, resource_kind, title, payload, input, created_by
) values (
  '70000000-0000-4000-8000-000000000010',
  '70000000-0000-4000-8000-000000000001',
  'ai_visibility',
  'ai_visibility_assessment',
  'Destination choice assessment',
  '{"score": 81}'::jsonb,
  '{"business": "Choice test"}'::jsonb,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

-- A native application has separate release, record and grant authorities.
-- The generic handoff copier must reject even an old pending token for it.
insert into public.saved_product_work (
  id, workspace_id, product_id, resource_kind, title, payload, input, created_by
) values (
  '70000000-0000-4000-8000-000000000011',
  '70000000-0000-4000-8000-000000000001',
  'applications',
  'application',
  'Private staff application',
  '{
    "version": 1,
    "revision": 0,
    "title": "Private staff application",
    "createdBy": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "createdAt": "2026-09-14T00:00:00.000Z",
    "history": [],
    "spec": {
      "title": "Private staff application",
      "maintenanceOwner": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "fields": [{"id": "name", "label": "Name", "type": "text", "required": false}],
      "components": [{"kind": "form", "fields": ["name"]}]
    },
    "specVersion": 1,
    "status": "draft",
    "versions": [{"version": 1, "spec": {
      "title": "Private staff application",
      "maintenanceOwner": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "fields": [{"id": "name", "label": "Name", "type": "text", "required": false}],
      "components": [{"kind": "form", "fields": ["name"]}]
    }}],
    "rehearsal": null,
    "records": [{"id": "private-record", "values": {"name": "Source-only record"}}],
    "designRevision": 0,
    "recordsRevision": 1,
    "candidate": {
      "designRevision": 0,
      "specVersion": 1,
      "spec": {
        "title": "Private staff application",
        "maintenanceOwner": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "fields": [{"id": "name", "label": "Name", "type": "text", "required": false}],
        "components": [{"kind": "form", "fields": ["name"]}]
      },
      "rehearsal": null
    },
    "release": null,
    "releases": []
  }'::jsonb,
  '{}'::jsonb,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

insert into public.workspace_handoffs (
  id, agency_workspace_id, source_work_id, recipient_email, token_hash,
  status, expires_at, created_by
) values
  ('70000000-0000-4000-8000-000000000020', '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000010', 'business-owner@example.com', repeat('1', 64), 'pending', now() + interval '1 hour', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000010', 'business-owner@example.com', repeat('2', 64), 'pending', now() + interval '1 hour', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('70000000-0000-4000-8000-000000000022', '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000010', 'business-owner@example.com', repeat('3', 64), 'pending', now() + interval '1 hour', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('70000000-0000-4000-8000-000000000023', '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000010', 'business-owner@example.com', '4' || repeat('4', 63), 'pending', now() + interval '1 hour', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('70000000-0000-4000-8000-000000000024', '70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000011', 'business-owner@example.com', '5' || repeat('5', 63), 'pending', now() + interval '1 hour', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

do $$
declare
  accepted record;
  replay record;
  caught text;
  source_count bigint;
  destination_count bigint;
begin
  select count(*) into source_count from public.saved_product_work;
  select * into accepted from public.accept_workspace_handoff(
    repeat('1', 64),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'business-owner@example.com',
    '70000000-0000-4000-8000-000000000002',
    null,
    false
  );
  perform pg_temp.assert_true(not accepted.already_accepted, 'first explicit destination acceptance must create a copy');
  perform pg_temp.assert_true(accepted.customer_workspace_id = '70000000-0000-4000-8000-000000000002', 'acceptance must use the selected business');
  perform pg_temp.assert_true((select workspace_id from public.saved_product_work where id = accepted.customer_work_id) = accepted.customer_workspace_id, 'copy must belong to the selected business');
  perform pg_temp.assert_true((select source_work_id from public.saved_product_work where id = accepted.customer_work_id) = '70000000-0000-4000-8000-000000000010', 'copy must preserve source provenance');

  begin
    perform * from public.accept_workspace_handoff(
      repeat('1', 64),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'business-owner@example.com',
      '70000000-0000-4000-8000-000000000003',
      null,
      true
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'handoff_destination_changed', 'replay cannot move an accepted handoff to another business');
  select * into replay from public.accept_workspace_handoff(
    repeat('1', 64),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'business-owner@example.com',
    '70000000-0000-4000-8000-000000000002',
    null,
    true
  );
  perform pg_temp.assert_true(replay.already_accepted and replay.customer_work_id = accepted.customer_work_id, 'same actor and destination must replay the same copy');
  perform pg_temp.assert_true((select count(*) from public.saved_product_work) = source_count + 1, 'replay must not create another copy or expand delegation');

  begin
    perform * from public.accept_workspace_handoff(
      repeat('2', 64),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'business-owner@example.com',
      '70000000-0000-4000-8000-000000000004',
      null,
      false
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'handoff_destination_membership_required', 'a foreign business cannot receive the copy');
  perform pg_temp.assert_true((select status from public.workspace_handoffs where id = '70000000-0000-4000-8000-000000000021') = 'pending', 'foreign destination failure must leave the handoff pending');
  perform pg_temp.assert_true((select count(*) from public.saved_product_work) = source_count + 1, 'foreign destination failure must not copy work');

  delete from public.workspace_memberships
    where workspace_id = '70000000-0000-4000-8000-000000000003'
      and user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  begin
    perform * from public.accept_workspace_handoff(
      repeat('2', 64),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'business-owner@example.com',
      '70000000-0000-4000-8000-000000000003',
      null,
      false
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'handoff_destination_membership_required', 'revoked destination membership must fail at acceptance');

  delete from public.workspace_memberships
    where workspace_id = accepted.customer_workspace_id
      and user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  begin
    perform * from public.accept_workspace_handoff(
      repeat('1', 64),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'business-owner@example.com',
      accepted.customer_workspace_id,
      null,
      false
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'handoff_destination_membership_required', 'replay must recheck current destination membership');

  select * into accepted from public.accept_workspace_handoff(
    repeat('3', 64),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'business-owner@example.com',
    null,
    'New customer business',
    false
  );
  perform pg_temp.assert_true(not accepted.already_accepted, 'new business acceptance must create a copy');
  perform pg_temp.assert_true((select kind from public.workspaces where id = accepted.customer_workspace_id) = 'customer', 'new destination must use the customer workspace kind');
  perform pg_temp.assert_true((select name from public.workspaces where id = accepted.customer_workspace_id) = 'New customer business', 'new destination must use the supplied business name');
  perform pg_temp.assert_true((select user_id from public.workspace_memberships where workspace_id = accepted.customer_workspace_id and user_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'new destination must grant membership to the accepting actor');

  select * into replay from public.accept_workspace_handoff(
    repeat('3', 64),
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    'business-owner@example.com',
    null,
    'New customer business',
    true
  );
  perform pg_temp.assert_true(replay.already_accepted and replay.customer_workspace_id = accepted.customer_workspace_id and replay.customer_work_id = accepted.customer_work_id, 'same named new business must replay the same copy');

  begin
    perform * from public.accept_workspace_handoff(
      repeat('3', 64),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'business-owner@example.com',
      null,
      'Another business',
      false
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'handoff_destination_changed', 'replay of a created business must require its recorded workspace ID');

  begin
    perform * from public.accept_workspace_handoff(
      '4' || repeat('4', 63),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'business-owner@example.com',
      false
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'handoff_destination_required', 'legacy acceptance must fail instead of inferring a business');

  select count(*) into source_count from public.saved_product_work;
  select count(*) into destination_count from public.workspaces;
  caught := null;
  begin
    perform * from public.accept_workspace_handoff(
      '5' || repeat('5', 63),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      'business-owner@example.com',
      null,
      'Application destination',
      false
    );
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'handoff_product_unsupported', 'native application handoffs must use the definition install path');
  perform pg_temp.assert_true((select status from public.workspace_handoffs where id = '70000000-0000-4000-8000-000000000024') = 'pending', 'unsupported application handoff must remain pending');
  perform pg_temp.assert_true((select count(*) from public.saved_product_work) = source_count, 'unsupported application handoff must not copy records');
  perform pg_temp.assert_true((select count(*) from public.workspaces) = destination_count, 'unsupported application handoff must not create a business');
end;
$$;

select 'handoff destination checks passed' as result;
