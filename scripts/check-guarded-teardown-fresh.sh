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
 if [[ "${STRELVA_GOOGLE_REVIEW_RETENTION_SQL_PROOF:-0}" == 1 && "$(basename "$migration")" == 20261021100900_google_review_content_retention.sql ]]; then
  psql "${psql_args[@]}" --file="$repo_root/tests/google-review-content-retention-upgrade-before.sql"
 fi
 psql "${psql_args[@]}" --file="$migration" >/dev/null
 if [[ "${STRELVA_GOOGLE_REVIEW_RETENTION_SQL_PROOF:-0}" == 1 && "$(basename "$migration")" == 20261021100900_google_review_content_retention.sql ]]; then
  psql "${psql_args[@]}" --file="$repo_root/tests/google-review-content-retention-upgrade-after.sql"
 fi
 count=$((count+1))
done < <(printf '%s\n' "$repo_root"/supabase/migrations/20*.sql | sort)
psql "${psql_args[@]}" --file="$repo_root/tests/guarded-tenant-teardown-schema.sql"
printf 'PASS final guarded teardown against %s ordered actual forward migrations.\n' "$count"
if [[ "${STRELVA_GOOGLE_REVIEW_RETENTION_SQL_PROOF:-0}" == 1 ]]; then
 psql "${psql_args[@]}" --file="$repo_root/tests/google-review-content-retention-schema.sql"
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
