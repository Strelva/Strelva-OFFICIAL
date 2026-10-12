#!/usr/bin/env bash
# Exact agency decision admission and recovery in an isolated local cluster.
# Never reads repository env or connects to a remote/hosted database.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql diff rg; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
create_temp_postgres strelva-agency2-decisions strelva-agency2-decision-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
forward="$repo_root/supabase/migrations/20261024132400_ux_agency2_decision_recovery.sql"
inverse="$repo_root/supabase/migrations/rollback-20261024132400_ux_agency2_decision_recovery.sql"
apply() { psql "${psql_args[@]}" --file="$1" >/dev/null; }
fingerprint() { psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/$1.txt"; }
apply "$repo_root/scripts/sql/local-supabase-shim.sql"
while IFS= read -r migration; do
  if [[ "$migration" == "$forward" ]]; then
    fingerprint before
    apply "$forward"
    fingerprint after
    apply "$inverse"
    fingerprint reverted
    diff -u "$cluster_root/before.txt" "$cluster_root/reverted.txt"
    apply "$forward"
    fingerprint reapplied
    diff -u "$cluster_root/after.txt" "$cluster_root/reapplied.txt"
  else
    apply "$migration"
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
apply "$repo_root/tests/agency2-decisions-schema.sql"
fingerprint final
# Retain only the first fictional contract transaction for the populated
# refusal. Resolve its helper explicitly, independent of temporary file paths.
{
  printf '\\ir %s\n' "$repo_root/tests/support/agency-proposal-response.sql"
  awk '/^\\ir support\// { next } /^rollback;$/ { print "commit;"; exit } { print }' "$repo_root/tests/agency2-decisions-schema.sql"
} >"$cluster_root/populated.sql"
apply "$cluster_root/populated.sql"
# Restore ordinary current agency access after the fixture's revocation test,
# then inspect its actual closed receipt in PostgREST's READ ONLY mode.
psql "${psql_args[@]}" --command="begin;
select public.bring_in_agency('b2000000-0000-4000-8000-000000000001','ux-owner@bakery.example.test','b2000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-0000000000a1','[{\"scope\":\"internal_tools\",\"level\":\"full_control\"}]','Restore fictional receipt access');
select public.respond_to_agency_proposal('b2000000-0000-4000-8000-000000000002','ux-lead@agency.example.test','b2000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-0000000000b1',true,public.agency_proposal_identity('b2000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-0000000000a1'));
select public.set_agency_client_staff('b2000000-0000-4000-8000-000000000002','ux-lead@agency.example.test','b2000000-0000-4000-8000-0000000000a1','b2000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-000000000003',true);
commit;" >/dev/null
decision_id="$(psql "${psql_args[@]}" -Atc "select id from public.owner_decisions where workspace_id='b2000000-0000-4000-8000-0000000000b1' and source_lifecycle='application_release' and outcome='done_unverified';")"
[[ "$decision_id" =~ ^[a-f0-9-]{36}$ ]] || { printf 'Fictional receipt ID was not recovered.\n' >&2; exit 1; }
read_only_outcome="$(psql "${psql_args[@]}" -Atc "begin read only; set local role service_role; select public.read_agency_decision_receipt('b2000000-0000-4000-8000-0000000000b1','b2000000-0000-4000-8000-0000000000a1','$decision_id',repeat('a',64),'b2000000-0000-4000-8000-000000000003','ux-staff@agency.example.test')->>'outcome'; rollback;")"
[[ "$read_only_outcome" == 'done_unverified' ]] || { printf 'READ ONLY receipt did not retain the accepted outcome.\n' >&2; exit 1; }
if psql "${psql_args[@]}" --file="$inverse" >"$cluster_root/refusal.log" 2>&1; then
  printf 'Agency decision inverse erased captured scopes.\n' >&2; exit 1
fi
if ! rg -q 'ux_agency2_decision_rollback_recorded_scopes' "$cluster_root/refusal.log"; then
  cat "$cluster_root/refusal.log" >&2; exit 1
fi
fingerprint refused
diff -u "$cluster_root/final.txt" "$cluster_root/refused.txt"
printf 'Agency2 decisions SQL passed: supported claim and exact receipt, unsupported source refusal, current-scope recovery, immutable snapshot, inverse/reapply, populated refusal.\n'
