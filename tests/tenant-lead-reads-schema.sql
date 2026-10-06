\set ON_ERROR_STOP on
-- Postgres reads for the inquiry read-source switch
-- (20261008140000_tenant_lead_reads.sql). Fictional tenants only.
begin;
create or replace function pg_temp.lr_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'tenant lead read assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.lr_lead(lead_id text, hash text, captured text, extra jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('leadId', lead_id, 'submissionHash', hash, 'name', 'Dana Reed',
    'email', 'dana@example.test', 'message', 'Private party for 30?', 'source', 'contact-form', 'capturedAt', captured) || extra
$$;

insert into public.tenants(id, stable_id, site_name, active) values
  ('read-site', 'c0ffee00-0000-4000-8000-0000000000c1', 'Read Fixture Site', true),
  ('read-other', 'c0ffee00-0000-4000-8000-0000000000c2', 'Other Read Site', true);

-- Locked down: only the service role may call the reads.
select pg_temp.lr_assert(not has_function_privilege('anon', 'public.read_tenant_lead(text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_tenant_lead(text,text)', 'execute')
  and not has_function_privilege('anon', 'public.read_tenant_lead_digests(text,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_tenant_lead_digests(text,timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.read_tenant_lead(text,text)', 'execute')
  and has_function_privilege('service_role', 'public.read_tenant_lead_digests(text,timestamptz)', 'execute'), 'grants');

select public.record_tenant_lead('read-site', pg_temp.lr_lead('lead_old', 'h1', '2026-01-02T09:00:00.000Z',
  '{"fields":{"guests":"30"},"capabilityId":"cap_inq","capabilityVersion":3}'), 'backfill');
select public.record_tenant_lead('read-site', pg_temp.lr_lead('lead_new', 'h2', '2026-10-05T21:40:00.000Z'), 'dual_write');
select public.record_tenant_lead('read-other', pg_temp.lr_lead('lead_theirs', 'h3', '2026-10-05T21:41:00.000Z'), 'dual_write');

-- By-id read: the same fields and the lead id the rest of the app uses.
select pg_temp.lr_assert(
  (select r->>'leadId' = 'lead_old' and r->>'capturedAt' = '2026-01-02T09:00:00.000Z' and r->>'submissionHash' = 'h1'
     and r#>>'{fields,guests}' = '30' and (r->>'capabilityVersion')::int = 3 and r->>'tenantId' = 'read-site'
   from (select public.read_tenant_lead('read-site', 'lead_old') r) x), 'by-id read maps every field');
select pg_temp.lr_assert(public.read_tenant_lead('read-site', 'lead_missing') is null, 'unknown lead is null');
select pg_temp.lr_assert(public.read_tenant_lead('no-such-site', 'lead_old') is null, 'unknown tenant is null');
select pg_temp.lr_assert(public.read_tenant_lead('read-site', 'not-a-lead-id') is null, 'malformed id is null');

-- Per tenant: another tenant's lead is never readable through this tenant.
select pg_temp.lr_assert(public.read_tenant_lead('read-site', 'lead_theirs') is null, 'other tenant lead not readable by id');
select pg_temp.lr_assert(public.read_tenant_lead('read-other', 'lead_old') is null, 'and the other way round');

-- Digests for parity, bounded by the since time.
select pg_temp.lr_assert(public.read_tenant_lead_digests('read-site', null) = '{"lead_old":"h1","lead_new":"h2"}'::jsonb, 'all digests');
select pg_temp.lr_assert(public.read_tenant_lead_digests('read-site', '2026-07-01T00:00:00Z') = '{"lead_new":"h2"}'::jsonb, 'since bounds the window');
select pg_temp.lr_assert(public.read_tenant_lead_digests('no-such-site', null) = '{}'::jsonb, 'unknown tenant reads empty');
select pg_temp.lr_assert(not (public.read_tenant_lead_digests('read-site', null) ? 'lead_theirs'), 'digests stay per tenant');

-- A slug rename keeps the leads readable under the new slug.
update public.tenants set id = 'read-site-renamed' where id = 'read-site';
select pg_temp.lr_assert(public.read_tenant_lead('read-site-renamed', 'lead_new')->>'leadId' = 'lead_new', 'readable after rename');

-- The parity store name is accepted by the shared parity ledger, when present.
do $$
begin
  if to_regprocedure('public.record_client_record_parity(text,text,integer,integer,integer,integer)') is null then
    raise notice 'client record parity absent; lead parity ledger is checked in the full cluster';
    return;
  end if;
  perform public.record_client_record_parity('tenant_leads', 'read-site-renamed', 2, 2, 0, 0);
  perform pg_temp.lr_assert((public.client_record_parity_streak('tenant_leads')->>'days')::int = 1, 'lead parity streak counts');
  perform public.record_client_record_parity('tenant_leads', 'read-other', 1, 0, 1, 0);
  perform pg_temp.lr_assert((public.client_record_parity_streak('tenant_leads')->>'days')::int = 0, 'one tenant out of parity breaks the day');
end $$;
rollback;
