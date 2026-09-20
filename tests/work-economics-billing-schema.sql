\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text) returns void
language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.sync_subscription_allowance_entitlement(jsonb)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.record_work_provider_receipt(jsonb)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.record_work_provider_receipt_decimal(jsonb)', 'EXECUTE'),
  'service role executes the billing projection and provider receipt functions'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.sync_subscription_allowance_entitlement(jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.record_work_provider_receipt(jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.record_work_provider_receipt_decimal(jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.record_work_provider_receipt_decimal(jsonb)', 'EXECUTE')
    and (select relrowsecurity from pg_class where oid='public.work_allowance_subscription_entitlements'::regclass)
    and (select relrowsecurity from pg_class where oid='public.work_provider_receipts'::regclass),
  'billing projections remain server-only and deny browser table access'
);

insert into public.users(id, email, verified_at) values
  ('e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', now()),
  ('e8000000-0000-4000-8000-000000000012', 'billing-member@example.com', now()),
  ('e8000000-0000-4000-8000-000000000013', 'billing-outsider@example.com', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('e8000000-0000-4000-8000-000000000001', 'customer', 'Billing Fixture Business',
   'e8000000-0000-4000-8000-000000000011');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000011', 'owner',
   'e8000000-0000-4000-8000-000000000011'),
  ('e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000012', 'member',
   'e8000000-0000-4000-8000-000000000011');
insert into public.workspaces(id, kind, name, created_by) values
  ('e8000000-0000-4000-8000-000000000004', 'customer', 'No allowance fixture business',
   'e8000000-0000-4000-8000-000000000011');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('e8000000-0000-4000-8000-000000000004', 'e8000000-0000-4000-8000-000000000011', 'owner',
   'e8000000-0000-4000-8000-000000000011');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values ('e8000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-000000000001',
  'tracker', 'tracker', 'Billing receipt target', '{}'::jsonb,
  'e8000000-0000-4000-8000-000000000011');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values ('e8000000-0000-4000-8000-000000000005', 'e8000000-0000-4000-8000-000000000004',
  'tracker', 'tracker', 'No allowance receipt target', '{}'::jsonb,
  'e8000000-0000-4000-8000-000000000011');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
values ('e8000000-0000-4000-8000-000000000006', 'e8000000-0000-4000-8000-000000000004',
  'tracker', 'tracker', 'Retry receipt target', '{}'::jsonb,
  'e8000000-0000-4000-8000-000000000011');

do $$
<<billing_test>>
declare
  first jsonb;
  replay jsonb;
  stale jsonb;
  closed jsonb;
  unavailable jsonb;
  trialing jsonb;
  past_due jsonb;
  recovered jsonb;
  allowance_id uuid;
  job_id uuid;
  decimal_job_id uuid;
  decimal_allowance_id uuid;
  no_allowance_job_id uuid;
  retry_job_id uuid;
  execution jsonb;
  decimal_execution jsonb;
  decimal_receipt jsonb;
  failed boolean;
  grant_count bigint;
  consumption_count bigint;
begin
  first := public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_1',
    'eventCreated', 1790000000,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'configured_zero_cost_local',
    'status', 'active',
    'periodStart', '2026-09-01T00:00:00Z',
    'periodEnd', '2026-10-01T00:00:00Z',
    'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_tracker_change', 'units', 4)),
    'spendingCapCents', 0
  ));
  perform pg_temp.assert_true(first->>'disposition' = 'applied', 'configured subscription entitlement applies once');
  perform pg_temp.assert_true(first->>'status' = 'active' and (first->>'allowanceId') is not null,
    'applied entitlement returns its named allowance');
  allowance_id := (first->>'allowanceId')::uuid;
  perform pg_temp.assert_true((select source = 'subscription_configured' and spending_cap_cents = 0
    from public.work_allowances where id = allowance_id),
    'subscription allowance keeps explicit configured source and zero operational cap');

  replay := public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_1',
    'eventCreated', 1790000000,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'configured_zero_cost_local',
    'status', 'active',
    'periodStart', '2026-09-01T00:00:00Z',
    'periodEnd', '2026-10-01T00:00:00Z',
    'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_tracker_change', 'units', 4)),
    'spendingCapCents', 0
  ));
  perform pg_temp.assert_true(replay->>'disposition' = 'replayed'
    and (replay->>'allowanceId')::uuid = allowance_id,
    'the same provider event replays its one allowance');

  failed := false;
  begin
    perform public.sync_subscription_allowance_entitlement(jsonb_build_object(
      'version', 1,
      'eventId', 'evt_billing_fixture_1',
      'eventCreated', 1790000000,
      'subscriptionId', 'sub_billing_fixture',
      'customerId', 'cus_billing_fixture',
      'workspaceId', 'e8000000-0000-4000-8000-000000000001',
      'payerId', 'e8000000-0000-4000-8000-000000000011',
      'configKey', 'changed_terms',
      'status', 'active',
      'periodStart', '2026-09-01T00:00:00Z',
      'periodEnd', '2026-10-01T00:00:00Z',
      'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_tracker_change', 'units', 4)),
      'spendingCapCents', 0
    ));
  exception when others then failed := sqlerrm = 'subscription_allowance_idempotency_conflict'; end;
  perform pg_temp.assert_true(failed, 'same provider event cannot change selected terms');

  stale := public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_old',
    'eventCreated', 1789999999,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'configured_zero_cost_local',
    'status', 'active',
    'periodStart', '2026-09-01T00:00:00Z',
    'periodEnd', '2026-10-01T00:00:00Z',
      'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_tracker_change', 'units', 4)),
    'spendingCapCents', 0
  ));
  perform pg_temp.assert_true(stale->>'disposition' = 'ignored_out_of_order',
    'an older subscription event cannot replace the current entitlement');

  closed := public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_cancelled',
    'eventCreated', 1790000010,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'configured_zero_cost_local',
    'status', 'cancelled',
    'periodStart', '2026-09-01T00:00:00Z',
    'periodEnd', '2026-10-01T00:00:00Z'
  ));
  perform pg_temp.assert_true(closed->>'status' = 'cancelled'
    and (select status = 'closed' from public.work_allowances where id = allowance_id),
    'a later cancellation closes the configured allowance while preserving its record');

  unavailable := public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_unavailable',
    'eventCreated', 1790000015,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'unavailable',
    'status', 'unavailable',
    'periodStart', '2026-10-01T00:00:00Z',
    'periodEnd', '2026-11-01T00:00:00Z'
  ));
  perform pg_temp.assert_true(unavailable->>'status' = 'unavailable'
    and (select count(*) = 1 from public.work_allowances
      where workspace_id = 'e8000000-0000-4000-8000-000000000001'),
    'known subscription facts remain unavailable without creating a new allowance');

  -- A trialing -> active transition in one period keeps one terms digest and
  -- one grant ledger. The Stripe status is entitlement state, not allowance
  -- terms, so the transition must not conflict or duplicate the grant.
  trialing := public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_trialing',
    'eventCreated', 1790000019,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'configured_zero_cost_local',
    'status', 'trialing',
    'periodStart', '2026-09-20T00:00:00Z',
    'periodEnd', '2026-10-20T00:00:00Z',
    'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_tracker_change', 'units', 4)),
    'spendingCapCents', 0
  ));
  allowance_id := (trialing->>'allowanceId')::uuid;
  select count(*) into grant_count
    from public.work_allowance_ledger l
    where l.allowance_id = billing_test.allowance_id and l.event_kind = 'grant';
  perform pg_temp.assert_true(trialing->>'status' = 'trialing' and grant_count = 1,
    'trialing subscription creates one configured allowance grant');

  select public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_2',
    'eventCreated', 1790000020,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'configured_zero_cost_local',
    'status', 'active',
    'periodStart', '2026-09-20T00:00:00Z',
    'periodEnd', '2026-10-20T00:00:00Z',
    'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_tracker_change', 'units', 4)),
    'spendingCapCents', 0
  )) into first;
  perform pg_temp.assert_true(first->>'status' = 'active'
    and (first->>'allowanceId')::uuid = allowance_id
    and (select count(*) = billing_test.grant_count
      from public.work_allowance_ledger l
      where l.allowance_id = billing_test.allowance_id and l.event_kind = 'grant'),
    'active recovery in the same period reuses the trial allowance and grant');

  -- The active period supplies a zero-cost allowance for the execution receipt
  -- proof below. No invoice amount or provider rate is inferred.
  perform public.work_allowance_accept_cap(
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', allowance_id
  );

  select id into job_id from public.job_economics_command(jsonb_build_object(
    'action', 'create', 'productId', 'tracker', 'resourceKind', 'tracker',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'workId', 'e8000000-0000-4000-8000-000000000002',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'estimateCents', 0, 'maxAuthorizedCents', 0
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action', 'accept', 'jobId', job_id),
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'claim', 'jobId', job_id, 'executionKey', 'provider-receipt-1',
    'maximumCents', 0, 'kind', 'provider', 'attribution', 'normal'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.work_allowance_execution_command(
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', jsonb_build_object(
      'action', 'reserve', 'jobId', job_id, 'executionKey', 'provider-receipt-1',
      'unitKind', 'completed_tracker_change', 'units', 1
    ));
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'start', 'jobId', job_id, 'executionKey', 'provider-receipt-1'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'finish', 'jobId', job_id, 'executionKey', 'provider-receipt-1',
    'effect', 'unknown', 'amountCents', null
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform pg_temp.assert_true((select effect = 'unknown' and billable_cents is null
    from public.job_economics_executions
    where public.job_economics_executions.job_id = billing_test.job_id
      and public.job_economics_executions.execution_key = 'provider-receipt-1'),
    'missing provider evidence leaves the execution held as unknown');

  execution := public.record_work_provider_receipt(jsonb_build_object(
    'provider', 'fixture-gateway', 'requestId', 'req_billing_fixture_1',
    'jobId', job_id, 'executionKey', 'provider-receipt-1', 'kind', 'provider',
    'attribution', 'normal', 'maximumCents', 0, 'billableCents', 0,
    'evidenceReference', 'fixture-gateway:req_billing_fixture_1'
  ));
  perform pg_temp.assert_true((execution->>'replayed')::boolean = false
    and execution#>>'{execution,effect}' = 'accepted'
    and (select count(*) = 1 from public.work_provider_receipts receipts where receipts.job_id = billing_test.job_id),
    'one exact provider receipt settles the held execution');
  execution := public.record_work_provider_receipt(jsonb_build_object(
    'provider', 'fixture-gateway', 'requestId', 'req_billing_fixture_1',
    'jobId', job_id, 'executionKey', 'provider-receipt-1', 'kind', 'provider',
    'attribution', 'normal', 'maximumCents', 0, 'billableCents', 0,
    'evidenceReference', 'fixture-gateway:req_billing_fixture_1'
  ));
  perform pg_temp.assert_true((execution->>'replayed')::boolean = true,
    'replaying an exact provider receipt does not run the action again');

  perform public.work_allowance_execution_command(
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', jsonb_build_object(
      'action', 'settle', 'jobId', job_id, 'executionKey', 'provider-receipt-1'
    ));
  select count(*) into grant_count
    from public.work_allowance_ledger l
    where l.allowance_id = billing_test.allowance_id and l.event_kind = 'grant';
  select count(*) into consumption_count
    from public.work_allowance_ledger l
    where l.allowance_id = billing_test.allowance_id and l.event_kind = 'consumption';
  perform pg_temp.assert_true(grant_count = 1 and consumption_count = 1,
    'one accepted provider receipt consumes one unit from the subscription grant');

  failed := false;
  begin
    perform public.record_work_provider_receipt(jsonb_build_object(
      'provider', 'fixture-gateway', 'requestId', 'req_billing_fixture_1',
      'jobId', job_id, 'executionKey', 'provider-receipt-1', 'kind', 'provider',
      'attribution', 'normal', 'maximumCents', 0, 'billableCents', 0,
      'evidenceReference', 'tampered-reference'
    ));
  exception when others then failed := sqlerrm = 'provider_receipt_mismatch'; end;
  perform pg_temp.assert_true(failed, 'a provider request id cannot be rebound to different evidence');

  past_due := public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_past_due',
    'eventCreated', 1790000025,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'configured_zero_cost_local',
    'status', 'past_due',
    'periodStart', '2026-09-20T00:00:00Z',
    'periodEnd', '2026-10-20T00:00:00Z',
    'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_tracker_change', 'units', 4)),
    'spendingCapCents', 0
  ));
  perform pg_temp.assert_true(past_due->>'status' = 'past_due'
    and (select status = 'closed' from public.work_allowances where id = billing_test.allowance_id),
    'past_due closes the current allowance without deleting its usage trail');

  -- Decimal provider receipts retain their exact amount while the existing
  -- cent ledger settles the accumulated whole-cent remainder. Use a different
  -- unit kind so the closed previous allowance cannot make the test ambiguous.
  decimal_allowance_id := (public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_decimal_allowance',
    'eventCreated', 1790000025,
    'subscriptionId', 'sub_billing_fixture_decimal',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'configured_decimal',
    'status', 'active',
    'periodStart', '2026-09-20T00:00:00Z',
    'periodEnd', '2026-10-20T00:00:00Z',
    'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_document_change', 'units', 4)),
    'spendingCapCents', 2
  ))->>'allowanceId')::uuid;
  perform public.work_allowance_accept_cap(
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', decimal_allowance_id
  );
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
  values ('e8000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-000000000001',
    'tracker', 'tracker', 'Decimal receipt target', '{}'::jsonb,
    'e8000000-0000-4000-8000-000000000011');
  select id into decimal_job_id from public.job_economics_command(jsonb_build_object(
    'action', 'create', 'productId', 'tracker', 'resourceKind', 'tracker',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'workId', 'e8000000-0000-4000-8000-000000000003',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'estimateCents', 1, 'maxAuthorizedCents', 2
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action', 'accept', 'jobId', decimal_job_id),
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');

  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'claim', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-1',
    'maximumCents', 1, 'kind', 'model', 'attribution', 'normal'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.work_allowance_execution_command(
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', jsonb_build_object(
      'action', 'reserve', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-1',
      'unitKind', 'completed_document_change', 'units', 1
    ));
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'start', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-1'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'finish', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-1',
    'effect', 'unknown', 'amountCents', null
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  decimal_receipt := public.record_work_provider_receipt_decimal(jsonb_build_object(
    'provider', 'fixture-gateway', 'requestId', 'req_billing_decimal_1',
    'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-1', 'kind', 'model',
    'attribution', 'normal', 'maximumCents', 1, 'billableUsd', '0.006',
    'evidenceReference', 'fixture-gateway:req_billing_decimal_1'
  ));
  perform public.work_allowance_execution_command(
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', jsonb_build_object(
      'action', 'settle', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-1'
    ));

  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'claim', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-2',
    'maximumCents', 1, 'kind', 'model', 'attribution', 'normal'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.work_allowance_execution_command(
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', jsonb_build_object(
      'action', 'reserve', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-2',
      'unitKind', 'completed_document_change', 'units', 1
    ));
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'start', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-2'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'finish', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-2',
    'effect', 'unknown', 'amountCents', null
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  decimal_receipt := public.record_work_provider_receipt_decimal(jsonb_build_object(
    'provider', 'fixture-gateway', 'requestId', 'req_billing_decimal_2',
    'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-2', 'kind', 'model',
    'attribution', 'normal', 'maximumCents', 1, 'billableUsd', '0.006',
    'evidenceReference', 'fixture-gateway:req_billing_decimal_2'
  ));
  perform public.work_allowance_execution_command(
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', jsonb_build_object(
      'action', 'settle', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-2'
    ));
  perform pg_temp.assert_true(
    (select count(*) = 2 and bool_and(receipts.billable_usd = 0.006) and sum(receipts.settlement_cents) = 1
       from public.work_provider_receipts receipts where receipts.job_id = billing_test.decimal_job_id)
    and (select remainder_cents = 0.2 from public.work_allowance_subcent_remainders remainder
      where remainder.allowance_id = billing_test.decimal_allowance_id)
    and (select sum(reservation.cap_cost_cents) = 1 from public.work_allowance_reservations reservation
      where reservation.allowance_id = billing_test.decimal_allowance_id and reservation.status = 'consumed'),
    'fractional provider receipts retain exact evidence and settle their aggregate whole-cent remainder');

  decimal_receipt := public.record_work_provider_receipt_decimal(jsonb_build_object(
    'provider', 'fixture-gateway', 'requestId', 'req_billing_decimal_2',
    'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-2', 'kind', 'model',
    'attribution', 'normal', 'maximumCents', 1, 'billableUsd', '0.006',
    'evidenceReference', 'fixture-gateway:req_billing_decimal_2'
  ));
  perform pg_temp.assert_true((decimal_receipt->>'replayed')::boolean = true
    and (select remainder_cents = 0.2 from public.work_allowance_subcent_remainders remainder
      where remainder.allowance_id = billing_test.decimal_allowance_id)
    and (select count(*) = 2 from public.work_provider_receipts receipts
      where receipts.job_id = billing_test.decimal_job_id),
    'replaying an exact decimal receipt does not advance the remainder or add a receipt');

  -- The retained fraction participates in the next allowance admission. With
  -- 1.2 cents settled as 1 cent and .2 retained, another 1-cent maximum would
  -- exceed the 2-cent cap and must be rejected before provider work starts.
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'claim', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-3',
    'maximumCents', 1, 'kind', 'model', 'attribution', 'normal'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  failed := false;
  begin
    perform public.work_allowance_execution_command(
      'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com', jsonb_build_object(
        'action', 'reserve', 'jobId', decimal_job_id, 'executionKey', 'decimal-receipt-3',
        'unitKind', 'completed_document_change', 'units', 1
      ));
  exception when others then failed := sqlerrm = 'work_allowance_capacity_exceeded'; end;
  perform pg_temp.assert_true(failed, 'an allowance admission includes the retained fractional cap amount');

  -- A job with no matching allowance still keeps the exact provider amount and
  -- carries its fractional remainder across receipts; flooring each receipt
  -- would incorrectly report zero cost for both calls.
  select id into no_allowance_job_id from public.job_economics_command(jsonb_build_object(
    'action', 'create', 'productId', 'tracker', 'resourceKind', 'tracker',
    'workspaceId', 'e8000000-0000-4000-8000-000000000004',
    'workId', 'e8000000-0000-4000-8000-000000000005',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'estimateCents', 1, 'maxAuthorizedCents', 2
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action', 'accept', 'jobId', no_allowance_job_id),
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');

  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'claim', 'jobId', no_allowance_job_id, 'executionKey', 'direct-decimal-1',
    'maximumCents', 1, 'kind', 'model', 'attribution', 'normal'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'start', 'jobId', no_allowance_job_id, 'executionKey', 'direct-decimal-1'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'finish', 'jobId', no_allowance_job_id, 'executionKey', 'direct-decimal-1',
    'effect', 'unknown', 'amountCents', null
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.record_work_provider_receipt_decimal(jsonb_build_object(
    'provider', 'fixture-gateway', 'requestId', 'req_billing_direct_decimal_1',
    'jobId', no_allowance_job_id, 'executionKey', 'direct-decimal-1', 'kind', 'model',
    'attribution', 'normal', 'maximumCents', 1, 'billableUsd', '0.006',
    'evidenceReference', 'fixture-gateway:req_billing_direct_decimal_1'
  ));

  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'claim', 'jobId', no_allowance_job_id, 'executionKey', 'direct-decimal-2',
    'maximumCents', 1, 'kind', 'model', 'attribution', 'normal'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'start', 'jobId', no_allowance_job_id, 'executionKey', 'direct-decimal-2'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'finish', 'jobId', no_allowance_job_id, 'executionKey', 'direct-decimal-2',
    'effect', 'unknown', 'amountCents', null
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.record_work_provider_receipt_decimal(jsonb_build_object(
    'provider', 'fixture-gateway', 'requestId', 'req_billing_direct_decimal_2',
    'jobId', no_allowance_job_id, 'executionKey', 'direct-decimal-2', 'kind', 'model',
    'attribution', 'normal', 'maximumCents', 1, 'billableUsd', '0.006',
    'evidenceReference', 'fixture-gateway:req_billing_direct_decimal_2'
  ));
  perform pg_temp.assert_true(
    (select count(*) = 2 and bool_and(receipts.billable_usd = 0.006)
       and sum(receipts.settlement_cents) = 1
       from public.work_provider_receipts receipts where receipts.job_id = billing_test.no_allowance_job_id)
    and (select remainder_cents = 0.2 from public.work_provider_subcent_remainders remainder
      where remainder.job_id = billing_test.no_allowance_job_id)
    and (select used_cents = 1 from public.job_economics where id = billing_test.no_allowance_job_id),
    'no-allowance receipts retain exact evidence and aggregate their fractional settlement');

  -- Strelva-paid retries use a separate exact accumulator. Their aggregate
  -- cost must be retained without touching customer usage, reservation, or
  -- the direct-job remainder used by customer-funded work.
  select id into retry_job_id from public.job_economics_command(jsonb_build_object(
    'action', 'create', 'productId', 'tracker', 'resourceKind', 'tracker',
    'workspaceId', 'e8000000-0000-4000-8000-000000000004',
    'workId', 'e8000000-0000-4000-8000-000000000006',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'estimateCents', 1, 'maxAuthorizedCents', 2
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform * from public.job_economics_command(jsonb_build_object('action', 'accept', 'jobId', retry_job_id),
    'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');

  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'claim', 'jobId', retry_job_id, 'executionKey', 'retry-decimal-1',
    'maximumCents', 1, 'kind', 'model', 'attribution', 'strelva_retry'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'start', 'jobId', retry_job_id, 'executionKey', 'retry-decimal-1'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'finish', 'jobId', retry_job_id, 'executionKey', 'retry-decimal-1',
    'effect', 'unknown', 'amountCents', null
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.record_work_provider_receipt_decimal(jsonb_build_object(
    'provider', 'fixture-gateway', 'requestId', 'req_billing_retry_decimal_1',
    'jobId', retry_job_id, 'executionKey', 'retry-decimal-1', 'kind', 'model',
    'attribution', 'strelva_retry', 'maximumCents', 1, 'billableUsd', '0.006',
    'evidenceReference', 'fixture-gateway:req_billing_retry_decimal_1'
  ));

  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'claim', 'jobId', retry_job_id, 'executionKey', 'retry-decimal-2',
    'maximumCents', 1, 'kind', 'model', 'attribution', 'strelva_retry'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'start', 'jobId', retry_job_id, 'executionKey', 'retry-decimal-2'
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.job_economics_execution_command(jsonb_build_object(
    'action', 'finish', 'jobId', retry_job_id, 'executionKey', 'retry-decimal-2',
    'effect', 'unknown', 'amountCents', null
  ), 'e8000000-0000-4000-8000-000000000011', 'billing-owner@example.com');
  perform public.record_work_provider_receipt_decimal(jsonb_build_object(
    'provider', 'fixture-gateway', 'requestId', 'req_billing_retry_decimal_2',
    'jobId', retry_job_id, 'executionKey', 'retry-decimal-2', 'kind', 'model',
    'attribution', 'strelva_retry', 'maximumCents', 1, 'billableUsd', '0.006',
    'evidenceReference', 'fixture-gateway:req_billing_retry_decimal_2'
  ));
  perform pg_temp.assert_true(
    (select count(*) = 2 and bool_and(receipts.billable_usd = 0.006)
       and sum(receipts.settlement_cents) = 1
       from public.work_provider_receipts receipts where receipts.job_id = billing_test.retry_job_id)
    and (select remainder_cents = 0.2 from public.work_retry_subcent_remainders remainder
      where remainder.job_id = billing_test.retry_job_id)
    and not exists (select 1 from public.work_provider_subcent_remainders remainder
      where remainder.job_id = billing_test.retry_job_id)
    and (select used_cents = 0 and reserved_cents = 0 and strelva_retry_cents = 1
      from public.job_economics where id = billing_test.retry_job_id),
    'retry receipts aggregate exact cost separately without entering customer spend');

  recovered := public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_recovered',
    'eventCreated', 1790000026,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000011',
    'configKey', 'configured_zero_cost_local',
    'status', 'active',
    'periodStart', '2026-09-20T00:00:00Z',
    'periodEnd', '2026-10-20T00:00:00Z',
    'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_tracker_change', 'units', 4)),
    'spendingCapCents', 0
  ));
  perform pg_temp.assert_true(recovered->>'status' = 'active'
    and (recovered->>'allowanceId')::uuid = billing_test.allowance_id
    and (select status = 'active' and cap_accepted_by = 'e8000000-0000-4000-8000-000000000011'::uuid
      from public.work_allowances where id = billing_test.allowance_id)
    and (select count(*) = billing_test.grant_count
      from public.work_allowance_ledger l
      where l.allowance_id = billing_test.allowance_id and l.event_kind = 'grant')
    and (select count(*) = billing_test.consumption_count
      from public.work_allowance_ledger l
      where l.allowance_id = billing_test.allowance_id and l.event_kind = 'consumption'),
    'active recovery reopens the same allowance without duplicate grants or lost acceptance and usage');

  -- A later subscription period may name a successor payer. The entitlement
  -- projection gets a new allowance, while an already-admitted job keeps its
  -- original payer and receipt authority.
  perform public.sync_subscription_allowance_entitlement(jsonb_build_object(
    'version', 1,
    'eventId', 'evt_billing_fixture_successor_payer',
    'eventCreated', 1790000030,
    'subscriptionId', 'sub_billing_fixture',
    'customerId', 'cus_billing_fixture',
    'workspaceId', 'e8000000-0000-4000-8000-000000000001',
    'payerId', 'e8000000-0000-4000-8000-000000000012',
    'configKey', 'configured_zero_cost_local',
    'status', 'active',
    'periodStart', '2026-10-20T00:00:00Z',
    'periodEnd', '2026-11-20T00:00:00Z',
    'grants', jsonb_build_array(jsonb_build_object('unitKind', 'completed_tracker_change', 'units', 4)),
    'spendingCapCents', 0
  ));
  perform pg_temp.assert_true(
    (select payer_id = 'e8000000-0000-4000-8000-000000000011'::uuid
       from public.job_economics where id = job_id),
    'a newer subscription payer does not rewrite an existing job payer'
  );

  failed := false;
  begin
    perform public.read_work_allowances(
      'e8000000-0000-4000-8000-000000000013', 'billing-outsider@example.com', null,
      'e8000000-0000-4000-8000-000000000001'
    );
  exception when others then failed := sqlerrm = 'work_allowance_access_denied'; end;
  perform pg_temp.assert_true(failed, 'subscription facts are not readable outside the workspace');
end;
$$;
