-- Pre-adoption only. After acceptance, stop through the scoped owner operation;
-- retained bookings, inquiry history and owner-write records must survive.
begin;
set local lock_timeout='3s';
set local statement_timeout='120s';
lock table public.ask_native_service_setups in access exclusive mode;
do $$
declare item record; current_function record;
begin
  if exists(select 1 from public.ask_native_service_setups) then raise exception 'ask_service_setup_rollback_requires_data_preservation'; end if;
  for item in select * from release_rollback_baseline.ask_native_service_setup order by signature loop
    select p.oid,p.proowner,p.proacl,md5(pg_get_functiondef(p.oid)) as body_hash into current_function from pg_proc p where p.oid=to_regprocedure(item.signature);
    if not found or current_function.oid is distinct from item.function_oid or current_function.proowner is distinct from item.owner_oid
      or current_function.proacl is distinct from item.acl or current_function.body_hash is distinct from item.after_hash then
      raise exception 'ask_service_setup_rollback_authority_drift: %',item.signature;
    end if;
  end loop;
end $$;
drop trigger ask_native_service_setup_tenant_teardown on public.tenants;
drop table public.ask_native_service_setups;
drop function public.ask_native_service_setup_immutable(),public.ask_native_service_setup_tenant_teardown(),public.publish_ask_native_service_setup(uuid,uuid,text,jsonb),public.revoke_ask_native_service_setup(uuid,uuid,text,uuid,text),public.inspect_ask_service_confirmation(text);
drop table release_rollback_baseline.ask_native_service_setup;
commit;
