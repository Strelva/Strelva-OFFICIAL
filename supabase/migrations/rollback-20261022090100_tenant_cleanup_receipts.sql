begin;
set local lock_timeout='3s';
lock table public.tenants,public.tenant_deprovision_cleanup in access exclusive mode;
-- Never remove the only durable retry/reuse fence, including completed history.
do $$ begin
 if exists(select 1 from public.tenant_deprovision_cleanup) then raise exception 'tenant_cleanup_receipts_retained'; end if;
end $$;
drop trigger tenant_cleanup_reuse_guard on public.tenants;
drop function public.tenant_cleanup_reuse_guard();
drop function public.finish_tenant_deprovision_cleanup(text,uuid,boolean,boolean,jsonb);
drop function public.deprovision_tenant_guarded(text,boolean,boolean,boolean);
drop function public.tenant_cleanup_receipt(text);
drop function public.tenant_cleanup_teardown_blockers(text);
drop table public.tenant_deprovision_cleanup;
alter function public.deprovision_tenant_guarded_before_cleanup(text,boolean,boolean,boolean) rename to deprovision_tenant_guarded;
grant execute on function public.deprovision_tenant_guarded(text,boolean,boolean,boolean) to service_role;
commit;
