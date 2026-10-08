#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-agency-prospects
cluster_port="$((61000 + ($$ % 3000)))"
for command_name in initdb pg_ctl psql; do command -v "$command_name" >/dev/null || { printf 'Missing %s\n' "$command_name" >&2; exit 1; }; done
mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc)
psql "${psql_args[@]}" <<'SQL'
create role service_role nologin bypassrls;
create role authenticated nologin;
create role anon nologin;
create schema auth;
grant usage on schema auth to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.users(id uuid primary key,email text unique not null,verified_at timestamptz);
create table public.tenants(id text primary key,subscription_status text not null default 'none');
SQL
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260905190000_release_one_workspaces.sql" >/dev/null
migration="$repo_root/supabase/migrations/20261011170000_agency_prospects.sql"
rollback="$repo_root/supabase/migrations/rollback-20261011170000_agency_prospects.sql"
psql "${psql_args[@]}" --file="$migration" >/dev/null
# Real rollback before adoption, followed by real reapply.
psql "${psql_args[@]}" --file="$rollback" >/dev/null
psql "${psql_args[@]}" --file="$migration" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/tests/agency-prospects-schema.sql"
# Two independent DB sessions race the final quota slot. Exactly one succeeds.
for attempt in 1 2; do
  (psql "${psql_args[@]}" --command="select public.agency_prospect_admit('b2770000-0000-4000-8000-000000000012');" >"$cluster_root/race-$attempt.log" 2>&1 && touch "$cluster_root/race-$attempt-accepted") &
  race_pids[$attempt]=$!
done
for attempt in 1 2; do wait "${race_pids[$attempt]}" || true; done
accepted=0
for attempt in 1 2; do
  if [[ -f "$cluster_root/race-$attempt-accepted" ]]; then accepted=$((accepted+1));
  elif ! grep -q 'agency_prospect_quota' "$cluster_root/race-$attempt.log"; then cat "$cluster_root/race-$attempt.log"; exit 1; fi
done
[[ "$accepted" -eq 1 ]] || { printf 'Quota race admitted %s requests\n' "$accepted"; exit 1; }
if psql "${psql_args[@]}" --file="$rollback" >"$cluster_root/rollback-refusal.log" 2>&1; then
  printf 'Rollback discarded acquired leads\n' >&2; exit 1
fi
grep -q 'agency_prospects_rollback_requires_data_preservation' "$cluster_root/rollback-refusal.log"
printf 'Agency prospects SQL passed: RLS, membership, durable quota, concurrent admission, rollback/reapply and data preservation.\n'
