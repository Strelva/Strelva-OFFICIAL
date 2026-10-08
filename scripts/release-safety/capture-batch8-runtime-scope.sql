-- After ORIGINAL batch8, BEFORE additive security/corrective tail migrations.
-- Pins its introduced RPC identities. Later security repair RPCs stay enabled.
\set ON_ERROR_STOP on
begin;
set local search_path=public,pg_temp;
set local lock_timeout='3s';
set local statement_timeout='120s';
\ir runtime-catalog.sql
select set_config('strelva.recovery_expected', :'expected_runtime_fingerprint', true);
do $$ begin
  if current_setting('strelva.recovery_expected') !~ '^[a-f0-9]{64}$'
    or pg_temp.batch8_runtime_fingerprint() <> current_setting('strelva.recovery_expected') then
    raise exception 'batch8_runtime_recovery_catalog_drift';
  end if;
end $$;
do $$ begin
  if (select state from release_runtime_recovery.batch8_state where singleton) is distinct from 'baseline' then
    raise exception 'batch8_runtime_recovery_wrong_state';
  end if;
end $$;
insert into release_runtime_recovery.batch8_scope
  select p.oid::regprocedure::text,p.oid from pg_proc p
  where p.pronamespace='public'::regnamespace and p.prokind='f'
  and not exists(select 1 from release_runtime_recovery.batch8_baseline_functions b where b.signature=p.oid::regprocedure::text);
update release_runtime_recovery.batch8_state set state='scoped' where singleton;
commit;
