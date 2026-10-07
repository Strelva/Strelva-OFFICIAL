-- Additive wrapper: record same-status receipt reschedules in the one history.
-- No booking table rewrite. Existing writers keep the original RPC signature.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
-- A rescheduled request starts a new owner clock without changing creation history.
alter table public.business_bookings add column requested_at timestamptz;
alter function public.record_tenant_booking(text,jsonb,text) rename to record_tenant_booking_before_w6;
revoke all on function public.record_tenant_booking_before_w6(text,jsonb,text) from public,anon,authenticated,service_role;
create function public.record_tenant_booking(p_tenant_id text,p_booking jsonb,p_via text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v record; v_before public.business_bookings; v_result jsonb; v_row public.business_bookings;
begin
 select * into v from public.booking_tenant(p_tenant_id);
 perform pg_advisory_xact_lock(hashtextextended(v.tenant_stable_id::text,9106));
 select * into v_before from public.business_bookings b where b.calendar_key=v.tenant_stable_id and (
   (p_booking ? 'legacyId' and b.legacy_id=p_booking->>'legacyId') or
   (p_booking ? 'publicReservationId' and b.public_reservation_id::text=p_booking->>'publicReservationId') or
   (p_booking ? 'id' and b.id::text=p_booking->>'id'));
 if v_before.public_reservation_id is not null and p_booking ? 'requestFingerprint'
   and v_before.request_fingerprint is distinct from p_booking->>'requestFingerprint' then
   raise exception 'booking_request_conflict';
 end if;
 if v_before.id is not null and (v_before.start_at is distinct from (p_booking->>'start')::timestamptz
   or v_before.end_at is distinct from (p_booking->>'end')::timestamptz) then
   p_booking := p_booking || jsonb_build_object('reason','Customer rescheduled');
 end if;
 v_result := public.record_tenant_booking_before_w6(p_tenant_id,p_booking,p_via);
 -- Native services may use the record UUID when no legacy external_ref exists.
 -- Resolve both identifiers without changing an existing booking's snapshot.
 if v_result#>>'{booking,id}' is not null then
   update public.business_bookings b set business_service_id=s.id from public.business_services s
     where b.id=(v_result#>>'{booking,id}')::uuid and b.business_service_id is null
       and s.workspace_id=b.workspace_id and (s.external_ref=b.service_ref or s.id::text=b.service_ref);
   select * into v_row from public.business_bookings where id=(v_result#>>'{booking,id}')::uuid;
   v_result := v_result || jsonb_build_object('booking',public.booking_json(v_row));
 end if;
 if v_before.id is not null and v_result->>'status'='updated' and
   (v_before.start_at is distinct from (v_result#>>'{booking,start}')::timestamptz or v_before.end_at is distinct from (v_result#>>'{booking,end}')::timestamptz) then
   if v_before.status=(v_result#>>'{booking,status}') then
     insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason)
     values(v_before.id,case when p_via='backfill' then 'migration' else 'visitor' end,v_before.status,v_before.status,'Customer rescheduled');
   end if;
   if v_result#>>'{booking,status}'='requested' then
     update public.business_bookings set requested_at=clock_timestamp() where id=v_before.id;
   end if;
 end if;
 return v_result;
end $$;
-- Business facts for client-branded confirmation mail. Never returns credentials.
create function public.read_booking_business_details(p_tenant_id text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('name',coalesce((select f.value#>>'{}' from public.business_record_facts f where f.workspace_id=v.workspace_id and f.fact_key='display_name'),t.site_name),
   'address',(select coalesce(f.value->>'formatted',concat_ws(', ',f.value->>'line1',f.value->>'line2',f.value->>'city',f.value->>'region',f.value->>'postalCode'))
     from public.business_record_facts f where f.workspace_id=v.workspace_id and f.fact_key='address'))
 from public.booking_tenant(p_tenant_id) v join public.tenants t on t.stable_id=v.tenant_stable_id
$$;
revoke all on function public.record_tenant_booking(text,jsonb,text),public.read_booking_business_details(text) from public,anon,authenticated;
grant execute on function public.record_tenant_booking(text,jsonb,text),public.read_booking_business_details(text) to service_role;
alter function public.change_native_booking(text,jsonb) rename to change_native_booking_before_w6;
revoke all on function public.change_native_booking_before_w6(text,jsonb) from public,anon,authenticated,service_role;
create function public.change_native_booking(p_hash text,p_change jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_before public.business_bookings; v_b public.business_bookings; v_result jsonb;
begin
 select b.* into v_before from public.business_bookings b join public.business_booking_access a on a.booking_id=b.id where a.manage_hash=p_hash for update of b;
 v_result := public.change_native_booking_before_w6(p_hash,p_change);
 select * into v_b from public.business_bookings where id=v_before.id;
 if p_change->>'action'='reschedule' and v_b.status='requested' then
   update public.business_bookings set requested_at=clock_timestamp() where id=v_b.id;
 end if;
 -- Only an actual widget row is mirrored. Native agent/inquiry records have no legacy row.
 if v_b.origin='site' and v_b.legacy_id is not null then
   update public.bookings set date=(v_b.start_at at time zone v_b.time_zone)::date,
     start_time=to_char(v_b.start_at at time zone v_b.time_zone,'HH24:MI'),
     end_time=to_char(v_b.end_at at time zone v_b.time_zone,'HH24:MI'),
     status=v_b.status,cancelled_at=v_b.cancelled_at
   where tenant_id=(select id from public.tenants where stable_id=v_b.tenant_stable_id) and id=v_b.legacy_id;
 end if;
 return v_result;
end $$;
revoke all on function public.change_native_booking(text,jsonb) from public,anon,authenticated;
grant execute on function public.change_native_booking(text,jsonb) to service_role;

alter function public.claim_booking_messages(timestamptz,integer) rename to claim_booking_messages_before_w6;
revoke all on function public.claim_booking_messages_before_w6(timestamptz,integer) from public,anon,authenticated,service_role;
create function public.claim_booking_messages(p_now timestamptz, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_row record;
  v_id uuid;
begin
  if p_now is null or p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'booking_invalid';
  end if;
  for v_row in
    select * from (
      select b.id as booking_id, 'reminder_2h'::text as kind, b.start_at as due_order
        from public.business_bookings b
        where b.status = 'confirmed' and b.origin <> 'import' and b.customer_email is not null
          and b.start_at > p_now and b.start_at <= p_now + interval '2 hours'
          and b.created_at <= b.start_at - interval '2 hours'
      union all
      select b.id, 'reminder_24h', b.start_at
        from public.business_bookings b
        where b.status = 'confirmed' and b.origin <> 'import' and b.customer_email is not null
          and b.start_at > p_now + interval '2 hours' and b.start_at <= p_now + interval '24 hours'
          and b.created_at <= b.start_at - interval '24 hours'
      union all
      select b.id, 'request_owner_reminder', coalesce(b.requested_at,b.created_at)
        from public.business_bookings b
        where b.status = 'requested' and (b.public_reservation_id is null or b.service_ref is not null)
          and coalesce(b.requested_at,b.created_at) <= p_now - interval '24 hours' and coalesce(b.requested_at,b.created_at) > p_now - interval '72 hours'
    ) due
    where not exists (select 1 from public.business_booking_messages m where m.booking_id = due.booking_id and m.kind = due.kind)
    order by due.due_order, due.booking_id
    limit p_limit
  loop
    v_id := null;
    insert into public.business_booking_messages(booking_id, kind)
      values (v_row.booking_id, v_row.kind)
      on conflict (booking_id, kind) do nothing
      returning id into v_id;
    -- Another run claimed it first: it is theirs to send.
    if v_id is null then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('messageId', v_id, 'kind', v_row.kind,
      'booking', (select public.booking_json(b) from public.business_bookings b where b.id = v_row.booking_id)));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.claim_booking_messages(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.claim_booking_messages(timestamptz,integer) to service_role;

alter function public.lapse_booking_requests(timestamptz,integer) rename to lapse_booking_requests_before_w6;
revoke all on function public.lapse_booking_requests_before_w6(timestamptz,integer) from public,anon,authenticated,service_role;
create function public.lapse_booking_requests(p_now timestamptz, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_row public.business_bookings;
  v_msg uuid;
begin
  if p_now is null or p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'booking_invalid'; end if;
  for v_row in
    select * from public.business_bookings
      where status = 'requested' and (public_reservation_id is null or service_ref is not null) and coalesce(requested_at,created_at) <= p_now - interval '72 hours'
      order by coalesce(requested_at,created_at), id
      limit p_limit
      for update skip locked
  loop
    update public.business_bookings set status = 'declined', updated_at = clock_timestamp()
      where id = v_row.id returning * into v_row;
    insert into public.business_booking_history(booking_id, actor, from_status, to_status, reason)
      values (v_row.id, 'system', 'requested', 'declined', 'Expired: the owner did not answer in 72 hours');
    v_msg := null;
    if v_row.customer_email is not null then
      insert into public.business_booking_messages(booking_id, kind) values (v_row.id, 'request_lapsed')
        on conflict (booking_id, kind) do nothing returning id into v_msg;
    end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('messageId', v_msg, 'booking', public.booking_json(v_row)));
  end loop;
  return v_out;
end;
$$;
revoke all on function public.lapse_booking_requests(timestamptz,integer) from public,anon,authenticated;
grant execute on function public.lapse_booking_requests(timestamptz,integer) to service_role;

commit;
