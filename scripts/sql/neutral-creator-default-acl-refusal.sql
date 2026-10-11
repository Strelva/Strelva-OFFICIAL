\set ON_ERROR_STOP on
-- PREPARED UNRUN. Owned disposable qualified pre-1730 local clone only.
-- Coordinator must pin this file, actual forward, catalog reader, parent/clone
-- qualification and actual migrator owner; retain raw psql CLOSE/code/error,
-- before/end DB/schema/settings/catalog/history and source byte identities.
-- This is a first-install refusal probe, not a standalone qualification harness.
-- Do not execute against an installed 1730 database or an external provider.
do $$begin
 if to_regclass('public.creator_version_paid_periods') is not null or exists(select 1 from pg_roles where rolname='neutral_creator_default_acl_probe') or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in('register_neutral_creator_listing','record_neutral_creator_money','prepare_neutral_version_collection','record_neutral_version_settlement','observe_neutral_creator_settlement','read_neutral_creator_sources','read_neutral_version_money','export_neutral_creator_paid_periods')) then raise exception 'neutral_creator_probe_requires_clean_predecessor';end if;
end$$;
\ir governed-money-operations-contract.sql
begin;
create role neutral_creator_default_acl_probe nologin;
alter default privileges in schema public grant execute on functions to neutral_creator_default_acl_probe;
commit;
-- Retain the actual forward's ACL exception. Allow psql to finish the aborted
-- transaction so the subsequent assertion runs; no grant or guard is waived.
\set ON_ERROR_STOP off
\ir ../../supabase/migrations/20261022173000_neutral_creator_version_money.sql
\set ON_ERROR_STOP on
begin;
do $$begin
 if to_regclass('public.creator_version_paid_periods') is not null or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in('register_neutral_creator_listing','record_neutral_creator_money','prepare_neutral_version_collection','record_neutral_version_settlement','observe_neutral_creator_settlement','read_neutral_creator_sources','read_neutral_version_money','export_neutral_creator_paid_periods')) then raise exception 'neutral_creator_probe_committed_exposure';end if;
 if not exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where d.defaclrole=(current_user::regrole)::oid and d.defaclnamespace='public'::regnamespace and d.defaclobjtype='f' and a.grantee=('neutral_creator_default_acl_probe'::regrole)::oid and a.privilege_type='EXECUTE') then raise exception 'neutral_creator_probe_fault_not_installed';end if;
end$$;
alter default privileges in schema public revoke execute on functions from neutral_creator_default_acl_probe;
drop role neutral_creator_default_acl_probe;
commit;
\ir governed-money-operations-contract.sql
-- Coordinator additionally requires exact stderr neutral_creator_acl_drift,
-- unchanged pre/end catalog/history, and all owned children actually CLOSED.
-- A nonzero earlier script exit needs separate owned cleanup; retain failures.
