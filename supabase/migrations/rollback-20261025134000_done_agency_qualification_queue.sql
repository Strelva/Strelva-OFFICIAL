-- Restore only the reader projection. Never delete evidence or decisions.
begin;
set local lock_timeout = '3s';
do $$ declare saved record; begin
  if (select count(*)<>2 or not bool_and(after_hash is not null and after_hash=md5(pg_get_functiondef(signature::regprocedure))) from done_agency_qualification_queue_rollback.functions) then
    raise exception 'done_agency_qualification_queue_rollback_function_drift';
  end if;
  for saved in select before_definition from done_agency_qualification_queue_rollback.functions loop execute saved.before_definition; end loop;
end $$;
drop schema done_agency_qualification_queue_rollback cascade;
commit;
