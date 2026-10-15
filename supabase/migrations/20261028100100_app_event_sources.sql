-- Emit Events from the write paths that already exist. AFTER triggers on the tables
-- every writer lands in, so no call site changes. Each trigger does nothing while
-- the capture switch (app_event_settings.capture) is off, and its only side effect
-- is app_event_emit_safe, which can never fail the source write. Payloads carry ids,
-- kinds, times and statuses: no customer names, emails, phones, messages, fact
-- values, or Google review text.
begin;
set local lock_timeout = '3s';

-- 1. Inquiries (form, connected site, agent, forwarding, repair, release from spam hold).
create function public.app_event_from_tenant_leads() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not public.app_event_capture_on() then return null; end if;
  if new.workspace_id is null then return null; end if;
  if not ((TG_OP = 'INSERT' and new.intake_state = 'kept' and new.recorded_via <> 'backfill')
    or (TG_OP = 'UPDATE' and old.intake_state = 'held_as_spam' and new.intake_state = 'released')) then
    return null;
  end if;
  perform public.app_event_emit_safe(new.workspace_id, 'inquiry.received', 'inquiry', new.lead_id, 'inquiries',
    jsonb_build_object('inquiryId', new.lead_id, 'channel', new.recorded_via, 'source', new.source,
      'capabilityId', new.capability_id, 'capabilityVersion', new.capability_version,
      'capturedAt', new.captured_at, 'released', TG_OP = 'UPDATE'),
    new.captured_at, 'lead:' || new.id::text);
  return null;
end;
$$;
create trigger app_event_tenant_leads_trg after insert or update of intake_state on public.tenant_leads
  for each row execute function public.app_event_from_tenant_leads();

-- 2. Bookings: every status change and reschedule lands in the history.
create function public.app_event_from_booking_history() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare b public.business_bookings;
begin
  if not public.app_event_capture_on() then return null; end if;
  if new.actor = 'migration' then return null; end if;
  select * into b from public.business_bookings x where x.id = new.booking_id;
  if not found or b.workspace_id is null or b.recorded_via = 'backfill' then return null; end if;
  perform public.app_event_emit_safe(b.workspace_id,
    case when new.from_status is null then 'booking.made' else 'booking.changed' end,
    'booking', b.id::text, 'bookings',
    jsonb_build_object('bookingId', b.id, 'systemId', b.system_id, 'origin', b.origin,
      'fromStatus', new.from_status, 'toStatus', new.to_status, 'actor', new.actor,
      'rescheduled', coalesce(new.reason = 'Customer rescheduled', false), 'startAt', b.start_at, 'endAt', b.end_at,
      'timeZone', b.time_zone, 'serviceName', b.service_name_at_booking),
    new.at, 'booking_history:' || new.id::text);
  return null;
end;
$$;
create trigger app_event_booking_history_trg after insert on public.business_booking_history
  for each row execute function public.app_event_from_booking_history();

-- 3. Business details (the working copy). The value is never copied: owner_recipient
-- and phone live here. Every write except an owner's own is pending, so pendingOwner
-- is always true; fact.confirmed reports the confirmation.
create function public.app_event_from_business_record_facts() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.business_record_facts;
begin
  if not public.app_event_capture_on() then return null; end if;
  if TG_OP = 'DELETE' then r := old; else r := new; end if;
  if TG_OP = 'UPDATE' and (old.value, old.source, old.verified) is not distinct from (new.value, new.source, new.verified) then
    return null;
  end if;
  perform public.app_event_emit_safe(r.workspace_id, 'fact.changed', 'fact', r.fact_key, null,
    jsonb_build_object('entity', 'fact', 'key', r.fact_key,
      'change', case TG_OP when 'INSERT' then 'added' when 'UPDATE' then 'updated' else 'removed' end,
      'source', r.source, 'verified', case when TG_OP = 'DELETE' then false else r.verified end, 'pendingOwner', true),
    null, 'fact:' || r.fact_key || ':' || txid_current()::text || ':' || TG_OP);
  return null;
end;
$$;
create trigger app_event_business_record_facts_trg after insert or update or delete on public.business_record_facts
  for each row execute function public.app_event_from_business_record_facts();

create function public.app_event_from_business_services() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.business_services;
begin
  if not public.app_event_capture_on() then return null; end if;
  if TG_OP = 'DELETE' then r := old; else r := new; end if;
  if TG_OP = 'UPDATE' and (to_jsonb(old) - 'updated_at' - 'updated_by') = (to_jsonb(new) - 'updated_at' - 'updated_by') then
    return null;
  end if;
  perform public.app_event_emit_safe(r.workspace_id, 'fact.changed', 'service', r.id::text, null,
    jsonb_build_object('entity', 'service', 'serviceId', r.id,
      'change', case TG_OP when 'INSERT' then 'added' when 'UPDATE' then 'updated' else 'removed' end,
      'source', r.source, 'verified', case when TG_OP = 'DELETE' then false else r.verified end, 'active', r.active),
    null, 'service:' || r.id::text || ':' || txid_current()::text || ':' || TG_OP);
  return null;
end;
$$;
create trigger app_event_business_services_trg after insert or update or delete on public.business_services
  for each row execute function public.app_event_from_business_services();

-- 5. Business details the owner confirmed. Owner decisions confirm by DELETE then
-- INSERT, so the INSERT branch is the one that fires: one event per confirmed entity
-- per transaction.
create function public.app_event_from_business_record_confirmed() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not public.app_event_capture_on() then return null; end if;
  if TG_OP = 'UPDATE' and old.state = new.state then return null; end if;
  perform public.app_event_emit_safe(new.workspace_id, 'fact.confirmed', new.entity, new.entity_id, null,
    jsonb_build_object('entity', new.entity, 'entityId', new.entity_id, 'confirmedByKind', new.confirmed_by_kind,
      'decisionId', new.decision_id, 'confirmedAt', new.confirmed_at),
    new.confirmed_at, 'confirmed:' || new.entity || ':' || new.entity_id || ':' || txid_current()::text);
  return null;
end;
$$;
create trigger app_event_business_record_confirmed_trg after insert or update on public.business_record_confirmed
  for each row execute function public.app_event_from_business_record_confirmed();

-- 6. Every numbered Release. The systems row is updated after this insert inside
-- append_website_system_release, so `current` can read false here: do not depend on it.
create function public.app_event_from_system_revisions() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare s public.systems;
begin
  if not public.app_event_capture_on() then return null; end if;
  select * into s from public.systems x where x.id = new.system_id;
  if not found then return null; end if;
  perform public.app_event_emit_safe(new.business_workspace_id, 'release.recorded', 'system', new.system_id::text,
    case s.kind when 'website' then 'website' when 'booking' then 'bookings' when 'inquiry' then 'inquiries'
      when 'internal_app' then 'internal_tools' when 'tracker' then 'internal_tools' else null end,
    jsonb_build_object('systemId', new.system_id, 'systemKind', s.kind, 'number', new.number,
      'summary', left(new.summary, 200), 'implementationKind', new.implementation->>'kind',
      'current', s.current_revision_id = new.id),
    new.created_at, 'system_revision:' || new.id::text);
  return null;
end;
$$;
create trigger app_event_system_revisions_trg after insert on public.system_revisions
  for each row execute function public.app_event_from_system_revisions();

-- 7 and 8. A deploy with a live read-back.
create function public.app_event_from_website_change_receipts() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not public.app_event_capture_on() then return null; end if;
  perform public.app_event_emit_safe(new.workspace_id, 'change.verified', 'system', new.system_id::text, 'website',
    jsonb_build_object('source', 'website_change', 'systemId', new.system_id, 'requestId', new.request_id,
      'receiptId', new.id, 'releaseId', null, 'commitSha', new.commit_sha, 'readBack', new.read_back),
    new.recorded_at, 'website_change_receipt:' || new.id::text);
  return null;
end;
$$;
create trigger app_event_website_change_receipts_trg after insert on public.website_change_receipts
  for each row when (new.kind = 'deployed' and new.read_back in ('confirmed','not_confirmed'))
  execute function public.app_event_from_website_change_receipts();

create function public.app_event_from_website_code_releases() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not public.app_event_capture_on() then return null; end if;
  perform public.app_event_emit_safe(new.workspace_id, 'change.verified', 'system', new.system_id::text, 'website',
    jsonb_build_object('source', 'website_code', 'systemId', new.system_id, 'requestId', null,
      'receiptId', null, 'releaseId', new.id, 'commitSha', new.commit_sha, 'readBack', new.read_back),
    new.recorded_at, 'website_code_release:' || new.id::text);
  return null;
end;
$$;
create trigger app_event_website_code_releases_trg after insert on public.website_code_releases
  for each row when (new.read_back in ('confirmed','not_confirmed'))
  execute function public.app_event_from_website_code_releases();

-- 9. Reviews (Google, Yelp and manual). Never the text or the author: the Google
-- content retention rules apply.
create function public.app_event_from_reviews() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ws uuid;
begin
  if not public.app_event_capture_on() then return null; end if;
  select l.workspace_id into ws from public.tenants t
    join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
    where t.id = new.tenant_id;
  if ws is null then return null; end if;
  perform public.app_event_emit_safe(ws, 'review.posted', 'review', new.id::text,
    case when new.source = 'google' then 'google' else null end,
    jsonb_build_object('reviewId', new.id, 'source', new.source, 'rating', new.rating, 'hasReply', new.reply is not null),
    coalesce(new.review_date, new.created_at), 'review:' || new.id::text);
  return null;
end;
$$;
create trigger app_event_reviews_trg after insert on public.reviews
  for each row execute function public.app_event_from_reviews();

-- 10. Google accounts connected to a business.
create function public.app_event_from_account_bindings() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.workspace_account_bindings; change text;
begin
  if not public.app_event_capture_on() then return null; end if;
  if TG_OP = 'DELETE' then r := old; else r := new; end if;
  if TG_OP = 'UPDATE' and old.status is not distinct from new.status then return null; end if;
  change := case when TG_OP = 'INSERT' then 'connected' when TG_OP = 'DELETE' then 'disconnected'
    else case r.status when 'connected' then 'connected' when 'needs_reauth' then 'needs_reconnect'
      when 'revoked' then 'disconnected' else 'error' end end;
  perform public.app_event_emit_safe(r.workspace_id, 'connection.changed', 'connection', 'binding:' || r.id::text, 'google',
    jsonb_build_object('provider', 'google', 'bindingId', r.id, 'change', change, 'status', r.status),
    null, 'binding:' || r.id::text || ':' || txid_current()::text || ':' || TG_OP);
  return null;
end;
$$;
create trigger app_event_account_bindings_trg after insert or update of status or delete on public.workspace_account_bindings
  for each row execute function public.app_event_from_account_bindings();

-- 11. Connected sites.
create function public.app_event_from_connected_sites() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.connected_sites; change text;
begin
  if not public.app_event_capture_on() then return null; end if;
  if TG_OP = 'DELETE' then r := old; else r := new; end if;
  if TG_OP = 'UPDATE' and old.status is not distinct from new.status
    and (old.verified_at is null) = (new.verified_at is null) then
    return null;
  end if;
  change := case when TG_OP = 'INSERT' then 'connected' when TG_OP = 'DELETE' then 'disconnected'
    when new.status = 'revoked' and old.status is distinct from new.status then 'disconnected'
    when old.verified_at is null and new.verified_at is not null then 'verified'
    else 'connected' end;
  perform public.app_event_emit_safe(r.business_workspace_id, 'connection.changed', 'connection',
    'connected_site:' || r.id::text, 'website',
    jsonb_build_object('provider', 'connected_site', 'connectedSiteId', r.id, 'siteHost', r.site_host,
      'change', change, 'status', r.status),
    null, 'connected_site:' || r.id::text || ':' || txid_current()::text || ':' || TG_OP);
  return null;
end;
$$;
create trigger app_event_connected_sites_trg after insert or update of status, verified_at or delete on public.connected_sites
  for each row execute function public.app_event_from_connected_sites();

-- 12. Who holds a Connection. No agency id is copied: only the kind of holder.
create function public.app_event_from_connection_holders() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not public.app_event_capture_on() then return null; end if;
  if TG_OP = 'UPDATE' and old.account_holder is not distinct from new.account_holder
    and old.access_through is not distinct from new.access_through then
    return null;
  end if;
  perform public.app_event_emit_safe(new.workspace_id, 'connection.changed', 'connection', new.ref,
    public.connection_provider_area(new.provider),
    jsonb_build_object('provider', new.provider, 'ref', new.ref, 'change', 'holder_recorded',
      'accountHolderKind', new.account_holder->>'kind', 'accessThroughKind', new.access_through->>'kind'),
    new.recorded_at, 'holder:' || new.ref || ':' || txid_current()::text);
  return null;
end;
$$;
create trigger app_event_connection_holders_trg after insert or update on public.connection_holders
  for each row execute function public.app_event_from_connection_holders();

-- 13. Needs you decisions. Not title, detail or decided_by (it can be an email).
create function public.app_event_from_owner_decisions() returns trigger
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not public.app_event_capture_on() then return null; end if;
  perform public.app_event_emit_safe(new.workspace_id, 'owner.decided', 'decision', new.id::text, null,
    jsonb_build_object('decisionId', new.id, 'changeKind', new.change_kind, 'state', new.state, 'route', new.route,
      'decidedByKind', new.decided_by_kind, 'systemId', new.system_id, 'sourceLifecycle', new.source_lifecycle),
    coalesce(new.decided_at, clock_timestamp()), 'decision:' || new.id::text);
  return null;
end;
$$;
create trigger app_event_owner_decisions_trg after update of state on public.owner_decisions
  for each row when (old.state = 'open' and new.state in ('approved','declined'))
  execute function public.app_event_from_owner_decisions();

revoke all on function
  public.app_event_from_tenant_leads(), public.app_event_from_booking_history(), public.app_event_from_business_record_facts(),
  public.app_event_from_business_services(), public.app_event_from_business_record_confirmed(),
  public.app_event_from_system_revisions(), public.app_event_from_website_change_receipts(),
  public.app_event_from_website_code_releases(), public.app_event_from_reviews(), public.app_event_from_account_bindings(),
  public.app_event_from_connected_sites(), public.app_event_from_connection_holders(), public.app_event_from_owner_decisions()
  from public, anon, authenticated, service_role;

commit;
