begin;
set local lock_timeout='3s';
lock table public.provider_change_cancellations in access exclusive mode;
do $$begin
 if exists(select 1 from public.provider_change_cancellations) then
  raise exception 'rollback_provider_change_cancellation_in_use';
 end if;
end $$;
drop function public.read_provider_change_requests(uuid,uuid,text);
alter function public.read_provider_change_requests_before_cancel(uuid,uuid,text) rename to read_provider_change_requests;
grant execute on function public.read_provider_change_requests(uuid,uuid,text) to service_role;
drop function public.cancel_provider_change(uuid,uuid,text);
drop table public.provider_change_cancellations;
notify pgrst,'reload schema';
commit;
