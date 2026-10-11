\set ON_ERROR_STOP on
create or replace function pg_temp.qassert(ok boolean,msg text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'provider queue: %',msg; end if; end $$;
create extension if not exists dblink;
select dblink_connect('provider_queue_reader',format('host=%s port=%s dbname=%s user=%s',current_setting('unix_socket_directories'),current_setting('port'),current_database(),current_user));
select dblink_exec('provider_queue_reader','begin read only');
select dblink_exec('provider_queue_reader','set local role service_role');
select pg_temp.qassert((select jsonb_array_length(result->'items') from dblink('provider_queue_reader',$q$select public.read_provider_client_queue('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020')$q$) as read(result jsonb))=8,'READ ONLY service reader sees eight scoped rows');
-- A still-open read transaction must not delay staff revocation. A fresh
-- READ COMMITTED statement in that same transaction sees the committed revoke.
set statement_timeout='700ms';
select public.set_agency_client_staff('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020','25700000-0000-4000-8000-000000000010','25700000-0000-4000-8000-000000000002',false);
reset statement_timeout;
select pg_temp.qassert((select jsonb_array_length(result->'items') from dblink('provider_queue_reader',$q$select public.read_provider_client_queue('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020')$q$) as read(result jsonb))=0,'next statement observes revocation while original reader remains open');
select dblink_exec('provider_queue_reader','rollback');
select dblink_disconnect('provider_queue_reader');
\echo 'Provider queue reader/revocation race passed.'
