#!/usr/bin/env bash
# A7: ordered local schema, behavior contracts, exact inverse/reapply and
# populated rollback refusal. No Docker, repository env or remote database.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql diff rg; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
create_temp_postgres strelva-ux-owner-agency strelva-ux-owner-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
forward="$repo_root/supabase/migrations/20261024122300_ux_owner_agency_access.sql"
rollback="$repo_root/supabase/migrations/rollback-20261024122300_ux_owner_agency_access.sql"
apply() {
  psql "${psql_args[@]}" --file="$1" >/dev/null 2>"$cluster_root/migration.err" || {
    printf 'Migration failed: %s\n' "$1" >&2; cat "$cluster_root/migration.err" >&2; exit 1;
  }
}
fingerprint() { psql "${psql_args[@]}" --tuples-only --no-align --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/$1.txt"; }
contracts() {
  psql "${psql_args[@]}" --file="$repo_root/tests/two-doors-bring-in-an-agency-schema.sql" >/dev/null
  psql "${psql_args[@]}" --file="$repo_root/tests/ux-owner-agency-access-schema.sql" >/dev/null
  if [[ -f "$repo_root/tests/ux-owner-setup-ask-schema.sql" ]]; then
    psql "${psql_args[@]}" --file="$repo_root/tests/ux-owner-setup-ask-schema.sql" >/dev/null
  fi
  psql "${psql_args[@]}" --file="$repo_root/tests/ux-owner-export-history.sql" >/dev/null
}
apply "$repo_root/scripts/sql/local-supabase-shim.sql"
while IFS= read -r migration; do
  [[ "$migration" == "$forward" ]] || apply "$migration"
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
fingerprint before
apply "$forward"
contracts
fingerprint after
apply "$rollback"
fingerprint reverted
diff -u "$cluster_root/before.txt" "$cluster_root/reverted.txt" >&2
apply "$forward"
fingerprint reapplied
diff -u "$cluster_root/after.txt" "$cluster_root/reapplied.txt" >&2
contracts
# Retain the contract fixture and a pending same-area amendment to test the
# actual rollback, then decline it to prove a populated safe inverse.
sed 's/^rollback;$/commit;/' "$repo_root/tests/ux-owner-agency-access-schema.sql" >"$cluster_root/populated.sql"
apply "$cluster_root/populated.sql"
psql "${psql_args[@]}" --command="select public.bring_in_agency('7f000000-0000-4000-8000-000000000001','owner@bakery.example.test','7f000000-0000-4000-8000-0000000000b1','7f000000-0000-4000-8000-0000000000a1','[{\"scope\":\"website\",\"level\":\"prepare\"}]','Pending downgrade');" >/dev/null
if psql "${psql_args[@]}" --file="$rollback" >"$cluster_root/refusal.txt" 2>&1; then
  printf 'Populated rollback unexpectedly succeeded.\n' >&2; exit 1
fi
if ! rg -q 'ux_owner_agency_access_rollback_refused' "$cluster_root/refusal.txt"; then
  cat "$cluster_root/refusal.txt" >&2; exit 1
fi
psql "${psql_args[@]}" --command="do \$\$ begin if public.business_scope_full_control('7f000000-0000-4000-8000-0000000000b1','website') is distinct from '7f000000-0000-4000-8000-0000000000a1'::uuid or (select count(*) from public.agency_scope_grants where customer_workspace_id='7f000000-0000-4000-8000-0000000000b1' and status='proposed') <> 1 then raise exception 'rollback refusal changed grants'; end if; end \$\$;" >/dev/null
psql "${psql_args[@]}" --command="select public.respond_to_agency_proposal('7f000000-0000-4000-8000-000000000002','lead@north.example.test','7f000000-0000-4000-8000-0000000000a1','7f000000-0000-4000-8000-0000000000b1',false);" >/dev/null
apply "$rollback"
fingerprint populated-reverted
diff -u "$cluster_root/before.txt" "$cluster_root/populated-reverted.txt" >&2
apply "$forward"
printf 'Owner agency access SQL passed (ordered schema, original and amendment contracts, exact rollback/reapply, populated rollback refusal and safe inverse).\n'
