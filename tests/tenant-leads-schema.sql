\set ON_ERROR_STOP on
-- Client lead store (20261005090000_tenant_leads.sql). Fictional tenants only.
-- Runs in the focused workspace cluster (after the business record migration)
-- and in the full upgrade cluster (applied before the October 1 migrations,
-- the order production may use).
begin;
create or replace function pg_temp.tl_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'tenant lead assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.tl_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.tl_lead(lead_id text, hash text, captured text, extra jsonb default '{}'::jsonb) returns jsonb
language sql as $$
  select jsonb_build_object('leadId', lead_id, 'submissionHash', hash, 'name', 'Ada Rivera',
    'email', 'ada@example.test', 'message', 'Do you ship to Ohio?', 'source', 'contact-form', 'capturedAt', captured) || extra
$$;

insert into public.tenants(id, stable_id, site_name, active) values
  ('lead-site', 'c0ffee00-0000-4000-8000-0000000000b1', 'Lead Fixture Site', true),
  ('other-lead-site', 'c0ffee00-0000-4000-8000-0000000000b2', 'Other Lead Site', true);

-- Locked down: RLS on, no table privilege for any API role, functions only for service_role.
select pg_temp.tl_assert((select relrowsecurity from pg_class where oid = 'public.tenant_leads'::regclass), 'rls enabled');
select pg_temp.tl_assert(not has_table_privilege('anon', 'public.tenant_leads', 'select')
  and not has_table_privilege('authenticated', 'public.tenant_leads', 'select')
  and not has_table_privilege('service_role', 'public.tenant_leads', 'select')
  and not has_table_privilege('service_role', 'public.tenant_leads', 'insert'), 'no direct table access');
select pg_temp.tl_assert(not has_function_privilege('anon', 'public.record_tenant_lead(text,jsonb,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_tenant_lead(text,jsonb,text)', 'execute')
  and not has_function_privilege('anon', 'public.read_tenant_leads(text,integer,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_tenant_leads(text,integer,timestamptz)', 'execute')
  and not has_function_privilege('service_role', 'public.tenant_lead_workspace(uuid)', 'execute'), 'public keys cannot call lead functions');
select pg_temp.tl_assert(has_function_privilege('service_role', 'public.record_tenant_lead(text,jsonb,text)', 'execute')
  and has_function_privilege('service_role', 'public.read_tenant_leads(text,integer,timestamptz)', 'execute'), 'service role can record and read');

-- Record, replay, double-submit window.
select pg_temp.tl_assert((public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_a1', 'abc123', '2026-10-05T12:00:00Z'), 'dual_write')->>'status') = 'recorded', 'first capture recorded');
select pg_temp.tl_assert((public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_a1', 'abc123', '2026-10-05T12:00:00Z'), 'backfill')->>'status') = 'exists', 'same lead id is a no-op');
select pg_temp.tl_assert((public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_a2', 'abc123', '2026-10-05T12:03:00Z'), 'dual_write')->>'status') = 'duplicate', 'same submission inside five minutes is a duplicate');
select pg_temp.tl_assert((public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_a3', 'abc123', '2026-10-05T12:30:00Z'), 'dual_write')->>'status') = 'recorded', 'same words half an hour later is a new lead');
select pg_temp.tl_assert((public.record_tenant_lead('other-lead-site', pg_temp.tl_lead('lead_a1', 'abc123', '2026-10-05T12:00:00Z'), 'dual_write')->>'status') = 'recorded', 'hash and id are per tenant');
select pg_temp.tl_assert((select count(*) from public.tenant_leads) = 3, 'three rows stored');
select pg_temp.tl_assert((select recorded_via = 'dual_write' and workspace_id is null and tenant_slug_at_capture = 'lead-site'
  from public.tenant_leads where lead_id = 'lead_a1' and tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000b1'), 'replay did not overwrite the first record');

-- Structured inquiry fields round-trip.
select public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_f1', 'fff111', '2026-10-05T13:00:00Z',
  '{"fields":{"timeline":"Soon"},"capabilityId":"cap_inquiry","capabilityVersion":2}'), 'dual_write');
select pg_temp.tl_assert((select fields->>'timeline' = 'Soon' and capability_version = 2 from public.tenant_leads where lead_id = 'lead_f1'), 'fields stored');

-- Failure paths: unknown tenant, oversized or malformed payloads, bad source.
select pg_temp.tl_expect($$select public.record_tenant_lead('no-such-site', pg_temp.tl_lead('lead_x1', 'x1', '2026-10-05T12:00:00Z'), 'dual_write')$$, 'tenant_lead_unknown_tenant');
select pg_temp.tl_expect($$select public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_x2', 'x2', '2026-10-05T12:00:00Z', jsonb_build_object('message', repeat('m', 5001))), 'dual_write')$$, 'tenant_lead_invalid');
select pg_temp.tl_expect($$select public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_x3', 'x3', '2026-10-05T12:00:00Z', jsonb_build_object('name', repeat('n', 201))), 'dual_write')$$, 'tenant_lead_invalid');
select pg_temp.tl_expect($$select public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_x4', 'x4', '2026-10-05T12:00:00Z', jsonb_build_object('fields', jsonb_build_object('a', repeat('f', 1000001)))), 'dual_write')$$, 'tenant_lead_invalid');
select pg_temp.tl_expect($$select public.record_tenant_lead('lead-site', pg_temp.tl_lead('not-a-lead', 'x5', '2026-10-05T12:00:00Z'), 'dual_write')$$, 'tenant_lead_invalid');
select pg_temp.tl_expect($$select public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_x6', 'X-6', '2026-10-05T12:00:00Z'), 'dual_write')$$, 'tenant_lead_invalid');
select pg_temp.tl_expect($$select public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_x7', 'x7', 'yesterday-ish'), 'dual_write')$$, 'tenant_lead_invalid');
select pg_temp.tl_expect($$select public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_x8', 'x8', '2026-10-05T12:00:00Z', '{"capabilityVersion":0}'), 'dual_write')$$, 'tenant_lead_invalid');
select pg_temp.tl_expect($$select public.record_tenant_lead('lead-site', pg_temp.tl_lead('lead_x9', 'x9', '2026-10-05T12:00:00Z'), 'import')$$, 'tenant_lead_invalid');
select pg_temp.tl_assert((select count(*) from public.tenant_leads where lead_id like 'lead_x%') = 0, 'rejected payloads stored nothing');

-- Operator read: newest first, per tenant, bounded, paged.
select pg_temp.tl_assert(jsonb_array_length(public.read_tenant_leads(null, 50, null)) = 4, 'all tenants');
select pg_temp.tl_assert(jsonb_array_length(public.read_tenant_leads('lead-site', 50, null)) = 3, 'one tenant');
select pg_temp.tl_assert((public.read_tenant_leads('lead-site', 1, null)->0->>'leadId') = 'lead_f1', 'newest first');
select pg_temp.tl_assert((public.read_tenant_leads('lead-site', 50, '2026-10-05T12:30:00Z')->0->>'leadId') = 'lead_a1', 'paged before a timestamp');
select pg_temp.tl_assert(public.read_tenant_leads('no-such-site', 50, null) = '[]'::jsonb, 'unknown tenant reads empty');

-- A slug rename keeps the leads and reads under the new slug.
update public.tenants set id = 'lead-site-renamed' where id = 'lead-site';
select pg_temp.tl_assert((public.read_tenant_leads('lead-site-renamed', 50, null)->0->>'tenantId') = 'lead-site-renamed'
  and (public.read_tenant_leads('lead-site-renamed', 50, null)->0->>'tenantSlugAtCapture') = 'lead-site', 'rename keeps leads');
select pg_temp.tl_assert((public.record_tenant_lead('lead-site-renamed', pg_temp.tl_lead('lead_a1', 'abc123', '2026-10-05T12:00:00Z'), 'repair')->>'status') = 'exists', 'replay after rename is still a no-op');

-- Conversion: a new link attaches earlier leads; later leads arrive attached.
do $$
declare v_ws uuid := 'cf000000-0000-4000-8000-0000000000e1';
begin
  if to_regclass('public.tenant_workspace_links') is null then
    raise notice 'tenant_workspace_links absent; conversion attach is checked in the focused cluster';
    return;
  end if;
  insert into public.users(id, email, verified_at) values ('cf000000-0000-4000-8000-0000000000e0', 'lead-operator@strelva.example.test', now());
  insert into public.workspaces(id, kind, name, created_by) values (v_ws, 'customer', 'Lead Fixture Business', 'cf000000-0000-4000-8000-0000000000e0');
  execute $sql$insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt)
    values ('c0ffee00-0000-4000-8000-0000000000b1', 'lead-site-renamed', 'cf000000-0000-4000-8000-0000000000e1', 'cf000000-0000-4000-8000-0000000000e0',
      'cf000000-0000-4000-8000-0000000000e2', repeat('a', 64), '{}'::jsonb)$sql$;
  perform pg_temp.tl_assert((select count(*) from public.tenant_leads where workspace_id = v_ws) = 3, 'link attached earlier leads');
  perform pg_temp.tl_assert((select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000b2' and workspace_id is not null) = 0, 'other tenant untouched');
  perform pg_temp.tl_assert((public.record_tenant_lead('lead-site-renamed', pg_temp.tl_lead('lead_w1', 'w1', '2026-10-06T09:00:00Z'), 'dual_write')->>'workspaceId') = v_ws::text, 'new lead lands in the workspace');
end $$;

-- Unlinking a converted tenant clears workspace_id on its leads for that
-- business only, keeps every lead row, and a reconversion attaches them again.
do $$
declare v_receipt jsonb; v_ws uuid;
begin
  if to_regprocedure('public.unlink_tenant_from_business(text,text,uuid,uuid,text)') is null then
    raise notice 'unlink absent; lead detach is checked once the business record migration exists';
    return;
  end if;
  insert into public.users(id, email, verified_at) values ('cf000000-0000-4000-8000-0000000000e5', 'lead-unlink-operator@strelva.example.test', now());
  insert into public.super_admins(user_id, email) values ('cf000000-0000-4000-8000-0000000000e5', 'lead-unlink-operator@strelva.example.test');
  v_receipt := public.convert_tenant_to_business('lead-unlink-operator@strelva.example.test', 'other-lead-site',
    '{"tenantId":"other-lead-site","tenantStableId":"c0ffee00-0000-4000-8000-0000000000b2","workspaceName":"Other Lead Business","billing":null,"account":null,"patch":{},"contacts":[]}',
    'cf000000-0000-4000-8000-0000000000e6', repeat('b', 64));
  v_ws := (v_receipt->>'workspaceId')::uuid;
  perform pg_temp.tl_assert((select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000b2' and workspace_id = v_ws) = 1, 'conversion attached the lead');
  v_receipt := public.unlink_tenant_from_business('lead-unlink-operator@strelva.example.test', 'other-lead-site', v_ws,
    'cf000000-0000-4000-8000-0000000000e7', repeat('c', 64));
  perform pg_temp.tl_assert(v_receipt->>'leadsDetached' = '1' and v_receipt->>'workspaceDeleted' = 'true', 'unlink detached one lead and removed the empty business');
  perform pg_temp.tl_assert((select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000b2' and workspace_id is null) = 1, 'lead row kept, unattached');
  perform pg_temp.tl_assert((select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000b1' and workspace_id is not null) >= 3, 'other tenant leads still attached to their business');
  perform pg_temp.tl_assert((public.record_tenant_lead('other-lead-site', pg_temp.tl_lead('lead_u9', 'u9', '2026-10-07T09:00:00Z'), 'dual_write')->'workspaceId') = 'null'::jsonb, 'new lead after unlink is unattached');
  v_receipt := public.convert_tenant_to_business('lead-unlink-operator@strelva.example.test', 'other-lead-site',
    '{"tenantId":"other-lead-site","tenantStableId":"c0ffee00-0000-4000-8000-0000000000b2","workspaceName":"Other Lead Business","billing":null,"account":null,"patch":{},"contacts":[]}',
    'cf000000-0000-4000-8000-0000000000e6', repeat('b', 64));
  perform pg_temp.tl_assert(v_receipt->>'alreadyConverted' = 'false'
    and (select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000b2' and workspace_id = (v_receipt->>'workspaceId')::uuid) = 2, 'reconversion reattached both leads');
end $$;

-- Deprovisioning the tenant deletes its leads and nothing else.
delete from public.tenants where id = 'other-lead-site';
select pg_temp.tl_assert((select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000b2') = 0
  and (select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000b1') >= 3, 'deprovision removes only that tenant');
rollback;
