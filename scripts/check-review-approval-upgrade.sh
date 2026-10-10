#!/usr/bin/env bash
# Actual schema-only live266 upgrade, entirely on an owned disposable cluster.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
schema_dump="${STRELVA_REVIEW_SCHEMA_DUMP:?Provide the protected schema-only dump explicitly.}"
[[ -f "$schema_dump" ]] || exit 1
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-review-upgrade strelva-review-upgrade-socket
cluster_port="$((62000 + ($$ % 2000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
psql "${psql_args[@]}" -c 'create role postgres superuser; create extension if not exists btree_gist with schema public; create extension if not exists pgcrypto with schema public;' >/dev/null
if ! psql "${psql_args[@]}" --file="$schema_dump" >"$cluster_root/restore.log" 2>&1; then
  # Avoid printing private definitions in a failure diagnostic.
  rg '^psql:.*(ERROR|FATAL):' "$cluster_root/restore.log" | head -n 8
  exit 1
fi
psql "${psql_args[@]}" -c 'create extension if not exists pgcrypto with schema public;' >/dev/null
psql "${psql_args[@]}" -Atc "select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'" >"$cluster_root/functions-before.json"
if [[ -n "${STRELVA_REVIEW_LIVE_CATALOG:-}" ]]; then
  python3 - "$STRELVA_REVIEW_LIVE_CATALOG" "$cluster_root/functions-before.json" <<'PY'
import sys,json,hashlib
live=json.load(open(sys.argv[1])); replay=json.load(open(sys.argv[2]))
actual={f['signature']:f for f in replay}
missing=[f['signature'] for f in live['functions'] if f['signature'] not in actual]
changed=[f['signature'] for f in live['functions'] if f['signature'] in actual and f['definition']!=actual[f['signature']]['definition']]
if missing or changed:
 print(json.dumps({'schemaFunctionComparison':'failed','missingCount':len(missing),'definitionDifferenceCount':len(changed)}));sys.exit(1)
print(json.dumps({'schemaFunctionComparison':'matched','capturedFunctionCount':len(live['functions']),'migrationCount':live['migrationCount']}))
PY
fi
psql "${psql_args[@]}" -c 'set role postgres;' --file="$repo_root/supabase/migrations/20261023200000_tenant_review_approval_continuity.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-review-approval-continuity-schema.sql" >/dev/null
python3 "$repo_root/scripts/check-review-approval-concurrency.py" "${psql_args[@]}"
echo 'Actual live266 schema-only upgrade and controlled review admission concurrency passed. No production data or provider writes.'
