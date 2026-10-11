\set ON_ERROR_STOP on
-- #509: no provider or operator edit reaches a client site without the
-- business's decision. Fictional fixture on the hosted linked-client site;
-- rolled back. Never connects to production.
begin;
create or replace function pg_temp.fo_assert(v boolean, message text) returns void language plpgsql as $$
begin if v is not true then raise exception 'facts owner decision: %', message; end if; end $$;
create or replace function pg_temp.fo_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%' || expected || '%' then return; end if; raise; end;
  raise exception 'facts owner decision: expected % from %', expected, statement;
end $$;

select pg_temp.fo_assert(not has_function_privilege('anon', 'public.confirm_business_facts(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.confirm_business_facts(uuid,uuid,text)', 'execute'), 'browsers cannot confirm facts');
select pg_temp.fo_assert(has_function_privilege('service_role', 'public.confirm_business_facts(uuid,uuid,text)', 'execute'), 'service applies recorded decisions');
select pg_temp.fo_assert(not has_function_privilege('authenticated', 'public.read_business_fact_review(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.read_confirmed_business_facts(uuid,uuid,text)', 'execute'), 'browsers cannot read reviews');
select pg_temp.fo_assert(not has_function_privilege('service_role', 'public.business_trusted_owner_recipient(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.business_record_confirm_owner_write()', 'execute'), 'helpers are internal');
select pg_temp.fo_assert(not has_table_privilege('service_role', 'public.business_record_confirmed', 'insert')
  and not has_table_privilege('service_role', 'public.business_record_fact_confirmations', 'select'), 'confirmed copy is reached through functions only');

do $$
declare
  ws uuid := '62000000-0000-4000-8000-000000000110';
  owner_id uuid := '62000000-0000-4000-8000-000000000101';
  operator_id uuid := '62000000-0000-4000-8000-000000000102';
  admin_id uuid := '62000000-0000-4000-8000-000000000103';
  agency_user uuid := '65090000-0000-4000-8000-000000000001';
  agency_ws uuid := '65090000-0000-4000-8000-000000000002';
  tenant text; rev bigint; review jsonb; item jsonb; d1 uuid; d2 uuid; d3 uuid; result jsonb; hosted jsonb; site jsonb; service_id text;
  n integer := 0;
  key text := 'sk_pub_' || repeat('f', 24);
begin
  select tenant_id into tenant from public.website_document_publications where workspace_id = ws limit 1;
  perform pg_temp.fo_assert(tenant is not null, 'hosted fixture exists');
  update public.tenants set owner_email = 'lp-owner@example.test' where id = tenant;
  perform pg_temp.fo_assert(exists (select 1 from public.super_admins where user_id = operator_id and revoked_at is null), 'operator fixture is an active super admin');
  site := public.create_connected_site(ws, owner_id, 'lp-owner@example.test', jsonb_build_object('publicKey', key, 'verificationToken', repeat('d', 32),
    'label', 'Fictional', 'siteUrl', 'https://facts.example.test/', 'siteHost', 'facts.example.test', 'allowedOrigins', jsonb_build_array('https://facts.example.test')));

  -- An agency serving this business, marked as Strelva's own agency: no advantage.
  insert into public.users(id, email, verified_at) values (agency_user, 'fo-agency@example.test', now());
  insert into public.workspaces(id, kind, name, created_by) values (agency_ws, 'agency', 'Fictional Strelva agency', agency_user);
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values (agency_ws, agency_user, 'owner', agency_user);
  insert into public.platform_workspaces(role, workspace_id, set_by) values ('strelva_agency', agency_ws, operator_id) on conflict do nothing;
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values ('65090000-0000-4000-8000-000000000010', ws, 'tracker', 'tracker', 'Agency work', '{}', owner_id);
  insert into public.operational_assignments(id, workspace_id, work_id, sponsor_id, sponsor_email, assignee_user_id, assignee_email, assignee_kind,
      assignee_workspace_id, offer_key, work_scope, status, accepted_at, expires_at)
    values ('65090000-0000-4000-8000-000000000011', ws, '65090000-0000-4000-8000-000000000010', owner_id, 'lp-owner@example.test', agency_user,
      'fo-agency@example.test', 'agency', agency_ws, 'fo-offer', '{}', 'accepted', clock_timestamp(), clock_timestamp() + interval '7 days');
  insert into public.offering_installations(id, business_workspace_id, definition_id, definition_version, native_resources, responsibility,
      accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by)
    values ('65090000-0000-4000-8000-000000000012', ws, 'facts_fixture', '1.0.0', '[]', '{"kind":"provider_requested","providerKind":"agency"}',
      array['operate'], array['workspace'], 'fo-install', repeat('a', 64), owner_id, owner_id);
  insert into public.offering_provider_deliveries(id, business_workspace_id, installation_id, assignment_id, status, scope, idempotency_key,
      command_digest, requested_by, expires_at, accepted_by, accepted_at, history)
    values ('65090000-0000-4000-8000-000000000013', ws, '65090000-0000-4000-8000-000000000012', '65090000-0000-4000-8000-000000000011',
      'accepted', array['operate'], 'fo-delivery', repeat('a', 64), owner_id, clock_timestamp() + interval '7 days', agency_user, clock_timestamp(), '[]');
  perform pg_temp.fo_assert(public.read_business_record(ws, agency_user, 'fo-agency@example.test')->>'access' = 'agency', 'agency fixture has agency access');

  -- 1. The owner's own write is the decision: live at once.
  rev := coalesce((select revision from public.business_records where workspace_id = ws), 0);
  perform public.patch_business_record(ws, owner_id, 'lp-owner@example.test', 'owner', rev,
    '{"facts":{"phone":{"value":"716-555-0101"},"display_name":{"value":"Owner Named Co"}}}', gen_random_uuid(), repeat('b', 64));
  hosted := public.read_hosted_website_business_facts(tenant);
  perform pg_temp.fo_assert(hosted->'facts'->>'phone' = '716-555-0101' and hosted->'facts'->>'display_name' = 'Owner Named Co', 'owner write is live');
  perform pg_temp.fo_assert(public.read_connected_site_context(key)->'facts'->>'phone' = '716-555-0101', 'owner write reaches connected sites');
  perform pg_temp.fo_assert(public.read_business_fact_review(ws) is null, 'nothing waits after an owner write');

  -- 2. Operator edits (even marked verified), an operator deletion, an admin
  -- writing as "owner", and Strelva's agency: all pending, none live.
  rev := (select revision from public.business_records where workspace_id = ws);
  perform public.patch_business_record(ws, operator_id, 'lp-operator@example.test', 'operator', rev,
    '{"facts":{"phone":{"value":"716-555-0199","verified":true},"display_name":null}}', gen_random_uuid(), repeat('b', 64));
  perform pg_temp.fo_assert((select actor_kind from public.business_record_revisions where workspace_id = ws order by sequence desc limit 1) = 'operator',
    'operator edit is logged as an operator action');
  rev := rev + 1;
  perform public.patch_business_record(ws, admin_id, 'lp-admin@example.test', 'owner', rev,
    '{"facts":{"email":{"value":"admin@example.test"}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  perform public.patch_business_record(ws, agency_user, 'fo-agency@example.test', 'agency', rev,
    '{"facts":{"hours":{"value":{"timezone":"America/New_York","weekly":[{"day":1,"opens":"09:00","closes":"17:00"}]}}},"services":[{"op":"upsert","name":"Agency cleaning","priceText":"$99"}]}',
    gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  hosted := public.read_hosted_website_business_facts(tenant);
  perform pg_temp.fo_assert(hosted->'facts'->>'phone' = '716-555-0101', 'operator phone is not live');
  perform pg_temp.fo_assert(hosted->'facts'->>'display_name' = 'Owner Named Co', 'operator deletion is not live');
  perform pg_temp.fo_assert(not (hosted->'facts' ? 'email'), 'admin write as owner is not live');
  perform pg_temp.fo_assert(not (hosted->'facts' ? 'hours') and not exists (select 1 from jsonb_array_elements(hosted->'services') s where s->>'name' = 'Agency cleaning'),
    'Strelva agency facts are not live');
  perform pg_temp.fo_assert(public.read_connected_site_context(key)->'facts'->>'phone' = '716-555-0101'
    and not (public.read_connected_site_context(key)->'facts' ? 'hours'), 'connected site serves the confirmed copy only');
  perform pg_temp.fo_assert(public.read_confirmed_business_facts(ws, agency_user, 'fo-agency@example.test')->'facts'->>'phone' = '716-555-0101',
    'builders read the confirmed copy');
  review := public.read_business_fact_review(ws);
  select count(*) into n from jsonb_array_elements(review->'changes');
  perform pg_temp.fo_assert(n >= 5 and (review->>'recordRevision')::bigint = rev, 'every pending change is listed against the current revision');
  select c->>'id' into service_id from jsonb_array_elements(review->'changes') c where c->>'entity' = 'service' and c->'after'->>'name' = 'Agency cleaning';
  perform pg_temp.fo_assert(service_id is not null, 'the agency service is pending');

  -- 3. A recipient an operator wrote neither receives nor approves owner
  -- links: delivery and the link claim keep resolving the existing owner.
  perform public.patch_business_record(ws, operator_id, 'lp-operator@example.test', 'operator', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"lp-operator@example.test"}}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  perform pg_temp.fo_assert(public.resolve_business_owner_recipient(ws)->>'email' = 'lp-owner@example.test'
    and (public.resolve_business_owner_recipient(ws)->>'trusted')::boolean, 'a pending provider recipient does not displace the owner');
  review := public.read_business_fact_review(ws);
  item := public.open_owner_decision(ws, jsonb_build_object('kind', 'fact.inferred', 'route', 'owner_decides', 'title', 'Confirm changes to your business details',
    'approveEffect', 'These details go live.', 'notYetEffect', 'Nothing changes.', 'sourceLifecycle', 'business_facts', 'sourceId', ws::text,
    'revisionHash', review->>'revisionHash', 'urgent', false, 'adminMayDecide', false));
  d1 := (item->>'id')::uuid;
  perform pg_temp.fo_assert((select d->'recipient'->>'email' from jsonb_array_elements(public.list_open_owner_decisions_for_delivery(500)) d
    where (d->>'id')::uuid = d1) = 'lp-owner@example.test', 'the email goes to the owner, not the provider address');
  perform pg_temp.fo_error(format('select public.confirm_business_facts(%L,%L,%L)', ws, d1, review->>'revisionHash'), 'business_facts_owner_approval_required');
  perform pg_temp.fo_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', ws, d1, review->>'revisionHash', 'approve', 'operator', operator_id, 'lp-operator@example.test'), 'owner_decision_owner_only');
  perform pg_temp.fo_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,%L,%L,null)', ws, d1, review->>'revisionHash', 'approve', 'session', admin_id, 'lp-admin@example.test'), 'owner_decision_permission_denied');
  perform pg_temp.fo_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,null,null,%L)', ws, d1, review->>'revisionHash', 'approve', 'owner_link', 'lp-operator@example.test'),
    'owner_decision_recipient_not_owner');
  perform pg_temp.fo_assert(public.read_hosted_website_business_facts(tenant)->'facts'->>'phone' = '716-555-0101', 'a redirected link publishes nothing');
  perform public.patch_business_record(ws, operator_id, 'lp-operator@example.test', 'operator', rev, '{"facts":{"owner_recipient":null}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;

  -- 4. A decision bound to an older revision publishes nothing.
  review := public.read_business_fact_review(ws);
  item := public.open_owner_decision(ws, jsonb_build_object('kind', 'fact.inferred', 'route', 'owner_decides', 'title', 'Confirm changes to your business details',
    'approveEffect', 'These details go live.', 'notYetEffect', 'Nothing changes.', 'sourceLifecycle', 'business_facts', 'sourceId', ws::text,
    'revisionHash', review->>'revisionHash', 'urgent', false, 'adminMayDecide', false));
  d2 := (item->>'id')::uuid;
  perform public.patch_business_record(ws, agency_user, 'fo-agency@example.test', 'agency', rev, '{"facts":{"description":{"value":"Late agency copy."}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  result := public.claim_owner_decision(ws, d2, review->>'revisionHash', 'approve', 'owner_link', null, null, 'lp-owner@example.test');
  perform pg_temp.fo_assert(result->>'status' = 'claimed', 'owner link claims the older item');
  perform pg_temp.fo_error(format('select public.confirm_business_facts(%L,%L,%L)', ws, d2, review->>'revisionHash'), 'business_facts_changed');
  perform pg_temp.fo_assert(public.read_hosted_website_business_facts(tenant)->'facts'->>'phone' = '716-555-0101', 'a stale approval publishes nothing');

  -- 5. The owner's signed link (no session, no account needed) publishes exactly what was shown.
  review := public.read_business_fact_review(ws);
  perform pg_temp.fo_assert(public.list_business_fact_review_workspaces(500) @> to_jsonb(array[ws]), 'the chase finds a business with pending facts');
  item := public.open_owner_decision(ws, jsonb_build_object('kind', 'fact.inferred', 'route', 'owner_decides', 'title', 'Confirm changes to your business details',
    'approveEffect', 'These details go live.', 'notYetEffect', 'Nothing changes.', 'sourceLifecycle', 'business_facts', 'sourceId', ws::text,
    'revisionHash', review->>'revisionHash', 'urgent', false, 'adminMayDecide', false));
  d3 := (item->>'id')::uuid;
  result := public.claim_owner_decision(ws, d3, review->>'revisionHash', 'approve', 'owner_link', null, null, 'LP-Owner@example.test');
  perform pg_temp.fo_assert(result->>'status' = 'claimed', 'the trusted owner recipient claims');
  result := public.confirm_business_facts(ws, d3, review->>'revisionHash');
  perform pg_temp.fo_assert(result->>'replayed' = 'false' and result->>'decidedByKind' = 'owner_link', 'owner link decision is applied');
  perform pg_temp.fo_assert(result->'factKeys' @> '["description","display_name","email","hours","phone"]'::jsonb
    and (result->>'recordRevision')::bigint = (review->>'recordRevision')::bigint, 'the receipt names the confirmed facts and revision');
  hosted := public.read_hosted_website_business_facts(tenant);
  perform pg_temp.fo_assert(hosted->'facts'->>'phone' = '716-555-0199', 'approved operator phone is live');
  perform pg_temp.fo_assert(not (hosted->'facts' ? 'display_name'), 'approved deletion is live');
  perform pg_temp.fo_assert(hosted->'facts'->>'email' = 'admin@example.test' and hosted->'facts' ? 'hours', 'approved admin and agency facts are live');
  perform pg_temp.fo_assert(exists (select 1 from jsonb_array_elements(hosted->'services') s where s->>'name' = 'Agency cleaning' and s->>'priceText' = '$99'), 'approved agency service is live');
  perform pg_temp.fo_assert(public.read_connected_site_context(key)->'facts'->>'description' = 'Late agency copy.', 'approval reaches connected sites');
  perform pg_temp.fo_assert(public.read_business_fact_review(ws) is null, 'nothing waits after approval');
  perform pg_temp.fo_assert(not public.list_business_fact_review_workspaces(500) @> to_jsonb(array[ws]), 'nothing to chase after approval');
  perform pg_temp.fo_assert(public.confirm_business_facts(ws, d3, review->>'revisionHash')->>'replayed' = 'true', 'replay returns the first receipt');
  perform pg_temp.fo_error(format('update public.business_record_fact_confirmations set decided_by = %L where decision_id = %L', 'x', d3), 'business_record_history_immutable');
  perform pg_temp.fo_error(format('delete from public.business_record_fact_confirmations where decision_id = %L', d3), 'business_record_history_immutable');

  -- 6. A signed-in owner decides the same way; a demoted owner's decision no longer holds.
  perform public.patch_business_record(ws, agency_user, 'fo-agency@example.test', 'agency', rev,
    format('{"services":[{"op":"upsert","id":"%s","name":"Agency cleaning","priceText":"$120"}]}', service_id)::jsonb, gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  perform pg_temp.fo_assert(public.read_hosted_website_business_facts(tenant)->'services' @> '[{"name":"Agency cleaning","priceText":"$99"}]', 'agency price change waits');
  review := public.read_business_fact_review(ws);
  item := public.open_owner_decision(ws, jsonb_build_object('kind', 'fact.inferred', 'route', 'owner_decides', 'title', 'Confirm changes to your business details',
    'approveEffect', 'These details go live.', 'notYetEffect', 'Nothing changes.', 'sourceLifecycle', 'business_facts', 'sourceId', ws::text,
    'revisionHash', review->>'revisionHash', 'urgent', false, 'adminMayDecide', false));
  result := public.claim_owner_decision(ws, (item->>'id')::uuid, review->>'revisionHash', 'approve', 'session', owner_id, 'lp-owner@example.test', null);
  perform pg_temp.fo_assert(result->'item'->>'decidedByKind' = 'owner_session', 'owner session claims');
  update public.workspace_memberships set role = 'admin' where workspace_id = ws and user_id = owner_id;
  perform pg_temp.fo_error(format('select public.confirm_business_facts(%L,%L,%L)', ws, item->>'id', review->>'revisionHash'), 'business_facts_owner_approval_required');
  update public.workspace_memberships set role = 'owner' where workspace_id = ws and user_id = owner_id;
  perform public.confirm_business_facts(ws, (item->>'id')::uuid, review->>'revisionHash');
  perform pg_temp.fo_assert(public.read_hosted_website_business_facts(tenant)->'services' @> '[{"name":"Agency cleaning","priceText":"$120"}]', 'owner session approval is live');

  -- 7. An owner-confirmed recipient A stays the approver while a provider's
  -- change to B waits: delivery, claim and confirmation all trust A, and
  -- approving it makes B the owner's address.
  rev := (select revision from public.business_records where workspace_id = ws);
  perform public.patch_business_record(ws, owner_id, 'lp-owner@example.test', 'owner', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"fo-owner-a@example.test","name":"Owner A"}}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  perform pg_temp.fo_assert(public.resolve_business_owner_recipient(ws)->>'email' = 'fo-owner-a@example.test', 'the owner-written recipient is trusted at once');
  perform public.patch_business_record(ws, agency_user, 'fo-agency@example.test', 'agency', rev,
    '{"facts":{"owner_recipient":{"value":{"email":"fo-provider-b@example.test"}}}}', gen_random_uuid(), repeat('b', 64));
  rev := rev + 1;
  perform pg_temp.fo_assert(public.resolve_business_owner_recipient(ws) @> '{"email":"fo-owner-a@example.test","name":"Owner A","from":"record","trusted":true}',
    'delivery keeps the confirmed owner while the change waits');
  review := public.read_business_fact_review(ws);
  item := public.open_owner_decision(ws, jsonb_build_object('kind', 'fact.inferred', 'route', 'owner_decides', 'title', 'Confirm changes to your business details',
    'approveEffect', 'These details go live.', 'notYetEffect', 'Nothing changes.', 'sourceLifecycle', 'business_facts', 'sourceId', ws::text,
    'revisionHash', review->>'revisionHash', 'urgent', false, 'adminMayDecide', false));
  perform pg_temp.fo_assert((select d->'recipient'->>'email' from jsonb_array_elements(public.list_open_owner_decisions_for_delivery(500)) d
    where d->>'id' = item->>'id') = 'fo-owner-a@example.test', 'the item is emailed to A');
  perform pg_temp.fo_error(format('select public.claim_owner_decision(%L,%L,%L,%L,%L,null,null,%L)', ws, item->>'id', review->>'revisionHash', 'approve', 'owner_link', 'fo-provider-b@example.test'),
    'owner_decision_recipient_not_owner');
  result := public.claim_owner_decision(ws, (item->>'id')::uuid, review->>'revisionHash', 'approve', 'owner_link', null, null, 'fo-owner-a@example.test');
  perform pg_temp.fo_assert(result->>'status' = 'claimed', 'A claims without an account');
  result := public.confirm_business_facts(ws, (item->>'id')::uuid, review->>'revisionHash');
  perform pg_temp.fo_assert(result->'factKeys' = '["owner_recipient"]'::jsonb, 'A confirmed the recipient change');
  perform pg_temp.fo_assert(public.resolve_business_owner_recipient(ws)->>'email' = 'fo-provider-b@example.test', 'the approved recipient is the owner address now');
end $$;
rollback;

-- PostgREST runs STABLE functions READ ONLY: the lock-free readers work there,
-- and the reader whose actor check locks rows is VOLATILE.
do $$ begin
  if (select provolatile from pg_proc where oid = 'public.read_confirmed_business_facts(uuid,uuid,text)'::regprocedure) <> 'v' then
    raise exception 'facts owner decision: locking reader is volatile';
  end if;
end $$;
begin read only;
set local role service_role;
select public.read_business_fact_review('62000000-0000-4000-8000-000000000110') is not distinct from public.read_business_fact_review('62000000-0000-4000-8000-000000000110');
select public.read_hosted_website_business_facts('unrelated-site') is null;
rollback;
