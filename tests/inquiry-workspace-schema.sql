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
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.inquiry_workspaces'::regclass,
      'public.inquiry_record_overlays'::regclass,
      'public.inquiry_publication_claims'::regclass
    )
  ),
  'every inquiry table must have RLS enabled'
);

select pg_temp.assert_true(
  (
    select bool_and(
      has_table_privilege('service_role', table_name, 'SELECT')
      and has_table_privilege('service_role', table_name, 'INSERT')
      and has_table_privilege('service_role', table_name, 'UPDATE')
      and not has_table_privilege('service_role', table_name, 'DELETE')
    )
    from unnest(array[
      'public.inquiry_workspaces',
      'public.inquiry_record_overlays',
      'public.inquiry_publication_claims'
    ]) as fixture(table_name)
  ),
  'service role must have the repository privileges without delete authority'
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
      'public.inquiry_workspaces',
      'public.inquiry_record_overlays',
      'public.inquiry_publication_claims'
    ]) as fixture(table_name)
  ),
  'browser roles must have no direct inquiry-table privileges'
);

insert into public.tenants (id, stable_id) values
  ('fictional-tenant', '10000000-0000-4000-8000-000000000001');

insert into public.inquiry_workspaces (tenant_id, business_id, state)
values ('fictional-tenant', 'fictional-business', '{"inquiries": []}'::jsonb);

select pg_temp.assert_true(
  (select tenant_stable_id = '10000000-0000-4000-8000-000000000001'::uuid
   from public.inquiry_workspaces where tenant_id = 'fictional-tenant'),
  'workspace trigger must mirror immutable tenant identity'
);

do $$
declare caught text;
begin
  begin
    insert into public.inquiry_workspaces (tenant_id, business_id, state)
    values ('fictional-tenant', 'invalid-record-copy', '{"inquiries": [{"id": "private-record"}]}'::jsonb);
    raise exception 'expected durable customer record copy to fail';
  exception when check_violation then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught like '%inquiry_workspaces_state_check%', 'durable workspace must keep inquiries empty');
end;
$$;

insert into public.inquiry_record_overlays (
  tenant_id, business_id, inquiry_id, capability_id, status, updated_by
) values (
  'fictional-tenant', 'fictional-business', 'inquiry-one', 'capability-one', 'new', 'owner-one'
);

insert into public.inquiry_publication_claims (
  id, tenant_id, business_id, request_id, capability_id, change_id, action,
  version, idempotency_key, command_digest, claim_token_hash, actor_id,
  governance_event_id
) values (
  '20000000-0000-4000-8000-000000000001', 'fictional-tenant',
  'fictional-business', 'request-one', 'capability-one', 'change-one',
  'make_live', 2, 'publish-once', repeat('a', 64), repeat('b', 64),
  'owner-one', 'event-one'
);

do $$
declare caught text;
begin
  begin
    update public.inquiry_publication_claims
    set request_id = 'forged-request'
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'expected immutable command update to fail';
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'inquiry_publication_command_is_immutable', 'publication command must be immutable');
end;
$$;

update public.inquiry_publication_claims
set status = 'accepted',
    acceptance_id = 'inquiry-postgres:claim-one',
    provider_receipt = '{"target": "Postgres public inquiry configuration"}'::jsonb,
    accepted_at = now(),
    updated_at = now()
where id = '20000000-0000-4000-8000-000000000001';

do $$
declare caught text;
begin
  begin
    update public.inquiry_publication_claims
    set status = 'failed', failure_reason = 'readback unavailable'
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'expected accepted downgrade to fail';
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'inquiry_publication_accepted_write_cannot_be_downgraded', 'accepted write must never become retryable');
end;
$$;

update public.inquiry_publication_claims
set status = 'verification_failed',
    failure_reason = 'Published configuration requires read-back verification.',
    updated_at = now()
where id = '20000000-0000-4000-8000-000000000001';

do $$
declare caught text;
begin
  begin
    update public.inquiry_publication_claims
    set failure_reason = 'rewritten evidence'
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'expected immutable verification evidence update to fail';
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'inquiry_publication_verification_evidence_is_immutable', 'verification evidence must be immutable');
end;
$$;

set role authenticated;
select pg_temp.assert_true(
  not has_table_privilege(current_user, 'public.inquiry_workspaces', 'SELECT'),
  'authenticated role must not bypass the application tenant gate'
);
reset role;
