#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-ledger-attribution strelva-ledger-attribution-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql;do
 name="$(basename "$migration")"
 if [[ "$name" == 20261005090000_tenant_leads.sql || "$name" == 20261020090034_split_attribution_receipts.sql ]];then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
forward="$repo_root/supabase/migrations/20261020090034_split_attribution_receipts.sql"
rollback="$repo_root/supabase/migrations/rollback-20261020090034_split_attribution_receipts.sql"
# A real old RPC accrual is committed before upgrade. Its historical source
# lacks acquisition evidence; the new implementation must not fabricate one.
sed -e 's/b2840000/b2830000/g' -e 's/attribution-/legacy-attribution-/g' "$repo_root/tests/support/business-attribution-fixture.sql" > "$cluster_root/legacy-fixture.sql"
psql "${psql_args[@]}" -f "$cluster_root/legacy-fixture.sql" >/dev/null
query "create schema ledger_legacy_fixture;create table ledger_legacy_fixture.frozen as select public.accrue_invoice_splits('b2830000-0000-4000-8000-000000000010','il_LegacyAgency',clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 day','platform','ch_LegacyAgency',1000,'cad') result" >/dev/null
query "select public.choose_business_provider('b2830000-0000-4000-8000-000000000001','legacy-attribution-owner@example.test','b2830000-0000-4000-8000-000000000010','b2830000-0000-4000-8000-000000000021')" >/dev/null
catalog="select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',p.prosrc,'security',p.prosecdef,'volatility',p.provolatile,'config',p.proconfig,'acl',(select jsonb_agg(to_jsonb(a) order by a.grantor,a.grantee,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"
query "$catalog" > "$cluster_root/before.catalog"
psql "${psql_args[@]}" -f "$forward" >/dev/null
legacy="select (select result from ledger_legacy_fixture.frozen)=public.accrue_invoice_splits(business_workspace_id,invoice_line_id,period_start,period_end,source_account_id,source_charge_id,basis_cents,currency,installation_id) from public.revenue_splits where invoice_line_id='il_LegacyAgency' and beneficiary_kind='platform'"
[[ "$(query "$legacy")" == t ]]
[[ "$(query "select not exists(select 1 from public.invoice_split_attributions) and not exists(select 1 from public.business_attributions)")" == t ]]
printf 'Populated legacy upgrade/replay preserves exact prior rows after operator replacement, without invented source/attribution.\n'
# Deliberate later-wrapper drift must prevent inverse even with an empty ledger.
query "create or replace function public.accrue_invoice_splits(p_business_id uuid,p_line_id text,p_period_start timestamptz,p_period_end timestamptz,p_source_account text,p_charge_id text,p_basis bigint,p_currency text,p_installation_id uuid default null,p_source_revision_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,pg_temp as \$\$begin return null;end\$\$" >/dev/null
if psql "${psql_args[@]}" -f "$rollback" > "$cluster_root/drift.log" 2>&1;then printf 'Rollback erased later wrapper\n' >&2;exit 1;fi
rg -q split_attribution_rollback_wrong_order "$cluster_root/drift.log"
python3 - "$forward" "$cluster_root/wrapper.sql" <<'PYCODE'
from pathlib import Path
import re,sys
s=Path(sys.argv[1]).read_text();body=re.search(r'create function public.accrue_invoice_splits\(.*?\$\$;',s,re.S).group(0)
Path(sys.argv[2]).write_text(body.replace('create function','create or replace function',1))
PYCODE
psql "${psql_args[@]}" -f "$cluster_root/wrapper.sql" >/dev/null
psql "${psql_args[@]}" -f "$rollback" >/dev/null
query "$catalog" > "$cluster_root/after.catalog"
cmp "$cluster_root/before.catalog" "$cluster_root/after.catalog"
printf 'Empty inverse restores exact full prior function source/ACL; later wrapper drift refuses.\n'
psql "${psql_args[@]}" -f "$forward" >/dev/null
psql "${psql_args[@]}" -f "$repo_root/tests/ledger-attribution-schema.sql"
# Historical committed rows belong only to the upgrade database. Original
# regression fixtures intentionally assert whole clean-ledger results.
createdb --host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" ledger_regression
regression_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=ledger_regression --set=ON_ERROR_STOP=1 --no-psqlrc)
sed '/^create role /d' "$repo_root/scripts/sql/local-supabase-shim.sql" > "$cluster_root/regression-shim.sql"
psql "${regression_args[@]}" -f "$cluster_root/regression-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql;do
 name="$(basename "$migration")"
 if [[ "$name" == 20261005090000_tenant_leads.sql ]];then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${regression_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${regression_args[@]}" -f "$migration" >/dev/null
done
psql "${regression_args[@]}" -f "$repo_root/tests/connect-money-schema.sql" >/dev/null
psql "${regression_args[@]}" -f "$repo_root/tests/money-apps-creator-quote-ledger-schema.sql" >/dev/null
printf 'Original connect-money/creator-ledger regressions pass in an independent clean database.\n' 
psql "${psql_args[@]}" --set=ledger_attribution_retain=1 -f "$repo_root/tests/ledger-attribution-schema.sql" >/dev/null
source "$repo_root/scripts/sql/ledger-attribution-races.sh"
check_ledger_attribution_races
query "select source_account_id||':'||invoice_line_id||':'||encode(digest(receipt::text,'sha256'),'hex') from public.invoice_split_attributions order by 1" > "$cluster_root/receipts.before"
if psql "${psql_args[@]}" -f "$rollback" > "$cluster_root/populated.log" 2>&1;then printf 'Rollback erased attribution receipts\n' >&2;exit 1;fi
rg -q split_attribution_receipts_require_preservation "$cluster_root/populated.log"
query "select source_account_id||':'||invoice_line_id||':'||encode(digest(receipt::text,'sha256'),'hex') from public.invoice_split_attributions order by 1" > "$cluster_root/receipts.after"
cmp "$cluster_root/receipts.before" "$cluster_root/receipts.after"
query "begin read only;set local role service_role;select public.export_workspace_v3_category('b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000001','attribution-owner@example.test','revenue_splits',0,1000);commit" >/dev/null
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
psql "${psql_args[@]}" -f "$repo_root/tests/function-exposure-schema.sql" >/dev/null
if [[ -n "${LEDGER_ATTRIBUTION_PROOF_DIR:-}" ]];then
 mkdir -p "$LEDGER_ATTRIBUTION_PROOF_DIR"
 cp "$cluster_root"/race-*.log "$cluster_root/drift.log" "$cluster_root/populated.log" "$LEDGER_ATTRIBUTION_PROOF_DIR/"
 cp "$cluster_root/receipts.before" "$cluster_root/receipts.after" "$LEDGER_ATTRIBUTION_PROOF_DIR/"
fi
printf 'Native lineage/source/zero/wholesale/loss/replay/legacy/ACL/READ ONLY/guarded rollback proof passed.\n' 
