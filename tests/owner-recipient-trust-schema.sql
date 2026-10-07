\set ON_ERROR_STOP on
-- #524: owner links go only to a trusted owner address. A recipient an
-- operator, an agency (Strelva's included) or an admin wrote is pending and
-- receives nothing until the owner confirms it. Fictional fixture, rolled
-- back. Never connects to production.
begin;
create or replace function pg_temp.rt_assert(v boolean, message text) returns void language plpgsql as $$
begin if v is not true then raise exception 'owner recipient trust: %', message; end if; end $$;
create or replace function pg_temp.rt_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%' || expected || '%' then return; end if; raise; end;
  raise exception 'owner recipient trust: expected % from %', expected, statement;
end $$;
-- One open owner item of a given kind and lifecycle.
create or replace function pg_temp.rt_open(ws uuid, kind text, lifecycle text, source_id text, hash text) returns uuid language sql as $$
  select (public.open_owner_decision(ws, jsonb_build_object('kind', kind, 'route', 'owner_decides', 'title', 'Fixture decision',
    'approveEffect', 'It happens.', 'notYetEffect', 'Nothing changes.', 'sourceLifecycle', lifecycle, 'sourceId', source_id,
    'revisionHash', hash, 'urgent', false, 'adminMayDecide', false))->>'id')::uuid
$$;
create or replace function pg_temp.rt_sent(ws uuid, item uuid, recipient text) returns void language sql as $$
  select null::void from (select public.record_owner_decision_delivery(ws, item, 'digest', 'sent', recipient, 'fixture-message', null)) x
$$;
create or replace function pg_temp.rt_trusted(ws uuid) returns text language sql as $$
  select email from public.business_owner_recipient_trust where workspace_id = ws
$$;
create or replace function pg_temp.rt_last(ws uuid) returns public.business_owner_recipient_events language sql as $$
  select * from public.business_owner_recipient_events where workspace_id = ws order by id desc limit 1
$$;

-- Privileges: the trust state is reached through functions only.
select pg_temp.rt_assert(not has_table_privilege('service_role', 'public.business_owner_recipient_trust', 'select')
  and not has_table_privilege('service_role', 'public.business_owner_recipient_events', 'insert')
  and not has_table_privilege('service_role', 'public.owner_decision_link_bindings', 'insert')
  and not has_table_privilege('authenticated', 'public.business_owner_recipient_trust', 'select'), 'trust tables are not exposed');
select pg_temp.rt_assert(not has_function_privilege('service_role', 'public.business_owner_recipient_set_trust(uuid,text,text,text,boolean,text,uuid,uuid,bigint,text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.business_trusted_owner_recipient(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.business_owner_recipient_trust_conversion()', 'execute'), 'trust helpers are internal');
select pg_temp.rt_assert(has_function_privilege('service_role', 'public.resolve_business_owner_recipient(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.resolve_business_owner_recipient(uuid)', 'execute'), 'resolver stays server-only');

do $$
declare
  operator_id uuid := '52400000-0000-4000-8000-000000000001';
  owner_id uuid := '52400000-0000-4000-8000-000000000002';
  admin_id uuid := '52400000-0000-4000-8000-000000000003';
  agency_user uuid := '52400000-0000-4000-8000-000000000004';
  agency_ws uuid := '52400000-0000-4000-8000-000000000005';
  ws uuid; quiet_ws uuid; none_ws uuid; rev bigint; review jsonb; item uuid; early uuid; result jsonb; ev public.business_owner_recipient_events;
  pair text[];
  kinds text[][] := array[
    array['system.go_live','website_domain'], array['fact.inferred','business_facts'], array['system.change_live','make_real'],
    array['system.change_live','website_document'], array['running.approve','booking_settings'], array['customer.commitment','booking_request'],
    array['system.change_live','version_release'], array['request.scope','work_plan'], array['request.scope','provider_delivery'],
    array['review.reply','tenant_event'], array['copy.marketing','publishing'], array['system.change_live','application_release']];
  n integer := 0;
begin
  insert into public.users(id, email, verified_at) values
    (operator_id, 'rt-operator@strelva.example.test', now()), (owner_id, 'rt-owner@example.test', now()),
    (admin_id, 'rt-admin@example.test', now()), (agency_user, 'rt-agency@example.test', now());
  insert into public.super_admins(user_id, email) values (operator_id, 'rt-operator@strelva.example.test');
  insert into public.tenants(id, stable_id, site_name, active, owner_email) values
    ('rt-site', '52400000-0000-4000-8000-0000000000a1', 'RT Bakery', true, 'rt-owner@example.test'),
    ('rt-quiet', '52400000-0000-4000-8000-0000000000a2', 'RT Quiet', true, 'rt-quiet@example.test'),
    ('rt-none', '52400000-0000-4000-8000-0000000000a3', 'RT Nobody', true, null),
    ('rt-unconverted', '52400000-0000-4000-8000-0000000000a4', 'RT Unconverted', true, 'rt-unconverted@example.test');

  -- 1. Conversion imports a trusted address.
  result := public.convert_tenant_to_business('rt-operator@strelva.example.test', 'rt-site',
    '{"tenantId":"rt-site","tenantStableId":"52400000-0000-4000-8000-0000000000a1","workspaceName":"RT Bakery","billing":null,"account":null,
      "patch":{"facts":{"owner_recipient":{"value":{"email":"rt-owner@example.test","name":"Robin Owner"},"verified":false}}},"contacts":[]}',
    '52400000-0000-4000-8000-0000000000c1', repeat('a', 64));
  ws := (result->>'workspaceId')::uuid;
  perform pg_temp.rt_assert(pg_temp.rt_trusted(ws) = 'rt-owner@example.test'
    and (select trusted_via = 'conversion' and tenant_stable_id is null from public.business_owner_recipient_trust where workspace_id = ws),
    'the imported owner_recipient is trusted at conversion');
  ev := pg_temp.rt_last(ws);
  perform pg_temp.rt_assert(ev.event = 'trusted' and ev.actor_kind = 'conversion' and ev.actor_id = operator_id::text, 'conversion trust is logged with the converting operator');
  perform pg_temp.rt_assert(public.resolve_business_owner_recipient(ws)
    = '{"email":"rt-owner@example.test","name":"Robin Owner","from":"record","source":"tenant_import","verified":false,"tenantId":null}'::jsonb,
    'resolver keeps its JSON for an imported address');
  result := public.convert_tenant_to_business('rt-operator@strelva.example.test', 'rt-quiet',
    '{"tenantId":"rt-quiet","tenantStableId":"52400000-0000-4000-8000-0000000000a2","workspaceName":"RT Quiet","billing":null,"account":null,"patch":{},"contacts":[]}',
    '52400000-0000-4000-8000-0000000000c2', repeat('a', 64));
  quiet_ws := (result->>'workspaceId')::uuid;
  perform pg_temp.rt_assert(public.resolve_business_owner_recipient(quiet_ws)
    = '{"email":"rt-quiet@example.test","name":null,"from":"tenant_fallback","source":null,"verified":false,"tenantId":"rt-quiet"}'::jsonb,
    'a site''s own owner_email is trusted when nothing was imported');
  update public.tenants set owner_email = 'rt-operator@strelva.example.test' where id = 'rt-quiet';
  perform pg_temp.rt_assert(public.resolve_business_owner_recipient(quiet_ws)->>'email' = 'rt-quiet@example.test',
    'editing the site''s owner_email after conversion moves nothing');
  result := public.convert_tenant_to_business('rt-operator@strelva.example.test', 'rt-none',
    '{"tenantId":"rt-none","tenantStableId":"52400000-0000-4000-8000-0000000000a3","workspaceName":"RT Nobody","billing":null,"account":null,"patch":{},"contacts":[]}',
    '52400000-0000-4000-8000-0000000000c3', repeat('a', 64));
  none_ws := (result->>'workspaceId')::uuid;
  perform pg_temp.rt_assert(public.resolve_business_owner_recipient(none_ws) is null, 'no address at conversion: nothing trusted');
  perform pg_temp.rt_assert(public.resolve_tenant_owner_recipient('rt-unconverted')
    = '{"email":"rt-unconverted@example.test","name":null,"from":"tenant","workspaceId":null,"tenantId":"rt-unconverted"}'::jsonb,
    'unconverted tenants keep their own owner_email');

  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
    (ws, owner_id, 'owner', operator_id), (ws, admin_id, 'admin', operator_id);
  -- An agency serving this business, marked as Strelva's own agency: no advantage.
  insert into public.workspaces(id, kind, name, created_by) values (agency_ws, 'agency', 'Fictional Strelva agency', agency_user);
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values (agency_ws, agency_user, 'owner', agency_user);
  insert into public.platform_workspaces(role, workspace_id, set_by) values ('strelva_agency', agency_ws, operator_id) on conflict do nothing;
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values ('52400000-0000-4000-8000-000000000010', ws, 'tracker', 'tracker', 'Agency work', '{}', owner_id);
  insert into public.operational_assignments(id, workspace_id, work_id, sponsor_id, sponsor_email, assignee_user_id, assignee_email, assignee_kind,
      assignee_workspace_id, offer_key, work_scope, status, accepted_at, expires_at)
    values ('52400000-0000-4000-8000-000000000011', ws, '52400000-0000-4000-8000-000000000010', owner_id, 'rt-owner@example.test', agency_user,
      'rt-agency@example.test', 'agency', agency_ws, 'rt-offer', '{}', 'accepted', clock_timestamp(), clock_timestamp() + interval '7 days');
  insert into public.offering_installations(id, business_workspace_id, definition_id, definition_version, native_resources, responsibility,
      accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by)
    values ('52400000-0000-4000-8000-000000000012', ws, 'rt_fixture', '1.0.0', '[]', '{"kind":"provider_requested","providerKind":"agency"}',
      array['operate'], array['workspace'], 'rt-install', repeat('a', 64), owner_id, owner_id);
  insert into public.offering_provider_deliveries(id, business_workspace_id, installation_id, assignment_id, status, scope, idempotency_key,
      command_digest, requested_by, expires_at, accepted_by, accepted_at, history)
    values ('52400000-0000-4000-8000-000000000013', ws, '52400000-0000-4000-8000-000000000012', '52400000-0000-4000-8000-000000000011',
      'accepted', array['operate'], 'rt-delivery', repeat('a', 64), owner_id, clock_timestamp() + interval '7 days', agency_user, clock_timestamp(), '[]');
  perform pg_temp.rt_assert(public.read_business_record(ws, agency_user, 'rt-agency@example.test')->>'access' = 'agency', 'agency fixture has agency access');

  -- An item whose link went to the trusted owner before anything changed.
  early := pg_temp.rt_open(ws, 'system.go_live', 'website_domain', 'rt-early', repeat('1', 64));
  perform pg_temp.rt_sent(ws, early, 'rt-owner@example.test');
  perform pg_temp.rt_assert(exists (select 1 from public.owner_decision_link_bindings where decision_id = early and recipient = 'rt-owner@example.test'),
    'a link sent to the trusted owner is bound to it');

  -- 2. An operator change is pending and receives nothing.
  rev := (select revision from public.business_records where workspace_id = ws);
  perform public.patch_business_record(ws, operator_id, 'rt-operator@strelva.example.test', 'operator', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"rt-operator@strelva.example.test"},"verified":true}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  perform pg_temp.rt_assert(pg_temp.rt_trusted(ws) = 'rt-owner@example.test', 'operator change does not move trust');
  ev := pg_temp.rt_last(ws);
  perform pg_temp.rt_assert(ev.event = 'written' and ev.pending and ev.actor_kind = 'operator' and ev.actor_id = operator_id::text
    and ev.email = 'rt-operator@strelva.example.test' and ev.previous_trusted = 'rt-owner@example.test', 'operator change is logged as pending, with actor');
  perform pg_temp.rt_assert(public.resolve_business_owner_recipient(ws)->>'email' = 'rt-owner@example.test'
    and public.resolve_tenant_owner_recipient('rt-site')->>'email' = 'rt-owner@example.test', 'every resolver keeps the trusted owner');
  item := pg_temp.rt_open(ws, 'system.go_live', 'website_domain', 'rt-operator', repeat('2', 64));
  perform pg_temp.rt_assert((select d->'recipient'->>'email' from jsonb_array_elements(public.list_open_owner_decisions_for_delivery(2000)) d
    where d->>'id' = item::text) = 'rt-owner@example.test', 'the delivery list sends the link to the trusted owner only');
  perform pg_temp.rt_sent(ws, item, 'rt-operator@strelva.example.test');
  perform pg_temp.rt_assert(not exists (select 1 from public.owner_decision_link_bindings where decision_id = item),
    'a link sent to a pending address binds nothing');
  perform pg_temp.rt_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,null,null,%L)', ws, item, repeat('2', 64), 'approve', 'owner_link',
    'rt-operator@strelva.example.test'), 'owner_decision_recipient_not_owner');

  -- 3. An agency change (Strelva's agency) and an admin writing as owner: the same.
  perform public.patch_business_record(ws, agency_user, 'rt-agency@example.test', 'agency', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"rt-agency@example.test"}}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  ev := pg_temp.rt_last(ws);
  perform pg_temp.rt_assert(ev.pending and ev.actor_kind = 'agency' and ev.actor_id = agency_user::text and pg_temp.rt_trusted(ws) = 'rt-owner@example.test',
    'agency change is pending, logged with actor');
  perform public.patch_business_record(ws, admin_id, 'rt-admin@example.test', 'owner', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"rt-admin@example.test"}}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  ev := pg_temp.rt_last(ws);
  perform pg_temp.rt_assert(ev.pending and ev.actor_kind = 'admin' and pg_temp.rt_trusted(ws) = 'rt-owner@example.test', 'admin writing as owner is pending');

  -- 4. Every owner-link kind refuses the untrusted recipient, and an
  --    address the link was never sent to; the trusted owner's link decides.
  foreach pair slice 1 in array kinds loop
    n := n + 1;
    item := pg_temp.rt_open(ws, pair[1], pair[2], 'rt-kind-' || n, lpad(to_hex(n), 64, 'c'));
    perform pg_temp.rt_sent(ws, item, 'rt-admin@example.test');
    perform pg_temp.rt_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,null,null,%L)', ws, item, lpad(to_hex(n), 64, 'c'), 'approve',
      'owner_link', 'rt-admin@example.test'), 'owner_decision_recipient_not_owner');
    perform pg_temp.rt_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,null,null,%L)', ws, item, lpad(to_hex(n), 64, 'c'), 'approve',
      'owner_link', 'rt-owner@example.test'), 'owner_decision_recipient_not_owner');
    if pair[2] = 'make_real' then
      perform pg_temp.rt_error(format('select public.strelva_make_real_link_session(%L,%L,%L)', ws, item, 'rt-agency@example.test'),
        'owner_decision_recipient_not_owner');
    end if;
    perform pg_temp.rt_sent(ws, item, 'rt-owner@example.test');
    result := public.claim_owner_decision(ws, item, lpad(to_hex(n), 64, 'c'), 'not_yet', 'owner_link', null, null, ' RT-Owner@example.test ');
    perform pg_temp.rt_assert(result->>'status' = 'claimed' and result->'item'->>'decidedBy' is distinct from 'rt-admin@example.test',
      format('%s/%s: the trusted owner''s link decides', pair[1], pair[2]));
  end loop;
  perform pg_temp.rt_assert(n = 12, 'all owner-link kinds checked');

  -- The facts source rechecks too: a decision recorded for a pending address publishes nothing.
  review := public.read_business_fact_review(ws);
  item := pg_temp.rt_open(ws, 'fact.inferred', 'business_facts', ws::text, review->>'revisionHash');
  update public.owner_decisions set state = 'approved', decided_at = clock_timestamp(), decided_by_kind = 'owner_link',
    decided_by = 'rt-admin@example.test' where id = item;
  perform pg_temp.rt_error(format('select public.confirm_business_facts(%L,%L,%L)', ws, item, review->>'revisionHash'), 'business_facts_owner_approval_required');
  perform pg_temp.rt_assert(pg_temp.rt_trusted(ws) = 'rt-owner@example.test', 'a forged approval moves nothing');

  -- 5. The previously trusted owner confirms by link: the new address is trusted.
  perform public.patch_business_record(ws, agency_user, 'rt-agency@example.test', 'agency', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"office@rtbakery.example.test","name":"RT Office"}}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  review := public.read_business_fact_review(ws);
  perform pg_temp.rt_assert(exists (select 1 from jsonb_array_elements(review->'changes') c where c->>'id' = 'owner_recipient'
    and c->'after'->>'email' = 'office@rtbakery.example.test'), 'the pending address is on the owner''s facts item');
  item := pg_temp.rt_open(ws, 'fact.inferred', 'business_facts', ws::text, review->>'revisionHash');
  perform pg_temp.rt_sent(ws, item, (select d->'recipient'->>'email' from jsonb_array_elements(public.list_open_owner_decisions_for_delivery(2000)) d
    where d->>'id' = item::text));
  result := public.claim_owner_decision(ws, item, review->>'revisionHash', 'approve', 'owner_link', null, null, 'rt-owner@example.test');
  perform pg_temp.rt_assert(result->>'status' = 'claimed', 'previous owner claims by link');
  perform public.confirm_business_facts(ws, item, review->>'revisionHash');
  perform pg_temp.rt_assert((select email = 'office@rtbakery.example.test' and name = 'RT Office' and trusted_via = 'owner_decision' and decision_id = item
    from public.business_owner_recipient_trust where workspace_id = ws), 'owner-confirmed address is trusted');
  ev := pg_temp.rt_last(ws);
  perform pg_temp.rt_assert(ev.event = 'trusted' and ev.actor_kind = 'owner_link' and ev.actor_id = 'rt-owner@example.test'
    and ev.previous_trusted = 'rt-owner@example.test' and ev.decision_id = item, 'trust change is logged with the deciding owner link');
  perform pg_temp.rt_assert(public.resolve_business_owner_recipient(ws)->>'email' = 'office@rtbakery.example.test'
    and public.resolve_tenant_owner_recipient('rt-site')->>'email' = 'office@rtbakery.example.test', 'resolvers follow the new trusted address');
  -- The old address's links stop working, even one sent while it was trusted.
  perform pg_temp.rt_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,null,null,%L)', ws, early, repeat('1', 64), 'approve', 'owner_link',
    'rt-owner@example.test'), 'owner_decision_recipient_not_owner');

  -- 6. An operator change confirmed by the owner signed in.
  perform public.patch_business_record(ws, operator_id, 'rt-operator@strelva.example.test', 'operator', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"robin@rtbakery.example.test"}}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  perform pg_temp.rt_assert(pg_temp.rt_trusted(ws) = 'office@rtbakery.example.test', 'operator change waits again');
  review := public.read_business_fact_review(ws);
  item := pg_temp.rt_open(ws, 'fact.inferred', 'business_facts', ws::text, review->>'revisionHash');
  perform pg_temp.rt_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', ws, item, review->>'revisionHash', 'approve', 'operator',
    operator_id, 'rt-operator@strelva.example.test'), 'owner_decision_owner_only');
  result := public.claim_owner_decision(ws, item, review->>'revisionHash', 'approve', 'session', owner_id, 'rt-owner@example.test', null);
  perform public.confirm_business_facts(ws, item, review->>'revisionHash');
  ev := pg_temp.rt_last(ws);
  perform pg_temp.rt_assert(pg_temp.rt_trusted(ws) = 'robin@rtbakery.example.test' and ev.event = 'trusted' and ev.actor_kind = 'owner_session'
    and ev.actor_id = owner_id::text, 'owner session confirms the operator''s change');

  -- 7. The owner's own write is trusted at once; removing it never moves trust.
  perform public.patch_business_record(ws, owner_id, 'rt-owner@example.test', 'owner', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"robin.owner@example.test"}}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  perform pg_temp.rt_assert((select email = 'robin.owner@example.test' and trusted_via = 'owner_write' from public.business_owner_recipient_trust where workspace_id = ws),
    'owner write is trusted');
  ev := pg_temp.rt_last(ws);
  perform pg_temp.rt_assert(ev.event = 'written' and not ev.pending and ev.actor_kind = 'owner', 'owner write is logged, not pending');
  perform public.patch_business_record(ws, owner_id, 'rt-owner@example.test', 'owner', rev, '{"facts":{"owner_recipient":null}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  ev := pg_temp.rt_last(ws);
  perform pg_temp.rt_assert(pg_temp.rt_trusted(ws) = 'robin.owner@example.test' and ev.event = 'written' and ev.email is null,
    'removal is logged and keeps trust');

  -- 8. No trusted address: nothing is sent and nobody decides by link.
  rev := (select revision from public.business_records where workspace_id = none_ws);
  perform public.patch_business_record(none_ws, operator_id, 'rt-operator@strelva.example.test', 'operator', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"rt-operator@strelva.example.test"}}}}', gen_random_uuid(), repeat('b', 64));
  perform pg_temp.rt_assert(public.resolve_business_owner_recipient(none_ws) is null, 'an operator cannot create a trusted address');
  item := pg_temp.rt_open(none_ws, 'system.go_live', 'website_domain', 'rt-none', repeat('3', 64));
  perform pg_temp.rt_assert((select d->'recipient' from jsonb_array_elements(public.list_open_owner_decisions_for_delivery(2000)) d
    where d->>'id' = item::text) = 'null'::jsonb, 'delivery list has no recipient, so the cron records it as not sent');
  perform pg_temp.rt_sent(none_ws, item, 'rt-operator@strelva.example.test');
  perform pg_temp.rt_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,null,null,%L)', none_ws, item, repeat('3', 64), 'approve', 'owner_link',
    'rt-operator@strelva.example.test'), 'owner_decision_recipient_not_owner');

  -- 9. Unlinking a business's only site deletes the business; its trust row and log go with it.
  perform pg_temp.rt_assert((public.preview_tenant_unlink('rt-operator@strelva.example.test', 'rt-quiet')->'plan'->>'deleteWorkspace')::boolean,
    'trust is conversion machinery, not use that keeps a business');
  perform public.unlink_tenant_from_business('rt-operator@strelva.example.test', 'rt-quiet', quiet_ws, '52400000-0000-4000-8000-0000000000c9', repeat('a', 64));
  perform pg_temp.rt_assert(not exists (select 1 from public.workspaces where id = quiet_ws)
    and not exists (select 1 from public.business_owner_recipient_trust where workspace_id = quiet_ws)
    and not exists (select 1 from public.business_owner_recipient_events where workspace_id = quiet_ws), 'a deleted business forgets its owner address');

  -- 10. The log is append-only.
  perform pg_temp.rt_error(format('update public.business_owner_recipient_events set email = %L where workspace_id = %L', 'x@example.test', ws), 'business_record_history_immutable');
  perform pg_temp.rt_error(format('delete from public.business_owner_recipient_events where workspace_id = %L', ws), 'business_record_history_immutable');
end $$;
rollback;
