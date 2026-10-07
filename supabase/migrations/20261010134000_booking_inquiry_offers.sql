-- Inquiry choices are bearer-authorized, bounded, expire after 72h, and never
-- reserve a time until a customer POST. No provider write or email lives here.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create table public.booking_inquiry_offers (
 id uuid primary key default gen_random_uuid(),
 tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
 inquiry_id text not null check (char_length(inquiry_id) between 1 and 200),
 offer_key text not null check (char_length(offer_key) between 1 and 100),
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 token_ciphertext text not null check (token_ciphertext like 'enc:v1:%'),
 customer jsonb not null,
 service_ref text not null,
 service_name text not null,
 timezone text not null,
 buffer_minutes integer not null check (buffer_minutes between 0 and 240),
 slots jsonb not null check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) between 1 and 3),
 expires_at timestamptz not null,
 created_at timestamptz not null default clock_timestamp(),
 booking_id uuid references public.business_bookings(id),
 selected_start timestamptz,
 unique (tenant_stable_id, inquiry_id, offer_key)
);
alter table public.booking_inquiry_offers enable row level security;
revoke all on public.booking_inquiry_offers from public, anon, authenticated, service_role;
create function public.issue_inquiry_booking_offer(p_tenant_id text, p_offer jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_o public.booking_inquiry_offers;
begin
 select * into v from public.booking_tenant(p_tenant_id);
 if v.tenant_stable_id is null then raise exception 'booking_not_found'; end if;
 if (public.read_tenant_booking_context(p_tenant_id)->>'paused')::boolean then raise exception 'booking_paused'; end if;
 if p_offer->>'inquiryId' is null or p_offer->>'key' is null or p_offer->>'customer' is null then raise exception 'booking_invalid'; end if;
 insert into public.booking_inquiry_offers(tenant_stable_id,inquiry_id,offer_key,token_hash,token_ciphertext,customer,
 service_ref,service_name,timezone,buffer_minutes,slots,expires_at)
 values(v.tenant_stable_id,p_offer->>'inquiryId',p_offer->>'key',p_offer->>'tokenHash',p_offer->>'tokenCiphertext',p_offer->'customer',
 p_offer->>'serviceId',p_offer->>'serviceName',p_offer->>'timeZone',(p_offer->>'bufferMinutes')::int,p_offer->'slots',
 least((p_offer->>'expiresAt')::timestamptz,clock_timestamp()+interval '72 hours'))
 on conflict(tenant_stable_id,inquiry_id,offer_key) do nothing;
 select * into v_o from public.booking_inquiry_offers where tenant_stable_id=v.tenant_stable_id
 and inquiry_id=p_offer->>'inquiryId' and offer_key=p_offer->>'key';
 return to_jsonb(v_o) || jsonb_build_object('tenantId',p_tenant_id);
end;
$$;
create function public.read_inquiry_booking_offer(p_hash text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
 select to_jsonb(o) || jsonb_build_object('tenantId',t.id) from public.booking_inquiry_offers o
 join public.tenants t on t.stable_id=o.tenant_stable_id where o.token_hash=p_hash and o.expires_at>clock_timestamp()
$$;
create function public.read_inquiry_booking_receipt(p_tenant_id text,p_inquiry_id text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
 select to_jsonb(o) || jsonb_build_object('tenantId',t.id) from public.booking_inquiry_offers o
 join public.tenants t on t.stable_id=o.tenant_stable_id where t.id=p_tenant_id and o.inquiry_id=p_inquiry_id
 and o.offer_key='receipt' and o.expires_at>clock_timestamp()
$$;
create function public.choose_inquiry_booking_offer(p_hash text,p_start timestamptz,p_access jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_o public.booking_inquiry_offers; v_tenant text; v_slot jsonb; v_result jsonb; v_b public.business_bookings;
begin
 select * into v_o from public.booking_inquiry_offers where token_hash=p_hash for update;
 if not found or v_o.expires_at<=clock_timestamp() then raise exception 'booking_not_found'; end if;
 if v_o.booking_id is not null then
  if v_o.selected_start is distinct from p_start then raise exception 'booking_request_conflict'; end if;
  select * into v_b from public.business_bookings where id=v_o.booking_id;
  return jsonb_build_object('status','unchanged','booking',public.booking_json(v_b));
 end if;
 select id into v_tenant from public.tenants where stable_id=v_o.tenant_stable_id;
 if (public.read_tenant_booking_context(v_tenant)->>'paused')::boolean then raise exception 'booking_paused'; end if;
 select x into v_slot from jsonb_array_elements(v_o.slots) x where (x->>'start')::timestamptz=p_start;
 if v_slot is null or p_start<=clock_timestamp() then raise exception 'booking_request_conflict'; end if;
 v_result := public.record_tenant_booking(v_tenant,jsonb_build_object(
  'legacyId','inquiry-offer-'||v_o.id::text,'status','requested','origin','inquiry','inquiryId',v_o.inquiry_id,
  'serviceRef',v_o.service_ref,'serviceName',v_o.service_name,'start',v_slot->>'start','end',v_slot->>'end',
  'bufferMinutes',v_o.buffer_minutes,'timeZone',v_o.timezone,'customer',v_o.customer,
  'requestFingerprint',v_o.token_hash||':'||p_start::text),'native');
 if v_result->>'status'='conflict' then raise exception 'booking_slot_taken'; end if;
 update public.booking_inquiry_offers set booking_id=(v_result#>>'{booking,id}')::uuid,selected_start=p_start where id=v_o.id;
 perform public.issue_booking_access(v_tenant,v_result#>>'{booking,id}',p_access);
 return v_result;
end;
$$;
revoke all on function public.issue_inquiry_booking_offer(text,jsonb),public.read_inquiry_booking_offer(text),
 public.read_inquiry_booking_receipt(text,text),public.choose_inquiry_booking_offer(text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.issue_inquiry_booking_offer(text,jsonb),public.read_inquiry_booking_offer(text),
 public.read_inquiry_booking_receipt(text,text),public.choose_inquiry_booking_offer(text,timestamptz,jsonb) to service_role;
commit;
