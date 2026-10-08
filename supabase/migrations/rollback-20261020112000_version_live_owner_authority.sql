begin;
set local lock_timeout='3s';
do $$ declare baseline record; begin
  select * into baseline from release_rollback_baseline.version_live_owner_authority where singleton;
  if baseline.after_hash is distinct from md5(pg_get_functiondef('public.save_system_version(uuid,text,uuid,bigint,jsonb)'::regprocedure)) then
    raise exception 'rollback_wrong_order_or_function_drift: version Live owner authority';
  end if;
  execute baseline.definition;
end $$;
drop table release_rollback_baseline.version_live_owner_authority;
commit;
