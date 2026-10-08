\set ON_ERROR_STOP on
begin read only;
set local role service_role;
select public.read_provider_client_queue('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020') as retained;
reset role;
do $$ begin
  if jsonb_array_length(public.read_provider_client_queue('25700000-0000-4000-8000-000000000002','staff@queue.example.test','25700000-0000-4000-8000-000000000020')->'items')<>8 then raise exception 'provider queue rollback lost existing customer records'; end if;
end $$;
rollback;
\echo 'Provider queue reapply retained exact eight customer rows under READ ONLY.'
