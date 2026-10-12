#!/usr/bin/env bash
# AG2: disposable native pages, ordinary agency authority, inverse/reapply.
# No repository env files, remote database, provider call or notification.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql diff rg; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
create_temp_postgres strelva-ux-native-pages strelva-ux-native-pages-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
forward="$repo_root/supabase/migrations/20261024132100_ux_agency_native_pages.sql"
rollback="$repo_root/supabase/migrations/rollback-20261024132100_ux_agency_native_pages.sql"
apply() {
  psql "${psql_args[@]}" --file="$1" >/dev/null 2>"$cluster_root/migration.err" || {
    printf 'SQL failed: %s\n' "$1" >&2; cat "$cluster_root/migration.err" >&2; exit 1;
  }
}
fingerprint() { psql "${psql_args[@]}" --tuples-only --no-align --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/$1.txt"; }
apply "$repo_root/scripts/sql/local-supabase-shim.sql"
while IFS= read -r migration; do
  if [[ "$migration" == "$forward" ]]; then
    fingerprint before
    apply "$forward"
    fingerprint after
    apply "$rollback"
    fingerprint reverted
    diff -u "$cluster_root/before.txt" "$cluster_root/reverted.txt" >&2
    apply "$forward"
    fingerprint reapplied
    diff -u "$cluster_root/after.txt" "$cluster_root/reapplied.txt" >&2
  else apply "$migration"; fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
apply "$repo_root/tests/ux-agency-native-pages-schema.sql"
# Retain the otherwise rolled-back fictional fixture to prove the inverse
# cannot erase accepted page receipts, and cannot silently change the catalog.
sed 's/^rollback;$/commit;/' "$repo_root/tests/ux-agency-native-pages-schema.sql" >"$cluster_root/populated.sql"
apply "$cluster_root/populated.sql"
fingerprint populated_before
if psql "${psql_args[@]}" --file="$rollback" >"$cluster_root/refusal.txt" 2>&1; then
  printf 'Populated native page rollback unexpectedly succeeded.\n' >&2; exit 1
fi
rg -q 'rollback_agency_native_page_receipts_retained' "$cluster_root/refusal.txt" || { cat "$cluster_root/refusal.txt" >&2; exit 1; }
fingerprint populated_after
diff -u "$cluster_root/populated_before.txt" "$cluster_root/populated_after.txt" >&2
printf 'AG2 SQL passed (form and booking drafts, ordinary scopes, current connections, unchanged live publication, exact replay, revoked staff, empty inverse/reapply, populated inverse refusal).\n'
