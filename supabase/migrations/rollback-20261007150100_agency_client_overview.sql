-- Rollback for 20261007150100_agency_client_overview.sql
-- Forward SHA-256: 90bb850b69e26db5eda60f560c6483c4d336d63b9738e5343831aa8e96a44036
-- Batch 3: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_overview_providers(uuid)')))) is distinct from '39672be7d8eb14311983e69b3e268fff' then raise exception 'rollback_wrong_order_or_function_drift: agency_overview_providers'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_overview_queue(uuid,uuid,text,uuid)')))) is distinct from 'b9fb021b5bc39ea675d8b67c5928284f' then raise exception 'rollback_wrong_order_or_function_drift: agency_overview_queue'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_client_overview(uuid,uuid,text,uuid,integer)')))) is distinct from '444473966367fcd874ba9817b9e6b04f' then raise exception 'rollback_wrong_order_or_function_drift: agency_client_overview'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_overview_client(uuid,uuid,text,uuid,boolean)')))) is distinct from 'dcdbbb9924f2b3dcb0cc196d0cad6b74' then raise exception 'rollback_wrong_order_or_function_drift: agency_overview_client'; end if;
end;
$rollback_guard$;
drop function public.agency_overview_providers(uuid);
drop function public.agency_overview_queue(uuid,uuid,text,uuid);
drop function public.agency_client_overview(uuid,uuid,text,uuid,integer);
drop function public.agency_overview_client(uuid,uuid,text,uuid,boolean);
commit;
