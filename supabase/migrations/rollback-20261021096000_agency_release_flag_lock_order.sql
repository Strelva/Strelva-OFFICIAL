-- Restore only this exact successor body. Retain every flag, ceiling, audit and
-- billing row, along with the function's current OID, metadata and permissions.
-- A later body is never overwritten by this inverse.
begin;
set local lock_timeout='3s';
do $migration$
declare target oid;definition text;body text;
begin
 target:=to_regprocedure('public.set_agency_workspace_release_flag(uuid,uuid,uuid,text,text,text,bigint,bigint,text)');
 select pg_get_functiondef(target),prosrc into definition,body from pg_proc where oid=target;
 if target is null or encode(sha256(convert_to(body,'UTF8')),'hex') is distinct from
  'ab1b2dc437068a674ff4479f7df93a160283d848d16890c7b29f2c394af5fb98' then
  raise exception 'agency_release_flag_lock_order_rollback_conflict';
 end if;
 execute replace(definition,
  E' perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));\n','');
end $migration$;
notify pgrst,'reload schema';
commit;
