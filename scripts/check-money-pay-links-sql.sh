#!/usr/bin/env bash
# Coordinator-only: disposable cluster, forward migration, schema assertions,
# exact inverse/reapply and populated inverse refusal. Fictional rows only.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-money-pay-links strelva-money-pay-links-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
apply() { psql "${psql_args[@]}" -f "$1" >/dev/null; }
query() { psql "${psql_args[@]}" -Atc "$1"; }
forward="$repo_root/supabase/migrations/20261026180000_money_agency_pay_links.sql"
inverse="$repo_root/supabase/migrations/rollback-20261026180000_money_agency_pay_links.sql"
apply "$repo_root/scripts/sql/local-supabase-shim.sql"
for migration in "$repo_root"/supabase/migrations/20*.sql; do
 [[ "$(basename "$migration")" < "$(basename "$forward")" ]] || break
 # Retained historical ordering: tenant_leads precedes website_documents.
 [[ "$(basename "$migration")" == 20261005090000_tenant_leads.sql ]] && continue
 if [[ "$(basename "$migration")" == 20261001120000_website_documents.sql ]]; then apply "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql"; fi
 apply "$migration"
done
apply "$repo_root/tests/money-pay-links-before.sql"
psql "${psql_args[@]}" -At -f "$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/before.catalog"
apply "$forward"
apply "$repo_root/tests/money-pay-links-schema.sql"
# The schema test rolls back, so the tables are empty and the inverse is exact.
apply "$inverse"
psql "${psql_args[@]}" -At -f "$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/inverse.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/inverse.catalog"
apply "$forward"
apply "$repo_root/tests/money-pay-links-populated.sql"
if psql "${psql_args[@]}" -f "$inverse" >"$cluster_root/populated-refusal.log" 2>&1; then echo 'Inverse removed retained pay links.' >&2; exit 1; fi
grep -q agency_pay_links_rollback_populated "$cluster_root/populated-refusal.log"
echo 'PASS: pay-link RPC contract, numbered immutable documents, closed ACLs, exact inverse/reapply and populated refusal.'
