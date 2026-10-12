#!/usr/bin/env bash
# Throwaway-cluster proof for 20261024400000 (found facts, read grant, agency
# connect link) against stub prerequisites. Applies, checks, rolls back and
# re-applies. Never connects anywhere but its own socket.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-google-found-facts sgff
cluster_port="$((61000 + ($$ % 3000)))"
mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" -l "$cluster_log" -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"
psql_args=(--host="$cluster_socket" --port="$cluster_port" --username="$(id -un)" --dbname=postgres --set=ON_ERROR_STOP=1 --no-psqlrc --quiet)
psql "${psql_args[@]}" <<'SQL'
create role service_role nologin bypassrls; create role authenticated nologin; create role anon nologin;
create table public.users (id uuid primary key, email text unique not null, verified_at timestamptz);
create table public.workspaces (id uuid primary key, kind text not null);
create table public.workspace_memberships (workspace_id uuid references public.workspaces(id), user_id uuid references public.users(id), role text not null, primary key (workspace_id, user_id));
create table public.provider_seats (customer_workspace_id uuid, agency_workspace_id uuid, status text);
create table public.agency_scope_grants (customer_workspace_id uuid, agency_workspace_id uuid, scope text, level text, status text);
create table public.workspace_account_bindings (id uuid primary key, workspace_id uuid, provider text, origin_tenant_stable_id uuid, status text);
create table public.workspace_google_locations (binding_id uuid, account_id text, location_id text);
-- Stub: the real reconnect episode is proven by its own migration checks.
create function public.publishing_google_reconnect(p_action text, p_id uuid default null, p_input jsonb default '{}') returns jsonb language sql as $$ select jsonb_build_object('bindingId', p_id) $$;
insert into public.users values ('10000000-0000-4000-8000-000000000001','owner@example.test',now()),('10000000-0000-4000-8000-000000000002','member@example.test',now()),
 ('10000000-0000-4000-8000-000000000003','staff@example.test',now()),('10000000-0000-4000-8000-000000000004','out@example.test',now());
insert into public.workspaces values ('20000000-0000-4000-8000-000000000001','customer'),('20000000-0000-4000-8000-000000000002','agency');
insert into public.workspace_memberships values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','member');
insert into public.provider_seats values ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','active');
insert into public.agency_scope_grants values ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','google','prepare','active');
insert into public.workspace_account_bindings values ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','google',null,'connected');
insert into public.workspace_google_locations values ('30000000-0000-4000-8000-000000000001','accounts/1','loc1');
SQL
migration="$repo_root/supabase/migrations/20261024400000_google_found_facts_and_read_grant.sql"
rollback="$repo_root/supabase/migrations/rollback-20261024400000_google_found_facts_and_read_grant.sql"
psql "${psql_args[@]}" --file="$migration"
psql "${psql_args[@]}" --command="select has_function_privilege('authenticated','public.read_google_found_facts(uuid,text,uuid)','execute') as authenticated_can_execute" | grep -q " f$" || { echo 'authenticated can execute found facts'; exit 1; }
psql "${psql_args[@]}" --command="begin; set local role authenticated; select count(*) from public.business_google_found_facts; rollback;" >/dev/null 2>&1 && { echo 'authenticated can read found facts'; exit 1; }
psql "${psql_args[@]}" --file="$repo_root/tests/google-found-facts-schema.sql"
psql "${psql_args[@]}" --file="$rollback"
psql "${psql_args[@]}" --command="select to_regclass('public.business_google_found_facts') is null and to_regclass('public.workspace_google_read_grants') is null" | grep -q " t$" || { echo 'rollback left tables'; exit 1; }
psql "${psql_args[@]}" --command="update public.workspace_account_bindings set status='connected'; insert into public.workspace_google_locations select '30000000-0000-4000-8000-000000000001','accounts/1','loc1' where not exists (select 1 from public.workspace_google_locations); insert into public.workspace_account_bindings select '30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','google',null,'connected' where not exists (select 1 from public.workspace_account_bindings); update public.provider_seats set status='active';"
psql "${psql_args[@]}" --file="$migration"
psql "${psql_args[@]}" --file="$repo_root/tests/google-found-facts-schema.sql"
echo "Google found facts SQL: migration, contract, rollback and re-apply passed (stub prerequisites)."
