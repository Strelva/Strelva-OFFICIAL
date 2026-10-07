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
  id text primary key,
  subscription_status text not null default 'none'
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
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920120000_websites.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920121000_agency_managed_website_draft_authority.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920122000_public_website_bookings.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260920123000_public_website_booking_fingerprints.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-exit-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-workspace-exit-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-export-v2-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/application-record-edits-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/onboarding-work-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/custom-application-lifecycle-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-calendar-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/work-economics-billing-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-application-authoring-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/websites-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-managed-website-draft-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/public-website-bookings-schema.sql"

# The focused workspace cluster supplies the tenant columns referenced by the
# hosted provisioning RPC. The full upgrade gate verifies their real history.
psql "${psql_args[@]}" <<'SQL'
alter table public.tenants add column owner_name text;
alter table public.tenants add column owner_email text;
alter table public.tenants add column industry text;
alter table public.tenants add column template text;
alter table public.tenants add column delivery_model text not null default 'custom_repo';
alter table public.tenants add column auto_publish boolean not null default false;
alter table public.tenants add column site_url text;
SQL
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261001120000_website_documents.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-documents-schema.sql"
# The focused cluster mirrors the historical domain claim columns; the full
# upgrade gate applies the original schema and proves legacy-row preservation.
psql "${psql_args[@]}" <<'SQL'
create table public.domain_claims (
 tenant_id text not null references public.tenants(id) on delete cascade,
 domain text not null, role text not null, status text not null,
 dns_status text, ssl_status text, verification text[], vercel_project_id text,
 error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 primary key(tenant_id,domain)
);
alter table public.domain_claims enable row level security;
revoke all on public.domain_claims from public,anon,authenticated;
grant all on public.domain_claims to service_role;
insert into public.domain_claims(tenant_id,domain,role,status,dns_status,ssl_status,created_at,updated_at)
 values('v2-fictional','domain-registration-legacy.example.test','production','verified','configured','issued','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z');
SQL
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261001130000_domain_registration_attempt.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/domain-registration-attempt-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261001140000_agency_website_document_drafts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-website-document-schema.sql"

# Workspace authority: one SQL role x permission table and the six writes
# that used to be gated only in TypeScript. The schema file proves the role
# matrix; the loop below proves the membership lock against real concurrent
# sessions, one write at a time.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261005120000_workspace_authority_helpers.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261005120100_workspace_authority_write_rpcs.sql"
# Systems catalog: make_systems (operator or delegated agency only) lands
# before the authority parity file so the role table includes it.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007192000_make_systems_authority.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-authority-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-systems-schema.sql"

authority_leaver='c9000000-0000-4000-8000-000000000005'
# The holder waits for an explicit parent command instead of a short PgSleep.
# Its ready application name is set only after the guarded statement finishes.
# A loaded machine can miss a timed hold entirely; this barrier cannot expire
# before the competing transaction has actually reached its lock wait.
authority_session_ready() {
  local app_name="$1" state="$2" attempt
  for attempt in $(seq 1 200); do
    if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_stat_activity where application_name='$app_name' and $state);")" == t ]]; then
      return 0
    fi
    sleep 0.02
  done
  printf 'Authority race session %s never reached its required state.\n' "$app_name" >&2
  return 1
}
authority_hold() {
  local app_name="$1" statement="$2"
  authority_pipe="$cluster_root/authority-session.in"
  mkfifo "$authority_pipe"
  exec 9<>"$authority_pipe"
  PGAPPNAME="$app_name" psql "${psql_args[@]}" <"$authority_pipe" >"$cluster_root/$app_name-$authority_call.log" 2>&1 &
  authority_holder=$!
  printf "begin;\n%s;\nset local application_name='%s-ready';\n" "$statement" "$app_name" >&9
  authority_session_ready "$app_name-ready" "state='idle in transaction'"
}
authority_release() {
  printf '%s;\n\\q\n' "$1" >&9
  wait "$authority_holder"
  exec 9>&-
  rm "$authority_pipe"
}
for authority_call in $(psql "${psql_args[@]}" -Atc "select name from public.authority_parity_calls order by name"); do
  authority_stmt="$(psql "${psql_args[@]}" -Atc "select replace(stmt, ':actor', quote_literal('$authority_leaver') || '::uuid') from public.authority_parity_calls where name='$authority_call'")"
  authority_tier="$(psql "${psql_args[@]}" -Atc "select tier from public.authority_parity_calls where name='$authority_call'")"
  case "$authority_call" in
    *handoff*) authority_workspace='c9000000-0000-4000-8000-000000000011' ;;
    *) authority_workspace='c9000000-0000-4000-8000-000000000010' ;;
  esac
  authority_membership="workspace_id='$authority_workspace' and user_id='$authority_leaver'"

  # 1. Removed mid-transaction: observe the write queued behind an uncommitted
  # removal, then commit removal. The write must re-read the row and be denied.
  authority_hold authority-remover "delete from public.workspace_memberships where $authority_membership"
  PGAPPNAME=authority-removed-write psql "${psql_args[@]}" -c "set statement_timeout='30s'; $authority_stmt" >"$cluster_root/authority-removed-$authority_call.log" 2>&1 &
  authority_writer=$!
  authority_session_ready authority-removed-write "wait_event_type='Lock'"
  authority_release commit
  if wait "$authority_writer"; then
    printf 'Authority race: %s landed after the actor was removed.\n' "$authority_call" >&2
    exit 1
  fi
  grep -q workspace_membership_required "$cluster_root/authority-removed-$authority_call.log"
  psql "${psql_args[@]}" -c "insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values ('$authority_workspace','$authority_leaver','admin','c9000000-0000-4000-8000-000000000001');" >/dev/null

  # 2. An in-flight write holds membership FOR SHARE until we release it.
  # A concurrent delete must time out even if process scheduling is delayed.
  authority_hold authority-writer "$authority_stmt"
  if psql "${psql_args[@]}" -c "set lock_timeout='150ms'; delete from public.workspace_memberships where $authority_membership;" >"$cluster_root/authority-blocked-$authority_call.log" 2>&1; then
    printf 'Authority race: removal did not wait for in-flight %s.\n' "$authority_call" >&2
    exit 1
  fi
  grep -q 'lock timeout' "$cluster_root/authority-blocked-$authority_call.log"
  authority_release rollback

  # 3. Observe a manager write queued behind an uncommitted downgrade, then
  # commit the downgrade. The write must re-read the role and be denied.
  if [[ "$authority_tier" == manager ]]; then
    authority_hold authority-demoter "update public.workspace_memberships set role='member' where $authority_membership"
    PGAPPNAME=authority-demoted-write psql "${psql_args[@]}" -c "set statement_timeout='30s'; $authority_stmt" >"$cluster_root/authority-demoted-$authority_call.log" 2>&1 &
    authority_writer=$!
    authority_session_ready authority-demoted-write "wait_event_type='Lock'"
    authority_release commit
    if wait "$authority_writer"; then
      printf 'Authority race: %s landed after the actor was downgraded.\n' "$authority_call" >&2
      exit 1
    fi
    grep -q workspace_permission_denied "$cluster_root/authority-demoted-$authority_call.log"
    psql "${psql_args[@]}" -c "update public.workspace_memberships set role='admin' where $authority_membership;" >/dev/null
  fi
  printf 'Workspace authority race passed: %s\n' "$authority_call"
done
# Two actual concurrent service-role transactions claim the same source domain
# with different idempotency keys. Exactly one may start; the loser must leave
# no durable work behind. This uses only the fictional local fixture above.
psql "${psql_args[@]}" --set=request_id=v2-race-first --file="$repo_root/tests/website-document-rebuild-race.sql" >"$cluster_root/website-race-first.log" 2>&1 &
website_race_first=$!
psql "${psql_args[@]}" --set=request_id=v2-race-second --file="$repo_root/tests/website-document-rebuild-race.sql" >"$cluster_root/website-race-second.log" 2>&1 &
website_race_second=$!
website_race_first_status=0
website_race_second_status=0
wait "$website_race_first" || website_race_first_status=$?
wait "$website_race_second" || website_race_second_status=$?
if [[ "$website_race_first_status" -eq 0 && "$website_race_second_status" -ne 0 ]]; then
  grep -q website_rebuild_in_progress "$cluster_root/website-race-second.log"
elif [[ "$website_race_second_status" -eq 0 && "$website_race_first_status" -ne 0 ]]; then
  grep -q website_rebuild_in_progress "$cluster_root/website-race-first.log"
else
  printf 'Website domain claim race did not produce exactly one winner.\n' >&2
  exit 1
fi
psql "${psql_args[@]}" <<'SQL'
do $$ begin
  if (select count(*) from public.saved_product_work where input->>'domainKey'='race.example.test') <> 1 then
    raise exception 'website domain claim race committed duplicate work';
  end if;
end $$;
SQL

# Strelva Reborn business record and tenant conversion. The conversion import
# is the planner output for a synthetic gldf-like tenant (no real data).
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261002120000_business_record.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-record-schema.sql"
psql "${psql_args[@]}" --set=tenant_import="$(cat "$repo_root/tests/fixtures/business-record-tenant-import.json")" \
  --file="$repo_root/tests/business-record-conversion-schema.sql"

# Strelva Reborn section 0: client leads copied to Postgres. Applied after the
# business record here, so conversion attaches leads to the business.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261005090000_tenant_leads.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-leads-schema.sql"
# Systems and Connections (the Systems model spine), on the same fictional
# cluster so the access rule, exit guard and existing-thing projection run
# against the real workspace, website, tenant-link and calendar tables.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261004120000_systems.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/systems-schema.sql"
# Safety batch (audit 2026-10-05): scoped provider launch on the customer's
# approval, then atomic tenant teardown that refuses tenants a workspace
# website still holds. The teardown test reuses the launch fixture's tenants.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007101000_provider_website_launch_authority.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/provider-website-launch-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007100000_atomic_tenant_teardown.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/atomic-tenant-teardown-schema.sql"
# Who owns and operates a converted business: provider mark, operator owner
# invitation (both memberships in one transaction), the tenant owner-recipient
# rule and client lead copies kept after a tenant is deprovisioned.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007110000_business_ownership.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-ownership-schema.sql"
# The earlier contracts still hold with the ownership migration applied. (The
# invitation contract commits its fixture, so the upgrade gate reruns it.)
psql "${psql_args[@]}" --set=tenant_import="$(cat "$repo_root/tests/fixtures/business-record-tenant-import.json")" \
  --file="$repo_root/tests/business-record-conversion-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-leads-schema.sql"
# Owner entry: per-workspace release flags layered over the env flags, and
# the tenant-to-workspace entry resolution, with cross-workspace denial.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007130000_workspace_release_flags.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-release-flags-schema.sql"
# Release rows on agency workspaces too (agency library under `workspace`);
# the business-workspace contract above still holds with it applied.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008161000_release_flags_agency_workspaces.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/release-flags-agency-workspaces-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-release-flags-schema.sql"
# Model-call cost log (one model-call helper, Ask Strelva spec section 5).
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007140000_model_call_log.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/model-call-log-schema.sql"
# Ask Strelva conversation history, and repo-change receipts on a website
# System (preview, owner decision, deploy). Fictional rows, rolled back.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008110000_ask_conversations.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/ask-conversations-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008111000_website_change_receipts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-change-receipts-schema.sql"
# Systems catalog: report cadence, last-sent markers and analytics config
# moved from Redis into Postgres (tenant-scoped, service role only).
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007194000_tenant_report_and_analytics_state.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-report-analytics-state-schema.sql"

# Systems catalog: history caps. Documents and onboarding keep every receipt
# in append-only tables, so edit 201 (and change 501) no longer fail.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007190000_document_revisions.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/document-revisions-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007190100_onboarding_revisions.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/onboarding-revisions-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007190200_application_version_history.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/application-version-history-schema.sql"

# Systems catalog, internal tools: contact and assigned-person fields on the
# business record, the cross-business link guard, and notice receipts.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007192100_internal_tool_links.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/internal-tool-links-schema.sql"
# Versions and the agency surface, on the Systems spine: lineage tables,
# the batched agency client read and Strelva's own agency workspace.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007150000_system_versions.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007150100_agency_client_overview.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007150200_platform_agency_workspace.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/system-versions-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-client-overview-schema.sql"
if [[ -n "${STRELVA_VERSIONS_CONTRACT-1}" ]]; then
  # The same Version store contract the in-memory store passes, run through
  # createSupabaseVersionStore against this cluster (psql-backed RPC port).
  # SQL contracts spawn real Postgres clients; allow bounded host scheduling
  # time without changing lock limits or any behavior assertion.
  STRELVA_VERSIONS_PSQL="--host=$cluster_socket --port=$cluster_port --username=$(id -un) --dbname=postgres" \
    pnpm --dir "$repo_root" exec vitest run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 src/__tests__/system-versions-store-contract.test.ts src/__tests__/agency-versions-server.test.ts
fi
# Needs you and Strelva handled: decision policy, owner decisions and the
# handled read model, on the same fictional cluster (needs the business record,
# tenant links and Systems above).
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007120000_needs_you.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-schema.sql"
# Policy settings: tenant setting moves into decision_policies, the
# operator "owner not told" list and the operator business list.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008124000_needs_you_policy_settings.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-policy-settings-schema.sql"

# Money and the client's data: the business billing home on the dormant
# org-layer tables, client records copied out of Redis, export schema 3 and
# the outcome loop. Fictional tenants only.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260729180000_org_layer_phase0_accounts.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007180000_business_billing.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-billing-schema.sql"
# Twin Trees as two businesses: --separate-business converts a linked-account
# site into its own business with its own billing home. The default join and
# the billing contract above must still hold with it applied.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008160000_convert_separate_business.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/convert-separate-business-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-billing-schema.sql"
psql "${psql_args[@]}" --set=tenant_import="$(cat "$repo_root/tests/fixtures/business-record-tenant-import.json")" \
  --file="$repo_root/tests/business-record-conversion-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007181000_tenant_client_records.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-client-records-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007182000_workspace_export_v3.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-export-v3-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007183000_business_outcomes.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-outcomes-schema.sql"
# Inquiries at 1.0.0 (section 6): Postgres reads for the lead read-source
# switch, with the parity ledger shared with the client stores.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008140000_tenant_lead_reads.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-lead-reads-schema.sql"
# Bookings at 1.0.0 (Reborn §2): one booking store for both route families,
# hours and services read from the business record, requests and pause.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008141000_booking_store.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-store-schema.sql"
# After a booking is taken: reminders sent once, the hold sweep, the 72-hour
# request clock, the manage-link lookup, schedule copies and narrower hours.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009110000_booking_lifecycle.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-lifecycle-schema.sql"
# Publishing: the business-level Google grant, its locations and a receipt
# for every Google write. After Systems, because it extends the origin kinds.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007170000_workspace_account_bindings.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-account-bindings-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010143000_publishing_reconnect.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/publishing-reconnect-schema.sql"
# Human minutes per business, then the operator queue (marks and the
# outside-write receipt ledger) and minutes resolved through the conversion
# link. Fictional rows only; each test rolls back.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260928130000_business_effort_minutes.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-effort-minutes-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007160000_operator_queue.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007160100_business_effort_tenant_links.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-effort-minutes-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/operator-queue-schema.sql"
# Listing writes whose read-back failed, for /admin/queue (after both the
# listing receipts and the operator queue).
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008123000_listing_readback_queue.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/listing-readback-queue-schema.sql"


# Make real activations persisted as operations/activation saved work.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261007155000_make_real_activations.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-activations-schema.sql"
# Possibilities in Postgres (stale rule, adoption at conversion, observed
# revisions, idle withdraw) and Make real live: channel flags and due resume.
# Before the website System block: its linked-publication test commits a
# tenant link, and the conversion contract rerun below expects none.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008130000_system_possibilities.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/system-possibilities-schema.sql"
# Conversion now adopts Systems; undoing an untouched conversion still removes its business.
psql "${psql_args[@]}" --set=tenant_import="$(cat "$repo_root/tests/fixtures/business-record-tenant-import.json")" \
  --file="$repo_root/tests/business-record-conversion-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008131000_make_real_live.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-live-schema.sql"
# The release flag rules still hold after the flag names gain channel keys.
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-release-flags-schema.sql"
STRELVA_POSSIBILITIES_PSQL="--host=$cluster_socket --port=$cluster_port --username=$(id -un) --dbname=postgres" \
  pnpm --dir "$repo_root" exec vitest run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 src/__tests__/possibility-repository.test.ts
# Website System (2026-10-08): publish onto a linked tenant, routing after a
# rename, the business template, and operator domain work on owner approval.
# Replaces reserve_website_hosted_tenant and manage_published_website_tenant;
# check-workspace-upgrade.sh reruns the original website contract after it.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008150000_website_linked_tenant_publication.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008150100_website_domain_owner_approval.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-linked-publication-schema.sql"
# Connected sites (from feat/connected-sites, renamed from 20261002120000):
# facts from the business record, inquiries in tenant_leads, spam in the
# spam pit, domain-ownership proof, and the connected_site System origin.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261008151000_connected_sites.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/connected-sites-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-leads-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-client-records-schema.sql"
# Inquiry records (2026-10-09): spam held in tenant_leads, inquiry_events,
# contact on capture, the workspace read. Replaces the three lead reads, so
# their contracts rerun after it.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009113000_inquiry_records.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-records-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-lead-reads-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-leads-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/connected-sites-schema.sql"
# Strelva (system): the audited service actor for the needs-you and
# workspace-work crons, and the connected_sites flag row. Replaces
# owner_decision_json and workspace_release_flag_names(); the Needs you,
# Make real live and release flag contracts rerun against the replacements.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009100000_strelva_service_actor.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/strelva-service-actor-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-live-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-release-flags-schema.sql"
# Journey gaps (wave 4): Strelva handled lists decided owner decisions
# (replaces read_strelva_handled), and Make real by signed owner link for an
# owner with no account (replaces record_strelva_service_action). The Needs
# you and service actor contracts rerun against the replacements.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009130000_strelva_handled_decisions.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/strelva-handled-decisions-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009131000_make_real_owner_link.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-owner-link-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/strelva-service-actor-schema.sql"
# Make real by owner link gets its own per-business flag key (wave 5).
# Replaces workspace_release_flag_names(); the release flag contracts rerun.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009140000_make_real_owner_link_flag.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-owner-link-flag-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009150000_reader_rpc_volatility.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/reader-rpc-volatility-schema.sql"
# Full effort coverage, rollback before zero logs, and reapply. Both readers
# retain VOLATILE because their identity checks lock authority rows.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009160000_business_effort_coverage.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-effort-coverage-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-business-effort-coverage.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-effort-minutes-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009160000_business_effort_coverage.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-effort-coverage-schema.sql"

rollback_guard_log="$cluster_root/effort-coverage-rollback-guard.log"
if psql "${psql_args[@]}" --file="$repo_root/tests/business-effort-coverage-rollback-schema.sql" >"$rollback_guard_log" 2>&1; then
  printf 'Effort rollback incorrectly accepted existing zero logs.\n' >&2
  exit 1
fi
if ! grep -q 'business_effort_coverage_rollback_has_zero_logs' "$rollback_guard_log"; then
  cat "$rollback_guard_log" >&2
  exit 1
fi

psql "${psql_args[@]}" --file="$repo_root/tests/workspace-release-flags-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-live-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/strelva-service-actor-schema.sql"
# Wave 6 website: fallback undo, immutable release reconciliation, and
# owner-decided domain proposals. Fictional fixtures and isolated Postgres only.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010110000_website_cutover_undo.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010113000_website_system_releases.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-system-releases-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010114000_website_domain_requests.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-domain-requests-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010115000_website_model_admission.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-model-admission-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010115500_website_business_facts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-business-facts-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010115700_website_native_fact_reviews.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-native-fact-reviews-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-cutover-undo-schema.sql"
# Wave 6 catalog: additive submit/contact RPCs, report receipts, newsletter
# projection and delegated Make authority. Run after all required flag names,
# business ownership, Systems and work-plan functions exist.
# Match the retained tenant newsletter table from 20260618224329. This
# isolated workspace fixture does not apply the complete legacy schema.
psql "${psql_args[@]}" <<'SQL'
create table public.newsletter_subscribers (
  tenant_id text not null references public.tenants(id) on delete cascade,
  email text not null, name text,
  subscribed_at timestamptz not null default now(),
  status text not null default 'active',
  primary key (tenant_id, email)
);
SQL
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010150000_internal_tool_submit_notices.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/internal-tool-submit-notices-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010150100_internal_tool_use_links.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/internal-tool-use-links-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010150200_internal_tool_notice_delivery.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/internal-tool-notice-delivery-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010150300_catalog_tool_evidence.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/catalog-tool-evidence-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010150400_internal_tool_use_edits.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/internal-tool-use-edits-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010155100_internal_tool_member_submit.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/internal-tool-member-submit-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010155200_internal_tool_use_link_labels.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/internal-tool-use-link-labels-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010152000_catalog_report_receipts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/catalog-reports-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010153000_newsletter_contacts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/newsletter-contacts-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010154000_system_work_plan_authority.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/system-work-plan-authority-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010155000_failed_system_plan_request.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/failed-system-plan-request-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-release-flags-schema.sql"

# The real Make real runner, checkpointing through these RPCs (psql-backed port).
STRELVA_MAKE_REAL_PSQL="--host=$cluster_socket --port=$cluster_port --username=$(id -un) --dbname=postgres" \
  pnpm --dir "$repo_root" exec vitest run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 src/__tests__/make-real-activation-repository.test.ts
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010130000_booking_parity.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-parity-schema.sql"

psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010131000_booking_access.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010132000_booking_updates.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010133000_booking_calendar_mirror.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010134000_booking_inquiry_offers.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135000_booking_setup.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135500_booking_receipt_history.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135900_booking_receipt_lifecycle.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135910_booking_owner_evidence.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135920_booking_service_policies.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135940_booking_manual.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135945_booking_cancellation_cutoff.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135950_booking_calendar_health.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135955_booking_exit_admission.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135956_booking_native_workspace.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-agent-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-owner-evidence-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-manual-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-service-policy-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-calendar-health-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-native-workspace-schema.sql"
# Prove the final interrupted checkpoint's rollback restores the tenant-only
# functions and can be reapplied before any native commitments are admitted.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-w6-booking-native-workspace.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135956_booking_native_workspace.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-native-workspace-schema.sql"
# #304 read-only visibility: forward, rollback and reapply.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011140000_agent_booking_visibility.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agent-booking-visibility-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011140000_agent_booking_visibility.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011140000_agent_booking_visibility.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agent-booking-visibility-schema.sql"
# Every stream's release flag key survives the last literal redefinition (#253).
psql "${psql_args[@]}" --file="$repo_root/tests/release-flag-names-final-schema.sql"

# The one booking store through both real route families (legacy /api/booking
# and the public booking service) against the real booking functions. Last,
# because it commits its fictional rows.
STRELVA_BOOKINGS_PSQL="--host=$cluster_socket --port=$cluster_port --username=$(id -un) --dbname=postgres" \
  pnpm --dir "$repo_root" exec vitest run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 src/__tests__/booking-one-store.test.ts
# Policy facts: confirmation/provenance/history/undo on the existing record RPC.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011120000_business_policies.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-policies-schema.sql"
# Rollback before adoption and reapply preserve legacy service areas.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011120000_business_policies.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011120000_business_policies.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-policies-schema.sql"

# Adoption is a stop point: rollback refuses both current facts and historical
# policy terms, even after Undo. The real rollback file runs in both cases.
psql "${psql_args[@]}" --set=check_history=0 --set=undo_terms=0 --file="$repo_root/tests/business-policies-rollback-schema.sql"
for policy_guard_phase in current history; do
  if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011120000_business_policies.sql" >"$cluster_root/policy-rollback-refusal.log" 2>&1; then
    printf 'Policy rollback discarded %s terms.\n' "$policy_guard_phase" >&2
    exit 1
  fi
  if ! grep -q 'business_policies_rollback_requires_data_preservation' "$cluster_root/policy-rollback-refusal.log"; then
    cat "$cluster_root/policy-rollback-refusal.log" >&2
    exit 1
  fi
  if [[ "$policy_guard_phase" == "current" ]]; then
    psql "${psql_args[@]}" --set=check_history=0 --set=undo_terms=1 --file="$repo_root/tests/business-policies-rollback-schema.sql"
  else
    psql "${psql_args[@]}" --set=check_history=1 --set=undo_terms=0 --file="$repo_root/tests/business-policies-rollback-schema.sql"
  fi
done
printf 'Policy rollback guards preserved current terms and undone history.\n'

printf 'Workspace SQL checks passed on isolated PostgreSQL at %s (port %s).\n' \
  "$cluster_socket" "$cluster_port"

# Enterprise Customers uses a separate isolated cluster because its fictional
# fixture deliberately has no overlap with the workspace schema proof.  Keep
# the aggregate gate explicit without applying either migration to production.
bash "$repo_root/scripts/check-customer-mapping-sql.sh"

# Inquiry capabilities use their own isolated fictional tenant fixture. This
# validates the additive migration without connecting to production.
bash "$repo_root/scripts/check-inquiry-workspace-sql.sh"
