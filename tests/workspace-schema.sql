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
    'public.accept_workspace_handoff(text,uuid,text,boolean)',
    'EXECUTE'
  ),
  'service_role must execute the handoff RPC'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.accept_workspace_handoff(text,uuid,text,boolean)',
    'EXECUTE'
  ),
  'authenticated must not execute the handoff RPC'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'anon',
    'public.accept_workspace_handoff(text,uuid,text,boolean)',
    'EXECUTE'
  ),
  'anon must not execute the handoff RPC'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'public',
    'public.accept_workspace_handoff(text,uuid,text,boolean)',
    'EXECUTE'
  ),
  'PUBLIC must not execute the handoff RPC'
);
select pg_temp.assert_true(
  has_function_privilege(
    'service_role',
    'public.create_owned_workspace(uuid,text,text,text)',
    'EXECUTE'
  ),
  'service_role must execute the workspace creation RPC'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.create_owned_workspace(uuid,text,text,text)',
    'EXECUTE'
  ),
  'authenticated must not execute the workspace creation RPC'
);
select pg_temp.assert_true(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.workspaces'::regclass,
      'public.workspace_memberships'::regclass,
      'public.saved_product_work'::regclass,
      'public.workspace_delegations'::regclass,
      'public.workspace_handoffs'::regclass
    )
  ),
  'every workspace table must have RLS enabled'
);
select pg_temp.assert_true(
  (select count(*) from pg_policies where schemaname = 'public' and tablename like 'workspace%') = 0,
  'release one workspace tables must not expose browser policies'
);
select pg_temp.assert_true(
  (
    select bool_and(
      has_table_privilege('service_role', table_name, 'SELECT')
      and has_table_privilege('service_role', table_name, 'INSERT')
      and has_table_privilege('service_role', table_name, 'UPDATE')
    )
    from unnest(array[
      'public.workspaces',
      'public.workspace_memberships',
      'public.saved_product_work',
      'public.workspace_delegations',
      'public.workspace_handoffs'
    ]) as fixture(table_name)
  ),
  'service_role must have the direct table privileges used by the repository'
);
select pg_temp.assert_true(
  (
    select bool_and(
      not has_table_privilege(browser_role, table_name, 'SELECT')
      and not has_table_privilege(browser_role, table_name, 'INSERT')
      and not has_table_privilege(browser_role, table_name, 'UPDATE')
      and not has_table_privilege(browser_role, table_name, 'DELETE')
    )
    from unnest(array['anon', 'authenticated']) as roles(browser_role)
    cross join unnest(array[
      'public.workspaces',
      'public.workspace_memberships',
      'public.saved_product_work',
      'public.workspace_delegations',
      'public.workspace_handoffs'
    ]) as fixture(table_name)
  ),
  'browser roles must have no direct workspace table privileges'
);

insert into public.users (id, email, verified_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com', now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'other@example.com', now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'unverified@example.com', null);

insert into public.workspaces (id, kind, name, created_by) values
  (
    '11111111-1111-4111-8111-111111111111',
    'agency',
    'Example Agency',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'agency',
    'Other Agency',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

insert into public.saved_product_work (
  id, workspace_id, product_id, resource_kind, title, payload, input, created_by
) values
  (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'ai_visibility',
    'ai_visibility_assessment',
    'Prepared assessment',
    '{"score": 73, "private": "source-owner-data"}'::jsonb,
    '{"business": "Example"}'::jsonb,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '33333333-3333-4333-8333-333333333333',
    'ai_visibility',
    'ai_visibility_assessment',
    'Wrong workspace source',
    '{"score": 20}'::jsonb,
    null,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

insert into public.workspace_handoffs (
  id, agency_workspace_id, source_work_id, recipient_email, token_hash,
  status, expires_at, created_by, revoked_by, revoked_at
) values
  (
    '50000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'recipient@example.com', repeat('a', 64), 'pending', now() + interval '1 hour',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'recipient@example.com', repeat('b', 64), 'pending', now() + interval '1 hour',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'unverified@example.com', repeat('c', 64), 'pending', now() + interval '1 hour',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null
  ),
  (
    '50000000-0000-4000-8000-000000000004',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'recipient@example.com', repeat('d', 64), 'pending', now() - interval '1 second',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null
  ),
  (
    '50000000-0000-4000-8000-000000000005',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'recipient@example.com', repeat('e', 64), 'revoked', now() + interval '1 hour',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now()
  ),
  (
    '50000000-0000-4000-8000-000000000006',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'recipient@example.com', repeat('f', 64), 'pending', now() + interval '1 hour',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null
  ),
  (
    '50000000-0000-4000-8000-000000000007',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'other@example.com', repeat('0', 64), 'pending', now() + interval '1 hour',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null
  );

do $$
declare
  before_workspaces bigint;
  before_work bigint;
  caught text;
begin
  select count(*) into before_workspaces from public.workspaces;
  select count(*) into before_work from public.saved_product_work;
  begin
    perform * from public.accept_workspace_handoff(
      repeat('b', 64),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'wrong@example.com',
      true
    );
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'handoff_recipient_mismatch', 'wrong email must take the mismatch route');
  perform pg_temp.assert_true((select count(*) from public.workspaces) = before_workspaces, 'mismatch must not create a workspace');
  perform pg_temp.assert_true((select count(*) from public.saved_product_work) = before_work, 'mismatch must not copy work');
end;
$$;

do $$
declare caught text;
begin
  begin
    perform * from public.accept_workspace_handoff(
      repeat('c', 64),
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'unverified@example.com',
      true
    );
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'verified_identity_required', 'unverified identity must have a distinct failure');
end;
$$;

do $$
declare
  expired_error text;
  revoked_error text;
begin
  begin
    perform * from public.accept_workspace_handoff(
      repeat('d', 64),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'recipient@example.com',
      true
    );
  exception when others then expired_error := sqlerrm;
  end;
  begin
    perform * from public.accept_workspace_handoff(
      repeat('e', 64),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'recipient@example.com',
      true
    );
  exception when others then revoked_error := sqlerrm;
  end;
  perform pg_temp.assert_true(expired_error = 'handoff_expired', 'expired token must fail');
  perform pg_temp.assert_true(revoked_error = 'handoff_revoked', 'revoked token must fail distinctly');
end;
$$;

do $$
declare
  source_change_blocked boolean := false;
begin
  begin
    update public.saved_product_work
      set workspace_id = '33333333-3333-4333-8333-333333333333'
      where id = '22222222-2222-4222-8222-222222222222';
  exception when foreign_key_violation then
    source_change_blocked := true;
  end;
  perform pg_temp.assert_true(source_change_blocked, 'handoff source must not move to another workspace');
  perform pg_temp.assert_true(
    (select workspace_id from public.saved_product_work where id = '22222222-2222-4222-8222-222222222222')
      = '11111111-1111-4111-8111-111111111111',
    'failed source change must preserve original ownership'
  );
  perform pg_temp.assert_true(
    exists (select 1 from public.workspace_handoffs where token_hash = repeat('f', 64) and status = 'pending'),
    'failed source change must preserve the handoff'
  );
end;
$$;

do $$
declare accepted record;
begin
  select * into accepted from public.accept_workspace_handoff(
    repeat('a', 64),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ' Recipient@Example.com ',
    true
  );
  perform pg_temp.assert_true(not accepted.already_accepted, 'first acceptance must be new');
  perform pg_temp.assert_true(accepted.customer_workspace_id is not null, 'acceptance must create customer workspace');
  perform pg_temp.assert_true(accepted.customer_work_id is not null, 'acceptance must copy source work');
  perform pg_temp.assert_true(accepted.delegation_id is not null, 'opt-in must create delegation');
  perform pg_temp.assert_true(
    exists (
      select 1 from public.workspace_memberships
      where workspace_id = accepted.customer_workspace_id
        and user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        and role = 'owner'
    ),
    'recipient must own the customer workspace'
  );
  perform pg_temp.assert_true(
    exists (
      select 1 from public.saved_product_work
      where id = accepted.customer_work_id
        and workspace_id = accepted.customer_workspace_id
        and source_work_id = '22222222-2222-4222-8222-222222222222'
        and payload = '{"score": 73, "private": "source-owner-data"}'::jsonb
        and input = '{"business": "Example"}'::jsonb
    ),
    'acceptance must preserve the prepared work and provenance'
  );
  perform pg_temp.assert_true(
    exists (
      select 1 from public.workspace_delegations
      where id = accepted.delegation_id
        and customer_work_id = accepted.customer_work_id
        and agency_workspace_id = '11111111-1111-4111-8111-111111111111'
        and status = 'active'
    ),
    'delegation must target only the copied work'
  );
end;
$$;

do $$
declare
  retried record;
  original public.workspace_handoffs%rowtype;
  claimed_error text;
  wrong_email_error text;
  unverified_error text;
begin
  select * into original from public.workspace_handoffs where token_hash = repeat('a', 64);

  begin
    perform * from public.accept_workspace_handoff(
      repeat('a', 64),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'other@example.com',
      false
    );
  exception when others then wrong_email_error := sqlerrm;
  end;
  perform pg_temp.assert_true(
    wrong_email_error = 'handoff_recipient_mismatch',
    'accepted-token retry must reject the same user with a different email'
  );

  update public.users set verified_at = null
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  begin
    perform * from public.accept_workspace_handoff(
      repeat('a', 64),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'recipient@example.com',
      false
    );
  exception when others then unverified_error := sqlerrm;
  end;
  perform pg_temp.assert_true(
    unverified_error = 'verified_identity_required',
    'accepted-token retry must reject a user whose email is no longer verified'
  );
  update public.users set verified_at = now()
    where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  select * into retried from public.accept_workspace_handoff(
    repeat('a', 64),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'recipient@example.com',
    false
  );
  perform pg_temp.assert_true(retried.already_accepted, 'same recipient retry must be idempotent');
  perform pg_temp.assert_true(retried.customer_workspace_id = original.customer_workspace_id, 'retry must return original workspace');
  perform pg_temp.assert_true(retried.customer_work_id = original.customer_work_id, 'retry must return original work');
  perform pg_temp.assert_true(retried.delegation_id = original.delegation_id, 'retry must return original delegation');

  begin
    perform * from public.accept_workspace_handoff(
      repeat('a', 64),
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'other@example.com',
      false
    );
  exception when others then claimed_error := sqlerrm;
  end;
  perform pg_temp.assert_true(
    claimed_error = 'handoff_recipient_mismatch',
    'another user with a different verified email cannot reuse an accepted token'
  );
end;
$$;

do $$
declare
  accepted public.workspace_handoffs%rowtype;
  later_work_id uuid;
  visible_ids uuid[];
begin
  select * into accepted from public.workspace_handoffs where token_hash = repeat('a', 64);
  insert into public.saved_product_work (
    workspace_id, product_id, resource_kind, title, payload, created_by
  ) values (
    accepted.customer_workspace_id,
    'ai_visibility',
    'ai_visibility_assessment',
    'Later private work',
    '{"score": 99}'::jsonb,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ) returning id into later_work_id;

  select array_agg(work.id order by work.id) into visible_ids
  from public.saved_product_work work
  join public.workspace_delegations delegation
    on delegation.customer_work_id = work.id
   and delegation.agency_workspace_id = '11111111-1111-4111-8111-111111111111'
   and delegation.status = 'active'
   and delegation.scope @> array['work:read']::text[]
  where work.workspace_id = accepted.customer_workspace_id;

  perform pg_temp.assert_true(visible_ids = array[accepted.customer_work_id], 'delegation must not expose later customer work');

  update public.workspace_delegations set
    status = 'revoked',
    revoked_at = now(),
    revoked_by = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  where id = accepted.delegation_id;

  perform pg_temp.assert_true(
    (select count(*) from public.saved_product_work where workspace_id = accepted.customer_workspace_id) = 2,
    'revoking delegation must preserve customer work'
  );
  perform pg_temp.assert_true(
    exists (select 1 from public.workspace_delegations where id = accepted.delegation_id and status = 'revoked'),
    'revocation must preserve its audit row'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1 from public.workspace_delegations
      where customer_workspace_id = accepted.customer_workspace_id
        and agency_workspace_id = '11111111-1111-4111-8111-111111111111'
        and status = 'active'
    ),
    'revoked delegation must no longer expose work'
  );
end;
$$;

begin;
set local role service_role;
select * from public.accept_workspace_handoff(
  repeat('0', 64),
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'other@example.com',
  false
);
reset role;
select pg_temp.assert_true(
  exists (
    select 1 from public.workspace_handoffs
    where token_hash = repeat('0', 64) and status = 'accepted'
  ),
  'acceptance must be visible inside its transaction'
);
rollback;

select pg_temp.assert_true(
  exists (
    select 1 from public.workspace_handoffs
    where token_hash = repeat('0', 64) and status = 'pending'
  ),
  'outer rollback must restore pending handoff state'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.workspaces
    where kind = 'customer' and created_by = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  'outer rollback must remove the customer workspace'
);
select pg_temp.assert_true(
  not exists (
    select 1 from public.saved_product_work
    where created_by = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ),
  'outer rollback must remove copied work'
);

select 'workspace schema checks passed' as result;
