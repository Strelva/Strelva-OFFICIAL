-- Restore the exact integrated predecessor captured by the forward migration.
-- Drift is a stop point. Local preparation only; no production authorization.
begin;
set local lock_timeout='3s';
do $restore$
declare saved record;
begin
  for saved in select * from public.acting_provider_gate_predecessors order by signature loop
    if saved.after_hash is null or to_regprocedure(saved.signature) is null
      or md5(pg_get_functiondef(saved.signature::regprocedure)) is distinct from saved.after_hash then
      raise exception 'rollback_wrong_order_or_function_drift: %',saved.signature;
    end if;
  end loop;
  for saved in select * from public.acting_provider_gate_predecessors order by signature loop
    execute saved.before_definition;
  end loop;
end;
$restore$;
drop function public.needs_you_provider_id(uuid,uuid,text);
drop function public.read_agency_google_listing_readback_failures(uuid,text,uuid,integer);
drop table public.acting_provider_gate_predecessors;
commit;
