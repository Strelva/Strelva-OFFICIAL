-- Store-served public reservations have a record service_ref; old calendar
-- read-back receipts do not. Keep owner clocks and receipt status consistent.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- Internal replay evidence; public API projections never expose this digest.
alter function public.booking_json(public.business_bookings) rename to booking_json_before_w6;
revoke all on function public.booking_json_before_w6(public.business_bookings) from public, anon, authenticated, service_role;
create function public.booking_json(b public.business_bookings) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.booking_json_before_w6(b) || jsonb_build_object('requestFingerprint',b.request_fingerprint,'requestedAt',b.requested_at)
$$;
revoke all on function public.booking_json(public.business_bookings) from public, anon, authenticated, service_role;

-- Fallback checks only routing/lifecycle/settings; it does not read any
-- business-record fact or service, and cannot bypass an unavailable store.
create function public.read_tenant_booking_policy(p_tenant_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('tenantStableId',v.tenant_stable_id,'workspaceId',v.workspace_id,'systemId',v.system_id,
    'paused',coalesce(v.system_lifecycle='paused',false),'settings',case when s.calendar_key is null then null else
      jsonb_build_object('mode',s.mode,'bufferMinutes',s.buffer_minutes,'minNoticeMinutes',s.min_notice_minutes,
        'maxAdvanceDays',s.max_advance_days,'defaultLengthMinutes',s.default_length_minutes,'maxPerDay',s.max_per_day,
        'timezone',s.timezone,'bookableHours',s.bookable_hours,'bookableOverrides',s.bookable_overrides,
        'legacyRequiresPayment',s.legacy_requires_payment,'revision',s.revision) end)
  from public.booking_tenant(p_tenant_id) v left join public.booking_settings s on s.calendar_key=v.tenant_stable_id
$$;
revoke all on function public.read_tenant_booking_policy(text) from public, anon, authenticated;
grant execute on function public.read_tenant_booking_policy(text) to service_role;

create or replace function public.read_workspace_booking_requests(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public.booking_json(b) order by b.start_at, b.id), '[]'::jsonb)
  from public.business_bookings b
  where p_workspace_id is not null and b.workspace_id = p_workspace_id and b.status = 'requested'
    and (b.public_reservation_id is null or b.service_ref is not null)
$$;
revoke all on function public.read_workspace_booking_requests(uuid) from public, anon, authenticated;
grant execute on function public.read_workspace_booking_requests(uuid) to service_role;

create function public.booking_request_clock() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'requested' and (old.status <> 'requested'
    or new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at) then
    new.requested_at := clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function public.booking_request_clock() from public, anon, authenticated, service_role;
create trigger business_booking_request_clock_trg
  before update on public.business_bookings for each row execute function public.booking_request_clock();

create function public.sync_native_booking_receipt() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.public_reservation_id is not null and new.service_ref is not null then
    update public.public_website_bookings set
      status = case when new.status in ('cancelled','declined') then 'cancelled'
        when new.status in ('confirmed','completed','no_show') then 'confirmed' else 'pending' end,
      start_at = new.start_at, end_at = new.end_at, updated_at = clock_timestamp()
      where id = new.public_reservation_id and tenant_stable_id = new.tenant_stable_id
        and business_workspace_id = new.workspace_id;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_native_booking_receipt() from public, anon, authenticated, service_role;
create trigger business_booking_receipt_sync_trg
  after update of status, start_at, end_at on public.business_bookings
  for each row execute function public.sync_native_booking_receipt();

-- Store claim precedes receipt persistence. Link that first receipt and keep
-- stale public saves from overwriting an owner's newer store decision.
create function public.native_booking_receipt_from_store() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare b public.business_bookings;
begin
  select * into b from public.business_bookings
    where public_reservation_id = new.id and service_ref is not null
      and tenant_stable_id = new.tenant_stable_id and workspace_id = new.business_workspace_id for share;
  if found then
    new.booking_id := b.id;
    new.status := case when b.status in ('cancelled','declined') then 'cancelled'
      when b.status in ('confirmed','completed','no_show') then 'confirmed' else 'pending' end;
    new.start_at := b.start_at;
    new.end_at := b.end_at;
  end if;
  return new;
end;
$$;
revoke all on function public.native_booking_receipt_from_store() from public, anon, authenticated, service_role;
create trigger native_booking_receipt_from_store_trg
  before insert or update on public.public_website_bookings
  for each row execute function public.native_booking_receipt_from_store();

-- A failed public receipt save can release its provisional claim, but never
-- a concurrent winner's durable receipt or any confirmed/requested booking.
create function public.release_public_record_booking_claim(p_tenant_id text,p_reservation_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; b public.business_bookings;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  select * into b from public.business_bookings
    where calendar_key=v.tenant_stable_id and public_reservation_id=p_reservation_id and service_ref is not null for update;
  if not found or b.status <> 'held' or exists(select 1 from public.public_website_bookings r
    where r.id=p_reservation_id and r.tenant_stable_id=b.tenant_stable_id and r.business_workspace_id=b.workspace_id) then
    return jsonb_build_object('released',false);
  end if;
  update public.business_bookings set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp() where id=b.id;
  insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason)
    values(b.id,'system','held','cancelled','Public receipt was not saved; no booking placed');
  return jsonb_build_object('released',true);
end;
$$;
revoke all on function public.release_public_record_booking_claim(text,uuid) from public, anon, authenticated;
grant execute on function public.release_public_record_booking_claim(text,uuid) to service_role;
commit;
