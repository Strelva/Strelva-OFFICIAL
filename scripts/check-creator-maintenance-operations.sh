#!/usr/bin/env bash
set -euo pipefail
# PREPARED native proof. Fictional rows, owned disposable cluster, no provider.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
# Explicit fresh private evidence directory is required; never overwrite a run.
validate_fresh_evidence_directory(){
 python3 - "$1" <<'PY_DIRECTORY'
import os,stat,sys
from pathlib import Path
path=Path(sys.argv[1]);parent=path.parent
if not path.is_absolute() or str(path.resolve())!=sys.argv[1] or path.exists() or path.is_symlink() or any(item.is_symlink() for item in [path,*path.parents]):raise SystemExit('Fresh canonical evidence path without ancestor symlinks required.')
if not parent.is_dir() or parent.stat().st_uid!=os.getuid() or stat.S_IMODE(parent.stat().st_mode)&0o077:raise SystemExit('Owned private evidence parent required.')
PY_DIRECTORY
}
evidence_dir="${1:?Pass an absolute fresh private evidence directory}"
validate_fresh_evidence_directory "$evidence_dir"
mkdir -m 700 -- "$evidence_dir"
preserve_and_cleanup(){
 local raw_exit=$? capture_exit
 trap - EXIT
 set +e
 python3 - "$cluster_root" "$evidence_dir" "$raw_exit" "$repo_root" <<'PY_CAPTURE'
import hashlib,json,os,shutil,sys
from pathlib import Path
cluster,evidence,raw,repo=map(Path,[sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]])
receipt={'rawExitCode':int(str(raw)),'proofScope':'owned-fictional-local-native-only','providerEffects':False,'fullReleaseQualified':False,'artifacts':{},'source':{}}
# Only owned top-level diagnostics/catalog snapshots, never database/socket data.
if str(cluster)!='.' and cluster.exists():
 for item in sorted(cluster.iterdir()):
  if item.is_file() and not item.is_symlink():
   target=evidence/item.name;shutil.copyfile(item,target);target.chmod(0o600)
   receipt['artifacts'][item.name]=hashlib.sha256(target.read_bytes()).hexdigest()
for name in ['scripts/check-creator-maintenance-operations.sh','scripts/temp-postgres.sh','scripts/sql/local-supabase-shim.sql','supabase/migrations/20261022170000_creator_maintenance_operations.sql','supabase/migrations/rollback-20261022170000_creator_maintenance_operations.sql','tests/creator-maintenance-operations-schema.sql','tests/money-apps-creator-quote-ledger-schema.sql','tests/function-exposure-schema.sql','scripts/check-readonly-rpcs.mjs','scripts/lib/readonly-rpcs.mjs','scripts/release-safety/postgres.ts', "scripts/sql/native-google-hash-portability-contract.sql", "scripts/sql/reward-durable-catalog-contract.sql", "scripts/sql/private-source-current-contract.sql", "supabase/migrations/rollback-20261022174000_private_source_exit_admission.sql", "supabase/migrations/rollback-20261022174500_private_source_exit_lock_order.sql", "supabase/migrations/rollback-20261021140100_native_google_hash_portability.sql", "supabase/migrations/rollback-20261022175000_reward_durable_mutations.sql"]:
 receipt['source'][name]=hashlib.sha256((repo/name).read_bytes()).hexdigest()
receipt['forwardInventory']=[{'file':item.name,'sha256':hashlib.sha256(item.read_bytes()).hexdigest()} for item in sorted((repo/'supabase/migrations').glob('20*.sql'))]
with (evidence/'receipt.json').open('x') as f:json.dump(receipt,f,indent=2);f.write('\n')
(evidence/'receipt.json').chmod(0o600)
(evidence/'receipt.sha256').write_text(hashlib.sha256((evidence/'receipt.json').read_bytes()).hexdigest()+'  receipt.json\n');(evidence/'receipt.sha256').chmod(0o600)
PY_CAPTURE
 capture_exit=$?
 if [[ "$capture_exit" != 0 ]];then printf 'Evidence capture failed; raw native exit %s; owned cluster retained: %s\n' "$raw_exit" "$cluster_root" >&2;exit 1;fi
 printf 'Private native evidence retained: %s (raw exit %s)\n' "$evidence_dir" "$raw_exit"
 # cleanup_temp_postgres takes its original status from $? and stops only its
 # owned PID. Preserve the raw status across evidence copying and diagnostics.
 return_raw_status(){ return "$raw_exit"; }
 return_raw_status
 cleanup_temp_postgres
}
trap preserve_and_cleanup EXIT
create_temp_postgres strelva-maintenance-operations strelva-maintenance-operations-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >"$cluster_root/shim.log" 2>&1
forward="$repo_root/supabase/migrations/20261022170000_creator_maintenance_operations.sql"
inverse="$repo_root/supabase/migrations/rollback-20261022170000_creator_maintenance_operations.sql"
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
for migration in "$repo_root"/supabase/migrations/20*.sql;do
 name="$(basename "$migration")"
 if [[ "$name" == 20261005090000_tenant_leads.sql || "$migration" == "$forward" ]];then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${psql_args[@]}" -f "$migration" >>"$cluster_root/ordered-migrations.log" 2>&1
done
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/private-source-current-contract.sql" >"$cluster_root/private-source-current-contract.log" 2>&1
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/native-google-hash-portability-contract.sql" >"$cluster_root/native-google-hash-portability-contract.log" 2>&1
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/reward-durable-catalog-contract.sql" >"$cluster_root/reward-durable-catalog-contract.log" 2>&1
# Snapshot definition, owner, ACL, column/constraint/policy metadata AND journal
# rows. A refusal is not green merely because the mutation itself failed.
snapshot(){
 query "select p.oid::regprocedure::text||'|'||md5(pg_get_functiondef(p.oid))||'|'||p.proowner||'|'||coalesce(p.proacl::text,'') from pg_proc p where p.pronamespace='public'::regnamespace order by 1"
 query "select c.oid||'|'||md5(to_jsonb(c)::text)||'|'||coalesce((select jsonb_agg(to_jsonb(a) order by a.attnum)::text from pg_attribute a where a.attrelid=c.oid),'')||'|'||coalesce((select jsonb_agg(to_jsonb(k) order by k.oid)::text from pg_constraint k where k.conrelid=c.oid),'')||'|'||coalesce((select jsonb_agg(to_jsonb(p) order by p.oid)::text from pg_policy p where p.polrelid=c.oid),'') from pg_class c where c.relnamespace='release_rollback_baseline'::regnamespace and c.relname='creator_maintenance_operations_catalog' order by 1"
 if [[ "$(query "select to_regclass('release_rollback_baseline.creator_maintenance_operations_catalog') is not null")" == t ]];then query "select to_jsonb(j)::text from release_rollback_baseline.creator_maintenance_operations_catalog j order by signature";fi
}
probe(){
 local label="$1" mutation="$2" packet="$3"
 snapshot >"$cluster_root/probe-before"
 if psql "${psql_args[@]}" >"$cluster_root/$label.log" 2>&1 <<SQL
begin;
$mutation
select 'CM_MUTATION_PREPARED';
\i $packet
SQL
 then printf 'Packet accepted %s drift\n' "$label" >&2;exit 1;fi
 rg -q '^[[:space:]]*CM_MUTATION_PREPARED[[:space:]]*$' "$cluster_root/$label.log"
 rg -q 'creator_maintenance_operations_(unsupported|hidden_helper|journal|catalog_drift)' "$cluster_root/$label.log"
 snapshot >"$cluster_root/probe-after"
 cmp "$cluster_root/probe-before" "$cluster_root/probe-after"
 printf 'GREEN atomic refusal: %s\n' "$label"
}
old='public.record_creator_royalty_maintenance(uuid,uuid,text,text,text,text,timestamptz)'
helper='public.record_creator_royalty_maintenance_before_identity(uuid,uuid,text,text,text,text,timestamptz)'
reader='public.read_creator_maintenance_operations(uuid,uuid,text)'
writer='public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz)'
journal='release_rollback_baseline.creator_maintenance_operations_catalog'
probe hidden-helper "grant execute on function $helper to service_role;" "$forward"
probe predecessor-custom-wrapper-acl "create role cm_ops_probe;grant execute on function $old to cm_ops_probe;" "$forward"
probe predecessor-grant-option "grant execute on function $old to service_role with grant option;" "$forward"
probe predecessor-inherited-owner 'create role cm_ops_probe;do $$begin execute format('\''grant %I to cm_ops_probe'\'',current_user);end$$;' "$forward"
probe predecessor-owner "alter function $helper owner to service_role;" "$forward"
probe predecessor-properties "alter function $old parallel safe;" "$forward"
probe predecessor-body "update pg_proc set prosrc='begin return null;end' where oid='$helper'::regprocedure;" "$forward"
probe custom-default-function "create role cm_ops_probe;alter default privileges in schema public grant execute on functions to cm_ops_probe;" "$forward"
probe predecessor-journal-schema-owner "alter schema release_rollback_baseline owner to service_role;" "$forward"
probe custom-default-table "create role cm_ops_probe;alter default privileges in schema release_rollback_baseline grant select on tables to cm_ops_probe;" "$forward"
snapshot >"$cluster_root/predecessor.catalog"
psql "${psql_args[@]}" -f "$forward" >"$cluster_root/forward.log" 2>&1
probe journal-table-grant "grant select on $journal to service_role;" "$inverse"
probe journal-missing-owner-privilege "revoke select on $journal from current_user;" "$inverse"
probe journal-column-grant "grant select(signature) on $journal to service_role;" "$inverse"
probe journal-policy "create policy cm_ops_probe on $journal using(true);" "$inverse"
probe journal-rls "alter table $journal enable row level security;" "$inverse"
probe journal-force-rls "alter table $journal force row level security;" "$inverse"
probe journal-owner "alter table $journal owner to service_role;" "$inverse"
probe journal-schema-owner "alter schema release_rollback_baseline owner to service_role;" "$inverse"
probe journal-schema "alter table $journal set schema public;" "$inverse"
probe journal-column-shape "alter table $journal add column unsupported text;" "$inverse"
probe journal-column-collation "alter table $journal alter column owner_name type text collate \"C\";" "$inverse"
probe journal-missing-row "delete from $journal where signature='$reader';" "$inverse"
probe journal-signature-substitution "update $journal set signature='$old' where signature='$reader';" "$inverse"
probe journal-extra-overload "create function public.read_creator_maintenance_operations(text) returns jsonb language sql as 'select null::jsonb';" "$inverse"
probe journal-definition-hash "update $journal set definition_hash='forged';" "$inverse"
probe journal-acl-hash "update $journal set acl_hash='forged';" "$inverse"
probe journal-properties-hash "update $journal set properties_hash='forged';" "$inverse"
probe successor-owner "alter function $reader owner to service_role;" "$inverse"
probe successor-custom-acl "create role cm_ops_probe;grant execute on function $reader to cm_ops_probe;" "$inverse"
probe successor-properties "alter function $reader volatile;" "$inverse"
probe successor-body-and-journal "update pg_proc set prosrc='begin return null;end' where oid='$reader'::regprocedure;update $journal set definition_hash=md5(pg_get_functiondef('$reader'::regprocedure)) where signature='$reader';" "$inverse"
# Genuine source-qualified listing/install/ledger, then service-role READ ONLY
# and exact current actor/source pin. Fixture writes stay in this owned cluster.
psql "${psql_args[@]}" -f "$repo_root/tests/creator-maintenance-operations-schema.sql" >"$cluster_root/native-fixture.log" 2>&1
rows="select 'terms|'||id||'|'||md5(to_jsonb(t)::text) from public.creator_royalty_terms t union all select 'listing|'||id||'|'||md5(to_jsonb(t)::text) from public.creator_listings t union all select 'split|'||id||'|'||md5(to_jsonb(t)::text) from public.revenue_splits t union all select 'install|'||id||'|'||md5(to_jsonb(t)::text) from public.offering_installations t order by 1"
query "$rows" >"$cluster_root/history-before"
psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/legitimate-inverse.log" 2>&1
snapshot >"$cluster_root/inverse.catalog"
cmp "$cluster_root/predecessor.catalog" "$cluster_root/inverse.catalog"
query "$rows" >"$cluster_root/history-after"
cmp "$cluster_root/history-before" "$cluster_root/history-after"
psql "${psql_args[@]}" -f "$forward" >"$cluster_root/reapply.log" 2>&1
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/native-google-hash-portability-contract.sql" >"$cluster_root/reapplied-native-google-hash-portability-contract.log" 2>&1
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/reward-durable-catalog-contract.sql" >"$cluster_root/reapplied-reward-durable-catalog-contract.log" 2>&1
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/private-source-current-contract.sql" >"$cluster_root/reapplied-private-source-current-contract.log" 2>&1
psql "${psql_args[@]}" -f "$repo_root/tests/function-exposure-schema.sql" >"$cluster_root/exposure.log" 2>&1
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port" >"$cluster_root/readonly.log" 2>&1
printf 'GREEN legitimate inverse/reapply preserves migration35 writer/catalog and retained history bytes.\n'
