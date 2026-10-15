\set ON_ERROR_STOP on
-- Events Apps receive (20261028100000-100100): per-business outbox, capture switch,
-- source triggers, delivery cursors, dead letters, replays, Webhook endpoints and the
-- coding-agent read. Fictional rows on a disposable cluster, inside one transaction.
begin;
create function pg_temp.ae_assert(ok boolean, note text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'app events assertion: %', note; end if; end $$;
create function pg_temp.ae_refuse(statement text, reason text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if position(reason in sqlerrm) = 0 then raise exception 'expected %, got % (%)', reason, sqlerrm, statement; end if;
    return;
  end;
  raise exception 'expected refusal %, succeeded: %', reason, statement;
end $$;
create function pg_temp.ae_keys(p jsonb) returns text language sql as $$
  select string_agg(k, ',' order by k) from jsonb_object_keys(p) k $$;
create function pg_temp.ae_count(ws uuid, t text) returns bigint language sql as $$
  select count(*) from public.app_events where workspace_id = ws and type = t $$;
create function pg_temp.ae_last(ws uuid, t text) returns public.app_events language sql as $$
  select e from public.app_events e where e.workspace_id = ws and e.type = t order by e.sequence desc limit 1 $$;

-- ---- (a) grants ----
select pg_temp.ae_assert(
  not has_table_privilege('service_role', 'public.app_events', 'select')
  and not has_table_privilege('service_role', 'public.app_event_cursors', 'select')
  and not has_table_privilege('service_role', 'public.app_event_webhook_endpoints', 'select')
  and not has_table_privilege('service_role', 'public.app_event_settings', 'select')
  and not has_table_privilege('service_role', 'public.app_event_dead_letters', 'select')
  and not has_table_privilege('authenticated', 'public.app_events', 'select'),
  'no table privilege for service_role on the outbox');
select pg_temp.ae_assert(
  not has_function_privilege('service_role', 'public.app_event_emit(uuid,text,text,text,text,jsonb,timestamptz,text)', 'execute')
  and not has_function_privilege('service_role', 'public.app_event_emit_safe(uuid,text,text,text,text,jsonb,timestamptz,text)', 'execute')
  and not has_function_privilege('service_role', 'public.app_event_actor_scope(uuid,uuid,text,uuid,boolean)', 'execute')
  and not has_function_privilege('service_role', 'public.app_event_webhook_allows(public.app_event_webhook_endpoints,public.app_events)', 'execute'),
  'internal helpers are not executable by service_role');
select pg_temp.ae_assert((
  select bool_and(has_function_privilege('service_role', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = any(array['app_event_recent_workspaces','app_event_ensure_cursors','app_event_active_webhook_endpoints',
    'app_event_claim_lanes','app_event_ack','app_event_fail','app_event_release','app_event_skip','app_event_disable_endpoint',
    'app_event_claim_replays','app_event_finish_replay','purge_app_events','app_event_health','read_app_event_capture',
    'set_app_event_capture','read_app_event_deliveries','read_operator_app_event_deliveries','retry_app_event_dead_letter',
    'operator_retry_app_event_dead_letter','create_app_event_webhook_endpoint','set_app_event_webhook_endpoint','agent_read_app_events'])
  ) and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname = any(array['app_event_recent_workspaces','app_event_ensure_cursors','app_event_active_webhook_endpoints',
    'app_event_claim_lanes','app_event_ack','app_event_fail','app_event_release','app_event_skip','app_event_disable_endpoint',
    'app_event_claim_replays','app_event_finish_replay','purge_app_events','app_event_health','read_app_event_capture',
    'set_app_event_capture','read_app_event_deliveries','read_operator_app_event_deliveries','retry_app_event_dead_letter',
    'operator_retry_app_event_dead_letter','create_app_event_webhook_endpoint','set_app_event_webhook_endpoint','agent_read_app_events'])) = 22,
  'every RPC is executable by service_role and by no one else');
select pg_temp.ae_assert('app_events' = any(public.workspace_release_flag_names()), '(k) app_events is a known release flag');
select pg_temp.ae_assert(not (select capture from public.app_event_settings), 'capture starts off');
select pg_temp.ae_assert((select provolatile = 'v' from pg_proc where oid = 'public.read_operator_app_event_deliveries(text,uuid)'::regprocedure),
  'the operator view is volatile: the operator check takes a row lock');

-- ---- seed ----
insert into public.users(id, email, verified_at) values
 ('28100000-0000-4000-8000-000000000001', 'ae-operator@example.test', now()),
 ('28100000-0000-4000-8000-000000000002', 'ae-owner@example.test', now()),
 ('28100000-0000-4000-8000-000000000003', 'ae-agency@example.test', now()),
 ('28100000-0000-4000-8000-000000000004', 'ae-staff@example.test', now()),
 ('28100000-0000-4000-8000-000000000005', 'ae-outsider@example.test', now()),
 ('28100000-0000-4000-8000-000000000006', 'ae-owner2@example.test', now()),
 ('28100000-0000-4000-8000-000000000007', 'ae-exited@example.test', now());
insert into public.super_admins(user_id, email) values ('28100000-0000-4000-8000-000000000001', 'ae-operator@example.test');
insert into public.workspaces(id, kind, name, created_by) values
 ('28100000-0000-4000-8000-000000000010', 'customer', 'Events client', '28100000-0000-4000-8000-000000000002'),
 ('28100000-0000-4000-8000-000000000011', 'customer', 'Second client', '28100000-0000-4000-8000-000000000006'),
 ('28100000-0000-4000-8000-000000000012', 'customer', 'Exited client', '28100000-0000-4000-8000-000000000007'),
 ('28100000-0000-4000-8000-000000000020', 'agency', 'Events agency', '28100000-0000-4000-8000-000000000003'),
 ('28100000-0000-4000-8000-000000000030', 'agency', 'Other agency', '28100000-0000-4000-8000-000000000005');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
 ('28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-000000000002', 'owner', '28100000-0000-4000-8000-000000000002'),
 ('28100000-0000-4000-8000-000000000011', '28100000-0000-4000-8000-000000000006', 'owner', '28100000-0000-4000-8000-000000000006'),
 ('28100000-0000-4000-8000-000000000012', '28100000-0000-4000-8000-000000000007', 'owner', '28100000-0000-4000-8000-000000000007'),
 ('28100000-0000-4000-8000-000000000020', '28100000-0000-4000-8000-000000000003', 'owner', '28100000-0000-4000-8000-000000000003'),
 ('28100000-0000-4000-8000-000000000020', '28100000-0000-4000-8000-000000000004', 'member', '28100000-0000-4000-8000-000000000003'),
 ('28100000-0000-4000-8000-000000000030', '28100000-0000-4000-8000-000000000005', 'owner', '28100000-0000-4000-8000-000000000005');
insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by) values
 ('28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-000000000020', 'owner', '28100000-0000-4000-8000-000000000002');
insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by) values
 ('28100000-0000-4000-8000-000000000020', '28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-000000000004', '28100000-0000-4000-8000-000000000003');
insert into public.workspace_exit_requests(workspace_id, requested_by, idempotency_key, command_digest, future_work, provider_participation,
    maintained_resource_action, state, completed_at)
  values ('28100000-0000-4000-8000-000000000012', '28100000-0000-4000-8000-000000000007', 'ae-exit', repeat('a', 64), 'pause', 'keep', 'stop',
    '{"status":"completed"}', now());
insert into public.tenants(id, site_name, stable_id, delivery_model) values
 ('ae-site', 'Events Site', '28100000-0000-4000-8000-0000000000a0', 'custom_repo'),
 ('ae-site-unlinked', 'Unlinked Site', '28100000-0000-4000-8000-0000000000a1', 'custom_repo');
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt)
  values ('28100000-0000-4000-8000-0000000000a0', 'ae-site', '28100000-0000-4000-8000-000000000010',
    '28100000-0000-4000-8000-000000000002', '28100000-0000-4000-8000-0000000000b0', repeat('c', 64), '{}');

-- ---- (b) capture off: nothing is written ----
insert into public.tenant_leads(tenant_stable_id, tenant_slug_at_capture, workspace_id, lead_id, submission_hash, name, email, message, source, captured_at, recorded_via)
  values ('28100000-0000-4000-8000-0000000000a0', 'ae-site', '28100000-0000-4000-8000-000000000010', 'lead_off', 'aaaa', 'Privacy Name', 'privacy@example.test', 'private message', 'contact', now(), 'dual_write');
select pg_temp.ae_assert((select count(*) from public.app_events) = 0, '(b) capture off writes no event');
select pg_temp.ae_assert((select count(*) from public.app_event_streams) = 0, '(b) capture off writes no stream');

-- ---- (c) capture on ----
set local role service_role;
select pg_temp.ae_refuse($$select public.set_app_event_capture('ae-owner@example.test', true, 'Not an operator')$$, 'workspace_release_operator_required');
select pg_temp.ae_refuse($$select public.set_app_event_capture('ae-operator@example.test', true, 'x')$$, 'app_events_invalid');
select public.set_app_event_capture('ae-operator@example.test', true, 'Fixture turns capture on');
reset role;
select pg_temp.ae_assert((select capture from public.app_event_settings), 'capture is on');
select pg_temp.ae_assert((select count(*) from public.app_event_capture_changes) = 1, 'one capture change row');
select pg_temp.ae_refuse($$update public.app_event_capture_changes set reason = 'edited reason'$$, 'app_event_history_immutable');

-- Inquiries: kept emits, held as spam does not, release emits once.
insert into public.tenant_leads(tenant_stable_id, tenant_slug_at_capture, workspace_id, lead_id, submission_hash, name, email, message, source, capability_id, capability_version, captured_at, recorded_via)
  values ('28100000-0000-4000-8000-0000000000a0', 'ae-site', '28100000-0000-4000-8000-000000000010', 'lead_one', 'bbbb', 'Privacy Name', 'privacy@example.test', 'private message', 'contact', 'contact_form', 2, now(), 'dual_write');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'inquiry.received') = 1, 'kept inquiry emits');
select pg_temp.ae_assert((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'inquiry.received')).subject_kind = 'inquiry'
  and (pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'inquiry.received')).subject_id = 'lead_one'
  and (pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'inquiry.received')).area = 'inquiries', 'inquiry subject and area');
select pg_temp.ae_assert(pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'inquiry.received')).payload)
  = 'capabilityId,capabilityVersion,capturedAt,channel,inquiryId,released,source', 'inquiry payload keys');
insert into public.tenant_leads(tenant_stable_id, tenant_slug_at_capture, workspace_id, lead_id, submission_hash, name, email, source, captured_at, recorded_via, intake_state, held_reason)
  values ('28100000-0000-4000-8000-0000000000a0', 'ae-site', '28100000-0000-4000-8000-000000000010', 'lead_spam', 'cccc', 'Spam Name', 'spam@example.test', 'contact', now(), 'spam_hold', 'held_as_spam', 'looks like spam');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'inquiry.received') = 1, 'held-as-spam insert emits nothing');
update public.tenant_leads set intake_state = 'released' where lead_id = 'lead_spam';
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'inquiry.received') = 2, 'release emits one');
select pg_temp.ae_assert((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'inquiry.received')).payload->>'released' = 'true', 'release is flagged');
update public.tenant_leads set intake_state = 'held_as_spam' where lead_id = 'lead_spam';
update public.tenant_leads set intake_state = 'released' where lead_id = 'lead_spam';
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'inquiry.received') = 2, 'the idempotency key prevents a second event for the same lead');

-- Bookings: made, changed, and none for a migration actor.
insert into public.business_bookings(id, calendar_key, workspace_id, status, origin, service_name_at_booking, start_at, end_at, block_end_at, time_zone,
    customer_name, customer_email, recorded_via, created_at)
  values ('28100000-0000-4000-8000-0000000000c1', '28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-000000000010', 'requested', 'site',
    'Consultation', now() + interval '2 days', now() + interval '2 days 30 minutes', now() + interval '2 days 30 minutes', 'America/New_York',
    'Private Customer', 'customer@example.test', 'native', now());
insert into public.business_booking_history(booking_id, actor, from_status, to_status) values ('28100000-0000-4000-8000-0000000000c1', 'visitor', null, 'requested');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'booking.made') = 1, 'booking.made');
select pg_temp.ae_assert(pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'booking.made')).payload)
  = 'actor,bookingId,endAt,fromStatus,origin,rescheduled,serviceName,startAt,systemId,timeZone,toStatus', 'booking payload keys');
select pg_temp.ae_assert((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'booking.made')).area = 'bookings', 'booking area');
insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason) values ('28100000-0000-4000-8000-0000000000c1', 'owner', 'requested', 'confirmed', 'Accepted');
insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason) values ('28100000-0000-4000-8000-0000000000c1', 'visitor', 'confirmed', 'confirmed', 'Customer rescheduled');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'booking.changed') = 2, 'booking.changed twice');
select pg_temp.ae_assert((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'booking.changed')).payload->>'rescheduled' = 'true', 'reschedule is flagged');
insert into public.business_booking_history(booking_id, actor, from_status, to_status) values ('28100000-0000-4000-8000-0000000000c1', 'migration', 'confirmed', 'completed');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'booking.changed') = 2, 'a migration actor emits nothing');

-- Business details: working copy, owner-confirmed copy, services.
insert into public.business_records(workspace_id, created_by, updated_by)
  values ('28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-000000000002', '28100000-0000-4000-8000-000000000002');
insert into public.business_record_facts(workspace_id, fact_key, value, source, verified, updated_by)
  values ('28100000-0000-4000-8000-000000000010', 'phone', '"+1 716 555 0100"', 'owner', true, '28100000-0000-4000-8000-000000000002');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'fact.changed') = 1, 'fact insert emits');
select pg_temp.ae_assert(pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'fact.changed')).payload)
  = 'change,entity,key,pendingOwner,source,verified', 'fact payload keys');
update public.business_record_facts set value = '"+1 716 555 0100"', updated_at = clock_timestamp() where fact_key = 'phone';
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'fact.changed') = 1, 'an identical value emits nothing');
update public.business_record_facts set value = '"+1 716 555 0199"' where fact_key = 'phone';
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'fact.changed') = 2, 'a changed value emits');
insert into public.business_services(id, workspace_id, name, duration_minutes, active, source, created_by, updated_by)
  values ('28100000-0000-4000-8000-0000000000d1', '28100000-0000-4000-8000-000000000010', 'Consultation', 30, true, 'owner',
    '28100000-0000-4000-8000-000000000002', '28100000-0000-4000-8000-000000000002');
select pg_temp.ae_assert(pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'fact.changed')).payload)
  = 'active,change,entity,serviceId,source,verified', 'service payload keys');
select pg_temp.ae_assert((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'fact.changed')).subject_kind = 'service', 'service subject kind');
insert into public.business_record_confirmed(workspace_id, entity, entity_id, state, confirmed_by_kind)
  values ('28100000-0000-4000-8000-000000000010', 'fact', 'phone', '{"value":"+1 716 555 0199"}', 'owner_write');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'fact.confirmed') = 1, 'fact.confirmed on insert');
select pg_temp.ae_assert(pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'fact.confirmed')).payload)
  = 'confirmedAt,confirmedByKind,decisionId,entity,entityId', 'confirmed payload keys');
update public.business_record_confirmed set state = state, confirmed_at = clock_timestamp() where entity_id = 'phone';
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'fact.confirmed') = 1, 'an unchanged state emits nothing');
-- Owner decisions confirm by DELETE then INSERT: the INSERT branch fires once per transaction.
delete from public.business_record_confirmed where entity = 'fact' and entity_id = 'phone';
insert into public.business_record_confirmed(workspace_id, entity, entity_id, state, confirmed_by_kind)
  values ('28100000-0000-4000-8000-000000000010', 'fact', 'phone', '{"value":"+1 716 555 0188"}', 'owner_write');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'fact.confirmed') = 1,
  'delete then insert in the same transaction is one event (same key)');

-- Releases and verified changes.
insert into public.systems(id, business_workspace_id, name, kind, command_id, command_digest, created_by, updated_by)
  values ('28100000-0000-4000-8000-0000000000e1', '28100000-0000-4000-8000-000000000010', 'Website', 'website',
    '28100000-0000-4000-8000-0000000000f1', repeat('a', 64), '28100000-0000-4000-8000-000000000002', '28100000-0000-4000-8000-000000000002');
insert into public.system_revisions(id, system_id, business_workspace_id, number, implementation, summary, command_id, command_digest, created_by)
  values ('28100000-0000-4000-8000-0000000000e2', '28100000-0000-4000-8000-0000000000e1', '28100000-0000-4000-8000-000000000010', 1,
    '{"kind":"website","ref":"ae-site"}', 'First website Release', '28100000-0000-4000-8000-0000000000f2', repeat('b', 64), '28100000-0000-4000-8000-000000000002');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'release.recorded') = 1, 'release.recorded');
select pg_temp.ae_assert((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'release.recorded')).area = 'website'
  and pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'release.recorded')).payload)
    = 'current,implementationKind,number,summary,systemId,systemKind', 'release payload and area');
insert into public.service_requests(id, business_workspace_id, status, request_text, outcome, context, scope, provider_kind, created_by) values
 ('28100000-0000-4000-8000-0000000000a2', '28100000-0000-4000-8000-000000000010', 'requested', 'A fictional menu', 'A fictional menu',
   '{"source":"website_change","systemId":"28100000-0000-4000-8000-0000000000e1"}', array['website.repo_change'], 'strelva', '28100000-0000-4000-8000-000000000002'),
 ('28100000-0000-4000-8000-0000000000a3', '28100000-0000-4000-8000-000000000010', 'requested', 'Another menu', 'Another menu',
   '{"source":"website_change","systemId":"28100000-0000-4000-8000-0000000000e1"}', array['website.repo_change'], 'strelva', '28100000-0000-4000-8000-000000000002');
insert into public.website_change_receipts(workspace_id, request_id, system_id, kind, commit_sha, deployment_url, read_back, recorded_by)
  values ('28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-0000000000a2', '28100000-0000-4000-8000-0000000000e1', 'deployed',
    'abcdef1', 'https://ae.example.test/', 'not_checked', '28100000-0000-4000-8000-000000000002');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'change.verified') = 0, 'a deploy that was not checked emits nothing');
insert into public.website_change_receipts(workspace_id, request_id, system_id, kind, commit_sha, deployment_url, read_back, recorded_by)
  values ('28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-0000000000a3', '28100000-0000-4000-8000-0000000000e1', 'deployed',
    'abcdef2', 'https://ae.example.test/', 'confirmed', '28100000-0000-4000-8000-000000000002');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'change.verified') = 1, 'a confirmed deploy emits');
select pg_temp.ae_assert(pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'change.verified')).payload)
  = 'commitSha,readBack,receiptId,releaseId,requestId,source,systemId', 'change.verified payload keys');
insert into public.website_code_releases(workspace_id, system_id, tenant_stable_id, request_key, commit_sha, deployment_url, read_back, summary, reported_by)
  values ('28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-0000000000e1', '28100000-0000-4000-8000-0000000000a0',
    '28100000-0000-4000-8000-0000000000a4', 'abcdef3', 'https://ae.example.test/', 'not_confirmed', 'Code Release', '28100000-0000-4000-8000-000000000002');
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'change.verified') = 2
  and (pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'change.verified')).payload->>'source' = 'website_code', 'a code Release emits');

-- Reviews: linked tenant emits; unlinked tenant does not; never text or author.
insert into public.reviews(tenant_id, source, author, rating, text, review_date)
  values ('ae-site', 'manual', 'Reviewer Name Secret', 5, 'Review text secret', now());
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'review.posted') = 1, 'review.posted for a linked tenant');
select pg_temp.ae_assert(pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'review.posted')).payload)
  = 'hasReply,rating,reviewId,source', 'review payload keys');
insert into public.reviews(tenant_id, source, author, rating, text, review_date)
  values ('ae-site-unlinked', 'manual', 'Reviewer Two', 4, 'Another review', now());
select pg_temp.ae_assert((select count(*) from public.app_events where type = 'review.posted') = 1, 'reviews for an unlinked tenant emit nothing');

-- Connections.
insert into public.workspace_account_bindings(id, workspace_id, provider, status, migrated_from)
  values ('28100000-0000-4000-8000-0000000000b1', '28100000-0000-4000-8000-000000000010', 'google', 'connected', 'oauth');
select pg_temp.ae_assert((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'connection.changed')).payload->>'change' = 'connected'
  and (pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'connection.changed')).area = 'google'
  and pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'connection.changed')).payload) = 'bindingId,change,provider,status',
  'binding connected');
update public.workspace_account_bindings set status = 'needs_reauth' where id = '28100000-0000-4000-8000-0000000000b1';
select pg_temp.ae_assert((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'connection.changed')).payload->>'change' = 'needs_reconnect', 'binding needs reconnect');
insert into public.connected_sites(id, business_workspace_id, public_key, label, site_url, site_host, allowed_origins, verification_token, created_by)
  values ('28100000-0000-4000-8000-0000000000b2', '28100000-0000-4000-8000-000000000010', 'sk_pub_' || repeat('a', 24), 'Site', 'https://ae.example.test',
    'ae.example.test', array['https://ae.example.test'], repeat('a', 32), '28100000-0000-4000-8000-000000000002');
update public.connected_sites set verified_at = now(), verified_by = '28100000-0000-4000-8000-000000000002' where id = '28100000-0000-4000-8000-0000000000b2';
select pg_temp.ae_assert((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'connection.changed')).payload->>'change' = 'verified'
  and pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'connection.changed')).payload) = 'change,connectedSiteId,provider,siteHost,status',
  'connected site verified');
insert into public.connection_holders(ref, provider, workspace_id, account_holder, access_through, recorded_by)
  values ('google_business_profile:ae-holder', 'google_business_profile', '28100000-0000-4000-8000-000000000010', '{"kind":"business","workspaceId":"28100000-0000-4000-8000-000000000010"}',
    '{"kind":"platform"}', '28100000-0000-4000-8000-000000000002');
select pg_temp.ae_assert(pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'connection.changed')).payload)
  = 'accessThroughKind,accountHolderKind,change,provider,ref'
  and (pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'connection.changed')).payload->>'accountHolderKind' = 'business'
  and (pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'connection.changed')).area = 'google', 'holder payload names kinds only');

-- Owner decisions: open to approved emits; open to expired does not.
insert into public.owner_decisions(id, workspace_id, system_id, change_kind, route, title, detail, approve_effect, not_yet_effect, source_lifecycle, source_id,
    revision_hash, sign_in_required, expires_at) values
 ('28100000-0000-4000-8000-0000000000aa', '28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-0000000000e1', 'system.go_live', 'owner_decides',
   'Make the website live', 'detail@example.test', 'Publish', 'Leave draft', 'system_release', 'ae-release-1', repeat('c', 64), false, now() + interval '1 day'),
 ('28100000-0000-4000-8000-0000000000ab', '28100000-0000-4000-8000-000000000010', '28100000-0000-4000-8000-0000000000e1', 'system.go_live', 'owner_decides',
   'Second go live', null, 'Publish', 'Leave draft', 'system_release', 'ae-release-2', repeat('d', 64), false, now() + interval '1 day');
update public.owner_decisions set state = 'expired', decided_at = now(), decided_by_kind = 'expiry' where id = '28100000-0000-4000-8000-0000000000ab';
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'owner.decided') = 0, 'open to expired emits nothing');
update public.owner_decisions set state = 'approved', decided_by_kind = 'owner_session', decided_by = 'ae-owner@example.test', decided_at = now()
  where id = '28100000-0000-4000-8000-0000000000aa';
select pg_temp.ae_assert(pg_temp.ae_count('28100000-0000-4000-8000-000000000010', 'owner.decided') = 1
  and pg_temp.ae_keys((pg_temp.ae_last('28100000-0000-4000-8000-000000000010', 'owner.decided')).payload)
    = 'changeKind,decidedByKind,decisionId,route,sourceLifecycle,state,systemId', 'owner.decided payload keys');

-- Sequence: contiguous per workspace, independent across workspaces.
select pg_temp.ae_assert((select count(*) = max(sequence) and min(sequence) = 1 from public.app_events where workspace_id = '28100000-0000-4000-8000-000000000010'),
  'sequence is contiguous from 1');
select pg_temp.ae_assert((select last_sequence from public.app_event_streams where workspace_id = '28100000-0000-4000-8000-000000000010')
  = (select max(sequence) from public.app_events where workspace_id = '28100000-0000-4000-8000-000000000010'), 'stream counter matches');
-- A second business: its own sequence starts at 1 (a lead for a workspace-owned connected site).
insert into public.connected_sites(id, business_workspace_id, public_key, label, site_url, site_host, allowed_origins, verification_token, created_by)
  values ('28100000-0000-4000-8000-0000000000b3', '28100000-0000-4000-8000-000000000011', 'sk_pub_' || repeat('b', 24), 'Site two', 'https://two.example.test',
    'two.example.test', array['https://two.example.test'], repeat('b', 32), '28100000-0000-4000-8000-000000000006');
select pg_temp.ae_assert((select min(sequence) = 1 and max(sequence) = 1 from public.app_events where workspace_id = '28100000-0000-4000-8000-000000000011'),
  'a second workspace has its own sequence');

-- No leaked field anywhere in any payload.
select pg_temp.ae_assert(not exists (select 1 from public.app_events where payload::text ~* 'privacy|private|secret|customer@example|detail@example|555|spam@|Make the website live|ae-owner@example'),
  'no customer name, email, phone, message, fact value, review text, author or decision title in any payload');

-- (d) A forced emit failure never fails the source write.
alter table public.app_events add constraint ae_test check (type <> 'review.posted') not valid;
insert into public.reviews(tenant_id, source, author, rating, text, review_date) values ('ae-site', 'manual', 'Reviewer Three', 3, 'Third review', now());
select pg_temp.ae_assert((select count(*) from public.reviews where author = 'Reviewer Three') = 1, '(d) the review row committed');
select pg_temp.ae_assert((select count(*) from public.app_event_emit_failures where type = 'review.posted') = 1, '(d) one emit failure recorded');
alter table public.app_events drop constraint ae_test;


-- ---- helpers for the delivery sections ----
create function pg_temp.ae_emit(ws uuid, t text, key text) returns uuid language sql as $$
  select public.app_event_emit(ws, t, case when t like 'booking.%' then 'booking' else 'inquiry' end, 'subject-' || key,
    case when t like 'booking.%' then 'bookings' when t = 'inquiry.received' then 'inquiries' else null end, '{"fixture":true}'::jsonb, null, key) $$;
create function pg_temp.ae_last_seq(ws uuid) returns bigint language sql as $$
  select last_sequence from public.app_event_streams where workspace_id = ws $$;

-- ---- (i, agency before any grant) the agent read follows the area grants ----
do $$
declare
  ws constant uuid := '28100000-0000-4000-8000-000000000010';
  agency constant uuid := '28100000-0000-4000-8000-000000000020';
  seat uuid; conn uuid; res constant text := 'https://strelva.example.test/api/mcp';
  owner_read jsonb; agency_read jsonb; paged jsonb; typed jsonb; seqs bigint[]; total bigint;
begin
  select id into seat from public.provider_seats where customer_workspace_id = ws and agency_workspace_id = agency and status = 'active';
  insert into public.assistant_connections(id, client_id, client_name, resource, scopes, workspace_id, user_id, verified_email, agency_id, seat_id)
    values ('28100000-0000-4000-8000-0000000000d1', 'client', 'Coding agent', res, array['business:read'], ws,
      '28100000-0000-4000-8000-000000000004', 'ae-staff@example.test', agency, seat) returning id into conn;
  insert into public.assistant_tokens(token_hash, client_id, resource, scopes, workspace_id, user_id, verified_email, agency_id, seat_id, connection_id)
    values (repeat('a', 64), 'client', res, array['business:read'], ws, '28100000-0000-4000-8000-000000000004', 'ae-staff@example.test', agency, seat, conn);
  insert into public.assistant_tokens(token_hash, client_id, resource, scopes, workspace_id, user_id, verified_email)
    values (repeat('b', 64), 'client', res, array['business:read'], ws, '28100000-0000-4000-8000-000000000002', 'ae-owner@example.test');
  insert into public.assistant_tokens(token_hash, client_id, resource, scopes, workspace_id, user_id, verified_email)
    values (repeat('c', 64), 'client', res, array['website:code'], ws, '28100000-0000-4000-8000-000000000002', 'ae-owner@example.test');

  owner_read := public.agent_read_app_events(repeat('b', 64), res, ws, 0, null, 100);
  total := pg_temp.ae_last_seq(ws);
  perform pg_temp.ae_assert((owner_read->>'lastSequence')::bigint = total and (owner_read->>'captureOn')::boolean, '(i) owner read reports the stream');
  select array_agg((e->>'sequence')::bigint order by ord) into seqs from jsonb_array_elements(owner_read->'events') with ordinality t(e, ord);
  perform pg_temp.ae_assert(seqs = (select array_agg(g::bigint) from generate_series(1, total::int) g) and (owner_read->>'nextAfter')::bigint = total,
    '(i) an owner token reads every type in order with nextAfter');
  perform pg_temp.ae_assert(not exists (select 1 from jsonb_array_elements(owner_read->'events') e where e ? 'allowed' or not (e ? 'data' and e ? 'subject')),
    '(i) events carry the thin shape and no delivery state');
  paged := public.agent_read_app_events(repeat('b', 64), res, ws, 3, null, 2);
  perform pg_temp.ae_assert(jsonb_array_length(paged->'events') = 2 and (paged->'events'->0->>'sequence') = '4' and (paged->>'nextAfter') = '5',
    '(i) after and limit page the read');
  typed := public.agent_read_app_events(repeat('b', 64), res, ws, 0, array['booking.made'], 100);
  perform pg_temp.ae_assert(jsonb_array_length(typed->'events') = 1 and typed->'events'->0->>'type' = 'booking.made', '(i) the type filter applies');
  agency_read := public.agent_read_app_events(repeat('a', 64), res, ws, 0, null, 100);
  perform pg_temp.ae_assert(not exists (select 1 from jsonb_array_elements(agency_read->'events') e where e->>'area' is not null)
    and exists (select 1 from jsonb_array_elements(agency_read->'events') e where e->>'type' = 'fact.changed')
    and jsonb_array_length(agency_read->'events') > 0,
    '(i) an agency token without a grant sees no area events, only area-free ones, and skipping them does not stop the read');
  perform pg_temp.ae_assert((agency_read->>'nextAfter')::bigint = total, '(i) the read scanned to the end');
  begin perform public.agent_read_app_events(repeat('c', 64), res, ws, 0, null, 10);
  exception when others then
    if position('oauth_invalid_token' in sqlerrm) = 0 then raise; end if;
    return;
  end;
  raise exception 'app events assertion: a token without business:read must be refused';
end $$;

-- ---- (e) delivery lifecycle: one session ----
do $$
declare
  ws constant uuid := '28100000-0000-4000-8000-000000000010';
  base bigint := pg_temp.ae_last_seq(ws);
  lanes jsonb; lane jsonb; tok uuid; ev3 uuid; ev2 uuid; res text; n int;
begin
  perform pg_temp.ae_assert(public.app_event_ensure_cursors(jsonb_build_array(jsonb_build_object('subscriber', 'app:bookings:test', 'workspaceId', ws))) = 1,
    '(e) ensure inserts one cursor');
  perform pg_temp.ae_assert(public.app_event_ensure_cursors(jsonb_build_array(jsonb_build_object('subscriber', 'app:bookings:test', 'workspaceId', ws))) = 0,
    '(e) ensure is idempotent');
  perform pg_temp.ae_assert((select delivered_through from public.app_event_cursors where subscriber = 'app:bookings:test') = base,
    '(e) a new cursor starts at the current end, so earlier events are excluded');
  begin perform public.app_event_ensure_cursors(jsonb_build_array(jsonb_build_object('subscriber', 'webhook:x', 'workspaceId', ws)));
    raise exception 'app events assertion: ensure must refuse webhook subscribers';
  exception when others then if position('app_events_invalid' in sqlerrm) = 0 then raise; end if; end;
  perform pg_temp.ae_emit(ws, 'booking.made', 'lc-1');
  perform pg_temp.ae_emit(ws, 'booking.changed', 'lc-2');
  perform pg_temp.ae_emit(ws, 'booking.changed', 'lc-3');
  lanes := public.app_event_claim_lanes(array['app:bookings:test'], 10, 60, 10);
  perform pg_temp.ae_assert(jsonb_array_length(lanes) = 1 and jsonb_array_length(lanes->0->'events') = 3, '(e) claim returns the 3 events');
  perform pg_temp.ae_assert((lanes->0->'events'->0->>'sequence')::bigint = base + 1 and (lanes->0->'events'->2->>'sequence')::bigint = base + 3
    and (lanes->0->'events'->0->>'allowed')::boolean, '(e) in order, allowed for an App');
  tok := (lanes->0->>'leaseToken')::uuid;
  perform pg_temp.ae_assert(jsonb_array_length(public.app_event_claim_lanes(array['app:bookings:test'], 10, 60, 10)) = 0, '(e) a leased lane is not claimed twice');
  perform pg_temp.ae_assert(public.app_event_ack('app:bookings:test', ws, tok, base + 1), '(e) ack with the lease');
  perform pg_temp.ae_assert(not public.app_event_ack('app:bookings:test', ws, gen_random_uuid(), base + 2), '(e) ack with a wrong token is false');
  select id into ev2 from public.app_events where workspace_id = ws and sequence = base + 2;
  perform pg_temp.ae_assert(public.app_event_fail('app:bookings:test', ws, tok, ev2, 'handler failed', false, 8, 60) = 'retry', '(e) fail retries');
  perform pg_temp.ae_assert((select attempts = 1 and next_attempt_at > clock_timestamp() and lease_token is null
    from public.app_event_cursors where subscriber = 'app:bookings:test'), '(e) attempts 1, next attempt in the future, lease released');
  perform pg_temp.ae_assert(jsonb_array_length(public.app_event_claim_lanes(array['app:bookings:test'], 10, 60, 10)) = 0, '(e) nothing before next_attempt_at');
  update public.app_event_cursors set next_attempt_at = clock_timestamp() - interval '1 second' where subscriber = 'app:bookings:test';
  lanes := public.app_event_claim_lanes(array['app:bookings:test'], 10, 60, 10);
  perform pg_temp.ae_assert(jsonb_array_length(lanes->0->'events') = 2 and (lanes->0->'events'->0->>'sequence')::bigint = base + 2
    and (lanes->0->>'attempts')::int = 1, '(e) the lane resumes at the failed event');
  tok := (lanes->0->>'leaseToken')::uuid;
  perform pg_temp.ae_assert(public.app_event_fail('app:bookings:test', ws, tok, ev2, 'handler failed again', false, 2, 60) = 'dead', '(e) the second failure at max 2 is dead');
  perform pg_temp.ae_assert((select count(*) = 1 from public.app_event_dead_letters where subscriber = 'app:bookings:test' and event_id = ev2 and sequence = base + 2),
    '(e) a dead letter snapshot exists');
  perform pg_temp.ae_assert((select delivered_through = base + 2 and attempts = 0 from public.app_event_cursors where subscriber = 'app:bookings:test'),
    '(e) the cursor advances past the dead event');
  lanes := public.app_event_claim_lanes(array['app:bookings:test'], 10, 60, 10);
  perform pg_temp.ae_assert(jsonb_array_length(lanes->0->'events') = 1 and (lanes->0->'events'->0->>'sequence')::bigint = base + 3, '(e) the next event follows the dead one');
  tok := (lanes->0->>'leaseToken')::uuid;
  perform pg_temp.ae_assert(public.app_event_skip('app:bookings:test', ws, tok) = pg_temp.ae_last_seq(ws), '(e) skip returns the end');
  perform pg_temp.ae_assert((select delivered_through = pg_temp.ae_last_seq(ws) and lease_token is null from public.app_event_cursors where subscriber = 'app:bookings:test'),
    '(e) skip moves the cursor to the end');
  perform pg_temp.ae_assert(jsonb_array_length(public.app_event_claim_lanes(array['app:bookings:test'], 10, 60, 10)) = 0, '(e) a caught-up lane is not claimed');
  -- All events purged out from under a lane: it catches up without a claim.
  perform pg_temp.ae_emit(ws, 'booking.changed', 'lc-4');
  delete from public.app_events where workspace_id = ws and idempotency_key = 'lc-4';
  lanes := public.app_event_claim_lanes(array['app:bookings:test'], 10, 60, 10);
  perform pg_temp.ae_assert(jsonb_array_length(lanes) = 0, '(e) a lane whose events were all purged is not claimed');
  perform pg_temp.ae_assert((select delivered_through = pg_temp.ae_last_seq(ws) from public.app_event_cursors where subscriber = 'app:bookings:test'),
    '(e) a lane whose events were all purged catches up');
  begin perform public.app_event_claim_lanes(array['app:bookings:test'], 0, 60, 10);
    raise exception 'app events assertion: claim must validate its limits';
  exception when others then if position('app_events_invalid' in sqlerrm) = 0 then raise; end if; end;
end $$;

-- ---- (f) replay ----
do $$
declare
  ws constant uuid := '28100000-0000-4000-8000-000000000010';
  dl uuid; claimed jsonb; view jsonb;
begin
  select id into dl from public.app_event_dead_letters where subscriber = 'app:bookings:test';
  view := public.retry_app_event_dead_letter('28100000-0000-4000-8000-000000000002', 'ae-owner@example.test', ws, null, dl);
  perform pg_temp.ae_assert((select replay_requested_at is not null from public.app_event_dead_letters where id = dl), '(f) retry requests a replay');
  perform pg_temp.ae_assert(view->'viewer'->>'kind' = 'business' and jsonb_array_length(view->'deadLetters') = 1, '(f) retry returns the deliveries view');
  claimed := public.app_event_claim_replays(10, 60);
  perform pg_temp.ae_assert(jsonb_array_length(claimed) = 1 and (claimed->0->>'allowed')::boolean and claimed->0->'event'->>'type' = 'booking.changed'
    and claimed->0->'event'->'data' = '{"fixture": true}'::jsonb, '(f) claim_replays returns the snapshot');
  perform pg_temp.ae_assert(jsonb_array_length(public.app_event_claim_replays(10, 60)) = 0, '(f) a leased replay is not claimed twice');
  perform public.app_event_finish_replay(dl, (claimed->0->>'leaseToken')::uuid, true, null);
  perform pg_temp.ae_assert((select replay_outcome = 'delivered' and replayed_at is not null from public.app_event_dead_letters where id = dl), '(f) delivered');
  perform pg_temp.ae_refuse(format($q$select public.retry_app_event_dead_letter('28100000-0000-4000-8000-000000000002', 'ae-owner@example.test', %L, null, %L)$q$, ws, dl),
    'app_event_already_delivered');
end $$;

-- ---- (g) scope ----
do $$
declare
  ws constant uuid := '28100000-0000-4000-8000-000000000010';
  agency constant uuid := '28100000-0000-4000-8000-000000000020';
  dl uuid; v jsonb;
begin
  select id into dl from public.app_event_dead_letters limit 1;
  v := public.read_app_event_deliveries('28100000-0000-4000-8000-000000000002', 'ae-owner@example.test', ws, null);
  perform pg_temp.ae_assert(v->'viewer' = '{"kind": "business", "canChange": true}'::jsonb and (v->>'captureOn')::boolean and jsonb_array_length(v->'counts') > 0
    and (v->'stream'->>'lastSequence')::bigint = pg_temp.ae_last_seq(ws) and v::text not like '%enc:v1%', '(g) the owner reads deliveries');
  v := public.read_app_event_deliveries('28100000-0000-4000-8000-000000000003', 'ae-agency@example.test', ws, agency);
  perform pg_temp.ae_assert(v->'viewer' = '{"kind": "agency", "canChange": true}'::jsonb, '(g) an agency owner reads');
  v := public.read_app_event_deliveries('28100000-0000-4000-8000-000000000004', 'ae-staff@example.test', ws, agency);
  perform pg_temp.ae_assert(v->'viewer' = '{"kind": "agency", "canChange": false}'::jsonb, '(g) assigned staff read');
  perform pg_temp.ae_refuse(format($q$select public.retry_app_event_dead_letter('28100000-0000-4000-8000-000000000004', 'ae-staff@example.test', %L, %L, %L)$q$, ws, agency, dl),
    'workspace_access_denied');
  perform pg_temp.ae_refuse(format($q$select public.read_app_event_deliveries('28100000-0000-4000-8000-000000000005', 'ae-outsider@example.test', %L, null)$q$, ws), 'workspace_access_denied');
  perform pg_temp.ae_refuse(format($q$select public.read_app_event_deliveries('28100000-0000-4000-8000-000000000005', 'ae-outsider@example.test', %L, '28100000-0000-4000-8000-000000000030')$q$, ws),
    'workspace_access_denied');
  perform pg_temp.ae_refuse(format($q$select public.read_app_event_deliveries('28100000-0000-4000-8000-000000000002', 'wrong@example.test', %L, null)$q$, ws), 'workspace_access_denied');
  perform pg_temp.ae_refuse($q$select public.read_app_event_deliveries('28100000-0000-4000-8000-000000000007', 'ae-exited@example.test', '28100000-0000-4000-8000-000000000012', null)$q$,
    'workspace_access_denied');
  perform pg_temp.ae_refuse(format($q$select public.read_app_event_deliveries('28100000-0000-4000-8000-000000000002', 'ae-owner@example.test', %L, null)$q$, agency),
    'workspace_access_denied');
  -- Operators.
  v := public.read_operator_app_event_deliveries('ae-operator@example.test', ws);
  perform pg_temp.ae_assert(v->'viewer' = '{"kind": "operator", "canChange": true}'::jsonb, '(g) operator view');
  perform pg_temp.ae_refuse(format($q$select public.read_operator_app_event_deliveries('ae-owner@example.test', %L)$q$, ws), 'workspace_release_operator_required');
  perform pg_temp.ae_refuse(format($q$select public.operator_retry_app_event_dead_letter('ae-operator@example.test', %L)$q$, dl), 'app_event_already_delivered');
end $$;

-- ---- (h) Webhooks ----
do $$
declare
  ws constant uuid := '28100000-0000-4000-8000-000000000010';
  agency constant uuid := '28100000-0000-4000-8000-000000000020';
  agency_owner constant uuid := '28100000-0000-4000-8000-000000000003';
  ep jsonb; e1 uuid; e2 uuid; lanes jsonb; tok uuid; before_seq bigint; i int; v jsonb;
begin
  perform pg_temp.ae_refuse(format($q$select public.create_app_event_webhook_endpoint(%L, 'ae-agency@example.test', %L, %L, 'https://maker.example.test/events', array['booking.made'], 'enc:v1:abcdef', 'wxyz')$q$,
    agency_owner, ws, agency), 'app_event_area_not_granted');
  insert into public.agency_scope_grants(customer_workspace_id, agency_workspace_id, scope, level, status, consent, proposed_by, responded_by, responded_at) values
    (ws, agency, 'bookings', 'full_control', 'active', 'Fictional bookings permission', '28100000-0000-4000-8000-000000000002', '28100000-0000-4000-8000-000000000002', now()),
    (ws, agency, 'inquiries', 'full_control', 'active', 'Fictional inquiries permission', '28100000-0000-4000-8000-000000000002', '28100000-0000-4000-8000-000000000002', now());
  before_seq := pg_temp.ae_last_seq(ws);
  ep := public.create_app_event_webhook_endpoint(agency_owner, 'ae-agency@example.test', ws, agency, 'https://maker.example.test/events',
    array['inquiry.received', 'booking.made', 'booking.made'], 'enc:v1:abcdef', 'wxyz');
  e1 := (ep->>'id')::uuid;
  perform pg_temp.ae_assert(ep->>'status' = 'active' and ep->>'createdByKind' = 'agency' and ep->>'agencyName' = 'Events agency'
    and ep->'eventTypes' = '["booking.made", "inquiry.received"]'::jsonb and not (ep ? 'secretCiphertext') and ep::text not like '%enc:v1%', '(h) created, types sorted and deduplicated, no secret returned');
  perform pg_temp.ae_assert((select delivered_through = before_seq from public.app_event_cursors where subscriber = 'webhook:' || e1::text and workspace_id = ws),
    '(h) the cursor starts at the stream end');
  perform pg_temp.ae_assert((select count(*) = 1 from public.app_event_webhook_endpoint_changes where endpoint_id = e1 and action = 'created' and actor_kind = 'agency'), '(h) a created change row');
  perform pg_temp.ae_refuse(format($q$select public.create_app_event_webhook_endpoint(%L, 'ae-agency@example.test', %L, %L, 'http://x', array['booking.made'], 'enc:v1:abcdef', 'wxyz')$q$,
    agency_owner, ws, agency), 'app_event_webhook_endpoints_url_check');
  for i in 2..5 loop
    ep := public.create_app_event_webhook_endpoint(agency_owner, 'ae-agency@example.test', ws, agency, 'https://maker' || i || '.example.test/events',
      array['booking.made'], 'enc:v1:abcdef', 'wxyz');
    if i = 2 then e2 := (ep->>'id')::uuid; end if;
  end loop;
  perform pg_temp.ae_refuse(format($q$select public.create_app_event_webhook_endpoint(%L, 'ae-agency@example.test', %L, %L, 'https://maker6.example.test/events', array['booking.made'], 'enc:v1:abcdef', 'wxyz')$q$,
    agency_owner, ws, agency), 'app_event_endpoint_limit');
  perform pg_temp.ae_refuse(format($q$select public.create_app_event_webhook_endpoint(%L, 'ae-agency@example.test', %L, %L, 'https://m.example.test/', array['not.a.type'], 'enc:v1:abcdef', 'wxyz')$q$,
    agency_owner, ws, agency), 'app_event_endpoint_invalid');
  perform pg_temp.ae_refuse(format($q$select public.create_app_event_webhook_endpoint('28100000-0000-4000-8000-000000000004', 'ae-staff@example.test', %L, %L, 'https://m.example.test/', array['booking.made'], 'enc:v1:abcdef', 'wxyz')$q$,
    ws, agency), 'workspace_access_denied');
  -- The business owner has its own five.
  ep := public.create_app_event_webhook_endpoint('28100000-0000-4000-8000-000000000002', 'ae-owner@example.test', ws, null, 'https://own.example.test/events',
    array['fact.changed'], 'enc:v1:ownown', 'ownn');
  perform pg_temp.ae_assert(ep->>'createdByKind' = 'business' and ep->>'agencyName' is null, '(h) the business owner creates its own Webhook');
  -- The agency sees only its own endpoints; the owner sees every one.
  v := public.read_app_event_deliveries('28100000-0000-4000-8000-000000000003', 'ae-agency@example.test', ws, agency);
  perform pg_temp.ae_assert(jsonb_array_length(v->'endpoints') = 5 and not exists (select 1 from jsonb_array_elements(v->'endpoints') x where x->>'createdByKind' = 'business'),
    '(g) an agency sees only its own endpoints');
  perform pg_temp.ae_assert(not exists (select 1 from jsonb_array_elements(v->'lanes') x where (x->>'subscriber') like 'webhook:%' and not exists (
    select 1 from jsonb_array_elements(v->'endpoints') y where 'webhook:' || (y->>'id') = x->>'subscriber')), '(g) an agency sees only its own Webhook lanes');
  v := public.read_app_event_deliveries('28100000-0000-4000-8000-000000000002', 'ae-owner@example.test', ws, null);
  perform pg_temp.ae_assert(jsonb_array_length(v->'endpoints') = 6, '(g) the owner sees every endpoint');
  -- Delivery: allowed follows the endpoint types and the live grants.
  perform pg_temp.ae_emit(ws, 'booking.made', 'wh-1');
  perform pg_temp.ae_emit(ws, 'inquiry.received', 'wh-2');
  lanes := public.app_event_claim_lanes(array['webhook:' || e1::text], 10, 60, 10);
  perform pg_temp.ae_assert(jsonb_array_length(lanes) = 1 and jsonb_array_length(lanes->0->'events') = 2
    and (lanes->0->'events'->0->>'allowed')::boolean and (lanes->0->'events'->1->>'allowed')::boolean, '(h) both events are allowed while the grants hold');
  perform public.app_event_release('webhook:' || e1::text, ws, (lanes->0->>'leaseToken')::uuid);
  update public.agency_scope_grants set status = 'ended', ended_by = '28100000-0000-4000-8000-000000000002', ended_at = clock_timestamp()
    where customer_workspace_id = ws and agency_workspace_id = agency and scope = 'inquiries';
  lanes := public.app_event_claim_lanes(array['webhook:' || e1::text], 10, 60, 10);
  perform pg_temp.ae_assert((lanes->0->'events'->0->>'allowed')::boolean and not (lanes->0->'events'->1->>'allowed')::boolean,
    '(h) allowed is false for inquiry events once that grant ends');
  perform public.app_event_release('webhook:' || e1::text, ws, (lanes->0->>'leaseToken')::uuid);
  -- Pause, resume and rotate; a paused endpoint is not claimed.
  ep := public.set_app_event_webhook_endpoint(agency_owner, 'ae-agency@example.test', ws, agency, e1, 'paused', null, null);
  perform pg_temp.ae_assert(ep->>'status' = 'paused', '(h) paused');
  perform pg_temp.ae_assert(jsonb_array_length(public.app_event_claim_lanes(array['webhook:' || e1::text], 10, 60, 10)) = 0, '(h) a paused endpoint is not claimed');
  perform pg_temp.ae_emit(ws, 'booking.made', 'wh-3');
  ep := public.set_app_event_webhook_endpoint(agency_owner, 'ae-agency@example.test', ws, agency, e1, 'active', null, null);
  perform pg_temp.ae_assert(ep->>'status' = 'active' and jsonb_array_length(public.app_event_claim_lanes(array['webhook:' || e1::text], 10, 60, 10)) = 0,
    '(h) resuming never replays what happened while paused');
  ep := public.set_app_event_webhook_endpoint(agency_owner, 'ae-agency@example.test', ws, agency, e1, null, 'enc:v1:rotated', 'rotd');
  perform pg_temp.ae_assert(ep->>'secretHint' = 'rotd' and (select secret_ciphertext = 'enc:v1:rotated' from public.app_event_webhook_endpoints where id = e1), '(h) rotated');
  perform pg_temp.ae_refuse(format($q$select public.set_app_event_webhook_endpoint(%L, 'ae-agency@example.test', %L, %L, %L, null, null, null)$q$, agency_owner, ws, agency, e1),
    'app_event_endpoint_invalid');
  -- An agency cannot touch the owner's endpoint; the owner can touch the agency's.
  perform pg_temp.ae_refuse(format($q$select public.set_app_event_webhook_endpoint(%L, 'ae-agency@example.test', %L, %L, %L, 'paused', null, null)$q$,
    agency_owner, ws, agency, (select id from public.app_event_webhook_endpoints where created_by_kind = 'business')), 'workspace_access_denied');
  ep := public.set_app_event_webhook_endpoint('28100000-0000-4000-8000-000000000002', 'ae-owner@example.test', ws, null, e2, 'disabled', null, null);
  perform pg_temp.ae_assert(ep->>'status' = 'disabled' and ep->>'disabledReason' = 'by_person', '(h) the owner turns off an agency Webhook');
  perform pg_temp.ae_refuse(format($q$select public.set_app_event_webhook_endpoint(%L, 'ae-agency@example.test', %L, %L, %L, 'active', null, null)$q$, agency_owner, ws, agency, e2),
    'app_event_endpoint_disabled');
  -- The cron disables an endpoint that answered 410.
  perform public.app_event_disable_endpoint(e1, 'gone');
  perform pg_temp.ae_assert((select status = 'disabled' and disabled_reason = 'gone' from public.app_event_webhook_endpoints where id = e1)
    and (select count(*) = 1 from public.app_event_webhook_endpoint_changes where endpoint_id = e1 and action = 'auto_disabled' and actor_kind = 'system'),
    '(h) disable_endpoint writes an auto_disabled change row');
  perform pg_temp.ae_refuse(format($q$select public.set_app_event_webhook_endpoint(%L, 'ae-agency@example.test', %L, %L, %L, 'active', null, null)$q$, agency_owner, ws, agency, e1),
    'app_event_endpoint_disabled');
  perform pg_temp.ae_refuse(format($q$update public.app_event_webhook_endpoint_changes set action = 'paused' where endpoint_id = %L$q$, e1), 'app_event_history_immutable');
  perform pg_temp.ae_assert(jsonb_array_length(public.app_event_active_webhook_endpoints(100)) = (select count(*) from public.app_event_webhook_endpoints where status = 'active')
    and (public.app_event_active_webhook_endpoints(100)->0 ? 'secretCiphertext'), '(h) the dispatcher list is active endpoints with their sealed secret');
end $$;

-- ---- (i, agency after the grant) booking events become visible ----
do $$
declare ws constant uuid := '28100000-0000-4000-8000-000000000010'; res constant text := 'https://strelva.example.test/api/mcp'; r jsonb;
begin
  r := public.agent_read_app_events(repeat('a', 64), res, ws, 0, null, 100);
  perform pg_temp.ae_assert(exists (select 1 from jsonb_array_elements(r->'events') e where e->>'type' = 'booking.made')
    and not exists (select 1 from jsonb_array_elements(r->'events') e where e->>'area' = 'inquiries'),
    '(i) an agency token with the bookings grant sees booking events and not inquiries');
end $$;

-- ---- (h, the seat ends) allowed turns false ----
do $$
declare
  ws constant uuid := '28100000-0000-4000-8000-000000000010';
  agency constant uuid := '28100000-0000-4000-8000-000000000020';
  ep jsonb; e3 uuid; lanes jsonb;
begin
  select id into e3 from public.app_event_webhook_endpoints where agency_workspace_id = agency and status = 'active' limit 1;
  perform pg_temp.ae_emit(ws, 'booking.made', 'wh-4');
  update public.app_event_cursors set delivered_through = pg_temp.ae_last_seq(ws) - 1 where subscriber = 'webhook:' || e3::text;
  lanes := public.app_event_claim_lanes(array['webhook:' || e3::text], 10, 60, 10);
  perform pg_temp.ae_assert((lanes->0->'events'->0->>'allowed')::boolean, '(h) allowed while the seat is active');
  perform public.app_event_release('webhook:' || e3::text, ws, (lanes->0->>'leaseToken')::uuid);
  update public.provider_seats set status = 'ended', ended_by = '28100000-0000-4000-8000-000000000002', ended_at = clock_timestamp()
    where customer_workspace_id = ws and agency_workspace_id = agency;
  lanes := public.app_event_claim_lanes(array['webhook:' || e3::text], 10, 60, 10);
  perform pg_temp.ae_assert(not (lanes->0->'events'->0->>'allowed')::boolean, '(h) after the seat ends, allowed is false');
  perform pg_temp.ae_refuse(format($q$select public.read_app_event_deliveries('28100000-0000-4000-8000-000000000003', 'ae-agency@example.test', %L, %L)$q$, ws, agency),
    'workspace_access_denied');
end $$;

-- ---- health and the cron's list ----
select pg_temp.ae_assert((public.app_event_health() ? 'lanesBehind') and (public.app_event_health()->>'captureOn')::boolean
  and (public.app_event_health()->>'emitFailuresLast24h')::int = 1 and (public.app_event_health()->>'deadLast24h')::int = 1,
  'health counts the failure and the dead letter');
select pg_temp.ae_assert(public.app_event_recent_workspaces(10) @> array['28100000-0000-4000-8000-000000000010'::uuid, '28100000-0000-4000-8000-000000000011'::uuid],
  'recent workspaces lists both businesses');

-- ---- (j) purge ----
update public.app_events set recorded_at = clock_timestamp() - interval '31 days'
  where workspace_id = '28100000-0000-4000-8000-000000000010' and sequence in (1, 2);
update public.app_event_emit_failures set at = clock_timestamp() - interval '31 days';
select pg_temp.ae_assert(public.purge_app_events(500) = '{"events": 2, "deadLetters": 0, "failures": 1}'::jsonb, '(j) purge removes exactly the old rows');
select pg_temp.ae_assert((select count(*) = 1 from public.app_event_dead_letters), '(j) the dead letter remains after its event was purged');
select pg_temp.ae_assert((select count(*) from public.app_events where sequence in (1, 2) and workspace_id = '28100000-0000-4000-8000-000000000010') = 0, '(j) the events are gone');

\if :{?keep_fixture}
commit;
\else
rollback;
\endif
