\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

-- Website creation remains a saved_product_work row. The migration adds only
-- the durable idempotency boundary needed to make two concurrent creates for
-- the same workspace/request key converge on one work item.
select pg_temp.assert_true(
  to_regclass('public.saved_product_work_websites_request_idx') is not null,
  'website request idempotency index must be installed'
);

do $$
declare
  owner_id uuid := '12000000-0000-4000-8000-000000000001';
  other_owner_id uuid := '12000000-0000-4000-8000-000000000002';
  workspace_id uuid := '12000000-0000-4000-8000-000000000010';
  other_workspace_id uuid := '12000000-0000-4000-8000-000000000011';
  first_work_id uuid := '12000000-0000-4000-8000-000000000020';
  duplicate_work_id uuid := '12000000-0000-4000-8000-000000000021';
  other_work_id uuid := '12000000-0000-4000-8000-000000000022';
begin
  insert into public.users (id, email, verified_at)
  values
    (owner_id, 'website-work-owner@example.test', clock_timestamp()),
    (other_owner_id, 'website-work-other@example.test', clock_timestamp());

  insert into public.workspaces (id, kind, name, created_by)
  values
    (workspace_id, 'personal', 'Website work owner', owner_id),
    (other_workspace_id, 'personal', 'Other website work owner', other_owner_id);

  insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
  values
    (workspace_id, owner_id, 'owner', owner_id),
    (other_workspace_id, other_owner_id, 'owner', other_owner_id);

  insert into public.saved_product_work (
    id, workspace_id, product_id, resource_kind, title, payload, input, created_by
  ) values (
    first_work_id,
    workspace_id,
    'websites',
    'website',
    'Website work',
    '{"version":1,"revision":0,"title":"Website work","status":"draft"}'::jsonb,
    '{"version":1,"source":"website_creation","requestId":"website-schema-request","requestHash":"fixture"}'::jsonb,
    owner_id
  );

  begin
    insert into public.saved_product_work (
      id, workspace_id, product_id, resource_kind, title, payload, input, created_by
    ) values (
      duplicate_work_id,
      workspace_id,
      'websites',
      'website',
      'Duplicate website work',
      '{"version":1,"revision":0,"title":"Duplicate website work","status":"draft"}'::jsonb,
      '{"version":1,"source":"website_creation","requestId":"website-schema-request","requestHash":"fixture"}'::jsonb,
      owner_id
    );
    raise exception 'duplicate website request id was accepted';
  exception
    when unique_violation then
      null;
  end;

  -- The request key is tenant scoped. A different workspace may use the same
  -- client request id without exposing or reusing the first workspace's work.
  insert into public.saved_product_work (
    id, workspace_id, product_id, resource_kind, title, payload, input, created_by
  ) values (
    other_work_id,
    other_workspace_id,
    'websites',
    'website',
    'Other website work',
    '{"version":1,"revision":0,"title":"Other website work","status":"draft"}'::jsonb,
    '{"version":1,"source":"website_creation","requestId":"website-schema-request","requestHash":"fixture"}'::jsonb,
    other_owner_id
  );

  insert into public.workspace_exit_requests (
    id, workspace_id, requested_by, idempotency_key, command_digest,
    future_work, provider_participation, maintained_resource_action,
    state, completed_at
  ) values (
    '12000000-0000-4000-8000-000000000030',
    other_workspace_id,
    other_owner_id,
    'website-schema-exit',
    repeat('e', 64),
    'pause',
    'keep',
    'stop',
    '{"status":"completed","maintainedResources":{"kind":"stopped"}}'::jsonb,
    clock_timestamp()
  );

  begin
    insert into public.saved_product_work (
      id, workspace_id, product_id, resource_kind, title, payload, input, created_by
    ) values (
      '12000000-0000-4000-8000-000000000023',
      other_workspace_id,
      'websites',
      'website',
      'Stopped website work',
      '{"version":1,"revision":0,"title":"Stopped website work","status":"draft"}'::jsonb,
      '{"version":1,"source":"website_creation","requestId":"website-after-exit","requestHash":"fixture"}'::jsonb,
      other_owner_id
    );
    raise exception 'website creation after workspace exit was accepted';
  exception
    when others then
      perform pg_temp.assert_true(sqlerrm = 'workspace_exit_future_work_blocked', 'website creation after exit must be stopped');
  end;

  perform pg_temp.assert_true(
    (select count(*) from public.saved_product_work where product_id = 'websites' and resource_kind = 'website' and input->>'requestId' = 'website-schema-request') = 2,
    'request idempotency key must be unique per workspace, not globally'
  );
end;
$$;

select 'website work schema checks passed' as result;
