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
  has_function_privilege('service_role', 'public.job_economics_command(jsonb,uuid,text)', 'EXECUTE'),
  'service_role must execute the economics command RPC'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.get_job_economics(uuid,uuid,text)', 'EXECUTE'),
  'service_role must execute the economics read RPC'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.job_economics_command(jsonb,uuid,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.job_economics_command(jsonb,uuid,text)', 'EXECUTE')
    and not has_function_privilege('public', 'public.job_economics_command(jsonb,uuid,text)', 'EXECUTE'),
  'browser roles must not execute the economics command RPC'
);
select pg_temp.assert_true(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.job_economics'::regclass,
    'public.job_economics_usage'::regclass,
    'public.job_economics_reservations'::regclass
  )),
  'economics tables must have RLS enabled'
);
select pg_temp.assert_true(
  (select count(*) from pg_policies where schemaname = 'public' and tablename like 'job_economics%') = 0,
  'economics tables must remain service-role only'
);

insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'member', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.tenants (id) values ('economics-tenant');

do $$
<<economics_test>>
declare
  job_id uuid;
  duplicate_id uuid;
  settled_id uuid;
  inquiry_job_id uuid;
  caught text;
  before_used integer;
begin
  -- Create is native-work bound, payer explicit, and safe to replay after a
  -- lost response. The second command returns the existing active row.
  select id into job_id from public.job_economics_command(
    jsonb_build_object(
      'action', 'create', 'productId', 'tracker', 'resourceKind', 'tracker',
      'workspaceId', '11111111-1111-4111-8111-111111111111',
      'workId', '88888888-8888-4888-8888-888888888888',
      'payerId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'estimateCents', 500000, 'maxAuthorizedCents', 800000
    ), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
  );
  select id into duplicate_id from public.job_economics_command(
    jsonb_build_object(
      'action', 'create', 'productId', 'tracker', 'resourceKind', 'tracker',
      'workspaceId', '11111111-1111-4111-8111-111111111111',
      'workId', '88888888-8888-4888-8888-888888888888',
      'payerId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'estimateCents', 500000, 'maxAuthorizedCents', 800000
    ), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
  );
  perform pg_temp.assert_true(job_id = duplicate_id, 'replayed create must return the active ledger');

  begin
    perform * from public.job_economics_command(
      jsonb_build_object(
        'action', 'accept', 'jobId', job_id
      ), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
    );
    raise exception 'generic member accepted another payer''s budget';
  exception when others then
    caught := sqlerrm;
    perform pg_temp.assert_true(caught = 'job_economics_payer_required', 'only payer may accept');
  end;

  perform * from public.job_economics_command(
    jsonb_build_object('action', 'accept', 'jobId', job_id),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
  );

  -- The reservation row and the locked job make a retried reservation
  -- idempotent while a different key cannot pass the authorized maximum.
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'reserve', 'jobId', job_id, 'idempotencyKey', 'reserve-1', 'amountCents', 600000),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
  );
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'reserve', 'jobId', job_id, 'idempotencyKey', 'reserve-1', 'amountCents', 600000),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
  );
  begin
    perform * from public.job_economics_command(
      jsonb_build_object('action', 'reserve', 'jobId', job_id, 'idempotencyKey', 'reserve-1', 'amountCents', 1),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
    );
    raise exception 'changed reservation replay accepted';
  exception when others then
    caught := sqlerrm;
    perform pg_temp.assert_true(caught = 'job_economics_idempotency_conflict', 'reservation digest must be bound to its key');
  end;
  begin
    perform * from public.job_economics_command(
      jsonb_build_object('action', 'reserve', 'jobId', job_id, 'idempotencyKey', 'reserve-2', 'amountCents', 300000),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
    );
    raise exception 'reservation over maximum accepted';
  exception when others then
    caught := sqlerrm;
    perform pg_temp.assert_true(caught = 'job_economics_reservation_exceeded', 'reservation must be capped atomically');
  end;

  select used_cents into before_used from public.job_economics where id = job_id;
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'report_usage', 'jobId', job_id,
      'idempotencyKey', 'retry-1', 'kind', 'model', 'attribution', 'strelva_retry', 'amountCents', 100000),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
  );
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'report_usage', 'jobId', job_id,
      'idempotencyKey', 'retry-1', 'kind', 'model', 'attribution', 'strelva_retry', 'amountCents', 100000),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
  );
  perform pg_temp.assert_true(
    (select used_cents from public.job_economics where id = job_id) = before_used
      and (select strelva_retry_cents from public.job_economics where id = job_id) = 100000,
    'retry usage must be visible without consuming customer usage twice'
  );
  begin
    perform * from public.job_economics_command(
      jsonb_build_object('action', 'report_usage', 'jobId', job_id,
        'idempotencyKey', 'retry-1', 'kind', 'model', 'attribution', 'strelva_retry', 'amountCents', 100001),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
    );
    raise exception 'changed usage replay accepted';
  exception when others then
    caught := sqlerrm;
    perform pg_temp.assert_true(caught = 'job_economics_idempotency_conflict', 'usage digest must be bound to its key');
  end;
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'report_usage', 'jobId', job_id,
      'idempotencyKey', 'unknown-1', 'kind', 'provider', 'attribution', 'normal', 'amountCents', null),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
  );
  perform pg_temp.assert_true(
    (select used_cents from public.job_economics where id = job_id) = before_used
      and (select usage.amount_cents from public.job_economics_usage usage where usage.job_id = economics_test.job_id and usage.idempotency_key = 'unknown-1') is null,
    'unknown usage must remain null and cannot become zero'
  );
  begin
    perform * from public.job_economics_command(
      jsonb_build_object('action', 'settle', 'jobId', job_id, 'actualCents', 100000),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
    );
    raise exception 'unknown usage settled as measured';
  exception when others then
    caught := sqlerrm;
    perform pg_temp.assert_true(caught = 'job_economics_unknown_settlement', 'unknown usage must block settlement');
  end;

  -- A known-only ledger may settle, but only when actual equals its recorded
  -- amount. This proves the measured marker is not inferred from an estimate.
  select id into settled_id from public.job_economics_command(
    jsonb_build_object(
      'action', 'create', 'productId', 'tracker', 'resourceKind', 'tracker',
      'workspaceId', '11111111-1111-4111-8111-111111111111',
      'workId', '88888888-8888-4888-8888-888888888888',
      'payerId', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'estimateCents', null, 'maxAuthorizedCents', 1000
    ), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
  );
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'accept', 'jobId', settled_id),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
  );
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'reserve', 'jobId', settled_id, 'idempotencyKey', 'settle-reserve', 'amountCents', 1000),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
  );
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'report_usage', 'jobId', settled_id,
      'idempotencyKey', 'known-1', 'kind', 'human', 'attribution', 'normal', 'amountCents', 250),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
  );
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'settle', 'jobId', settled_id, 'actualCents', 250),
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'recipient@example.com'
  );
  perform pg_temp.assert_true(
    (select status = 'settled' and actual_known and actual_cents = 250 from public.job_economics where id = settled_id),
    'known usage must settle to the exact measured amount'
  );
  -- A retry arriving after settlement still returns the original reservation
  -- and usage rows instead of attempting a second mutation.
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'reserve', 'jobId', settled_id, 'idempotencyKey', 'settle-reserve', 'amountCents', 1000),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
  );
  perform * from public.job_economics_command(
    jsonb_build_object('action', 'report_usage', 'jobId', settled_id,
      'idempotencyKey', 'known-1', 'kind', 'human', 'attribution', 'normal', 'amountCents', 250),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
  );
  perform pg_temp.assert_true(
    (select count(*) from public.job_economics_reservations reservation
      where reservation.job_id = economics_test.settled_id and reservation.idempotency_key = 'settle-reserve') = 1
      and (select count(*) from public.job_economics_usage usage
        where usage.job_id = economics_test.settled_id and usage.idempotency_key = 'known-1') = 1,
    'post-settlement retries must not duplicate idempotent rows'
  );

  -- Inquiry ledgers follow the tenant identity lifecycle. The mutable slug
  -- update is the same operation used by the rename RPC; tenant deletion is
  -- the child-first deprovision boundary.
  select id into inquiry_job_id from public.job_economics_command(
    jsonb_build_object(
      'action', 'create', 'productId', 'inquiry', 'resourceKind', 'inquiry_capability',
      'tenantId', 'economics-tenant', 'businessId', 'business-one',
      'requestId', 'request-one', 'capabilityId', 'capability-one',
      'payerId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'estimateCents', null, 'maxAuthorizedCents', 1000
    ), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'agency@example.com'
  );
  update public.tenants set id = 'economics-tenant-renamed' where id = 'economics-tenant';
  perform pg_temp.assert_true(
    (select tenant_id = 'economics-tenant-renamed' from public.job_economics where id = inquiry_job_id),
    'tenant rename must cascade to inquiry budgets'
  );
  delete from public.tenants where id = 'economics-tenant-renamed';
  perform pg_temp.assert_true(
    not exists (select 1 from public.job_economics where id = inquiry_job_id),
    'tenant deprovision must remove inquiry budgets'
  );
end;
$$;

select 'work economics schema checks passed' as result;
