-- Pre-adoption reversal only. Preserve retained sessions and later function
-- guards; never infer an older authority shape from a populated or drifted DB.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
lock table public.owner_decision_link_sessions in access exclusive mode;
do $$
declare item record;
begin
  if exists(select 1 from public.owner_decision_link_sessions) then
    raise exception 'owner_decision_runtime_rollback_requires_data_preservation';
  end if;
  for item in select * from release_rollback_baseline.owner_decision_runtime_authority order by signature loop
    if md5(pg_get_functiondef(item.signature::regprocedure)) is distinct from item.after_hash then
      raise exception 'owner_decision_runtime_rollback_authority_drift: %',item.signature;
    end if;
  end loop;
  for item in select * from release_rollback_baseline.owner_decision_runtime_authority order by signature loop
    execute item.definition;
  end loop;
end $$;
alter table public.owner_decision_link_sessions drop column provider_assignment_id;
drop table release_rollback_baseline.owner_decision_runtime_authority;
commit;
