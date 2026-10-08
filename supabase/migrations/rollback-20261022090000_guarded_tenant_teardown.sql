begin;
set local lock_timeout='3s';
drop function public.deprovision_tenant_guarded(text,boolean,boolean,boolean);
commit;
