#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$repo_root/supabase/migrations/20260905190000_release_one_workspaces.sql"
schema_test="$repo_root/tests/workspace-schema.sql"
cluster_root="$(mktemp -d "${TMPDIR:-/tmp}/strelva-workspace-sql.XXXXXX")"
cluster_data="$cluster_root/data"
cluster_socket="$cluster_root/socket"
cluster_log="$cluster_root/postgres.log"
cluster_port="$((61000 + ($$ % 3000)))"
cluster_started=0

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ "$cluster_started" -eq 1 ]]; then
    pg_ctl -D "$cluster_data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  printf 'Workspace SQL cluster preserved at: %s\n' "$cluster_root"
  exit "$status"
}
trap cleanup EXIT INT TERM

for command_name in initdb pg_ctl psql; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required PostgreSQL command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done

if [[ ! -f "$migration" || ! -f "$schema_test" ]]; then
  printf 'Workspace migration or SQL test fixture is missing.\n' >&2
  exit 1
fi

mkdir -p "$cluster_socket"
initdb -D "$cluster_data" --locale=C --encoding=UTF8 --auth=trust --no-instructions >/dev/null
pg_ctl -D "$cluster_data" \
  -l "$cluster_log" \
  -o "-F -k '$cluster_socket' -c listen_addresses='' -p $cluster_port" \
  -w start >/dev/null
cluster_started=1

psql_args=(
  --host="$cluster_socket"
  --port="$cluster_port"
  --username="$(id -un)"
  --dbname=postgres
  --set=ON_ERROR_STOP=1
  --no-psqlrc
)

# This deliberately creates only the identity columns and database roles the
# additive workspace migration references. It does not apply another migration.
psql "${psql_args[@]}" <<'SQL'
create role service_role nologin bypassrls;
create role authenticated nologin;
create role anon nologin;

create table public.users (
  id uuid primary key,
  email text unique not null,
  verified_at timestamptz
);

create table public.tenants (
  id text primary key
);
SQL

psql "${psql_args[@]}" --file="$migration"
psql "${psql_args[@]}" --file="$schema_test"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260908120000_workspace_result_recovery.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-recovery-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260911150000_tracker_work_updates.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tracker-work-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260911200000_job_economics.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/work-economics-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260911210000_document_work.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/document-work-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260911220000_work_plan_output_execution.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/work-plan-output-schema.sql"

psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260912010000_budgeted_execution.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/work-economics-runtime-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260912110000_bounded_product_work.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/bounded-product-work-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260912120000_work_context_participation.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/work-context-participation-schema.sql"
psql "${psql_args[@]}" --command="create table public.super_admins(user_id uuid primary key references public.users(id), email text, revoked_at timestamptz);"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260912143000_product_learning_work.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/product-learning-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260912160000_work_responsibilities.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/work-responsibility-schema.sql"

psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260912180000_work_plan_application_output.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/work-plan-application-schema.sql"

psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260912190000_tracker_record_coordination.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tracker-coordination-schema.sql"

psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260912200000_tracker_handoff_isolation.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tracker-handoff-isolation-schema.sql"

psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260914010000_handoff_destinations.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/handoff-destination-schema.sql"

psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260914020000_application_releases.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260914021000_application_source_updates.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260914030000_application_use_access.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260919020000_application_select_fields.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/application-releases-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/application-source-updates-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/application-use-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260914040000_standing_responsibilities.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/standing-responsibilities-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260914041000_standing_execution.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/standing-execution-schema.sql"

psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260915010000_offering_installations.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/offering-installations-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260915030000_operational_assignments.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/operational-assignments-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260918010000_provider_delivery.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/provider-delivery-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260919010000_service_requests.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/service-requests-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260915040000_work_allowances.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/work-allowances-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260915050000_agent_access.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agent-access-schema.sql"

# Minimal website identity fixture. Production owns these columns and membership
# mirrors through its tenant migrations; this cluster never connects there.
psql "${psql_args[@]}" <<'SQL'
alter table public.tenants add column stable_id uuid not null default gen_random_uuid() unique;
alter table public.tenants add column site_name text not null default 'Fictional website';
alter table public.tenants add column active boolean not null default true;
create table public.memberships (
  user_id uuid not null references public.users(id),
  tenant_id text not null references public.tenants(id) on update cascade on delete cascade,
  role text not null check (role in ('viewer','editor','admin','owner')),
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  unique (user_id,tenant_id)
);
SQL

# Inquiry capability state is kept on the workspace SQL cluster as well as the
# focused inquiry cluster below, so its tenant-to-customer exit mapping is
# exercised against the same offering and exit tables used by the aggregate.
psql "${psql_args[@]}" <<'SQL'
create or replace function public.set_tenant_stable_id() returns trigger
language plpgsql set search_path = public as $$
begin
  select stable_id into new.tenant_stable_id from public.tenants where id = new.tenant_id;
  if new.tenant_stable_id is null then
    raise exception 'tenant_stable_id_not_found';
  end if;
  return new;
end;
$$;
SQL
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260911100000_inquiry_capability_workspace.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260915060000_offering_websites.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/offering-websites-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260918120000_public_continuation_imports.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/public-continuation-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260918130000_workspace_invitations.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-invitations-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260918140000_workspace_payer_transitions.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-payer-transitions-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260918150000_workspace_exports.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-export-schema.sql"

# Exercise both lock orders at the acceptance boundary. A creation transaction
# that acquires the workspace lock first keeps the prior payer; an acceptance
# transaction that acquires it first makes the successor authoritative.
psql "${psql_args[@]}" <<'SQL'
insert into public.users(id,email,verified_at) values ('a1000000-0000-4000-8000-000000000004','next@payer.test',now());
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('a1000000-0000-4000-8000-000000000010','a1000000-0000-4000-8000-000000000004','member','a1000000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('a1000000-0000-4000-8000-000000000022','a1000000-0000-4000-8000-000000000010','tracker','tracker','Create wins lock','{}','a1000000-0000-4000-8000-000000000001'),
 ('a1000000-0000-4000-8000-000000000023','a1000000-0000-4000-8000-000000000010','tracker','tracker','Accept wins lock','{}','a1000000-0000-4000-8000-000000000001');
select * from public.workspace_payer_transition_command(
 jsonb_build_object('action','propose','workspaceId','a1000000-0000-4000-8000-000000000010','successorEmail','next@payer.test'),
 'a1000000-0000-4000-8000-000000000001','owner@payer.test');
SQL
psql "${psql_args[@]}" --command="begin; select count(*) from public.job_economics_create_with_payer_transition(jsonb_build_object('action','create','workspaceId','a1000000-0000-4000-8000-000000000010','workId','a1000000-0000-4000-8000-000000000022','productId','tracker','resourceKind','tracker','payerId','a1000000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',800),'a1000000-0000-4000-8000-000000000001','owner@payer.test'); select pg_sleep(1); commit;" >/dev/null &
create_first_pid=$!
sleep 0.2
psql "${psql_args[@]}" --command="select count(*) from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',(select id from public.workspace_payer_transitions where status='pending')),'a1000000-0000-4000-8000-000000000004','next@payer.test');" >/dev/null
wait "$create_first_pid"
psql "${psql_args[@]}" <<'SQL'
do $$ begin
  if (select payer_id from public.job_economics where work_id='a1000000-0000-4000-8000-000000000022')
     is distinct from 'a1000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'create-first boundary changed the payer before acceptance committed';
  end if;
end $$;
SQL

psql "${psql_args[@]}" --command="select count(*) from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','a1000000-0000-4000-8000-000000000010','successorEmail','owner@payer.test'),'a1000000-0000-4000-8000-000000000001','owner@payer.test');" >/dev/null
psql "${psql_args[@]}" --command="begin; select count(*) from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',(select id from public.workspace_payer_transitions where status='pending')),'a1000000-0000-4000-8000-000000000001','owner@payer.test'); select pg_sleep(1); commit;" >/dev/null &
accept_first_pid=$!
sleep 0.2
psql "${psql_args[@]}" --command="select count(*) from public.job_economics_create_with_payer_transition(jsonb_build_object('action','create','workspaceId','a1000000-0000-4000-8000-000000000010','workId','a1000000-0000-4000-8000-000000000023','productId','tracker','resourceKind','tracker','payerId','a1000000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',900),'a1000000-0000-4000-8000-000000000001','owner@payer.test');" >/dev/null
wait "$accept_first_pid"
psql "${psql_args[@]}" <<'SQL'
do $$ begin
  if (select payer_id from public.job_economics where work_id='a1000000-0000-4000-8000-000000000023')
     is distinct from 'a1000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'accept-first boundary did not apply to the next job';
  end if;
end $$;
SQL

# Prove actor-row and workspace-lock ordering with the same account on both
# sides. The blocker makes create queue for the workspace lock first. A
# transition implementation using actor-then-workspace against a create path
# using workspace-then-actor would form a cycle when create later asks for the
# actor row. Both paths must complete with one common order.
psql "${psql_args[@]}" <<'SQL'
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('a1000000-0000-4000-8000-000000000024','a1000000-0000-4000-8000-000000000010','tracker','tracker','Same owner propose race','{}','a1000000-0000-4000-8000-000000000001'),
 ('a1000000-0000-4000-8000-000000000025','a1000000-0000-4000-8000-000000000010','tracker','tracker','Same owner accept race','{}','a1000000-0000-4000-8000-000000000001');
SQL

psql "${psql_args[@]}" --command="begin; select pg_advisory_xact_lock(hashtextextended('a1000000-0000-4000-8000-000000000010',7415)); select pg_sleep(1); commit;" >/dev/null &
propose_blocker_pid=$!
sleep 0.1
psql "${psql_args[@]}" --command="set statement_timeout='5s'; select count(*) from public.job_economics_create_with_payer_transition(jsonb_build_object('action','create','workspaceId','a1000000-0000-4000-8000-000000000010','workId','a1000000-0000-4000-8000-000000000024','productId','tracker','resourceKind','tracker','payerId','a1000000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',910),'a1000000-0000-4000-8000-000000000001','owner@payer.test');" >/dev/null &
same_owner_create_pid=$!
sleep 0.2
psql "${psql_args[@]}" --command="set statement_timeout='5s'; select count(*) from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','a1000000-0000-4000-8000-000000000010','successorEmail','owner@payer.test'),'a1000000-0000-4000-8000-000000000001','owner@payer.test');" >/dev/null &
same_owner_propose_pid=$!
wait "$propose_blocker_pid"
wait "$same_owner_create_pid"
wait "$same_owner_propose_pid"

psql "${psql_args[@]}" --command="begin; select pg_advisory_xact_lock(hashtextextended('a1000000-0000-4000-8000-000000000010',7415)); select pg_sleep(1); commit;" >/dev/null &
accept_blocker_pid=$!
sleep 0.1
psql "${psql_args[@]}" --command="set statement_timeout='5s'; select count(*) from public.job_economics_create_with_payer_transition(jsonb_build_object('action','create','workspaceId','a1000000-0000-4000-8000-000000000010','workId','a1000000-0000-4000-8000-000000000025','productId','tracker','resourceKind','tracker','payerId','a1000000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',920),'a1000000-0000-4000-8000-000000000001','owner@payer.test');" >/dev/null &
same_owner_accept_create_pid=$!
sleep 0.2
psql "${psql_args[@]}" --command="set statement_timeout='5s'; select count(*) from public.workspace_payer_transition_command(jsonb_build_object('action','accept','transitionId',(select id from public.workspace_payer_transitions where status='pending')),'a1000000-0000-4000-8000-000000000001','owner@payer.test');" >/dev/null &
same_owner_accept_pid=$!
wait "$accept_blocker_pid"
wait "$same_owner_accept_create_pid"
wait "$same_owner_accept_pid"

psql "${psql_args[@]}" <<'SQL'
do $$ begin
  if (select count(*) from public.job_economics
      where work_id in ('a1000000-0000-4000-8000-000000000024','a1000000-0000-4000-8000-000000000025')) <> 2 then
    raise exception 'same-actor payer transition races did not preserve both new jobs';
  end if;
  if not exists(select 1 from public.workspace_payer_transitions
      where successor_user_id='a1000000-0000-4000-8000-000000000001' and status='accepted') then
    raise exception 'same-actor accept race did not preserve the accepted boundary';
  end if;
end $$;
SQL

# September 20 completion migrations and focused behavioral fixtures.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920010000_application_date_fields.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920010100_application_record_edits.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920010200_application_edit_field_preservation.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920020000_onboarding_work.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920020100_onboarding_attachment_immutability.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920030000_agency_provider_delivery.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920030100_agency_work_access.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920030200_agency_application_draft_authority.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920030201_agency_application_draft_authority_fix.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920040000_offering_inquiry_workspace.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920050000_custom_application_lifecycle.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920050100_custom_application_economics.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920070000_workspace_calendar_connections.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920070100_workspace_calendar_event_receipts.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920080000_subscription_allowance_entitlements.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920080100_trusted_provider_receipts.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920080200_precise_provider_receipts.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920100000_workspace_exit.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920100100_workspace_export_v2.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920100200_workspace_exit_export_boundaries.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920110000_inquiry_workspace_exit.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-exit-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-workspace-exit-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-export-v2-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/application-record-edits-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/onboarding-work-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/custom-application-lifecycle-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-calendar-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/work-economics-billing-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-application-authoring-schema.sql"

printf 'Workspace SQL checks passed on isolated PostgreSQL at %s (port %s).\n' \
  "$cluster_socket" "$cluster_port"

# Enterprise Customers uses a separate isolated cluster because its fictional
# fixture deliberately has no overlap with the workspace schema proof.  Keep
# the aggregate gate explicit without applying either migration to production.
bash "$repo_root/scripts/check-customer-mapping-sql.sh"

# Inquiry capabilities use their own isolated fictional tenant fixture. This
# validates the additive migration without connecting to production.
bash "$repo_root/scripts/check-inquiry-workspace-sql.sh"
