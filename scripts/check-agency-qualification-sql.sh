#!/usr/bin/env bash
# All ordered migrations + qualification roundtrip/rollback on disposable local Postgres.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
for command_name in initdb pg_ctl psql; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
create_temp_postgres strelva-agency-qualification strelva-aq-socket
cluster_port="$((61000 + ($$ % 3000)))"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null
forward="$repo_root/supabase/migrations/20261024122500_ux_agency_qualification.sql"
rollback="$repo_root/supabase/migrations/rollback-20261024122500_ux_agency_qualification.sql"
query="select target,md5(pg_get_functiondef(target::regprocedure)) from unnest(array['public.record_agency_verification(text,uuid,text,text,jsonb,text)','public.agency_effect_allowed(uuid,text)','public.agency_verification_state(uuid)']) target order by target"
while IFS= read -r migration; do
  if [[ "$migration" == "$forward" ]]; then psql "${psql_args[@]}" -Atc "$query" >"$cluster_root/before.hash"; fi
  if ! psql "${psql_args[@]}" --file="$migration" >"$cluster_root/migration.log" 2>&1; then printf 'Ordered migration failed: %s\n' "$migration" >&2; cat "$cluster_root/migration.log" >&2; exit 1; fi
done < <(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort)
psql "${psql_args[@]}" --file="$rollback" >/dev/null
psql "${psql_args[@]}" -Atc "$query" >"$cluster_root/after.hash"
cmp "$cluster_root/before.hash" "$cluster_root/after.hash"
psql "${psql_args[@]}" --file="$forward" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/agency-full-control-decisions-schema.sql" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/agency-qualification-schema.sql" >/dev/null
if psql "${psql_args[@]}" --file="$rollback" >"$cluster_root/refusal.log" 2>&1; then printf 'Populated qualification rollback unexpectedly succeeded\n' >&2; exit 1; fi
if ! rg -q agency_qualification_populated_rollback_refused "$cluster_root/refusal.log"; then cat "$cluster_root/refusal.log" >&2; exit 1; fi
printf 'Agency qualification and Full control: ordered migrations, empty rollback/reapply, submission/decision authority, READ ONLY, revocation and populated rollback refusal passed locally.\n'
