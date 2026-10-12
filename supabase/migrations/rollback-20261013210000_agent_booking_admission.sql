-- Restores #529's admission (site and inquiry only), the hour-long agent cap
-- and exact-address email caps. Bookings, access and history are retained.
begin;
set local lock_timeout = '2s';
drop function public.list_published_business_pages();
create or replace function public.check_public_booking_budget(p_business uuid,p_email text,p_start timestamptz,p_end timestamptz,p_fingerprint text,p_booking_id uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; v_email text:=lower(btrim(p_email));
begin
 if p_business is null or coalesce(v_email,'')='' then raise exception 'booking_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_business::text,529));
 -- Release expired public holds before an exclusion check, without depending
 -- on the cron. Preserve their receipt/history; never reopen an expired hold.
 with expired as (
   update public.business_bookings set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp()
   where workspace_id=p_business and origin in ('site','inquiry') and status='held'
     and created_at<=clock_timestamp()-interval '15 minutes' returning id
 ) insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason)
   select id,'system','held','cancelled','Public hold expired without email confirmation' from expired;
 select count(*) into v_count from (
   select customer_email,start_at,end_at from public.public_booking_requests
   where workspace_id=p_business and state in ('held','confirming') and expires_at>clock_timestamp()
     and fingerprint is distinct from p_fingerprint
   union all
   select customer_email,start_at,block_end_at from public.business_bookings
   where workspace_id=p_business and origin in ('site','inquiry') and status in ('held','requested')
     and id is distinct from p_booking_id and request_fingerprint is distinct from p_fingerprint
 ) pending;
 if v_count>=20 then raise exception 'booking_public_limit_business'; end if;
 if exists(select 1 from public.public_booking_requests where workspace_id=p_business and state in ('held','confirming')
     and expires_at>clock_timestamp() and fingerprint is distinct from p_fingerprint and customer_email=v_email)
   or exists(select 1 from public.business_bookings where workspace_id=p_business and origin in ('site','inquiry') and status in ('held','requested')
     and id is distinct from p_booking_id and request_fingerprint is distinct from p_fingerprint and lower(btrim(customer_email))=v_email)
 then raise exception 'booking_public_limit_email'; end if;
 if exists(select 1 from public.public_booking_requests where workspace_id=p_business and state in ('held','confirming')
     and expires_at>clock_timestamp() and fingerprint is distinct from p_fingerprint and start_at<p_end and end_at>p_start)
   or exists(select 1 from public.business_bookings where workspace_id=p_business and origin in ('site','inquiry') and status in ('held','requested')
     and id is distinct from p_booking_id and request_fingerprint is distinct from p_fingerprint and start_at<p_end and block_end_at>p_start)
 then raise exception 'booking_slot_taken'; end if;
end $$;

create or replace function public.guard_public_booking_budget() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_admission public.public_booking_requests;
begin
 -- Every native inquiry handoff starts as an expiring hold, including the
 -- separate w6 choose_inquiry_booking_slot path. The old offer token is not
 -- customer email verification. Unsupported callers cannot place a request.
 if new.origin='inquiry' and new.recorded_via='native' then
   if tg_op='INSERT' and new.status in ('requested','confirmed') then new.status:='held'; end if;
   if tg_op='UPDATE' and old.status='held' and new.status in ('requested','confirmed')
     and not exists(select 1 from public.business_booking_access where booking_id=new.id and confirmed_at is not null)
   then raise exception 'booking_email_confirmation_required'; end if;
 end if;
 if new.public_reservation_id is not null then
   select r.* into v_admission from public.public_booking_requests r join public.public_website_bookings b
     on b.tenant_stable_id=r.tenant_stable_id and b.calendar_request_id=r.request_id where b.id=new.public_reservation_id;
   if found and v_admission.state='held' then
     new.status:=case when v_admission.expires_at<=clock_timestamp() then 'cancelled' else 'held' end;
     new.created_at:=v_admission.created_at;
   end if;
 end if;
 if new.origin not in ('site','inquiry') or new.recorded_via<>'native' or new.status not in ('held','requested') then return new; end if;
 -- Do not let a replay change an expired row back into a live hold.
 if tg_op='UPDATE' and old.status='cancelled' and new.status='held' then raise exception 'booking_hold_expired'; end if;
 if tg_op='UPDATE' and old.status=new.status and old.start_at=new.start_at and old.end_at=new.end_at then return new; end if;
 perform public.check_public_booking_budget(coalesce(new.workspace_id,new.calendar_key),new.customer_email,new.start_at,new.block_end_at,new.request_fingerprint,new.id);
 return new;
end $$;

create or replace function public.hold_agent_booking(p_tenant_id text, p_booking jsonb, p_access jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_b public.business_bookings; v_result jsonb; v_access jsonb;
begin
  select * into v from public.booking_tenant(p_tenant_id);
  if coalesce(v.tenant_stable_id,v.workspace_id) is null then raise exception 'booking_unknown_tenant'; end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v.tenant_stable_id,v.workspace_id)::text, 9106));
  select * into v_b from public.business_bookings where calendar_key = coalesce(v.tenant_stable_id,v.workspace_id) and legacy_id = p_booking->>'legacyId';
  if found then
    if v_b.origin <> 'agent' or v_b.request_fingerprint is distinct from p_booking->>'requestFingerprint' then
      raise exception 'booking_request_conflict';
    end if;
    return jsonb_build_object('status', 'unchanged', 'booking', public.booking_json(v_b),
      'access', (select to_jsonb(a) from public.business_booking_access a where a.booking_id = v_b.id));
  end if;
  if (select count(*) from public.business_bookings where calendar_key = coalesce(v.tenant_stable_id,v.workspace_id) and origin = 'agent'
    and created_at > clock_timestamp() - interval '1 hour') >= 10 then raise exception 'booking_agent_limit'; end if;
  if (public.read_tenant_booking_context(p_tenant_id)->>'paused')::boolean then raise exception 'booking_paused'; end if;
  if p_booking->>'status' <> 'held' or p_booking->>'origin' <> 'agent' then raise exception 'booking_invalid'; end if;
  v_result := public.record_tenant_booking(p_tenant_id, p_booking, 'native');
  if v_result->>'status' = 'conflict' then return v_result; end if;
  v_access := public.issue_booking_access(p_tenant_id, v_result#>>'{booking,id}', p_access);
  return v_result || jsonb_build_object('access', v_access);
end;
$$;
drop function public.booking_email_identity(text);
commit;
