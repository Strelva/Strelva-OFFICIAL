begin;
set local lock_timeout = '3s';
-- The projection owns no customer records. Refuse to drop a later successor.
do $$ begin
  if not exists(select 1 from public.provider_client_queue_catalog_guard
    where definition_hash=md5(pg_get_functiondef('public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer)'::regprocedure))) then
    raise exception 'provider_client_queue_rollback_successor_conflict';
  end if;
end $$;
drop function public.read_provider_client_queue(uuid,text,uuid,timestamptz,text,integer);
drop table public.provider_client_queue_catalog_guard;
notify pgrst, 'reload schema';
commit;
