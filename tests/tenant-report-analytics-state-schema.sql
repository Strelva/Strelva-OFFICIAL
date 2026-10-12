\set ON_ERROR_STOP on
-- Report cadence, last-sent markers and analytics config in Postgres
-- (20261007194000_tenant_report_and_analytics_state.sql). Fictional tenants only.
begin;
create or replace function pg_temp.rs_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'report state assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.rs_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

insert into public.tenants(id, stable_id, site_name, active) values
  ('report-site', 'c0ffee00-0000-4000-8000-0000000000e1', 'Report Fixture Site', true),
  ('other-report-site', 'c0ffee00-0000-4000-8000-0000000000e2', 'Other Report Site', true);

-- Locked down: RLS on, no table privilege for any API role, functions only for service_role.
select pg_temp.rs_assert((select relrowsecurity from pg_class where oid = 'public.tenant_report_state'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.tenant_analytics_config'::regclass), 'rls enabled');
select pg_temp.rs_assert(not has_table_privilege(r, t, p), format('%s has no %s on %s', r, p, t))
  from unnest(array['anon', 'authenticated', 'service_role']) r,
       unnest(array['public.tenant_report_state', 'public.tenant_analytics_config']) t,
       unnest(array['select', 'insert', 'update', 'delete']) p;
select pg_temp.rs_assert(not has_function_privilege(r, f, 'execute') and has_function_privilege('service_role', f, 'execute'),
    format('%s cannot call %s; service role can', r, f))
  from unnest(array['anon', 'authenticated']) r,
       unnest(array['public.read_tenant_report_state(text)', 'public.set_tenant_report_cadence(text,text,text)',
         'public.mark_tenant_report_sent(text,timestamptz,text)', 'public.read_tenant_analytics_config(text)',
         'public.write_tenant_analytics_config(text,jsonb,text)']) f;

-- No row: null, so the app reads the Redis key instead.
select pg_temp.rs_assert(public.read_tenant_report_state('report-site') is null, 'no row reads null');
select pg_temp.rs_assert(public.read_tenant_report_state('missing-site') is null, 'unknown tenant reads null');
select pg_temp.rs_assert(public.read_tenant_analytics_config('report-site') is null, 'no config reads null');

-- Cadence: operator write replaces; backfill only fills an empty cadence.
select public.set_tenant_report_cadence('report-site', 'weekly', 'dual_write');
select pg_temp.rs_assert(public.read_tenant_report_state('report-site')->>'cadence' = 'weekly', 'cadence stored');
select public.set_tenant_report_cadence('report-site', 'monthly', 'backfill');
select pg_temp.rs_assert(public.read_tenant_report_state('report-site')->>'cadence' = 'weekly', 'backfill never overwrites a set cadence');
select public.set_tenant_report_cadence('report-site', 'monthly', 'dual_write');
select pg_temp.rs_assert(public.read_tenant_report_state('report-site')->>'cadence' = 'monthly', 'operator change wins');
select pg_temp.rs_expect($$select public.set_tenant_report_cadence('report-site', 'daily', 'dual_write')$$, 'tenant_report_invalid');
select pg_temp.rs_expect($$select public.set_tenant_report_cadence('report-site', 'weekly', 'repair')$$, 'tenant_report_invalid');
select pg_temp.rs_expect($$select public.set_tenant_report_cadence('missing-site', 'weekly', 'dual_write')$$, 'tenant_report_unknown_tenant');

-- Last-sent marker: epoch ms out, and it only moves forward.
select public.mark_tenant_report_sent('report-site', timestamptz '2026-09-01T15:00:00.123Z', 'dual_write');
select pg_temp.rs_assert((public.read_tenant_report_state('report-site')->>'lastSentAt')::bigint = 1788274800123, 'marker in epoch ms');
select public.mark_tenant_report_sent('report-site', timestamptz '2026-08-01T15:00:00Z', 'backfill');
select pg_temp.rs_assert((public.read_tenant_report_state('report-site')->>'lastSentAt')::bigint = 1788274800123, 'older marker never moves it back');
select public.mark_tenant_report_sent('report-site', timestamptz '2026-10-01T15:00:00Z', 'dual_write');
select pg_temp.rs_assert((public.read_tenant_report_state('report-site')->>'lastSentAt')::bigint = 1790866800000, 'newer marker moves forward');
select pg_temp.rs_assert(public.read_tenant_report_state('report-site')->>'cadence' = 'monthly', 'marker keeps cadence');
select pg_temp.rs_expect($$select public.mark_tenant_report_sent('report-site', null, 'dual_write')$$, 'tenant_report_invalid');
select pg_temp.rs_expect($$select public.mark_tenant_report_sent('report-site', now() + interval '1 month', 'dual_write')$$, 'tenant_report_invalid');
select pg_temp.rs_expect($$select public.mark_tenant_report_sent('missing-site', now(), 'dual_write')$$, 'tenant_report_unknown_tenant');
-- A marker-only row has no cadence, so the app falls back to Redis for it.
select public.mark_tenant_report_sent('other-report-site', timestamptz '2026-09-01T15:00:00Z', 'backfill');
select pg_temp.rs_assert(public.read_tenant_report_state('other-report-site')->'cadence' = 'null'::jsonb, 'marker-only row has null cadence');

-- Analytics config: full write, backfill never replaces, invalid shapes refused.
select public.write_tenant_analytics_config('report-site',
  '{"gscProperty":"sc-domain:report.example.test","ga4PropertyId":"123456","updatedAt":"2026-09-02T10:00:00.000Z"}', 'dual_write');
select pg_temp.rs_assert(public.read_tenant_analytics_config('report-site')
  = '{"gscProperty":"sc-domain:report.example.test","ga4PropertyId":"123456","updatedAt":"2026-09-02T10:00:00.000Z"}'::jsonb, 'config round trip');
select pg_temp.rs_assert(public.write_tenant_analytics_config('report-site', '{"gscProperty":null,"ga4PropertyId":"999","updatedAt":null}', 'backfill')->>'status' = 'exists', 'backfill reports exists');
select pg_temp.rs_assert(public.read_tenant_analytics_config('report-site')->>'ga4PropertyId' = '123456', 'backfill never replaces');
select public.write_tenant_analytics_config('report-site', '{"gscProperty":null,"ga4PropertyId":null,"updatedAt":"2026-09-03T10:00:00.000Z"}', 'dual_write');
select pg_temp.rs_assert(public.read_tenant_analytics_config('report-site')->'gscProperty' = 'null'::jsonb, 'clearing a property is stored');
select pg_temp.rs_assert(public.write_tenant_analytics_config('other-report-site', '{"ga4PropertyId":"42"}', 'backfill')->>'status' = 'written', 'backfill fills an empty tenant');
select pg_temp.rs_expect($$select public.write_tenant_analytics_config('report-site', '{"gscProperty":7}', 'dual_write')$$, 'tenant_analytics_invalid');
select pg_temp.rs_expect($$select public.write_tenant_analytics_config('report-site', '{"gscProperty":""}', 'dual_write')$$, 'tenant_analytics_invalid');
select pg_temp.rs_expect($$select public.write_tenant_analytics_config('report-site', '{"updatedAt":"not a date"}', 'dual_write')$$, 'tenant_analytics_invalid');
select pg_temp.rs_expect($$select public.write_tenant_analytics_config('report-site', '[]', 'dual_write')$$, 'tenant_analytics_invalid');
select pg_temp.rs_expect($$select public.write_tenant_analytics_config('missing-site', '{}', 'dual_write')$$, 'tenant_analytics_unknown_tenant');

-- Cross-tenant: one tenant's rows never answer for another.
select pg_temp.rs_assert(public.read_tenant_analytics_config('other-report-site')->>'ga4PropertyId' = '42'
  and public.read_tenant_analytics_config('report-site')->>'ga4PropertyId' is null, 'rows stay per tenant');

-- A slug rename keeps the rows and reads under the new slug.
update public.tenants set id = 'report-site-renamed' where id = 'report-site';
select pg_temp.rs_assert((public.read_tenant_report_state('report-site-renamed')->>'lastSentAt')::bigint = 1790866800000
  and public.read_tenant_report_state('report-site') is null, 'rename keeps report state');

-- Deprovisioning deletes only that tenant's rows.
delete from public.tenants where id = 'other-report-site';
select pg_temp.rs_assert((select count(*) from public.tenant_report_state where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000e2') = 0
  and (select count(*) from public.tenant_analytics_config where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000e2') = 0
  and (select count(*) from public.tenant_report_state where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000e1') = 1, 'deprovision removes only that tenant');
rollback;
