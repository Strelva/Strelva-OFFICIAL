#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-guarded-teardown-fresh strelva-guarded-teardown-socket
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql sort;do
 command -v "$command_name" >/dev/null || { printf 'Required command unavailable: %s\n' "$command_name" >&2;exit 1; }
done
[[ -f "$repo_root/tests/guarded-tenant-teardown-schema.sql" ]] || { printf 'Final teardown fixture is missing.\n' >&2;exit 1; }
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
# Apply every actual forward migration exactly once, beginning at initial_schema.
# No fabricated legacy tables, inverse experiments or custom baseline precede it.
count=0
while IFS= read -r migration;do
 printf 'Fresh teardown predecessor: %s\n' "$(basename "$migration")"
 if [[ "$(basename "$migration")" == 20261022130000_tenant_newsletter_teardown_hold.sql ]]; then
  node "$repo_root/scripts/tenant-newsletter-baseline-proof.mjs" | psql "${psql_args[@]}"
 fi
 if [[ "${STRELVA_GOOGLE_REVIEW_RETENTION_SQL_PROOF:-0}" == 1 && "$(basename "$migration")" == 20261021100900_google_review_content_retention.sql ]]; then
  psql "${psql_args[@]}" --file="$repo_root/tests/google-review-content-retention-upgrade-before.sql"
 fi
 if [[ "${STRELVA_PRIVATE_DEFINITION_SQL_PROOF:-0}" == 1 && "$(basename "$migration")" == 20261022123000_private_definition_versions.sql ]]; then
  psql "${psql_args[@]}" --tuples-only --no-align --command="select jsonb_build_object('dataDirectory',current_setting('data_directory'),'socketDirectory',current_setting('unix_socket_directories'),'port',current_setting('port'),'systemIdentifier',(select system_identifier::text from pg_control_system()),'databaseOid',(select oid::text from pg_database where datname=current_database()));" > "$cluster_root/private-native-identity.json"
  python3 - "$cluster_root/private-native-identity.json" "$cluster_root/private-native-marker.json" <<'PYMARKER'
import json,os,pathlib,sys
identity=json.loads(pathlib.Path(sys.argv[1]).read_text())
identity.update(kind='strelva-owned-temporary-postgres',uid=os.getuid())
for key in ('dataDirectory','socketDirectory'): identity[key]=str(pathlib.Path(identity[key]).resolve(strict=True))
with open(sys.argv[2],'x') as handle: json.dump(identity,handle)
os.chmod(sys.argv[2],0o600)
PYMARKER
  private_native_url=$(python3 - "$cluster_root/private-native-marker.json" <<'PYURL'
import json,pathlib,pwd,os,sys,urllib.parse
identity=json.loads(pathlib.Path(sys.argv[1]).read_text())
print('postgresql://'+urllib.parse.quote(pwd.getpwuid(os.getuid()).pw_name,safe='')+'@/postgres?'+urllib.parse.urlencode({'host':identity['socketDirectory'],'port':identity['port']}))
PYURL
  )
  env -u STRELVA_LOCAL_AUTH_PROOF STRELVA_PRIVATE_DEFINITION_NATIVE_PROOF=1 STRELVA_LOCAL_DB_URL="$private_native_url" STRELVA_PRIVATE_DEFINITION_CLUSTER_MARKER="$cluster_root/private-native-marker.json" python3 scripts/check-private-definition-acl-baseline.py "$migration" "$repo_root/supabase/migrations/rollback-$(basename "$migration")"
  pg_dump --host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --schema-only --schema=public | python3 -c 'import sys; sys.stdout.writelines(line for line in sys.stdin if not line.startswith((r"\restrict ",r"\unrestrict ")))' > "$cluster_root/private-definition-before.sql"
 fi
 psql "${psql_args[@]}" --file="$migration" >/dev/null
 if [[ "${STRELVA_GOOGLE_REVIEW_RETENTION_SQL_PROOF:-0}" == 1 && "$(basename "$migration")" == 20261021100900_google_review_content_retention.sql ]]; then
  psql "${psql_args[@]}" --file="$repo_root/tests/google-review-content-retention-upgrade-after.sql"
 fi
 count=$((count+1))
done < <(printf '%s\n' "$repo_root"/supabase/migrations/20*.sql | sort)
psql "${psql_args[@]}" --file="$repo_root/tests/guarded-tenant-teardown-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/tenant-teardown-evidence-owners.sql"
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/tenant-newsletter-teardown-hold.sql"
printf 'PASS final guarded teardown against %s ordered actual forward migrations.\n' "$count"
if [[ -n "${STRELVA_TEARDOWN_DATABASE_TYPES_OUT:-}" ]]; then
 pnpm exec tsx scripts/generate-database-types.ts --host "$cluster_socket" --port "$cluster_port" --out "$STRELVA_TEARDOWN_DATABASE_TYPES_OUT"
fi
if [[ "${STRELVA_GOOGLE_REVIEW_RETENTION_SQL_PROOF:-0}" == 1 ]]; then
 psql "${psql_args[@]}" --file="$repo_root/tests/google-review-content-retention-schema.sql"
 if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261021100900_google_review_content_retention.sql" > "$cluster_root/review-retention-inverse.log" 2>&1; then
  printf 'Forward-only review retention inverse unexpectedly succeeded.\n' >&2; exit 1
 fi
 rg -q 'google_review_content_retention_forward_only' "$cluster_root/review-retention-inverse.log" || { cat "$cluster_root/review-retention-inverse.log" >&2; exit 1; }
 printf 'PASS review content retention inverse refuses forward-only recovery.\n'
 printf 'PASS populated review retention upgrade and native archive expiry/purge.\n'
fi
if [[ "${STRELVA_RUNTIME_GENERATION_SQL_PROOF:-0}" == 1 ]]; then
 for fixture in runtime-data-google-grant-generation.sql runtime-data-google-receipt-intent.sql runtime-data-google-provider-retention.sql runtime-data-tenant-connection-generation.sql; do
  psql "${psql_args[@]}" --file="$repo_root/tests/$fixture"
 done
 source "$repo_root/tests/support/runtime-data-tenant-generation-races.sh"
 check_tenant_connection_generation_lifecycle
 printf 'PASS native grant generation, original receipt intent and tenant rename/reuse races.\n'
fi
if [[ "${STRELVA_GOOGLE_SERVICE_SQL_PROOF:-0}" == 1 ]]; then
 psql "${psql_args[@]}" --file="$repo_root/tests/runtime-data-google-service-authority.sql"
 psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261021101000_google_make_real_service_authority.sql"
 psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021101000_google_make_real_service_authority.sql"
 psql "${psql_args[@]}" --file="$repo_root/tests/runtime-data-google-service-authority.sql"
 source "$repo_root/tests/support/runtime-data-google-service-races.sh"
 check_google_service_authority_admission_wait
 printf 'PASS signed Google service authority, inverse/reapply and observed admission wait revocations.\n'
fi
if [[ "${STRELVA_CLEANUP_AGENCY_SQL_PROOF:-0}" == 1 ]]; then
 psql "${psql_args[@]}" --set=keep_fixture=true --file="$repo_root/tests/tenant-cleanup-receipts-schema.sql"
 psql "${psql_args[@]}" --file="$repo_root/tests/tenant-cleanup-blockers-readonly.sql"
 psql "${psql_args[@]}" --file="$repo_root/scripts/sql/agency-created-application-authority-contract.sql"
 printf 'PASS cleanup receipt CAS, booking-only READ ONLY and agency reader contracts.\n'
fi
if [[ "${STRELVA_TENANT_CLEANUP_NATIVE_PROOF:-0}" == 1 ]]; then
 cleanup_connection=$(python3 - "$cluster_socket" "$cluster_port" "$(id -un)" <<'PY'
import json,sys
print(json.dumps(['-h',sys.argv[1],'-p',sys.argv[2],'-U',sys.argv[3],'-d','postgres']))
PY
 )
 STRELVA_TENANT_CLEANUP_PSQL="$cleanup_connection" pnpm exec vitest run src/__tests__/deprovision-concurrent-native.test.ts --maxWorkers=2
 printf 'PASS actual two-worker PostgreSQL and Redis cleanup recovery.\n'
fi

if [[ "${STRELVA_PRIVATE_DEFINITION_SQL_PROOF:-0}" == 1 ]]; then
 psql "${psql_args[@]}" --file="$repo_root/scripts/sql/private-definition-versions-contract.sql"
 psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261022130000_tenant_newsletter_teardown_hold.sql"
 psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261022123000_private_definition_versions.sql"
 pg_dump --host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --schema-only --schema=public | python3 -c 'import sys; sys.stdout.writelines(line for line in sys.stdin if not line.startswith((r"\restrict ",r"\unrestrict ")))' > "$cluster_root/private-definition-restored.sql"
 cmp "$cluster_root/private-definition-before.sql" "$cluster_root/private-definition-restored.sql"
 psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261022123000_private_definition_versions.sql"
 psql "${psql_args[@]}" --file="$repo_root/scripts/sql/private-definition-versions-contract.sql"
 psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261022130000_tenant_newsletter_teardown_hold.sql"
 psql "${psql_args[@]}" --file="$repo_root/scripts/sql/tenant-newsletter-teardown-hold.sql"
 pnpm exec tsx scripts/generate-database-types.ts --host "$cluster_socket" --port "$cluster_port" --out "$repo_root/.scratch/full-model-completion-2026-10-08/private-definition-database.types.ts"
 printf 'PASS private definition forward/inverse/reapply, exact public schema ACL equality and READ ONLY contracts.\n'
fi
