\set ON_ERROR_STOP on
-- #509 (PR #523 round 3): an operator's pending edit never reaches booking
-- availability, the agent/MCP booking tools, booking emails, inquiry offers,
-- the public inquiry form or a linked site's content. Every reader returns
-- the owner-confirmed copy in its earlier shape, and the owner's own write
-- reaches them at once. Fictional fixture; rolled back.
begin;
create function pg_temp.bf_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'booking confirmed facts: %', message; end if; end $$;

do $$
declare
  ws uuid := '65352300-0000-4000-8000-000000000110';
  own uuid := '65352300-0000-4000-8000-000000000101';
  oper uuid := '65352300-0000-4000-8000-000000000102';
  scope text := 'workspace:65352300-0000-4000-8000-000000000110';
  rev bigint; sid text; ctx jsonb; details jsonb; inquiry_ctx jsonb; site jsonb; inquiry jsonb;
begin
  insert into public.users(id, email, verified_at) values (own, 'bf-owner@example.test', now()), (oper, 'bf-operator@example.test', now());
  insert into public.super_admins(user_id, email) values (oper, 'bf-operator@example.test');
  insert into public.workspaces(id, kind, name, created_by) values (ws, 'customer', 'Booking facts fixture', own);
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values (ws, own, 'owner', own), (ws, oper, 'admin', own);
  insert into public.tenants(id, stable_id, site_name, active) values ('bf-site', '65352300-0000-4000-8000-000000000120', 'BF Site', true);
  insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt)
    values ('65352300-0000-4000-8000-000000000120', 'bf-site', ws, own, '65352300-0000-4000-8000-000000000130', repeat('a', 64), '{}');

  -- The owner's own details: confirmed by their write.
  perform public.patch_business_record(ws, own, 'bf-owner@example.test', 'owner', 0,
    '{"facts":{"phone":{"value":"716-555-0101"},"display_name":{"value":"Owner Co"},"address":{"value":{"line1":"1 Owner St","city":"Buffalo"}},"hours":{"value":{"timezone":"America/New_York","weekly":[{"day":1,"opens":"09:00","closes":"17:00"}]}}},"services":[{"op":"upsert","name":"Owner service","durationMinutes":60,"priceText":"$99","active":true}]}',
    gen_random_uuid(), repeat('b', 64));
  select id::text into sid from public.business_services where workspace_id = ws and name = 'Owner service';
  select revision into rev from public.business_records where workspace_id = ws;

  -- An operator's verified edit and new service: pending until the owner decides.
  perform public.patch_business_record(ws, oper, 'bf-operator@example.test', 'operator', rev, jsonb_build_object(
    'facts', '{"phone":{"value":"716-555-0999","verified":true},"display_name":{"value":"Operator Co","verified":true},"address":{"value":{"line1":"999 Operator St","city":"Buffalo"},"verified":true},"hours":{"value":{"timezone":"UTC","weekly":[{"day":1,"opens":"06:00","closes":"23:00"}]},"verified":true}}'::jsonb,
    'services', jsonb_build_array(
      jsonb_build_object('op', 'upsert', 'id', sid, 'name', 'Operator service', 'durationMinutes', 120, 'priceText', '$500', 'verified', true),
      jsonb_build_object('op', 'upsert', 'name', 'Operator-only service', 'durationMinutes', 15, 'active', true, 'verified', true))),
    gen_random_uuid(), repeat('b', 64));
  perform pg_temp.bf_assert(public.read_business_fact_review(ws) is not null, 'operator edit is pending');

  ctx := public.read_tenant_booking_context(scope);
  perform pg_temp.bf_assert(ctx->>'phone' = '716-555-0101', 'booking phone is confirmed, got ' || coalesce(ctx->>'phone', 'null'));
  perform pg_temp.bf_assert(ctx->'hours' = '{"timezone":"America/New_York","weekly":[{"day":1,"opens":"09:00","closes":"17:00"}]}'::jsonb, 'booking hours are confirmed, got ' || coalesce(ctx->>'hours', 'null'));
  perform pg_temp.bf_assert(ctx->'services' = jsonb_build_array(jsonb_build_object('id', sid, 'name', 'Owner service', 'durationMinutes', 60, 'active', true, 'externalRef', null)),
    'booking services are confirmed, same shape: ' || (ctx->'services')::text);
  perform pg_temp.bf_assert(ctx ?& array['tenantStableId','calendarKey','workspaceId','systemId','paused','settings','servicePolicies'], 'booking context keeps its keys');

  details := public.read_booking_business_details(scope);
  perform pg_temp.bf_assert(details->>'name' = 'Owner Co' and details->>'address' = '1 Owner St, Buffalo', 'booking email details are confirmed: ' || details::text);

  inquiry_ctx := public.read_inquiry_workspace_booking_context(ws);
  perform pg_temp.bf_assert(inquiry_ctx->>'phone' = '716-555-0101' and inquiry_ctx->'hours'->>'timezone' = 'America/New_York'
    and inquiry_ctx->'services' = ctx->'services', 'inquiry booking context is confirmed: ' || inquiry_ctx::text);

  site := public.read_tenant_business_context('bf-site');
  perform pg_temp.bf_assert(site->'facts'->>'phone' = '716-555-0101' and site->'facts'->>'display_name' = 'Owner Co'
    and site->'facts'->'address'->>'line1' = '1 Owner St', 'linked site overlay is confirmed: ' || (site->'facts')::text);
  perform pg_temp.bf_assert(site->'services' = jsonb_build_array(jsonb_build_object('id', sid, 'name', 'Owner service', 'description', null, 'priceText', '$99')),
    'linked site services are confirmed: ' || (site->'services')::text);

  inquiry := public.read_inquiry_business_context('bf-site');
  perform pg_temp.bf_assert(inquiry->'facts'->'phone'->>'value' = '716-555-0101'
    and inquiry->'facts'->'hours'->'value'->>'timezone' = 'America/New_York', 'inquiry facts are confirmed: ' || (inquiry->'facts')::text);
  perform pg_temp.bf_assert(jsonb_array_length(inquiry->'services') = 1 and inquiry->'services'->0->>'name' = 'Owner service'
    and inquiry->'services'->0 ?& array['id','name','description','priceText','active','verified'], 'inquiry form services are confirmed: ' || (inquiry->'services')::text);
  perform pg_temp.bf_assert(jsonb_array_length(inquiry->'people') = 0, 'inquiry people unchanged');

  -- The owner's own write is their decision: it reaches every reader at once.
  select revision into rev from public.business_records where workspace_id = ws;
  perform public.patch_business_record(ws, own, 'bf-owner@example.test', 'owner', rev,
    '{"facts":{"phone":{"value":"716-555-0222"}}}', gen_random_uuid(), repeat('b', 64));
  perform pg_temp.bf_assert(public.read_tenant_booking_context(scope)->>'phone' = '716-555-0222'
    and public.read_tenant_business_context('bf-site')->'facts'->>'phone' = '716-555-0222', 'owner write reaches booking and site');
  perform pg_temp.bf_assert(public.read_booking_business_details(scope)->>'name' = 'Owner Co', 'unrelated pending name stays pending');

  -- A pending deletion of a confirmed service can't be booked, so it isn't offered.
  delete from public.booking_service_policies where business_service_id = sid::uuid;
  delete from public.business_services where id = sid::uuid;
  perform pg_temp.bf_assert(public.read_tenant_booking_context(scope)->'services' = '[]'::jsonb
    and public.read_inquiry_workspace_booking_context(ws)->'services' = '[]'::jsonb, 'removed record service is not bookable');

  -- Nothing confirmed: booking falls back as an unconverted site does.
  delete from public.business_record_confirmed where workspace_id = ws;
  ctx := public.read_tenant_booking_context(scope);
  perform pg_temp.bf_assert(ctx->'hours' = 'null'::jsonb and ctx->'phone' = 'null'::jsonb and ctx->'services' = '[]'::jsonb, 'empty confirmed copy: no hours, phone or services');
  perform pg_temp.bf_assert(public.read_booking_business_details(scope)->>'name' = 'Booking facts fixture', 'name falls back to the business name');
end $$;

select pg_temp.bf_assert(not has_function_privilege('service_role', 'public.business_confirmed_facts(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.business_confirmed_services(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.business_confirmed_services(uuid)', 'execute'), 'confirmed-copy helpers are internal');
select pg_temp.bf_assert(has_function_privilege('service_role', 'public.read_tenant_booking_context(text)', 'execute')
  and has_function_privilege('service_role', 'public.read_booking_business_details(text)', 'execute')
  and has_function_privilege('service_role', 'public.read_tenant_business_context(text)', 'execute'), 'reader privileges unchanged');

rollback;
