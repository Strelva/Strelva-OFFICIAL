\set ON_ERROR_STOP on
-- Pure immutable validator probes only; no tables, users, roles or data are seeded.
begin;
create function pg_temp.assert_lock_refusal(paths jsonb) returns void language plpgsql as $$
begin
 begin
  perform public.system_version_validate_locks('{"title":"Locked","17":"numeric key","true":"boolean key"}',paths);
 exception when others then
  if sqlerrm='system_version_input_invalid' then return; end if;
  raise exception 'unexpected_native_lock_refusal';
 end;
 raise exception 'malformed_lock_input_was_accepted';
end;$$;
select public.system_version_validate_locks('{"title":"Locked"}','["title"]');
select public.system_version_validate_locks('{"title":"Locked"}','[]');
-- Existing NULL/container refusal must remain unchanged.
select pg_temp.assert_lock_refusal(null);
select pg_temp.assert_lock_refusal('null');
select pg_temp.assert_lock_refusal('[null]');
-- Reachable parity delta: native coercion can accept these existing named keys.
select pg_temp.assert_lock_refusal('[17]');
select pg_temp.assert_lock_refusal('[true]');
select pg_temp.assert_lock_refusal('["title",null]');
rollback;
