#!/usr/bin/env bash
# AG4: exact access consent, owner authority, guarded inverse/reapply.
# Disposable local Postgres only; no Docker, repo env or remote database.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql diff rg; do
  command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }
done
create_temp_postgres strelva-ux-proposal strelva-ux-proposal-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
forward="$repo_root/supabase/migrations/20261024132000_ux_agency_proposal_identity.sql"
rollback="$repo_root/supabase/migrations/rollback-20261024132000_ux_agency_proposal_identity.sql"
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
  else
    apply "$migration"
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
apply "$repo_root/tests/ux-agency-proposal-identity-schema.sql"
fingerprint final
# Rehome the helper explicitly before retaining this otherwise rolled-back test.
cat "$repo_root/tests/support/agency-proposal-response.sql" >"$cluster_root/populated.sql"
sed -e '/^\\ir support\/agency-proposal-response.sql$/d' -e 's/^rollback;$/commit;/' "$repo_root/tests/ux-agency-proposal-identity-schema.sql" >>"$cluster_root/populated.sql"
apply "$cluster_root/populated.sql"
psql "${psql_args[@]}" --command="select public.bring_in_agency('7f000000-0000-4000-8000-000000000001','owner@bakery.example.test','7f000000-0000-4000-8000-0000000000b1','7f000000-0000-4000-8000-0000000000a1','[{\"scope\":\"website\",\"level\":\"prepare\"}]','Pending downgrade');" >/dev/null
# Keep an actual acceptance transaction open after it has checked the owner.
# Both current-identity and membership revocations must wait for that decision.
cat >"$cluster_root/owner-lock-holder.sql" <<SQL
begin;
select public.respond_to_agency_proposal('7f000000-0000-4000-8000-000000000002','lead@north.example.test','7f000000-0000-4000-8000-0000000000a1','7f000000-0000-4000-8000-0000000000b1',true,public.agency_proposal_identity('7f000000-0000-4000-8000-0000000000b1','7f000000-0000-4000-8000-0000000000a1'));
\\o $cluster_root/owner-lock-ready.txt
select 'owner locks acquired';
\\o
select pg_sleep(5);
rollback;
SQL
psql "${psql_args[@]}" --file="$cluster_root/owner-lock-holder.sql" >"$cluster_root/owner-lock-holder.log" 2>&1 &
owner_lock_pid=$!
for ((attempt=0; attempt<100; attempt++)); do
  [[ -s "$cluster_root/owner-lock-ready.txt" ]] && break
  kill -0 "$owner_lock_pid" 2>/dev/null || { cat "$cluster_root/owner-lock-holder.log" >&2; exit 1; }
  sleep 0.05
done
[[ -s "$cluster_root/owner-lock-ready.txt" ]] || { printf 'Owner lock fixture did not become ready.\n' >&2; exit 1; }
for owner_revocation in \
  "update public.users set verified_at=null where id='7f000000-0000-4000-8000-000000000001'" \
  "update public.workspace_memberships set role='admin' where workspace_id='7f000000-0000-4000-8000-0000000000b1' and user_id='7f000000-0000-4000-8000-000000000001'"; do
  if psql "${psql_args[@]}" --command="begin; set local lock_timeout='300ms'; $owner_revocation; rollback;" >"$cluster_root/owner-revocation.log" 2>&1; then
    printf 'Owner revocation passed an in-flight acceptance lock.\n' >&2; exit 1
  fi
  rg -q 'lock timeout' "$cluster_root/owner-revocation.log" || { cat "$cluster_root/owner-revocation.log" >&2; exit 1; }
done
wait "$owner_lock_pid" || { cat "$cluster_root/owner-lock-holder.log" >&2; exit 1; }
# The current READ ONLY readers are a successor to proposal identity. Keep
# them installed for every native/race proof above, then undo that empty
# function-only successor before exercising the predecessor's own guard.
apply "$repo_root/supabase/migrations/rollback-20261025170000_done_integrate_readonly_authorization.sql"
fingerprint pending_predecessor
if psql "${psql_args[@]}" --file="$rollback" >"$cluster_root/refusal.txt" 2>&1; then
  printf 'Pending-proposal rollback unexpectedly succeeded.\n' >&2; exit 1
fi
rg -q 'ux_agency_identity_rollback_pending_proposals' "$cluster_root/refusal.txt" || { cat "$cluster_root/refusal.txt" >&2; exit 1; }
fingerprint pending_refused
diff -u "$cluster_root/pending_predecessor.txt" "$cluster_root/pending_refused.txt" >&2
psql "${psql_args[@]}" --command="do \$\$ begin if public.business_scope_full_control('7f000000-0000-4000-8000-0000000000b1','website') is distinct from '7f000000-0000-4000-8000-0000000000a1'::uuid or (select count(*) from public.agency_scope_grants where customer_workspace_id='7f000000-0000-4000-8000-0000000000b1' and status='proposed') <> 1 then raise exception 'rollback refusal changed access'; end if; end \$\$;" >/dev/null
psql "${psql_args[@]}" --command="select public.respond_to_agency_proposal('7f000000-0000-4000-8000-000000000002','lead@north.example.test','7f000000-0000-4000-8000-0000000000a1','7f000000-0000-4000-8000-0000000000b1',false,public.agency_proposal_identity('7f000000-0000-4000-8000-0000000000b1','7f000000-0000-4000-8000-0000000000a1'));" >/dev/null
apply "$rollback"
apply "$forward"
apply "$repo_root/supabase/migrations/20261025170000_done_integrate_readonly_authorization.sql"
fingerprint populated_reapplied
diff -u "$cluster_root/final.txt" "$cluster_root/populated_reapplied.txt" >&2
printf 'AG4 proposal SQL passed (exact proposals, owner demotion/unverification, immutable terms, controlled current-owner revocation locks, empty and populated inverse/reapply, pending rollback refusal).\n'
