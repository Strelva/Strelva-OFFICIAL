-- Provider-state projection only. business_bookings remains booking authority.
-- Lease plus the existing schedule CAS prevents duplicate provider writes;
-- interrupted writing/unknown work resumes through read-only recovery.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create table public.business_booking_calendar_mirrors (
  booking_id uuid primary key references public.business_bookings(id) on delete cascade,
  work_id uuid not null unique references public.saved_product_work(id) on delete cascade,
  provider text not null check(provider in ('google','outlook')),
  calendar_id text not null,
  claim_token uuid,
  claim_until timestamptz,
  status text not null default 'unknown' check(status in ('verified','accepted','unknown','failed','skipped')),
  external_event_id text,
  detail text,
  updated_at timestamptz not null default now()
);
alter table public.business_booking_calendar_mirrors enable row level security;
revoke all on public.business_booking_calendar_mirrors from public,anon,authenticated,service_role;

create function public.prepare_booking_calendar_mirror(p_booking_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path = public,pg_temp as $$
declare b public.business_bookings; m public.business_booking_calendar_mirrors; c public.workspace_calendar_connections;
  v_user uuid; v_email text; v_work uuid; v_payload jsonb; v_now text;
begin
  if p_token is null then raise exception 'booking_invalid'; end if;
  select * into b from public.business_bookings where id=p_booking_id for update;
  if b.id is null or b.workspace_id is null or b.public_reservation_id is not null or b.origin='import'
    or b.status not in ('confirmed','cancelled') then return null; end if;
  select * into m from public.business_booking_calendar_mirrors where booking_id=b.id for update;
  if m.claim_until > clock_timestamp() then return null; end if;
  if m.booking_id is null and b.status <> 'confirmed' then return null; end if;
  -- A confirmed row carries the booking's own standing or explicit approval.
  -- No calendar credentials, delegated makers, or unverified owner identities
  -- are inferred from the caller or the visitor token.
  select u.id,lower(btrim(u.email)) into v_user,v_email from public.workspace_memberships wm
    join public.users u on u.id=wm.user_id where wm.workspace_id=b.workspace_id and wm.role='owner'
      and u.verified_at is not null order by wm.created_at,u.id limit 1;
  if v_user is null then raise exception 'booking_calendar_owner_required'; end if;
  perform public.workspace_require(b.workspace_id,v_user,'record_calendar_receipt');
  select * into c from public.workspace_calendar_connections where workspace_id=b.workspace_id
    and (m.booking_id is null or (provider=m.provider and calendar_id=m.calendar_id))
    and status in ('connected','authorized') and calendar_id <> 'pending' order by provider limit 1;
  if c.id is null then return null; end if;
  v_now := to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if m.booking_id is null then
    v_work := gen_random_uuid();
    v_payload := jsonb_build_object('version',1,'revision',0,'title',left(b.service_name,160),'createdBy',v_user,
      'createdAt',v_now,'history','[]'::jsonb,'availability',jsonb_build_array(jsonb_build_object('start',b.start_at,'end',b.end_at)),
      'reservations',jsonb_build_array(jsonb_build_object('requestId',b.id,'title',left(b.service_name,160),'status','reserved','start',b.start_at,'end',b.end_at)));
    insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,input,created_by)
      values(v_work,b.workspace_id,'scheduling','booking_calendar_mirror',left(b.service_name,160),v_payload,
        jsonb_build_object('bookingId',b.id,'projection','provider_state_only'),v_user);
    insert into public.business_booking_calendar_mirrors(booking_id,work_id,provider,calendar_id,claim_token,claim_until)
      values(b.id,v_work,c.provider,c.calendar_id,p_token,clock_timestamp()+interval '5 minutes') returning * into m;
  else
    -- Desired availability comes from the booking; reservation and receipt
    -- stay at the provider's last known state until governed reconciliation.
    update public.saved_product_work set payload=jsonb_set(payload,'{availability}',
      jsonb_build_array(jsonb_build_object('start',b.start_at,'end',b.end_at))), updated_at=clock_timestamp()
      where id=m.work_id and workspace_id=b.workspace_id;
    update public.business_booking_calendar_mirrors set claim_token=p_token,claim_until=clock_timestamp()+interval '5 minutes'
      where booking_id=b.id;
  end if;
  return jsonb_build_object('booking',public.booking_json(b),'workId',m.work_id,'provider',m.provider,'userId',v_user,'email',v_email);
end;
$$;
create function public.finish_booking_calendar_mirror(p_booking_id uuid,p_token uuid,p_status text,p_event_id text,p_detail text) returns void
language plpgsql security definer set search_path = public,pg_temp as $$
begin
  if p_status not in ('verified','accepted','unknown','failed','skipped') then raise exception 'booking_invalid'; end if;
  update public.business_booking_calendar_mirrors set status=p_status,external_event_id=p_event_id,detail=left(p_detail,500),
    claim_token=null,claim_until=null,updated_at=clock_timestamp() where booking_id=p_booking_id and claim_token=p_token;
  if not found then raise exception 'booking_calendar_claim_lost'; end if;
end;
$$;
revoke all on function public.prepare_booking_calendar_mirror(uuid,uuid),public.finish_booking_calendar_mirror(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_booking_calendar_mirror(uuid,uuid),public.finish_booking_calendar_mirror(uuid,uuid,text,text,text) to service_role;
commit;
