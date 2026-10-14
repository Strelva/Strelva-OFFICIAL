#!/usr/bin/env bash
# All October 12 UX tails: actual ordered schema, each empty inverse/reapply,
# all native lane fixtures and retained populated/race proof runners.
# Local disposable PostgreSQL only; no repository env or hosted connection.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql diff rg; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
create_temp_postgres strelva-ux-audit strelva-ux-audit-socket
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
ux_count=0
while IFS= read -r migration; do
  migration_name="$(basename "$migration")"
  # Keep the original twelve contracts at their historical boundary. Pass 2
  # changes admission and captures these bodies, so install it after the
  # original retained inverse/refusal proofs instead of applying it early.
  if [[ "$migration_name" == 2026102413* ]]; then continue; fi
  if [[ "$migration_name" == 2026102412* || "$migration_name" == 20261025120000_done_owner_signup_releases.sql ]]; then
    fingerprint before
    apply "$migration"
    fingerprint forward
    # At the installation boundary, before later wrappers or fictional rows.
    apply "$repo_root/supabase/migrations/rollback-$migration_name"
    fingerprint inverse
    diff -u "$cluster_root/before.catalog" "$cluster_root/inverse.catalog" >&2
    apply "$migration"
    fingerprint reapplied
    diff -u "$cluster_root/forward.catalog" "$cluster_root/reapplied.catalog" >&2
    ux_count=$((ux_count + 1))
  else
    apply "$migration"
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
[[ "$ux_count" == 13 ]] || { printf 'Expected twelve UX forwards and direct signup enrollment; found %s\n' "$ux_count" >&2; exit 1; }
# Qualification intentionally commits its native READ ONLY setup. Run it last
# so its persistent fictional evidence cannot affect other fixture assumptions.
for fixture in ux-owner-setup-ask-schema ux-owner-agency-access-schema ux-owner-export-history agency-full-control-decisions-schema chrome-recorded-actors ux-integration-booking-actor-schema done-owner-signup-releases-schema agency-qualification-schema; do
  apply "$repo_root/tests/$fixture.sql"
done
# Exercise actual populated inverses on independent clones: B2 and booking
# fixtures deliberately reuse the same fictional identities. No production row
# is deleted to manufacture an empty inverse.
original_psql_args=("${psql_args[@]}")
for guarded in 'chrome-recorded-actors:20261024123500_ux_chrome_recorded_actors.sql:ux_chrome_actor_rollback_would_discard_evidence' 'agency-full-control-decisions-schema:20261024123100_ux_agency_full_control_decisions.sql:ux_agency_decisions_rollback_recorded_actors' 'ux-integration-booking-actor-schema:20261024124700_ux_integration_booking_actor.sql:rollback_ux_booking_actor_retained_history' 'ux-owner-setup-ask-schema:20261024122000_ux_owner_setup_ask.sql:ux_owner_setup_ask_rollback_populated' 'done-owner-signup-releases-schema:20261025120000_done_owner_signup_releases.sql:done_owner_signup_releases_rollback_populated'; do
  fixture="${guarded%%:*}"; inverse_spec="${guarded#*:}"
  forward="${inverse_spec%%:*}"; reason="${inverse_spec#*:}"
  psql "${original_psql_args[@]}" --command='create database ux_populated_inverse template postgres' >/dev/null
  psql_args=("${original_psql_args[@]}" --dbname=ux_populated_inverse)
  # Relative includes otherwise resolve under the temporary directory. Keep
  # every original helper and contract while retaining the fictional rows.
  awk -v test_root="$repo_root/tests" '
    /^\\ir / { print "\\ir " test_root "/" $2; next }
    /^rollback;$/ { print "commit;"; next }
    { print }
  ' "$repo_root/tests/$fixture.sql" >"$cluster_root/populated-$fixture.sql"
  apply "$cluster_root/populated-$fixture.sql"
  fingerprint populated
  if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-$forward" >"$cluster_root/refusal.log" 2>&1; then
    printf 'Populated UX inverse unexpectedly succeeded: %s\n' "$forward" >&2; exit 1
  fi
  rg -q "$reason" "$cluster_root/refusal.log" || { cat "$cluster_root/refusal.log" >&2; exit 1; }
  fingerprint refused
  diff -u "$cluster_root/populated.catalog" "$cluster_root/refused.catalog" >&2
  psql_args=("${original_psql_args[@]}")
  psql "${psql_args[@]}" --command='drop database ux_populated_inverse' >/dev/null
done
# Install every pass-2 successor in the same sorted order as a fresh database,
# rehearsing its inverse before any later wrapper captures the new definition.
pass2_count=0
while IFS= read -r migration; do
  migration_name="$(basename "$migration")"
  fingerprint before
  apply "$migration"
  fingerprint forward
  apply "$repo_root/supabase/migrations/rollback-$migration_name"
  fingerprint inverse
  diff -u "$cluster_root/before.catalog" "$cluster_root/inverse.catalog" >&2
  apply "$migration"
  fingerprint reapplied
  diff -u "$cluster_root/forward.catalog" "$cluster_root/reapplied.catalog" >&2
  pass2_count=$((pass2_count + 1))
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '2026102413*.sql' | sort)
[[ "$pass2_count" == 5 ]] || { printf 'Expected five pass-2 UX forwards; found %s\n' "$pass2_count" >&2; exit 1; }
# These owned runners retain their distinct isolation, concurrent reservation,
# selected-agency and populated-safe-inverse evidence on separate clusters.
for lane_runner in check-ux-trust-email-sql.sh check-ux-trust-ui-budget-sql.sh check-ux-owner-agency-access-sql.sh check-agency-qualification-sql.sh check-ux-owner2-sql.sh check-ux-agency-proposal-identity-sql.sh check-ux-agency-native-pages-sql.sh check-agency2-decisions-sql.sh; do
  bash "$repo_root/scripts/$lane_runner"
done
printf 'UX audit SQL passed: eighteen ordered forwards, exact empty inverses/reapply, every new native fixture, signup enrollment/populated refusal, snapshot refusal and lane race/authority proofs. Local only.\n'
