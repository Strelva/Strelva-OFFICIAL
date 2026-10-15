begin;
set local lock_timeout = '3s';
drop function if exists public.read_provider_client_queue_v3(uuid,text,uuid,timestamptz,text,integer);
notify pgrst, 'reload schema';
commit;
