-- Immediate lifecycle messages, one attempt per history event and audience.
-- New table only; historical/backfilled events never become email candidates.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create table public.business_booking_update_epoch (id boolean primary key default true check(id), starts_at timestamptz not null default clock_timestamp());
insert into public.business_booking_update_epoch default values;
create table public.business_booking_updates (
  id uuid primary key default gen_random_uuid(),
  history_id uuid not null references public.business_booking_history(id) on delete cascade,
  audience text not null check (audience in ('customer','client')),
  status text not null default 'claimed' check(status in ('claimed','sent','suppressed','failed','skipped')),
  provider_message_id text,
  detail text,
  unique(history_id,audience)
);
alter table public.business_booking_update_epoch enable row level security;
alter table public.business_booking_updates enable row level security;
revoke all on public.business_booking_update_epoch, public.business_booking_updates from public, anon, authenticated, service_role;

create function public.claim_booking_updates(p_booking_id uuid, p_owner boolean, p_agent boolean, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; v_id uuid; v_out jsonb := '[]';
begin
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'booking_invalid'; end if;
  for v in select h.*, a.audience from public.business_booking_history h
    join public.business_bookings b on b.id = h.booking_id
    cross join (values('customer'),('client')) a(audience)
    where h.at >= (select starts_at from public.business_booking_update_epoch)
      and (p_booking_id is null or b.id = p_booking_id)
      and b.origin <> 'import' and h.actor <> 'migration' and b.end_at > clock_timestamp()
      and h.to_status = b.status
      and (h.to_status in ('requested','confirmed','cancelled','declined') or (p_agent and h.to_status='held' and b.origin='agent'))
      and coalesce(h.reason,'') not like 'Expired%'
      and coalesce(h.reason,'') not like 'Hold expired%'
      and (a.audience = 'customer' or (p_owner and h.to_status in ('cancelled','confirmed')
        and b.public_reservation_id is null))
      and not exists(select 1 from public.business_booking_updates u where u.history_id=h.id and u.audience=a.audience)
    order by h.at, h.id limit p_limit
  loop
    v_id := null;
    insert into public.business_booking_updates(history_id,audience) values(v.id,v.audience)
      on conflict do nothing returning id into v_id;
    if v_id is null then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object('messageId',v_id,'audience',v.audience,'reason',v.reason,
      'fromStatus',v.from_status,'booking',(select public.booking_json(b) from public.business_bookings b where b.id=v.booking_id),
      'access',(select to_jsonb(a) from public.business_booking_access a where a.booking_id=v.booking_id)));
  end loop;
  return v_out;
end;
$$;
create function public.finish_booking_update(p_id uuid,p_status text,p_provider text,p_detail text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_status not in ('sent','suppressed','failed','skipped') then raise exception 'booking_invalid'; end if;
  update public.business_booking_updates set status=p_status,provider_message_id=left(p_provider,200),detail=left(p_detail,500)
    where id=p_id and status='claimed';
end;
$$;
revoke all on function public.claim_booking_updates(uuid,boolean,boolean,integer), public.finish_booking_update(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_booking_updates(uuid,boolean,boolean,integer), public.finish_booking_update(uuid,text,text,text) to service_role;
commit;
