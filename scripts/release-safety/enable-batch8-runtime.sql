-- Separately reviewed reactivation; deploy feature switches only after this.
-- Restores ONLY captured service grants, never bodies or broader authority.
\set ON_ERROR_STOP on
begin;
set local search_path=public,pg_temp;
set local lock_timeout='3s';
set local statement_timeout='120s';
\ir runtime-catalog.sql
do $$
declare rpc record; recovery release_runtime_recovery.batch8_state;
begin
  select * into recovery from release_runtime_recovery.batch8_state where singleton for update;
  if recovery.state is distinct from 'disabled' then raise exception 'batch8_runtime_recovery_wrong_state'; end if;
  if pg_temp.batch8_runtime_fingerprint()<>recovery.disabled_fingerprint then
    raise exception 'batch8_runtime_recovery_catalog_drift';
  end if;
  for rpc in select * from release_runtime_recovery.batch8_grants loop
    execute format('grant execute on function public.%s to service_role%s',rpc.signature,
      case when rpc.grant_option then ' with grant option' else '' end);
  end loop;
  if pg_temp.batch8_runtime_catalog()<>recovery.forward_catalog then
    raise exception 'batch8_runtime_recovery_restore_drift';
  end if;
  update release_runtime_recovery.batch8_state set state='enabled' where singleton;
end $$;
commit;
