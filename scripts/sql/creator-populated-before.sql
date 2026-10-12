\set ON_ERROR_STOP on
\set native_keep_fixture true
\ir ../../tests/w6-version-native-applications.sql
-- Snapshot actual released native lineage, destination records and owner receipts.
create table public.creator_upgrade_snapshots(table_name text primary key,digest text not null);
do $$ declare relation text; fingerprint text;begin
 foreach relation in array array['system_version_sources','system_version_source_revisions','system_versions','system_version_releases','system_version_decisions','system_version_preparations','system_version_native_applications','systems','system_revisions','saved_product_work','application_states','application_releases','application_records','owner_decisions','owner_decision_deliveries'] loop
  execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,''|'' order by to_jsonb(t)::text),'''')) from public.%I t',relation) into fingerprint;
  insert into public.creator_upgrade_snapshots values(relation,fingerprint);
 end loop;
end $$;
create table public.creator_upgrade_guard_hashes as select p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) digest from pg_proc p where p.oid in ('public.system_version_history_immutable()'::regprocedure,'public.system_version_identity_guard()'::regprocedure);
