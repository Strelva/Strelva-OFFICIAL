-- Refuse to erase retained agency page decisions or receipts.
begin;
set local lock_timeout='2s';
lock table public.agency_native_page_commands in access exclusive mode;
do $$ begin
 if (select count(*) from public.agency_native_page_contracts)<>5 or exists(select 1 from public.agency_native_page_contracts where installed_hash is distinct from md5(pg_get_functiondef(signature::regprocedure))) then raise exception 'rollback_agency_native_page_function_drift'; end if;
 if exists(select 1 from public.agency_native_page_commands) then raise exception 'rollback_agency_native_page_receipts_retained'; end if;
end $$;
drop function public.submit_agency_native_page(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,text,text);
drop function public.read_agency_native_page_command(uuid,uuid,uuid,text,jsonb);
drop function public.read_agency_native_page_choices(uuid,uuid,uuid,text);
drop function public.read_agency_native_page_work(uuid,uuid,uuid,text,jsonb,uuid);
drop function public.require_agency_native_page_scope(uuid,uuid,uuid,text,text);
drop table public.agency_native_page_commands;
drop table public.agency_native_page_contracts;
commit;
