#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-compensation strelva-comp-socket
mkdir -p "$cluster_socket"
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
for migration in "$repo_root"/supabase/migrations/20*.sql; do
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done
export STRELVA_MAKE_REAL_PSQL="--host=$cluster_socket --port=$cluster_port --username=$(id -un) --dbname=postgres"
cd "$repo_root"
run_contracts() {
  pnpm exec vitest run src/__tests__/make-real-activation-repository.test.ts --maxWorkers=1 --testTimeout=30000
}
run_contracts
psql "${psql_args[@]}" <<'SQL'
do $$begin
  if has_function_privilege('service_role','public.make_real_compensation_transition_valid(jsonb,jsonb,text,boolean)','execute')
    or has_function_privilege('authenticated','public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb)','execute')
    or has_function_privilege('anon','public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb)','execute') then
    raise exception 'compensation helper or mutation exposed';
  end if;
end $$;
SQL
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261014030000_make_real_compensation_claims.sql" >/dev/null
psql "${psql_args[@]}" <<'SQL'
do $$begin
  if has_function_privilege('service_role','public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb)','execute')
    or has_function_privilege('service_role','public.create_make_real_activation(uuid,uuid,text,jsonb)','execute') then
    raise exception 'recovery left activation writes enabled';
  end if;
end $$;
SQL
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261014030000_make_real_compensation_claims.sql" >/dev/null
run_contracts
echo 'Durable compensation, forged transitions, runtime disable/reapply checks passed.'
