-- Owner list evidence only: bounded bookings/history, calendar health, no secrets.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create function public.read_workspace_booking_evidence(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_from date,p_to date) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_stable uuid; v_out jsonb; v_health text;
begin
  perform public.read_workspace_tenant_links(p_workspace_id,p_user_id,p_verified_email);
  select t.stable_id into v_stable from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
    where t.id=p_tenant_id and l.workspace_id=p_workspace_id;
  if v_stable is null then raise exception 'workspace_access_denied'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>6 then raise exception 'booking_invalid'; end if;
  select case when exists(select 1 from public.workspace_calendar_connections where workspace_id=p_workspace_id and status='connected' and calendar_id<>'pending') then 'connected'
    when exists(select 1 from public.workspace_calendar_connections where workspace_id=p_workspace_id and status in ('error','revoked')) then 'reconnect'
    when exists(select 1 from public.workspace_calendar_connections where workspace_id=p_workspace_id and status='authorized') then 'setup'
    else 'not_connected' end into v_health;
  with selected as (
    select b.* from public.business_bookings b where b.calendar_key=v_stable
      and (b.start_at at time zone b.time_zone)::date between p_from and p_to
      order by b.start_at,b.id limit 501
  ), visible as (select * from selected order by start_at,id limit 500)
  select jsonb_build_object('calendarHealth',v_health,'truncated',(select count(*)>500 from selected),
    'bookings',coalesce(jsonb_agg(jsonb_build_object('booking',public.booking_json(b),
      'calendar',(select jsonb_build_object('status',case when m.status='verified' and b.status in ('confirmed','cancelled') and m.updated_at<b.updated_at then 'unknown' else m.status end,'updatedAt',m.updated_at) from public.business_booking_calendar_mirrors m where m.booking_id=b.id),
      'history',coalesce((select jsonb_agg(e.entry order by e.at,e.id) from (
        select * from (
          select h.at,h.id,jsonb_build_object('kind','change','actor',h.actor,'from',h.from_status,'to',h.to_status,'reason',h.reason,'at',h.at) entry
          from public.business_booking_history h where h.booking_id=b.id
          union all
          select coalesce(m.finished_at,m.claimed_at),m.id,jsonb_build_object('kind','reminder','reminder',m.kind,'status',m.status,'at',coalesce(m.finished_at,m.claimed_at))
          from public.business_booking_messages m where m.booking_id=b.id
        ) events order by at desc,id desc limit 50
      ) e),'[]'::jsonb),
      'historyTruncated',(select count(*) from public.business_booking_history h where h.booking_id=b.id)+(select count(*) from public.business_booking_messages m where m.booking_id=b.id)>50
    ) order by b.start_at,b.id),'[]'::jsonb)) into v_out from visible b;
  return v_out;
end $$;
revoke all on function public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date) from public,anon,authenticated;
grant execute on function public.read_workspace_booking_evidence(uuid,uuid,text,text,date,date) to service_role;
-- A no-show is deliberate and can only be recorded once the appointment ends.
-- Recheck membership, site identity, status and clock atomically under the row lock.
create function public.mark_workspace_booking_no_show(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_tenant_id text,p_ref text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_stable uuid; b public.business_bookings;
begin
  perform public.read_workspace_tenant_links(p_workspace_id,p_user_id,p_verified_email);
  select t.stable_id into v_stable from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id
    where t.id=p_tenant_id and l.workspace_id=p_workspace_id;
  if v_stable is null then raise exception 'workspace_access_denied'; end if;
  select * into b from public.business_bookings where calendar_key=v_stable and (id::text=p_ref or legacy_id=p_ref) for update;
  if b.id is null or b.end_at>clock_timestamp() or b.status not in ('confirmed','no_show') then raise exception 'booking_not_found'; end if;
  if b.status='no_show' then return public.booking_json(b); end if;
  update public.business_bookings set status='no_show',updated_at=clock_timestamp() where id=b.id returning * into b;
  insert into public.business_booking_history(booking_id,actor,from_status,to_status,reason)
    values(b.id,case when exists(select 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner') then 'owner' else 'member' end,'confirmed','no_show','Marked as no-show');
  if b.legacy_id is not null then
    update public.bookings set status='completed' where tenant_id=p_tenant_id and id=b.legacy_id;
  end if;
  return public.booking_json(b);
end $$;
revoke all on function public.mark_workspace_booking_no_show(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.mark_workspace_booking_no_show(uuid,uuid,text,text,text) to service_role;
commit;
