#!/usr/bin/env bash
# Forward your inquiries (20261024500000): the contract on the full ordered
# schema, the populated-rollback refusal, an exact rollback to the prior
# catalog and a clean reapply. Local throwaway cluster only.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-inquiry-forwarding strelva-inquiry-forwarding-socket
cluster_port="$((64000 + ($$ % 1000)))"
for command_name in initdb pg_ctl psql diff; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
fingerprint() { psql "${psql_args[@]}" --tuples-only --no-align --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/$1.txt"; }
apply() { psql "${psql_args[@]}" --file="$1" >/dev/null 2>"$cluster_root/migration.err" || { printf 'Migration failed: %s\n' "$1" >&2; cat "$cluster_root/migration.err" >&2; exit 1; }; }
forward="$repo_root/supabase/migrations/20261024500000_inquiry_forwarding.sql"
inverse="$repo_root/supabase/migrations/rollback-20261024500000_inquiry_forwarding.sql"
contract() { psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-forwarding-schema.sql" >/dev/null; }

psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in $(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | awk -F/ '{print $NF"\t"$0}' | sort | cut -f2); do
  [[ "$(basename "$migration")" < "$(basename "$forward")" ]] || break
  apply "$migration"
done
fingerprint before
apply "$forward"
contract
fingerprint after

# A populated rollback must refuse: it would delete end-customer messages.
psql "${psql_args[@]}" -c "insert into public.users(id,email,verified_at) values ('24500000-0000-4000-8000-0000000000f1','refusal@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values ('24500000-0000-4000-8000-0000000000f2','customer','Refusal','24500000-0000-4000-8000-0000000000f1');
  insert into public.inquiry_forwarding_addresses(workspace_id,local_part,issued_by,issued_as) values ('24500000-0000-4000-8000-0000000000f2','fwd-rrrrrrrrrrrrrrrrrrrrrrrr','24500000-0000-4000-8000-0000000000f1','owner');" >/dev/null
if psql "${psql_args[@]}" --file="$inverse" >"$cluster_root/refusal.log" 2>&1; then
  printf 'Populated inquiry forwarding rollback did not refuse.\n' >&2; exit 1
fi
grep -q 'inquiry_forwarding_rollback_requires_data_preservation' "$cluster_root/refusal.log"
psql "${psql_args[@]}" -c "delete from public.workspaces where id='24500000-0000-4000-8000-0000000000f2'; delete from public.users where id='24500000-0000-4000-8000-0000000000f1';" >/dev/null

apply "$inverse"
fingerprint rolled-back
diff -u "$cluster_root/before.txt" "$cluster_root/rolled-back.txt" >&2 || { printf 'Inquiry forwarding rollback did not restore the prior catalog.\n' >&2; exit 1; }
apply "$forward"
fingerprint reapplied
diff -u "$cluster_root/after.txt" "$cluster_root/reapplied.txt" >&2 || { printf 'Inquiry forwarding reapply differs from the first apply.\n' >&2; exit 1; }
contract

# Rehearse the inverse at its own ordered boundary before installing successors
# that depend on the forwarding reader. Then prove the composed current schema.
for migration in $(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | awk -F/ '{print $NF"\t"$0}' | sort | cut -f2); do
  [[ "$(basename "$migration")" > "$(basename "$forward")" ]] || continue
  apply "$migration"
done
contract
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
printf 'Inquiry forwarding SQL contract passed (ordered-boundary forward, populated refusal, exact rollback/reapply, current successors and read-only RPCs).\n'
