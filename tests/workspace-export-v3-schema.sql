\set ON_ERROR_STOP on
-- Export schema 3 (20261007182000_workspace_export_v3.sql). Fictional data.
begin;
create or replace function pg_temp.ex_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'export v3 assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ex_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- Legacy tenant tables the focused cluster does not otherwise create.
create table if not exists public.bookings (id text primary key, tenant_id text not null references public.tenants(id) on update cascade on delete cascade,
  tenant_stable_id uuid, client_name text not null, client_email text not null, client_phone text not null default '', date text not null,
  start_time text not null, end_time text not null, service_id text not null, service_name text not null, status text not null,
  notes text, cancelled_at timestamptz, created_at timestamptz not null default now());
create table if not exists public.reviews (id uuid primary key default gen_random_uuid(), tenant_id text not null references public.tenants(id) on update cascade on delete cascade,
  tenant_stable_id uuid, author text not null default '', text text not null, rating integer, reply text, replied_at timestamptz,
  source text not null, external_id text, review_date timestamptz, created_at timestamptz not null default now());
create table if not exists public.content (tenant_id text not null references public.tenants(id) on update cascade on delete cascade,
  tenant_stable_id uuid, section text not null, data jsonb not null, version integer not null default 1, updated_at timestamptz not null default now(),
  primary key (tenant_id, section));

insert into public.users(id, email, verified_at) values
  ('e7000000-0000-4000-8000-000000000001', 'ex-operator@strelva.example.test', now()),
  ('e7000000-0000-4000-8000-000000000002', 'ex-member@example.test', now()),
  ('e7000000-0000-4000-8000-000000000003', 'ex-owner@example.test', now()),
  ('e7000000-0000-4000-8000-000000000004', 'ex-stranger@example.test', now());
insert into public.super_admins(user_id, email) values ('e7000000-0000-4000-8000-000000000001', 'ex-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('ex-store', 'e7000000-0000-4000-8000-0000000000a1', 'Export Store', true, 'store-owner@example.test'),
  ('ex-elsewhere', 'e7000000-0000-4000-8000-0000000000a2', 'Unlinked Site', true, null);
create temporary table ex_w(id uuid);
insert into ex_w select (public.convert_tenant_to_business('ex-operator@strelva.example.test', 'ex-store',
  jsonb_build_object('tenantId', 'ex-store', 'tenantStableId', 'e7000000-0000-4000-8000-0000000000a1', 'workspaceName', 'Export Store',
    'billing', '{"billingType":"tier","subscriptionStatus":"active","subscriptionPlan":null,"monthlyCents":19900,"hasStripeSubscription":false,"grandfathered":true}'::jsonb,
    'account', null, 'patch', '{}'::jsonb, 'contacts', '[]'::jsonb),
  gen_random_uuid(), encode(sha256('ex-convert'::bytea), 'hex'))->>'workspaceId')::uuid;
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ((select id from ex_w), 'e7000000-0000-4000-8000-000000000002', 'member', 'e7000000-0000-4000-8000-000000000001');

-- Data older than any Redis window, plus another site's data that must not leak.
select public.record_tenant_lead('ex-store', jsonb_build_object('leadId', 'lead_old', 'submissionHash', 'aa11', 'name', 'Old Lead',
  'email', 'old@example.test', 'capturedAt', '2025-01-02T00:00:00Z'), 'backfill');
select public.record_tenant_lead('ex-store', jsonb_build_object('leadId', 'lead_new', 'submissionHash', 'bb22', 'name', 'New Lead',
  'capturedAt', '2026-10-01T00:00:00Z'), 'dual_write');
select public.record_tenant_lead('ex-elsewhere', jsonb_build_object('leadId', 'lead_other', 'submissionHash', 'cc33', 'name', 'Other',
  'capturedAt', '2026-10-01T00:00:00Z'), 'dual_write');
select public.record_tenant_client_record('ex-store', 'spam_held', 'spam_1', '{"id":"spam_1","reason":"honeypot"}', repeat('a', 64), '2026-09-01T00:00:00Z', 'dual_write', 'replace');
select public.record_tenant_client_record('ex-store', 'booking_config', 'config', '{"value":{"timezone":"UTC"}}', repeat('b', 64), '2026-09-01T00:00:00Z', 'dual_write', 'replace');
select public.record_tenant_client_record('ex-elsewhere', 'spam_held', 'spam_x', '{"id":"spam_x"}', repeat('c', 64), '2026-09-01T00:00:00Z', 'dual_write', 'replace');
insert into public.bookings(id, tenant_id, client_name, client_email, date, start_time, end_time, service_id, service_name, status)
  values ('bk_1', 'ex-store', 'Ada', 'ada@example.test', '2026-10-10', '10:00', '11:00', 'svc', 'Tasting', 'confirmed'),
         ('bk_x', 'ex-elsewhere', 'Bo', 'bo@example.test', '2026-10-10', '10:00', '11:00', 'svc', 'Tasting', 'confirmed');
insert into public.reviews(tenant_id, author, text, rating, reply, source) values ('ex-store', 'Cy', 'Great figs', 5, 'Thank you!', 'google');
insert into public.content(tenant_id, section, data) values ('ex-store', 'hero', '{"title":"Dried fruit"}');

-- Locked down.
select pg_temp.ex_assert(not has_table_privilege('service_role', 'public.workspace_export_builds', 'select')
  and not has_table_privilege('authenticated', 'public.workspace_export_build_parts', 'select'), 'no direct table access');
select pg_temp.ex_assert(not has_function_privilege('anon', 'public.read_workspace_export_build_part(uuid,text,integer)', 'execute')
  and has_function_privilege('service_role', 'public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer)', 'execute')
  and not has_function_privilege('service_role', 'public.workspace_export_v3_tenant_rows(text,uuid,text,integer,integer)', 'execute'), 'function grants');

-- Categories read only the linked site's data, with no time window.
create or replace function pg_temp.ex_cat(p_category text, p_offset integer default 0, p_limit integer default 500) returns jsonb language sql as $$
  select public.export_workspace_v3_category((select id from ex_w), 'e7000000-0000-4000-8000-000000000001', 'ex-operator@strelva.example.test', p_category, p_offset, p_limit)
$$;
select pg_temp.ex_assert(jsonb_array_length(pg_temp.ex_cat('leads')->'items') = 2
  and pg_temp.ex_cat('leads')#>>'{items,0,leadId}' = 'lead_old', 'every lead, oldest first, none from another site');
select pg_temp.ex_assert(pg_temp.ex_cat('leads', 0, 1)->>'next' = '1' and pg_temp.ex_cat('leads', 1, 1)#>>'{items,0,leadId}' = 'lead_new'
  and pg_temp.ex_cat('leads', 1, 1)->>'next' = '2' and jsonb_array_length(pg_temp.ex_cat('leads', 2, 1)->'items') = 0, 'paged');
select pg_temp.ex_assert(jsonb_array_length(pg_temp.ex_cat('spam_held')->'items') = 1 and pg_temp.ex_cat('spam_held')#>>'{items,0,recordId}' = 'spam_1', 'spam held for review');
select pg_temp.ex_assert(pg_temp.ex_cat('booking_config')#>>'{items,0,payload,value,timezone}' = 'UTC', 'booking hours');
select pg_temp.ex_assert(jsonb_array_length(pg_temp.ex_cat('bookings')->'items') = 1 and pg_temp.ex_cat('bookings')#>>'{items,0,id}' = 'bk_1', 'bookings');
select pg_temp.ex_assert(pg_temp.ex_cat('reviews')#>>'{items,0,reply}' = 'Thank you!', 'reviews and replies');
select pg_temp.ex_assert(pg_temp.ex_cat('content')#>>'{items,0,section}' = 'hero', 'content');
select pg_temp.ex_assert(pg_temp.ex_cat('linked_sites')#>>'{items,0,tenantId}' = 'ex-store', 'linked sites');
select pg_temp.ex_assert(pg_temp.ex_cat('billing')#>>'{items,0,state}' = 'grandfathered', 'billing state, no card data');
select pg_temp.ex_assert(pg_temp.ex_cat('business_record')#>'{items,0}' ? 'record', 'business record');
select pg_temp.ex_assert(pg_temp.ex_cat('systems')#>'{items,0}' ? 'connections', 'systems and connections');
select pg_temp.ex_assert(jsonb_array_length(pg_temp.ex_cat('inquiry_timelines')->'items') = 0, 'empty category is an empty list');
select pg_temp.ex_expect($$select pg_temp.ex_cat('orders')$$, 'workspace_export_invalid');

-- Members, strangers and unverified emails cannot export; nor can another business's owner.
select pg_temp.ex_expect(format($$select public.export_workspace_v3_category(%L, 'e7000000-0000-4000-8000-000000000002', 'ex-member@example.test', 'leads', 0, 10)$$, (select id from ex_w)), 'workspace_export_denied');
select pg_temp.ex_expect(format($$select public.export_workspace_v3_category(%L, 'e7000000-0000-4000-8000-000000000004', 'ex-stranger@example.test', 'leads', 0, 10)$$, (select id from ex_w)), 'workspace_export_denied');
select pg_temp.ex_expect(format($$select public.export_workspace_v3_category(%L, 'e7000000-0000-4000-8000-000000000001', 'wrong@example.test', 'leads', 0, 10)$$, (select id from ex_w)), 'workspace_export_denied');
select pg_temp.ex_expect(format($$select public.start_workspace_export_build(%L, 'e7000000-0000-4000-8000-000000000002', 'ex-member@example.test')$$, (select id from ex_w)), 'workspace_export_denied');

-- Operator-started build goes to the owner recipient only; one at a time.
create temporary table ex_build(value jsonb);
insert into ex_build select public.start_workspace_export_build((select id from ex_w), 'e7000000-0000-4000-8000-000000000001', 'ex-operator@strelva.example.test');
select pg_temp.ex_assert((select value->>'deliverTo' = 'store-owner@example.test' and value->>'requesterRole' = 'operator' from ex_build), 'delivered to the owner recipient');
select pg_temp.ex_expect(format($$select public.start_workspace_export_build(%L, 'e7000000-0000-4000-8000-000000000001', 'ex-operator@strelva.example.test')$$, (select id from ex_w)), 'workspace_export_in_progress');
-- No partial export is marked ready.
select pg_temp.ex_expect(format($$select public.complete_workspace_export_build(%L, '{}'::jsonb, repeat('d', 64), '{}'::jsonb)$$, (select (value->>'buildId')::uuid from ex_build)), 'workspace_export_build_incomplete');
select public.append_workspace_export_build_part((select (value->>'buildId')::uuid from ex_build), 0, '{"schemaVersion":3,');
select public.append_workspace_export_build_part((select (value->>'buildId')::uuid from ex_build), 2, '"x":1}');
select pg_temp.ex_expect(format($$select public.complete_workspace_export_build(%L, '{}'::jsonb, repeat('d', 64), '{}'::jsonb)$$, (select (value->>'buildId')::uuid from ex_build)), 'workspace_export_build_incomplete');
select public.append_workspace_export_build_part((select (value->>'buildId')::uuid from ex_build), 1, '"y":2,');
select pg_temp.ex_assert(public.complete_workspace_export_build((select (value->>'buildId')::uuid from ex_build), '{"categories":[]}'::jsonb,
  encode(sha256('token-fixture'::bytea), 'hex'), '{"leads":2}'::jsonb)->>'status' = 'ready', 'complete when every part exists');
select pg_temp.ex_assert((select schema_version = 3 from public.workspace_export_receipts where id = (select (value->>'buildId')::uuid from ex_build)), 'receipt recorded');
-- The token is the credential; wrong token, missing part, appends after ready all refused.
select pg_temp.ex_assert(public.read_workspace_export_build_part((select (value->>'buildId')::uuid from ex_build), encode(sha256('token-fixture'::bytea), 'hex'), 1)->>'body' = '"y":2,', 'download by token');
select pg_temp.ex_expect(format($$select public.read_workspace_export_build_part(%L, repeat('0', 64), 0)$$, (select value->>'buildId' from ex_build)), 'workspace_export_link_invalid');
select pg_temp.ex_expect(format($$select public.read_workspace_export_build_part(%L, encode(sha256('token-fixture'::bytea), 'hex'), 9)$$, (select value->>'buildId' from ex_build)), 'workspace_export_link_invalid');
select pg_temp.ex_expect(format($$select public.append_workspace_export_build_part(%L, 3, 'x')$$, (select value->>'buildId' from ex_build)), 'workspace_export_build_not_open');
update public.workspace_export_builds set expires_at = now() - interval '1 second' where id = (select (value->>'buildId')::uuid from ex_build);
select pg_temp.ex_expect(format($$select public.read_workspace_export_build_part(%L, encode(sha256('token-fixture'::bytea), 'hex'), 0)$$, (select value->>'buildId' from ex_build)), 'workspace_export_link_invalid');
-- A failed build keeps no parts.
create temporary table ex_failed(value jsonb);
insert into ex_failed select public.start_workspace_export_build((select id from ex_w), 'e7000000-0000-4000-8000-000000000001', 'ex-operator@strelva.example.test');
select public.append_workspace_export_build_part((select (value->>'buildId')::uuid from ex_failed), 0, 'x');
select public.fail_workspace_export_build((select (value->>'buildId')::uuid from ex_failed), 'synthetic');
select pg_temp.ex_assert(public.read_workspace_export_build((select (value->>'buildId')::uuid from ex_failed), 'e7000000-0000-4000-8000-000000000001', 'ex-operator@strelva.example.test')->>'status' = 'failed'
  and (select count(*) from public.workspace_export_build_parts where build_id = (select (value->>'buildId')::uuid from ex_failed)) = 0, 'failed build keeps nothing');
-- A business with no owner recipient cannot get an operator-started export.
update public.tenants set owner_email = null where id = 'ex-store';
select pg_temp.ex_expect(format($$select public.start_workspace_export_build(%L, 'e7000000-0000-4000-8000-000000000001', 'ex-operator@strelva.example.test')$$, (select id from ex_w)), 'workspace_export_no_owner_recipient');
rollback;
