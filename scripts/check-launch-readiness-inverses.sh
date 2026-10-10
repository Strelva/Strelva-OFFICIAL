#!/usr/bin/env bash
set -euo pipefail
# Exact private successor composition, empty inverse order and whole catalog.
# Populated/refusal/authority cases remain with their dedicated native drivers.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-readiness-inverses strelva-readiness-inverses-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
query(){ psql "${psql_args[@]}" -Atq -c "$1"; }
psql "${psql_args[@]}" -f "$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql;do
 name="$(basename "$migration")"
 if [[ "${name:0:14}" > 20261020090030 ]];then continue;fi
 if [[ "$name" == 20261005090000_tenant_leads.sql ]];then continue;fi
 if [[ "$name" == 20261001120000_website_documents.sql ]];then psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/20261005090000_tenant_leads.sql" >/dev/null;fi
 psql "${psql_args[@]}" -f "$migration" >/dev/null
done
catalog="select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'owner',p.proowner,'acl',(select jsonb_agg(to_jsonb(a) order by a.grantor,a.grantee,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by p.oid::regprocedure::text) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'"
query "$catalog" > "$cluster_root/before.json"
packets=(20261020090031_provider_change_cancel 20261020090032_responsibility_month_evidence 20261020090033_business_attributions 20261020090034_split_attribution_receipts 20261020090035_creator_maintenance_identity 20261020090036_bundle_maintenance 20261020090037_provider_completion_cleanup)
for packet in "${packets[@]}";do psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/$packet.sql" >/dev/null;done
# A later completion wrapper owns its predecessor until37 is retired.
if psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/rollback-20261020090033_business_attributions.sql" > "$cluster_root/wrong-order.log" 2>&1;then
 printf '33 inverse retired a later completion wrapper\n' >&2;exit 1
fi
rg -q business_attribution_rollback_wrong_order "$cluster_root/wrong-order.log"
for ((i=${#packets[@]}-1;i>=0;i--));do
 psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/rollback-${packets[$i]}.sql" >/dev/null
done
query "$catalog" > "$cluster_root/after.json"
cmp "$cluster_root/before.json" "$cluster_root/after.json"
[[ "$(query "select to_regclass('public.provider_change_cancellations') is null and to_regclass('public.responsibility_meter_months') is null and to_regclass('public.business_attributions') is null and to_regclass('public.invoice_split_attributions') is null and to_regclass('public.provider_completion_cleanup_receipts') is null and to_regclass('release_rollback_baseline.creator_maintenance_identity') is null")" == t ]]
printf 'All seven empty private inverses restore the exact prior public function definitions, owners and ACLs; wrong completion order refused.\n'
for packet in "${packets[@]}";do psql "${psql_args[@]}" -f "$repo_root/supabase/migrations/$packet.sql" >/dev/null;done
node --import tsx "$repo_root/scripts/check-readonly-rpcs.mjs" "postgresql:///postgres?host=$cluster_socket&port=$cluster_port"
printf 'All seven private forwards reapply in order; actual service-reader graph qualifies.\n'
