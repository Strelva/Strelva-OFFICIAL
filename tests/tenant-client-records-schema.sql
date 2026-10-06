\set ON_ERROR_STOP on
-- Client records copied out of Redis (20261007181000_tenant_client_records.sql).
-- Fictional tenants only.
begin;
create or replace function pg_temp.cr_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'client record assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.cr_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.cr_hash(p text) returns text language sql as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
create or replace function pg_temp.cr_put(p_tenant text, p_store text, p_id text, p_payload jsonb, p_at text,
  p_mode text default 'replace', p_via text default 'dual_write') returns jsonb language sql as $$
  select public.record_tenant_client_record(p_tenant, p_store, p_id, p_payload, pg_temp.cr_hash(p_payload::text), p_at::timestamptz, p_via, p_mode)
$$;

insert into public.users(id, email, verified_at) values
  ('c7000000-0000-4000-8000-000000000001', 'cr-operator@strelva.example.test', now());
insert into public.super_admins(user_id, email) values ('c7000000-0000-4000-8000-000000000001', 'cr-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active) values
  ('cr-site', 'c7000000-0000-4000-8000-0000000000b1', 'Records Site', true),
  ('cr-other', 'c7000000-0000-4000-8000-0000000000b2', 'Other Records Site', true);

-- Locked down.
select pg_temp.cr_assert((select relrowsecurity from pg_class where oid = 'public.tenant_client_records'::regclass), 'rls on');
select pg_temp.cr_assert(not has_table_privilege('anon', 'public.tenant_client_records', 'select')
  and not has_table_privilege('authenticated', 'public.tenant_client_records', 'select')
  and not has_table_privilege('service_role', 'public.tenant_client_records', 'select')
  and not has_table_privilege('service_role', 'public.tenant_client_record_parity', 'insert'), 'no direct table access');
select pg_temp.cr_assert(not has_function_privilege('anon', 'public.record_tenant_client_record(text,text,text,jsonb,text,timestamptz,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_tenant_client_records(text,text,integer,timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'public.tenant_client_record_workspace(uuid)', 'execute')
  and has_function_privilege('service_role', 'public.record_tenant_client_record(text,text,text,jsonb,text,timestamptz,text,text)', 'execute')
  and has_function_privilege('service_role', 'public.client_record_parity_streak(text)', 'execute'), 'function grants');

-- Record, replay, update, keep-first, remove.
select pg_temp.cr_assert(pg_temp.cr_put('cr-site', 'spam_held', 'spam_1', '{"id":"spam_1","reason":"honeypot"}', '2026-10-05T12:00:00Z')->>'status' = 'recorded', 'recorded');
select pg_temp.cr_assert(pg_temp.cr_put('cr-site', 'spam_held', 'spam_1', '{"id":"spam_1","reason":"honeypot"}', '2026-10-05T12:00:00Z', 'replace', 'backfill')->>'status' = 'unchanged', 'backfill replay is a no-op');
select pg_temp.cr_assert(pg_temp.cr_put('cr-site', 'booking_config', 'config', '{"value":{"timezone":"UTC"}}', '2026-10-05T12:00:00Z')->>'status' = 'recorded', 'config recorded');
select pg_temp.cr_assert(pg_temp.cr_put('cr-site', 'booking_config', 'config', '{"value":{"timezone":"America/New_York"}}', '2026-10-06T12:00:00Z')->>'status' = 'updated', 'config replaced');
select pg_temp.cr_assert((select payload#>>'{value,timezone}' from public.tenant_client_records where record_id = 'config') = 'America/New_York', 'newest value kept');
select pg_temp.cr_assert(pg_temp.cr_put('cr-site', 'inquiry_reply', 'lead_a', '{"firstReplyAt":"2026-10-05T13:00:00Z","by":"strelva"}', '2026-10-05T13:00:00Z', 'keep_first')->>'status' = 'recorded', 'first reply');
select pg_temp.cr_assert(pg_temp.cr_put('cr-site', 'inquiry_reply', 'lead_a', '{"firstReplyAt":"2026-10-05T15:00:00Z","by":"owner"}', '2026-10-05T15:00:00Z', 'keep_first')->>'status' = 'kept', 'later reply does not replace the first');
select pg_temp.cr_assert(pg_temp.cr_put('cr-site', 'inquiry_reply', 'lead_a', '{"firstReplyAt":"2026-10-05T12:30:00Z","by":"owner"}', '2026-10-05T12:30:00Z', 'keep_first', 'repair')->>'status' = 'updated', 'an earlier reply found by repair wins');
select pg_temp.cr_assert((select payload->>'by' from public.tenant_client_records where record_id = 'lead_a') = 'owner', 'earliest reply kept');
select pg_temp.cr_assert(pg_temp.cr_put('cr-site', 'account_grouping', 'acct-1', '{"id":"acct-1","tenantIds":["cr-site"]}', '2026-10-05T12:00:00Z')->>'status' = 'recorded', 'grouping');
select pg_temp.cr_assert((public.record_tenant_client_record('cr-site', 'account_grouping', 'acct-1', null, null, '2026-10-06T00:00:00Z', 'dual_write', 'remove'))->>'status' = 'removed', 'removal kept as a mark');
select pg_temp.cr_assert((select removed_at is not null from public.tenant_client_records where record_id = 'acct-1'), 'removed_at set, row kept');
select pg_temp.cr_assert(jsonb_array_length(public.read_tenant_client_records('cr-site', 'account_grouping', 10, null)) = 0, 'removed records are not read');
select pg_temp.cr_assert((public.record_tenant_client_record('cr-site', 'account_grouping', 'never', null, null, now(), 'dual_write', 'remove'))->>'status' = 'unchanged', 'removing nothing is a no-op');

-- Failure paths.
select pg_temp.cr_expect($$select pg_temp.cr_put('no-such-site', 'spam_held', 'x', '{}', '2026-10-05T12:00:00Z')$$, 'client_record_unknown_tenant');
select pg_temp.cr_expect($$select pg_temp.cr_put('cr-site', 'orders', 'x', '{}', '2026-10-05T12:00:00Z')$$, 'client_record_invalid');
select pg_temp.cr_expect($$select pg_temp.cr_put('cr-site', 'spam_held', 'x', '[1]', '2026-10-05T12:00:00Z')$$, 'client_record_invalid');
select pg_temp.cr_expect($$select pg_temp.cr_put('cr-site', 'spam_held', 'x', jsonb_build_object('m', repeat('m', 260000)), '2026-10-05T12:00:00Z')$$, 'client_record_invalid');
select pg_temp.cr_expect($$select public.record_tenant_client_record('cr-site', 'spam_held', 'x', '{}', 'not-a-hash', now(), 'dual_write', 'replace')$$, 'client_record_invalid');
select pg_temp.cr_expect($$select pg_temp.cr_put('cr-site', 'spam_held', 'x', '{}', '2026-10-05T12:00:00Z', 'replace', 'import')$$, 'client_record_invalid');
select pg_temp.cr_expect($$select pg_temp.cr_put('cr-site', 'spam_held', 'x', '{}', '2026-10-05T12:00:00Z', 'merge')$$, 'client_record_invalid');
select pg_temp.cr_assert((select count(*) from public.tenant_client_records where record_id = 'x') = 0, 'rejected writes stored nothing');

-- Per tenant: another tenant's records are separate and not read.
select pg_temp.cr_put('cr-other', 'spam_held', 'spam_1', '{"id":"spam_1","reason":"other"}', '2026-10-05T12:00:00Z');
select pg_temp.cr_assert(jsonb_array_length(public.read_tenant_client_records('cr-site', 'spam_held', 10, null)) = 1
  and public.read_tenant_client_records('cr-site', 'spam_held', 10, null)#>>'{0,payload,reason}' = 'honeypot', 'reads stay per tenant');
select pg_temp.cr_assert(public.read_tenant_client_records('no-such-site', 'spam_held', 10, null) = '[]'::jsonb, 'unknown tenant reads empty');

-- Digests for parity, and parity streaks.
select pg_temp.cr_assert(public.read_tenant_client_record_digests('cr-site', 'spam_held') = jsonb_build_object('spam_1', pg_temp.cr_hash('{"id": "spam_1", "reason": "honeypot"}')), 'digests are id -> hash');
select public.record_client_record_parity('spam_held', 'cr-site', 1, 1, 0, 0);
select pg_temp.cr_assert((public.client_record_parity_streak('spam_held')->>'days')::int = 1, 'one day of parity');
insert into public.tenant_client_record_parity(store, tenant_stable_id, checked_on, ok, redis_count, postgres_count, missing, mismatched)
  select 'spam_held', 'c7000000-0000-4000-8000-0000000000b1', (now() at time zone 'UTC')::date - d, true, 1, 1, 0, 0 from generate_series(1, 7) d;
select pg_temp.cr_assert((public.client_record_parity_streak('spam_held')->>'days')::int = 8, 'eight consecutive days');
select public.record_client_record_parity('spam_held', 'cr-other', 2, 1, 1, 0);
select pg_temp.cr_assert((public.client_record_parity_streak('spam_held')->>'days')::int = 0
  and (public.client_record_parity_streak('spam_held')->>'lastFailureOn')::date = (now() at time zone 'UTC')::date, 'a tenant out of parity today resets the streak');
select public.record_client_record_parity('spam_held', 'cr-other', 2, 2, 0, 0);
select pg_temp.cr_assert((public.client_record_parity_streak('spam_held')->>'days')::int = 8, 'the same day back in parity counts again');
update public.tenant_client_record_parity set ok = false, missing = 1 where checked_on = (now() at time zone 'UTC')::date - 3;
select pg_temp.cr_assert((public.client_record_parity_streak('spam_held')->>'days')::int = 3, 'an older failure caps the streak');
select pg_temp.cr_assert((public.client_record_parity_streak('booking_config')->>'days')::int = 0, 'never checked -> 0');
select pg_temp.cr_expect($$select public.record_client_record_parity('spam_held', 'cr-site', -1, 0, 0, 0)$$, 'client_record_invalid');

-- A slug rename moves nothing: records key on stable_id.
update public.tenants set id = 'cr-site-renamed' where id = 'cr-site';
select pg_temp.cr_assert(jsonb_array_length(public.read_tenant_client_records('cr-site-renamed', 'spam_held', 10, null)) = 1, 'rename keeps records');

-- Conversion fills workspace_id; unlink clears it; no workspace is kept alive by the copy.
create temporary table cr_link(value jsonb);
insert into cr_link select public.convert_tenant_to_business('cr-operator@strelva.example.test', 'cr-site-renamed',
  jsonb_build_object('tenantId', 'cr-site-renamed', 'tenantStableId', 'c7000000-0000-4000-8000-0000000000b1', 'workspaceName', 'Records Site',
    'billing', null, 'account', null, 'patch', '{}'::jsonb, 'contacts', '[]'::jsonb),
  gen_random_uuid(), encode(sha256('cr-convert'::bytea), 'hex'));
select pg_temp.cr_assert((select bool_and(workspace_id = ((select value->>'workspaceId' from cr_link))::uuid)
  from public.tenant_client_records where tenant_stable_id = 'c7000000-0000-4000-8000-0000000000b1'), 'conversion attaches every record');
select pg_temp.cr_assert(pg_temp.cr_put('cr-site-renamed', 'analytics_settings', 'analytics', '{"value":{"ga4PropertyId":"123"}}', '2026-10-06T00:00:00Z')->>'workspaceId'
  = (select value->>'workspaceId' from cr_link), 'new records after conversion carry the workspace');
select pg_temp.cr_assert(not (public.preview_tenant_unlink('cr-operator@strelva.example.test', 'cr-site-renamed')::text like '%tenant_client_records%'), 'the copy does not keep the workspace in use');
select public.unlink_tenant_from_business('cr-operator@strelva.example.test', 'cr-site-renamed',
  (select (value->>'workspaceId')::uuid from cr_link), gen_random_uuid(), encode(sha256('cr-unlink'::bytea), 'hex'));
select pg_temp.cr_assert((select bool_and(workspace_id is null) from public.tenant_client_records
  where tenant_stable_id = 'c7000000-0000-4000-8000-0000000000b1'), 'unlink clears the workspace');
select pg_temp.cr_assert((select count(*) from public.tenant_client_records where tenant_stable_id = 'c7000000-0000-4000-8000-0000000000b1') = 5, 'unlink keeps the records');
rollback;
