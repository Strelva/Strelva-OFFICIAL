#!/usr/bin/env bash
set -euo pipefail
# Existing full isolated schema qualification; its private cluster survives
# until this script exits. No production credentials or libpq overrides.
review_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${ACCESS_REVIEW_BASE_DUMP:-}" && -f "$ACCESS_REVIEW_BASE_DUMP" ]]; then
  source "$review_repo_root/scripts/temp-postgres.sh"
  create_temp_postgres strelva-access-review
  repo_root="$review_repo_root"
  cluster_port="$((61000 + ($$ % 3000)))"
  mkdir -p "$cluster_socket"
  initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
  pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
  psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
  psql "${psql_args[@]}" -c 'create role service_role nologin bypassrls; create role authenticated nologin; create role anon nologin;'
  psql "${psql_args[@]}" --file="$ACCESS_REVIEW_BASE_DUMP" >/dev/null
else
  source "$review_repo_root/scripts/check-workspace-sql.sh"
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260908150000_enterprise_customers.sql"
  if [[ -n "${ACCESS_REVIEW_BASE_DUMP:-}" ]]; then
    pg_dump --host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --no-owner --file="$ACCESS_REVIEW_BASE_DUMP"
  fi
fi
psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/access-before.txt"
# Inject a failure after the new functions exist but before ACLs/commit.
# The source migration must leave the baseline catalog intact under autocommit psql.
awk '/^revoke all on function public.access_review_require/ { print "select 1/0;" } { print }' "$repo_root/supabase/migrations/20261021091000_access_review.sql" >"$cluster_root/access-forward-failure.sql"
if psql "${psql_args[@]}" --file="$cluster_root/access-forward-failure.sql" >"$cluster_root/access-forward-failure.log" 2>&1; then
  printf 'Injected forward migration failure succeeded.\n' >&2; exit 1
fi
grep -q 'division by zero' "$cluster_root/access-forward-failure.log"
psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/access-failed-forward.txt"
diff -u "$cluster_root/access-before.txt" "$cluster_root/access-failed-forward.txt"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021091000_access_review.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261021091000_access_review.sql"
psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/access-after.txt"
diff -u "$cluster_root/access-before.txt" "$cluster_root/access-after.txt"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261021091000_access_review.sql"
psql "${psql_args[@]}" --set=keep_fixture=true --file="$repo_root/tests/access-review-schema.sql"
psql "${psql_args[@]}" -c "begin read only; select jsonb_array_length(public.read_access_review('27500000-0000-4000-8000-000000000041','27500000-0000-4000-8000-000000000001','ar-1@example.test',true)->'units')=2; rollback;"
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
bash "$repo_root/scripts/check-access-review-races.sh" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/access-before-refusal.txt"
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261021091000_access_review.sql" >"$cluster_root/access-review-refusal.log" 2>&1; then
  printf 'Access-review rollback discarded audit receipts.\n' >&2; exit 1
fi
grep -q access_review_rollback_requires_audit_preservation "$cluster_root/access-review-refusal.log"
psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/access-after-refusal.txt"
diff -u "$cluster_root/access-before-refusal.txt" "$cluster_root/access-after-refusal.txt"
psql "${psql_args[@]}" -Atc "select count(*)=1 from public.customer_mapping_audit where record_type='agent_token' and record_id='27500000-0000-4000-8000-000000000087'" | grep -qx t
printf 'Access review: native contracts, races, exact unused rollback, retained-audit refusal passed.\n'
