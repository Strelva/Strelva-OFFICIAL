-- Guarded inverse: retained monthly evidence cannot be silently destroyed.
begin;
set local lock_timeout='3s';
lock table public.responsibility_meter_months in access exclusive mode;
do $$ begin
  if exists(select 1 from public.responsibility_meter_months) then
    raise exception 'responsibility_month_evidence_preservation_required';
  end if;
end $$;
drop function public.read_responsibility_month_evidence(uuid,uuid,text,date);
drop function public.snapshot_responsibility_meter(uuid,uuid,text,date);
alter function public.snapshot_responsibility_meter_preview_v1(uuid,uuid,text,date)
  rename to snapshot_responsibility_meter;
revoke all on function public.snapshot_responsibility_meter(uuid,uuid,text,date) from public,anon,authenticated;
grant execute on function public.snapshot_responsibility_meter(uuid,uuid,text,date) to service_role;
drop table public.responsibility_meter_months;
notify pgrst,'reload schema';
commit;
