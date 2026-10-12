-- Separately authorized, reviewed PRE-batch8 target catalog fingerprint required.
-- Never reconstruct this baseline from an already upgraded target.
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
create schema release_runtime_recovery;
revoke all on schema release_runtime_recovery from public,anon,authenticated,service_role;
create table release_runtime_recovery.batch8_state (
  singleton boolean primary key check(singleton), state text not null,
  baseline_fingerprint text not null, forward_catalog jsonb, disabled_fingerprint text, disabled_role_fingerprint text
);
create table release_runtime_recovery.batch8_baseline_functions(signature text primary key);
create table release_runtime_recovery.batch8_scope(signature text primary key, introduced_function_oid oid not null, function_oid oid not null, retired boolean not null default false);
create table release_runtime_recovery.batch8_grants(signature text primary key, function_oid oid not null, grant_option boolean not null);
revoke all on all tables in schema release_runtime_recovery from public,anon,authenticated,service_role;
insert into release_runtime_recovery.batch8_state values(true,'baseline',pg_temp.batch8_runtime_fingerprint(),null,null,null);
insert into release_runtime_recovery.batch8_baseline_functions
  select p.oid::regprocedure::text from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';
commit;
