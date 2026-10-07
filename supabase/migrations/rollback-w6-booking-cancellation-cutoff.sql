begin;
set local lock_timeout='2s';
drop function public.set_tenant_booking_status(text,text,text,text,text);
alter function public.set_tenant_booking_status_before_cutoff(text,text,text,text,text) rename to set_tenant_booking_status;
grant execute on function public.set_tenant_booking_status(text,text,text,text,text) to service_role;
commit;
