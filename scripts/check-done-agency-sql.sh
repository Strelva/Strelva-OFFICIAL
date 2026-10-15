#!/usr/bin/env bash
# Complete-agency contracts on disposable local Postgres only. No providers/Auth/mail.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql diff rg; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
create_temp_postgres strelva-done-agency strelva-done-agency-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
fingerprint() { psql "${psql_args[@]}" -At --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/$1.catalog"; }
while IFS= read -r migration; do
  if [[ "$(basename "$migration")" == 20261025132000* ]]; then fingerprint claim_before; fi
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then
    printf 'Ordered migration failed: %s\n' "$migration" >&2; cat "$cluster_root/migration.log" >&2; exit 1
  fi
  if [[ "$(basename "$migration")" == 20261025132000* ]]; then
    fingerprint claim_forward
    psql "${psql_args[@]}" --file="$(dirname "$migration")/rollback-$(basename "$migration")"
    fingerprint claim_reverted
    diff -u "$cluster_root/claim_before.catalog" "$cluster_root/claim_reverted.catalog"
    psql "${psql_args[@]}" --file="$migration"
    fingerprint claim_reapplied
    diff -u "$cluster_root/claim_forward.catalog" "$cluster_root/claim_reapplied.catalog"
  fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
for fixture in done-agency-signup-systems-schema.sql done-agency-client-systems-schema.sql done-agency-claim-email-schema.sql done-agency-website-decisions-schema.sql agency-qualification-independent-review-schema.sql; do
  psql "${psql_args[@]}" --file="$repo_root/tests/$fixture"
done
# Retain real fictional provider-acceptance and website-execution evidence in
# separate clones. A refused inverse must leave the exact catalog unchanged.
original_psql_args=("${psql_args[@]}")
for guarded in 'done-agency-claim-email-schema:20261025132000_done_agency_claim_email.sql:agency_claim_delivery_receipts_retained' 'done-agency-website-decisions-schema:20261025133000_done_agency_website_decisions.sql:done_agency_website_rollback_recorded_execution'; do
  fixture="${guarded%%:*}"; inverse_spec="${guarded#*:}"
  forward="${inverse_spec%%:*}"; reason="${inverse_spec#*:}"
  psql "${original_psql_args[@]}" --command='create database done_populated_inverse template postgres'
  psql_args=("${original_psql_args[@]}" --dbname=done_populated_inverse)
  awk -v test_root="$repo_root/tests" '
    /^\\ir / { print "\\ir " test_root "/" $2; next }
    /^rollback;$/ { print "commit;"; next }
    { print }
  ' "$repo_root/tests/$fixture.sql" >"$cluster_root/populated-$fixture.sql"
  psql "${psql_args[@]}" --file="$cluster_root/populated-$fixture.sql"
  fingerprint populated
  psql "${psql_args[@]}" -Atc "select jsonb_build_object(
    'claims',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) from public.agency_client_owner_claims c),
    'executions',(select coalesce(jsonb_agg(to_jsonb(e) order by e.decision_id),'[]'::jsonb) from public.done_agency_website_executions e),
    'decisions',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb) from public.owner_decisions d),
    'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.website_document_receipts r));" >"$cluster_root/populated.rows"
  if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-$forward" >"$cluster_root/refusal.log" 2>&1; then
    printf 'Populated done-agency inverse unexpectedly succeeded: %s\n' "$forward" >&2; exit 1
  fi
  rg -q "$reason" "$cluster_root/refusal.log" || { cat "$cluster_root/refusal.log" >&2; exit 1; }
  fingerprint refused
  psql "${psql_args[@]}" -Atc "select jsonb_build_object(
    'claims',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) from public.agency_client_owner_claims c),
    'executions',(select coalesce(jsonb_agg(to_jsonb(e) order by e.decision_id),'[]'::jsonb) from public.done_agency_website_executions e),
    'decisions',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]'::jsonb) from public.owner_decisions d),
    'receipts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.website_document_receipts r));" >"$cluster_root/refused.rows"
  diff -u "$cluster_root/populated.rows" "$cluster_root/refused.rows"
  diff -u "$cluster_root/populated.catalog" "$cluster_root/refused.catalog"
  psql_args=("${original_psql_args[@]}")
  psql "${psql_args[@]}" --command='drop database done_populated_inverse'
done
fingerprint ordered_forward
# Empty inverses run in reverse successor order, then forwards reapply in order.
while IFS= read -r forward; do
  psql "${psql_args[@]}" --file="$(dirname "$forward")/rollback-$(basename "$forward")"
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '2026102513*.sql' | sort -r)
while IFS= read -r forward; do psql "${psql_args[@]}" --file="$forward"; done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '2026102513*.sql' | sort)
fingerprint ordered_reapplied
diff -u "$cluster_root/ordered_forward.catalog" "$cluster_root/ordered_reapplied.catalog"
printf 'Agency contracts, exact empty inverse/reapply, retained claim delivery and website execution refusal passed locally. Auth, browser and hosted delivery remain separate.\n'
