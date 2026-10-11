-- Both customer route families record late cancellation before immutable history.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
alter function public.set_tenant_booking_status(text,text,text,text,text) rename to set_tenant_booking_status_before_cutoff;
revoke all on function public.set_tenant_booking_status_before_cutoff(text,text,text,text,text) from public,anon,authenticated,service_role;
create function public.set_tenant_booking_status(p_tenant_id text,p_ref text,p_status text,p_actor text,p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.business_bookings; v_cutoff integer;
begin
 if p_status='cancelled' and p_actor='visitor' then
   select row.* into b from public.business_bookings row join public.tenants t on t.stable_id=row.calendar_key
     where t.id=p_tenant_id and (row.legacy_id=p_ref or row.id::text=p_ref) limit 1 for update of row;
   if found and b.status<>'cancelled' then
     select cancellation_cutoff_hours into v_cutoff from public.booking_settings where calendar_key=b.calendar_key;
     if b.start_at<clock_timestamp()+make_interval(hours=>coalesce(v_cutoff,24)) then
       p_reason:='Customer cancelled after the cancellation cutoff';
     end if;
   end if;
 end if;
 return public.set_tenant_booking_status_before_cutoff(p_tenant_id,p_ref,p_status,p_actor,p_reason);
end $$;
revoke all on function public.set_tenant_booking_status(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.set_tenant_booking_status(text,text,text,text,text) to service_role;
commit;
