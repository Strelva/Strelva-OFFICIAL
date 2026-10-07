begin;
set local lock_timeout = '3s';
drop function if exists public.reserve_website_model_call(uuid,uuid,uuid,text,integer);
drop table if exists public.website_model_allowances;
commit;
