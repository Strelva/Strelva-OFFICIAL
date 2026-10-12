#!/usr/bin/env bash
# C5/C6 proof on a new disposable local cluster. Never sources repository env.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql diff rg; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
create_temp_postgres strelva-ux-owner2 strelva-ux-owner2-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
apply() {
  if ! psql "${psql_args[@]}" --file="$1" >"$cluster_root/apply.log" 2>&1; then
    printf 'SQL file failed: %s\n' "$1" >&2; cat "$cluster_root/apply.log" >&2; exit 1
  fi
}
fingerprint() { psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/$1.catalog"; }
apply "$repo_root/scripts/sql/local-supabase-shim.sql"
owner2_count=0
while IFS= read -r migration; do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" == 20261024131000_ux_owner2_checkout.sql || "$migration_name" == 20261024131100_ux_owner2_payment_terms.sql ]]; then
    fingerprint before
    apply "$migration"
    fingerprint forward
    apply "$repo_root/supabase/migrations/rollback-$migration_name"
    fingerprint inverse
    diff -u "$cluster_root/before.catalog" "$cluster_root/inverse.catalog" >&2
    apply "$migration"
    fingerprint reapplied
    diff -u "$cluster_root/forward.catalog" "$cluster_root/reapplied.catalog" >&2
    owner2_count=$((owner2_count + 1))
  else
    apply "$migration"
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
[[ "$owner2_count" == 2 ]] || { printf 'Expected two owner2 forwards; found %s\n' "$owner2_count" >&2; exit 1; }
for fixture in ux-owner2-checkout-schema ux-owner2-payment-terms-schema checkout-final-admission-schema; do
  apply "$repo_root/tests/$fixture.sql"
done
# This fixture retains one fictional row and invokes the real guarded inverse.
apply "$repo_root/tests/ux-owner2-checkout-rollback-refusal.sql"
rg -q 'workspace_checkout_populated_rollback_refused' "$cluster_root/apply.log"
rg -q 'PASS owner2 actual populated rollback refused' "$cluster_root/apply.log"
printf 'PASS owner2: ordered forwards, empty inverse/reapply, checkout and terms fixtures, populated checkout refusal. Provider delivery remains unproven.\n'
