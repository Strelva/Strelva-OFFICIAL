-- Agency flag writes and native billing provisioning share the business-record
-- advisory boundary. Acquire it before the workspace row, as provisioning does.
-- Replace only that one body line: identity, ceiling, System scope, verification,
-- both revisions, flag/history writes, result shape, OID and ACL remain intact.
begin;
set local lock_timeout='3s';
do $migration$
declare target oid;definition text;body text;needle text;
begin
 target:=to_regprocedure('public.set_agency_workspace_release_flag(uuid,uuid,uuid,text,text,text,bigint,bigint,text)');
 select pg_get_functiondef(target),prosrc into definition,body from pg_proc where oid=target;
 if target is null or encode(sha256(convert_to(body,'UTF8')),'hex') is distinct from
  '2d1e03e46cd8947bcf6ce5e50738cf5be841f3ceece17e747a93599e7070e380' then
  raise exception 'agency_release_flag_lock_order_predecessor_conflict';
 end if;
 needle:=' perform public.workspace_release_assert_workspace(p_workspace_id);';
 execute replace(definition,needle,
  E' perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));\n'||needle);
end $migration$;
notify pgrst,'reload schema';
commit;
