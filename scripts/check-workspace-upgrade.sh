#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
baseline_migration="20260802120000_report_snapshots.sql"
upgrade_migration="20260905190000_release_one_workspaces.sql"
schema_test="$repo_root/tests/workspace-upgrade-schema.sql"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-workspace-upgrade strelva-upgrade-socket
cluster_port="$((61000 + ($$ % 3000)))"

for command_name in initdb pg_ctl psql grep; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required upgrade-check command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$schema_test" || ! -f "$repo_root/supabase/migrations/$baseline_migration" || ! -f "$repo_root/supabase/migrations/$upgrade_migration" ]]; then
  printf 'Upgrade baseline, migration, or SQL test fixture is missing.\n' >&2
  exit 1
fi

initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" \
  -l "$cluster_log" \
  -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" \
  -w start >/dev/null
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"

psql_args=(
  --host="$cluster_socket"
  --port="$cluster_port"
  --username="$(id -un)"
  --dbname=postgres
  --set=ON_ERROR_STOP=1
  --no-psqlrc
)

# Supabase owns auth.users and auth.uid(). The compatibility shim is local-only
# and shared with the scrubbed production copy; the public schema itself starts
# from the repository's real historical migrations.
psql "${psql_args[@]}" --file="$repo_root/scripts/sql/local-supabase-shim.sql" >/dev/null

for migration in $(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort); do
  migration_name="$(basename "$migration")"
  if [[ "$migration_name" > "$baseline_migration" ]]; then
    break
  fi
  printf 'Applying documented prior schema: %s\n' "$migration_name"
  psql "${psql_args[@]}" --file="$migration" >/dev/null
done

# Representative rows exist before the workspace/recovery additions. The
# identity and tenant migrations above create the same columns/triggers used by
# this fixture; later migrations must preserve these rows and their mirrors.
psql "${psql_args[@]}" <<'SQL'
insert into public.users (id, email, verified_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'owner@upgrade.example', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'unverified@upgrade.example', null);
insert into public.tenants (id, site_name, active)
  values ('upgrade-site', 'Upgrade Fixture Site', true);
insert into public.memberships (user_id, tenant_id, role)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'upgrade-site', 'owner');
insert into public.content (tenant_id, section, data)
  values ('upgrade-site', 'hero', '{"headline":"Before the workspace upgrade"}'::jsonb);
insert into public.report_snapshots (tenant_id, period, metrics)
  values ('upgrade-site', '2026-08', '{"retained":true}'::jsonb);
SQL

tail_started=0
early_lead_migration="20261005090000_tenant_leads.sql"
for migration in $(find "$repo_root/supabase/migrations" -maxdepth 1 -type f -name '20*.sql' | sort); do
  migration_name="$(basename "$migration")"
  if [[ "$tail_started" -eq 0 ]]; then
    if [[ "$migration_name" != "$upgrade_migration" ]]; then
      continue
    fi
    tail_started=1
  fi
  if [[ "$migration_name" == "$early_lead_migration" ]]; then
    printf 'Skipping %s: applied ahead of the October 1 migrations above.\n' "$migration_name"
    continue
  fi
  if [[ "$migration_name" == "20261001120000_website_documents.sql" ]]; then
    # Production is at 20260930120000. The client lead store must be safe to
    # apply first, on its own, before the website and business record
    # migrations; prove that order here. The business record migration then
    # creates the conversion trigger itself.
    printf 'Applying client lead store ahead of October 1: %s\n' "$early_lead_migration"
    psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/$early_lead_migration" >/dev/null
    psql "${psql_args[@]}" --file="$repo_root/tests/tenant-leads-schema.sql"
  fi
  printf 'Applying ordered workspace/recovery migration: %s\n' "$migration_name"
  if [[ "$migration_name" == "20260920060000_content_version_request_id.sql" ]]; then
    # A reader must make the metadata change fail immediately, not queue an
    # exclusive lock that would hold up subsequent client requests.
    PGAPPNAME=strelva-column-holder psql "${psql_args[@]}" \
      -c 'begin; lock table public.content_versions in access share mode; select pg_sleep(2); rollback;' \
      > "$cluster_root/column-holder.log" 2>&1 &
    holder_pid=$!
    lock_ready=0
    for attempt in $(seq 1 40); do
      if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='strelva-column-holder' and l.relation='public.content_versions'::regclass and l.granted);")" == t ]]; then lock_ready=1; break; fi
      sleep 0.025
    done
    [[ "$lock_ready" == 1 ]] || { printf 'Reader lock fixture failed.\n' >&2; exit 1; }
    if PGOPTIONS='-c statement_timeout=500ms' psql "${psql_args[@]}" --file="$migration" > "$cluster_root/column-contention.log" 2>&1; then
      printf 'Column migration incorrectly accepted a conflicting client lock.\n' >&2; exit 1
    fi
    grep -q 'could not obtain lock' "$cluster_root/column-contention.log"
    [[ "$(psql "${psql_args[@]}" -Atc "select not exists(select 1 from information_schema.columns where table_schema='public' and table_name='content_versions' and column_name='request_id');")" == t ]]
    wait "$holder_pid"
    printf 'Column contention failed immediately and left the schema unchanged.\n'
  fi
  if [[ "$migration_name" == "20260920060100_content_version_request_index.sql" ]]; then
    # Simulate concurrent maintenance. The index may wait/fail, but a client
    # writer must still acquire its normal lock while that index is waiting.
    PGAPPNAME=strelva-index-holder psql "${psql_args[@]}" \
      -c 'begin; lock table public.content_versions in share update exclusive mode; select pg_sleep(3); rollback;' \
      > "$cluster_root/index-holder.log" 2>&1 &
    holder_pid=$!
    lock_ready=0
    for attempt in $(seq 1 40); do
      if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='strelva-index-holder' and l.relation='public.content_versions'::regclass and l.granted);")" == t ]]; then lock_ready=1; break; fi
      sleep 0.025
    done
    [[ "$lock_ready" == 1 ]] || { printf 'Index lock fixture failed.\n' >&2; exit 1; }
    PGAPPNAME=strelva-waiting-index psql "${psql_args[@]}" --file="$migration" > "$cluster_root/index-contention.log" 2>&1 &
    index_pid=$!
    index_waiting=0
    for attempt in $(seq 1 40); do
      if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_stat_activity where application_name='strelva-waiting-index' and wait_event_type='Lock');")" == t ]]; then index_waiting=1; break; fi
      sleep 0.025
    done
    [[ "$index_waiting" == 1 ]] || { printf 'Index did not reach the contention boundary.\n' >&2; exit 1; }
    psql "${psql_args[@]}" -c 'begin; lock table public.content_versions in row exclusive mode nowait; rollback;' >/dev/null
    if wait "$index_pid"; then printf 'Expected bounded index lock timeout was absent.\n' >&2; exit 1; fi
    grep -q 'lock timeout' "$cluster_root/index-contention.log"
    wait "$holder_pid"
    printf 'Client writer remained available during a bounded index lock wait.\n'
  fi
  if [[ "$migration_name" == "20261001130000_domain_registration_attempt.sql" ]]; then
    psql "${psql_args[@]}" <<'SQL'
insert into public.domain_claims(tenant_id,domain,role,status,dns_status,ssl_status,created_at,updated_at)
 values('upgrade-site','domain-registration-legacy.example.test','production','verified','configured','issued','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
SQL
  fi
  psql "${psql_args[@]}" --file="$migration" >/dev/null
  if [[ "$migration_name" == "20260920060100_content_version_request_index.sql" ]]; then
    psql "${psql_args[@]}" --file="$migration" > "$cluster_root/index-retry.log" 2>&1
    psql "${psql_args[@]}" -c 'alter index public.content_versions_tenant_request_idx rename to content_versions_expected_idx; create index content_versions_tenant_request_idx on public.content_versions (request_id);' >/dev/null
    if psql "${psql_args[@]}" --file="$migration" > "$cluster_root/index-wrong-definition.log" 2>&1; then
      printf 'An incompatible existing index was incorrectly accepted.\n' >&2; exit 1
    fi
    grep -q 'content_version_request_index_not_ready' "$cluster_root/index-wrong-definition.log"
    psql "${psql_args[@]}" -c 'drop index public.content_versions_tenant_request_idx; alter index public.content_versions_expected_idx rename to content_versions_tenant_request_idx;' >/dev/null
    printf 'Valid index retry passed; incompatible index was rejected.\n'
  fi
done

if [[ "$tail_started" -ne 1 ]]; then
  printf 'Workspace/recovery migration boundary was not found.\n' >&2
  exit 1
fi

# A second application of the first workspace migration must fail atomically.
# Run it in a transaction so a failed rerun cannot leave a partial schema behind.
rerun_log="$cluster_root/rerun.log"
if psql "${psql_args[@]}" --single-transaction --file="$repo_root/supabase/migrations/$upgrade_migration" >"$rerun_log" 2>&1; then
  printf 'The workspace migration unexpectedly ran twice.\n' >&2
  exit 1
fi
if ! grep -Eq "already exists|duplicate" "$rerun_log"; then
  cat "$rerun_log" >&2
  printf 'The expected migration rerun failure was not observed.\n' >&2
  exit 1
fi
workspace_table_exists="$(psql "${psql_args[@]}" --tuples-only --no-align --command="select to_regclass('public.workspaces') is not null;")"
if [[ "$workspace_table_exists" != "t" ]]; then
  printf 'The failed rerun removed the workspace table.\n' >&2
  exit 1
fi
printf 'Expected migration rerun rejection preserved the applied schema.\n'

psql "${psql_args[@]}" --file="$schema_test"
psql "${psql_args[@]}" --file="$repo_root/tests/service-delivery-commitments-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/customer-business-entry-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/function-exposure-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/newsletter-backfill-identity-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-newsletter-sender-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-documents-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/domain-registration-attempt-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-website-document-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-authority-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-record-schema.sql"
psql "${psql_args[@]}" --set=tenant_import="$(cat "$repo_root/tests/fixtures/business-record-tenant-import.json")" \
  --file="$repo_root/tests/business-record-conversion-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-leads-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-ownership-schema.sql"
# accept_workspace_invitation is replaced by 20261007110000; the original
# invitation contract must still hold against the replacement.
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-invitations-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-report-analytics-state-schema.sql"
psql "${psql_args[@]}" -Atc "select count(*) from pg_trigger where tgname = 'tenant_workspace_links_attach_leads'" | grep -qx 1 \
  || { printf 'Conversion trigger for client leads is missing after out-of-order apply.\n' >&2; exit 1; }
psql "${psql_args[@]}" --file="$repo_root/tests/business-effort-minutes-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-effort-coverage-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/operator-queue-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-account-bindings-schema.sql"
# 20261008160000 replaces convert_tenant_to_business and the billing link
# trigger; the billing contract and the separate-business option both hold.
psql "${psql_args[@]}" --file="$repo_root/tests/business-billing-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/convert-separate-business-schema.sql"
# Release rows: agency workspaces accepted since 20261008161000; business
# workspaces still accepted, personal ones still refused.
psql "${psql_args[@]}" --file="$repo_root/tests/release-flags-agency-workspaces-schema.sql"
# 20261009113000 replaces read_tenant_leads, read_tenant_lead and
# read_tenant_lead_digests; their contracts and the new records hold.
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-lead-reads-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-records-schema.sql"
# 20261008150000 replaces reserve_website_hosted_tenant and
# manage_published_website_tenant; website-documents-schema above proves the
# original contract against the replacements.
psql "${psql_args[@]}" --file="$repo_root/tests/website-linked-publication-schema.sql"
# 20261008151000 widens tenant_leads, tenant_client_records and
# system_origin_kinds; their earlier contracts ran above against it.
psql "${psql_args[@]}" --file="$repo_root/tests/connected-sites-schema.sql"
# 20261009100000 (Strelva service actor) replaces owner_decision_json and
# workspace_release_flag_names(); its contract holds after the full ordered upgrade.
psql "${psql_args[@]}" --file="$repo_root/tests/strelva-service-actor-schema.sql"
# 20261009130000 replaces read_strelva_handled and 20261009131000 replaces
# record_strelva_service_action; both contracts hold after the full upgrade.
psql "${psql_args[@]}" --file="$repo_root/tests/strelva-handled-decisions-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-owner-link-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-schema.sql"
# 20261009140000 replaces workspace_release_flag_names() with the full list
# plus make_real_owner_link.
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-owner-link-flag-schema.sql"
# Later w6 migrations replace it again; the final list keeps every stream's keys.
psql "${psql_args[@]}" --file="$repo_root/tests/release-flag-names-final-schema.sql"
# Batch 7A readers must work in the transaction mode PostgREST chooses for POST.
psql "${psql_args[@]}" --file="$repo_root/tests/reader-rpc-volatility-schema.sql"
# Batch 7A (20261009151000-20261009154000) replaces the actor, service-actor
# and payer functions; its contracts hold after the full ordered upgrade, and
# the replaced contracts above ran against the replacements.
psql "${psql_args[@]}" --file="$repo_root/tests/provider-seats-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-verifications-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/platform-service-actor-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/payer-party-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/batch-7a-reader-modes.sql"
# Native publishing and booking email on the full retained tenant schema.
psql "${psql_args[@]}" --file="$repo_root/tests/native-publishing-targets-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-booking-email-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011101000_business_booking_email.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011102000_native_publishing_targets.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011102000_native_publishing_targets.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011101000_business_booking_email.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/native-publishing-targets-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-booking-email-schema.sql"
# 20261014100000-20261014101000 (#255/#534) replace every client-serving
# super_admins gate with the acting provider; the effect matrix holds after
# the full ordered upgrade, and the replaced contracts above ran against it.
psql "${psql_args[@]}" --file="$repo_root/tests/acting-provider-gates-schema.sql"
printf 'Workspace full-schema upgrade rehearsal passed on isolated PostgreSQL at %s (port %s).\n' \
  "$cluster_socket" "$cluster_port"
