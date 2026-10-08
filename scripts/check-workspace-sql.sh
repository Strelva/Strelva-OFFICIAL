#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$repo_root/supabase/migrations/20260905190000_release_one_workspaces.sql"
schema_test="$repo_root/tests/workspace-schema.sql"
source "$repo_root/scripts/temp-postgres.sh"
create_temp_postgres strelva-workspace-sql
cluster_port="$((61000 + ($$ % 3000)))"

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
read -r cluster_postmaster_pid < "$cluster_data/postmaster.pid"

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

# Hold long enough for a separate psql probe under parallel-stream CPU load.
# The probe still has its strict 150ms lock timeout; permission assertions do not change.
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
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010163200_version_owner_grants.sql"
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
# The new public reader replaces the historical looser connected-site filter.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261012110000_business_pages.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261012110000_business_pages.sql"
psql "${psql_args[@]}" -Atc "select to_regclass('public.business_pages') is null and to_regprocedure('public.business_confirmed_public_facts(uuid)') is null" | grep -qx t
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261012110000_business_pages.sql"
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
# Wave 6 inquiry closure: additive replies, exact outcome proof, notice context and connected spam review.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010120000_inquiry_workspace_replies.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010121000_inquiry_outcome_proof.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010122000_inquiry_weekly_outcomes.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-workspace-replies-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010123000_inquiry_context_notices.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-context-notices-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010124000_connected_inquiry_records.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/connected-inquiry-records-schema.sql"
# Strelva (system): the audited service actor for the needs-you and
# workspace-work crons, and the connected_sites flag row. Replaces
# owner_decision_json and workspace_release_flag_names(); the Needs you,
# Make real live and release flag contracts rerun against the replacements.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261009100000_strelva_service_actor.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125000_inquiry_urgent_decisions.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125500_inquiry_inbox.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-inbox-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125700_inquiry_cache_presence.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-cache-presence-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125900_inquiry_export_before_teardown.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-export-before-teardown-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125600_inquiry_reply_purpose.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-reply-purpose-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125800_connected_inquiry_owner_notices.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/connected-inquiry-owner-notices-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-reply-purpose-race-setup.sql"
psql "${psql_args[@]}" --set=engine=true --file="$repo_root/tests/inquiry-reply-purpose-race.sql" >"$cluster_root/inquiry-engine-race.log" 2>&1 &
inquiry_engine_race=$!
psql "${psql_args[@]}" --set=engine=false --file="$repo_root/tests/inquiry-reply-purpose-race.sql" >"$cluster_root/inquiry-owner-race.log" 2>&1 &
inquiry_owner_race=$!
inquiry_engine_status=0
inquiry_owner_status=0
wait "$inquiry_engine_race" || inquiry_engine_status=$?
wait "$inquiry_owner_race" || inquiry_owner_status=$?
if [[ "$inquiry_engine_status" -eq 0 && "$inquiry_owner_status" -ne 0 ]]; then
  grep -q inquiry_reply_already_sent "$cluster_root/inquiry-owner-race.log"
elif [[ "$inquiry_owner_status" -eq 0 && "$inquiry_engine_status" -ne 0 ]]; then
  grep -q reply_purpose_already_claimed "$cluster_root/inquiry-engine-race.log"
else
  printf 'Inquiry reply purpose race did not produce exactly one winner.\n' >&2
  cat "$cluster_root/inquiry-engine-race.log" "$cluster_root/inquiry-owner-race.log" >&2
  exit 1
fi
printf 'Inquiry engine/owner reply race passed: exactly one send purpose claimed.\n'
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
# Publishing listing controls and flag keys, after 20261009140000 (the last
# pinned literal flag list); the final flag test needs 141000's keys (#253).
# 142000 needs legacy collection tables this fixture omits; the full ordered
# replay covers it.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010140000_google_listing_controls.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010141000_publishing_release_flags.sql"
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
# Batch 7A (agency 1.0): provider seats, agency verification, the neutral
# service actor and the payer party. Each 7A contract runs, then the replaced
# contracts that can rerun here rerun against the replacements (workspace
# authority and business billing commit or count fixtures; they rerun after
# the full ordered upgrade in check-workspace-upgrade.sh). Then the rollback
# rehearsal: with committed rows in every 7A table, the four rollbacks in
# reverse order must archive them and leave the public catalog exactly as
# before 7A; then 7A applies again and its contracts hold.
batch_7a=(20261009151000_provider_seats 20261009152000_agency_verifications
  20261009153000_platform_service_actor 20261009154000_payer_party)
catalog_fingerprint() {
  psql "${psql_args[@]}" --tuples-only --no-align --file="$repo_root/tests/support/public-catalog-fingerprint.sql"
}
apply_batch_7a() {
  local name
  for name in "${batch_7a[@]}"; do
    psql "${psql_args[@]}" --single-transaction --file="$repo_root/supabase/migrations/$name.sql"
  done
}
check_batch_7a_contracts() {
  psql "${psql_args[@]}" --file="$repo_root/tests/provider-seats-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/agency-verifications-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/platform-service-actor-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/payer-party-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/batch-7a-reader-modes.sql"
}
check_batch_7a() {
  check_batch_7a_contracts
  psql "${psql_args[@]}" --file="$repo_root/tests/system-versions-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/agency-client-overview-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/strelva-service-actor-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/make-real-owner-link-schema.sql"
  psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-schema.sql"
}
catalog_fingerprint >"$cluster_root/catalog-before-7a.txt"
apply_batch_7a
check_batch_7a
psql "${psql_args[@]}" --file="$repo_root/tests/batch-7a-populated.sql"
for (( index=${#batch_7a[@]}-1; index>=0; index-- )); do
  psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-${batch_7a[$index]}.sql"
done
catalog_fingerprint >"$cluster_root/catalog-after-7a-rollback.txt"
if ! diff -u "$cluster_root/catalog-before-7a.txt" "$cluster_root/catalog-after-7a-rollback.txt"; then
  printf 'Batch 7A rollback did not restore the public catalog.\n' >&2
  exit 1
fi
archived_7a="$(psql "${psql_args[@]}" --tuples-only --no-align --command="
  select (select count(*) from release_rollback_archive.m20261009151000_provider_seats)
    || ' ' || (select count(*) from release_rollback_archive.m20261009151000_agency_client_staff)
    || ' ' || (select count(*) from release_rollback_archive.m20261009151000_workspace_providers)
    || ' ' || (select count(*) from release_rollback_archive.m20261009152000_agency_verifications)
    || ' ' || (select count(*) from release_rollback_archive.m20261009153000_strelva_service_actions)
    || ' ' || (select count(*) from release_rollback_archive.m20261009154000_accounts)
    || ' ' || (select count(*) from release_rollback_archive.m20261009154000_job_economics)
    || ' ' || (select count(*) from release_rollback_archive.m20261009154000_workspace_payer_transitions)")"
if [[ "$archived_7a" != "1 1 1 1 1 1 1 1" ]]; then
  printf 'Batch 7A rollback archives are wrong: %s\n' "$archived_7a" >&2
  exit 1
fi
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-${batch_7a[0]}.sql" >"$cluster_root/7a-wrong-order.log" 2>&1; then
  printf 'A batch 7A rollback ran against a schema without 7A.\n' >&2
  exit 1
fi
grep -q 'rollback_wrong_order_or_function_drift' "$cluster_root/7a-wrong-order.log"
# The rehearsal fixture's rows stay committed, so only the 7A contracts rerun.
apply_batch_7a
check_batch_7a_contracts
printf 'Batch 7A forward, populated rollback and reapply passed.\n'
# Agency signup (#258): the ordinary create path grants nothing outside the
# agency, every effect starts unverified, and the cap and identity hold.
psql "${psql_args[@]}" --file="$repo_root/tests/agency-signup-schema.sql"
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
# #509: provider and operator facts reach client sites only by owner decision.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011133700_business_facts_owner_decision.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-facts-owner-decision-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011133700_business_facts_owner_decision.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-business-facts-schema.sql"
# Owner history before the forward migration: the confirmed copy keeps it.
psql "${psql_args[@]}" --file="$repo_root/tests/business-facts-owner-decision-backfill-seed.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011133700_business_facts_owner_decision.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-facts-owner-decision-backfill.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-facts-owner-decision-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/website-business-facts-schema.sql"
# #509 after #521: every public facts reader (connect.js, /biz, llms.txt,
# JSON-LD) reads only the owner-confirmed copy. #509's rollback refuses to run
# before it; its own rollback restores the 20261012110000 reader.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013110000_public_facts_read_confirmed.sql"
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011133700_business_facts_owner_decision.sql" >"$cluster_root/facts-rollback-order.log" 2>&1; then
  printf '#509 rollback ran before the public-facts reader stopped reading its copy.\n' >&2
  exit 1
fi
grep -q 'business_facts_rollback_order' "$cluster_root/facts-rollback-order.log"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261013110000_public_facts_read_confirmed.sql"
psql "${psql_args[@]}" -Atc "select prosrc not like '%business_record_confirmed%' from pg_proc where oid='public.business_confirmed_public_facts(uuid)'::regprocedure" | grep -qx t
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013110000_public_facts_read_confirmed.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-facts-owner-decision-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/connected-sites-schema.sql"
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
psql "${psql_args[@]}" <<'SQL'
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- Match the retained collection table; publishing outputs depend on it.
create table public.collection_entries (
 id uuid primary key default gen_random_uuid(),tenant_id text not null references public.tenants(id),
 type text not null,slug text not null,status text not null default 'draft',data jsonb not null default '{}',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(tenant_id,type,slug)
);
SQL
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010142000_workspace_publishing_content.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-publishing-content-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011100000_workspace_newsletter_sender.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-newsletter-sender-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-workspace-newsletter-sender.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011100000_workspace_newsletter_sender.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-newsletter-sender-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011100100_newsletter_backfill_identity.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/newsletter-backfill-identity-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-newsletter-backfill-identity.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/newsletter-contacts-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011100100_newsletter_backfill_identity.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/newsletter-backfill-identity-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010154000_system_work_plan_authority.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/system-work-plan-authority-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010155000_failed_system_plan_request.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/failed-system-plan-request-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-release-flags-schema.sql"

# Wave 6 agency, operator, durable client records and portability.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010160000_agency_authoring.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-agency-authoring.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010163000_agency_operator_overview.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-agency-operator-overview.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010163100_version_management.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-version-management.sql"
STRELVA_VERSIONS_PSQL="--host=$cluster_socket --port=$cluster_port --username=$(id -un) --dbname=postgres" \
  pnpm --dir "$repo_root" exec vitest run --maxWorkers=2 --testTimeout=30000 src/__tests__/system-versions-store-contract.test.ts src/__tests__/agency-versions-server.test.ts
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010163300_version_native_applications.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-version-native-applications.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010163400_version_sibling_changes.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-version-sibling-changes.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010161000_operator_google_attempts.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010161100_operator_effort_context.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/operator-google-attempts-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010161200_operator_content_receipts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/operator-content-receipts-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010161300_review_reply_reservations.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-review-reply-reservations.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010161400_operator_complete_sources.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-operator-complete-sources.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010162000_complete_client_record_stores.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-client-record-stores.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010162200_inquiry_delivery_records.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-inquiry-delivery-records.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20260802120000_report_snapshots.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010162100_tenant_receipt_retention.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-tenant-retention.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010164000_finite_job_adapters.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/finite-job-adapters-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010165500_business_portability.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-business-portability.sql"
# Roundtrip before later export/exit extensions replace these wrappers.
psql "${psql_args[@]}" --file="$repo_root/tests/w6-business-portability-rollback.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010165800_unbounded_export_archive.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-unbounded-export-archive.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010165900_export_build_access.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-export-build-access.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010165600_exit_handoff_evidence.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-exit-handoff-evidence.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010165700_export_recovery.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-export-recovery.sql"
# The real Make real runner, checkpointing through these RPCs (psql-backed port).
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125910_inquiry_decision_notice_claims.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-decision-notice-claims-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125915_inquiry_decision_notice_events.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-decision-notice-events-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125920_tenant_lead_parity_completeness.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-lead-parity-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125925_inquiry_member_replies.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-member-replies-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125930_inquiry_business_facts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-business-facts-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125935_inquiry_operator_authority.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-operator-authority-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125940_inquiry_booking_handoff.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-booking-handoff-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125950_inquiry_operator_review.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-operator-review-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010125955_inquiry_operator_revocation.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-operator-revocation-schema.sql"
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
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261010135956_booking_native_workspace.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010135956_booking_native_workspace.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-native-workspace-schema.sql"
# Wave 6: confirmed shared business facts, never private owner contact data.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010165000_tenant_business_context.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-business-context-schema.sql"
# Agency 1.0 native publishing targets and logged booking email enablement.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011102000_native_publishing_targets.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011101000_business_booking_email.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/native-publishing-targets-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-booking-email-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011101000_business_booking_email.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011102000_native_publishing_targets.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011102000_native_publishing_targets.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011101000_business_booking_email.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/native-publishing-targets-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-booking-email-schema.sql"
# Native paused issues cannot enter the integrated tenant-only sender;
# its legacy acceptance/recovery contract remains intact after this migration.
psql "${psql_args[@]}" --file="$repo_root/tests/workspace-newsletter-sender-schema.sql"
# #304 read-only visibility: forward, rollback and reapply.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011140000_agent_booking_visibility.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agent-booking-visibility-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011140000_agent_booking_visibility.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011140000_agent_booking_visibility.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agent-booking-visibility-schema.sql"

# #529: anonymous booking caps, email-only placement, and reversible schema.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011150000_public_booking_admission.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011150000_public_booking_admission.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011150000_public_booking_admission.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/public-booking-admission-schema.sql"
# #547: agent holds share that admission; live-only agent cap; mailbox caps.
# Forward, rollback to #529's functions, and reapply; #529's contract reruns.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013210000_agent_booking_admission.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agent-booking-admission-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261013210000_agent_booking_admission.sql"
psql "${psql_args[@]}" -Atc "select to_regprocedure('public.booking_email_identity(text)') is null and to_regprocedure('public.list_published_business_pages()') is null and position('''agent''' in pg_get_functiondef('public.check_public_booking_budget(uuid,text,timestamptz,timestamptz,text,uuid)'::regprocedure))=0" | grep -qx t
# The regression probes must fail on #529's functions: dead holds, shared budget, one mailbox.
if psql "${psql_args[@]}" --file="$repo_root/tests/agent-booking-admission-schema.sql" >"$cluster_root/agent-admission-before.log" 2>&1; then
  printf 'Agent admission probes passed without 20261013210000.\n' >&2
  exit 1
fi
for probe in dead_holds shared_budget one_email; do
  if ! grep -q "$probe: " "$cluster_root/agent-admission-before.log"; then
    cat "$cluster_root/agent-admission-before.log" >&2
    printf 'Agent admission probe %s did not fail before the fix.\n' "$probe" >&2
    exit 1
  fi
done
psql "${psql_args[@]}" --file="$repo_root/tests/public-booking-admission-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013210000_agent_booking_admission.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agent-booking-admission-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/public-booking-admission-schema.sql"

# Google location lineage through the real Versions/System stores, after the
# account-binding migrations. Preparation stays fake; no Google dispatch.
if [[ -n "${STRELVA_VERSIONS_CONTRACT-1}" ]]; then
  STRELVA_VERSIONS_PSQL="--host=$cluster_socket --port=$cluster_port --username=$(id -un) --dbname=postgres" \
    pnpm --dir "$repo_root" exec vitest run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 src/__tests__/google-location-versions-postgres.test.ts
fi

# #530 M8: an operator with an admin seat never decides an owner item.
# Forward, rollback (the original member branch and the Needs you contract
# hold again), then forward once more.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011153000_operator_owner_decisions.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/operator-owner-decisions-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011153000_operator_owner_decisions.sql"
psql "${psql_args[@]}" --set=after_rollback=true --file="$repo_root/tests/operator-owner-decisions-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011153000_operator_owner_decisions.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/operator-owner-decisions-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-schema.sql"

# The one booking store through both real route families (legacy /api/booking
# and the public booking service) against the real booking functions. Last,
# because it commits its fictional rows.
STRELVA_BOOKINGS_PSQL="--host=$cluster_socket --port=$cluster_port --username=$(id -un) --dbname=postgres" \
  pnpm --dir "$repo_root" exec vitest run --maxWorkers=2 --testTimeout=30000 --hookTimeout=30000 src/__tests__/booking-one-store.test.ts
bash "$repo_root/scripts/check-inquiry-rollbacks.sh" "$cluster_socket" "$cluster_port"
# Wave 6 owner entry and Ask (isolated local proof; explicit rollbacks are never applied here).
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010100000_owner_invitation_claim.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/owner-invitation-claim-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010103000_ask_business_fact_drafts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/ask-business-fact-drafts-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010102000_owner_decision_links.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010102100_website_owner_link_launch.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/owner-decision-links-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010104000_owner_decision_website_preview.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/owner-decision-website-preview-schema.sql"
# Retain a fictional native Version, then prove rollback leaves the business's
# live application, destination records and preparation receipts intact.
psql "${psql_args[@]}" --set=native_keep_fixture=true --file="$repo_root/tests/w6-version-native-applications.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261010163300_version_native_applications.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-version-native-rollback.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010163300_version_native_applications.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/w6-version-native-rollforward.sql"
# Integration: Postgres lead authority plus receipt retention share one teardown wrapper.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261010170000_deprovision_retained_after_inquiry_export.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/deprovision-retained-after-inquiry-export-schema.sql"
# Every stream's release flag key survives every redefinition, in any apply order (#253).
psql "${psql_args[@]}" --file="$repo_root/tests/release-flag-names-final-schema.sql"
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
# Public policy output after the policy projection exists; saved pages block rollback.
psql "${psql_args[@]}" --file="$repo_root/tests/business-pages-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/business-pages-rollback-schema.sql"
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261012110000_business_pages.sql" >"$cluster_root/business-pages-rollback-refusal.log" 2>&1; then
  printf 'Business page rollback discarded saved publication settings.\n' >&2
  exit 1
fi
grep -q 'business_pages_rollback_requires_data_preservation' "$cluster_root/business-pages-rollback-refusal.log"
psql "${psql_args[@]}" -Atc "select exists(select 1 from public.business_pages where handle='rollback-fixture') and to_regprocedure('public.business_confirmed_public_facts(uuid)') is not null" | grep -qx t
printf 'Business page rollback preserved saved publication settings.\n'
# #509 round 3: bookings, inquiries and the linked-site overlay read only the
# owner-confirmed copy. The contract reproduces the leak before the migration
# (an operator's pending phone reaches booking), holds after it alongside the
# earlier booking and inquiry contracts, #509's rollback refuses while it is
# applied, and its rollback restores the exact catalog.
if psql "${psql_args[@]}" --file="$repo_root/tests/booking-confirmed-facts-schema.sql" >"$cluster_root/booking-facts-before.log" 2>&1; then
  printf 'Booking readers already ignored pending facts before 20261013115000.\n' >&2
  exit 1
fi
grep -q 'booking phone is confirmed, got 716-555-0999' "$cluster_root/booking-facts-before.log"
psql "${psql_args[@]}" --tuples-only --no-align --file="$repo_root/tests/support/public-catalog-fingerprint.sql" >"$cluster_root/catalog-before-booking-facts.txt"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013115000_booking_reads_confirmed_facts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-confirmed-facts-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-business-context-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-context-notices-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/inquiry-booking-handoff-schema.sql"
# The hosted facts contract ran forward/rollback/forward above, before
# website-cutover-undo intentionally removes its shared publication fixture.
psql "${psql_args[@]}" --file="$repo_root/tests/connected-sites-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261013110000_public_facts_read_confirmed.sql"
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011133700_business_facts_owner_decision.sql" >"$cluster_root/booking-facts-rollback-order.log" 2>&1; then
  printf '#509 rollback ran while the booking readers still read its copy.\n' >&2
  exit 1
fi
grep -q 'roll back 20261013115000_booking_reads_confirmed_facts first' "$cluster_root/booking-facts-rollback-order.log"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013110000_public_facts_read_confirmed.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261013115000_booking_reads_confirmed_facts.sql"
if ! diff -u "$cluster_root/catalog-before-booking-facts.txt" \
    <(psql "${psql_args[@]}" --tuples-only --no-align --file="$repo_root/tests/support/public-catalog-fingerprint.sql"); then
  printf 'Booking-reader rollback did not restore the exact catalog.\n' >&2
  exit 1
fi
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013115000_booking_reads_confirmed_facts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/booking-confirmed-facts-schema.sql"
printf 'Booking readers read only the confirmed copy; rollback is exact and ordered.\n'
# Every stream's release flag key survives the integrated redefinitions (#253).
psql "${psql_args[@]}" --file="$repo_root/tests/release-flag-names-final-schema.sql"


# Signed tracking keys are service-role-only and cannot be discarded while a
# site depends on them. Prove guarded rollback, empty rollback, and reapply.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261012010000_tenant_track_signing_keys.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261012120000_track_signing_key_rotation.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-track-signing-keys-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-track-signing-key-rotation.sql"
psql "${psql_args[@]}" --command="insert into public.tenants(id,site_name) values('track-signing-rollback-fixture','Tracking key rollback fixture'); insert into public.tenant_track_signing_keys(tenant_id,public_key) values('track-signing-rollback-fixture',repeat('o',100)); select public.rotate_tenant_track_signing_key('track-signing-rollback-fixture',repeat('n',100));" >/dev/null
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261012120000_track_signing_key_rotation.sql" >"$cluster_root/track-key-rotation-rollback.log" 2>&1; then
  printf 'Tracking key rotation rollback discarded an in-window key.\n' >&2
  exit 1
fi
grep -q 'track_signing_key_rotation_rollback_requires_data_preservation' "$cluster_root/track-key-rotation-rollback.log"
psql "${psql_args[@]}" -Atc "select public_key = repeat('n',100) and previous_public_key = repeat('o',100) from public.tenant_track_signing_keys where tenant_id='track-signing-rollback-fixture'" | grep -qx t
psql "${psql_args[@]}" --command="update public.tenant_track_signing_keys set previous_public_key=null, previous_valid_until=null where tenant_id='track-signing-rollback-fixture';" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261012120000_track_signing_key_rotation.sql"
psql "${psql_args[@]}" -Atc "select public_key = repeat('n',100) and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='tenant_track_signing_keys' and column_name='previous_public_key') and to_regprocedure('public.rotate_tenant_track_signing_key(text,text)') is null from public.tenant_track_signing_keys where tenant_id='track-signing-rollback-fixture'" | grep -qx t
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261012010000_tenant_track_signing_keys.sql" >"$cluster_root/track-key-rollback.log" 2>&1; then
  printf 'Tracking key rollback discarded an active site key.\n' >&2
  exit 1
fi
grep -q 'tenant_track_signing_keys_rollback_requires_data_preservation' "$cluster_root/track-key-rollback.log"
psql "${psql_args[@]}" --command="delete from public.tenant_track_signing_keys where tenant_id='track-signing-rollback-fixture'; delete from public.tenants where id='track-signing-rollback-fixture';" >/dev/null
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261012010000_tenant_track_signing_keys.sql"
if [[ "$(psql "${psql_args[@]}" -Atc "select to_regclass('public.tenant_track_signing_keys') is null;")" != t ]]; then
  printf 'Tracking key rollback left its table behind.\n' >&2
  exit 1
fi
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261012010000_tenant_track_signing_keys.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261012120000_track_signing_key_rotation.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/tenant-track-signing-keys-schema.sql"
printf 'Tracking key migration passed forward, guarded rollback, empty rollback and reapply.\n'
# Provider disconnect revocation receipts and local token cleanup: forward,
# rollback while empty, and reapply. Fixtures use fictional credentials only.
psql "${psql_args[@]}" --command="alter table public.tenants add column if not exists instagram_access_token text, add column if not exists updated_at timestamptz not null default now();"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011180000_provider_disconnect_receipts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/provider-disconnect-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011180000_provider_disconnect_receipts.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011180000_provider_disconnect_receipts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/provider-disconnect-schema.sql"
# #524: owner links go only to a trusted owner address. The rollback must
# restore every public function body and privilege, trigger, relation, column
# and constraint exactly; then the migration reapplies.
owner_trust_snapshot() {
  psql "${psql_args[@]}" -At <<'SQL'
select 'fn ' || p.oid::regprocedure::text || ' ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(p.proacl::text, '')
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')
union all
select 'tg ' || t.tgrelid::regclass::text || ' ' || t.tgname || ' ' || t.tgenabled::text || ' ' || md5(pg_get_triggerdef(t.oid))
  from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal
union all
select 'rel ' || c.relname || ' ' || c.relkind::text || ' ' || c.relrowsecurity::text || ' ' || coalesce(c.relacl::text, '')
  from pg_class c where c.relnamespace = 'public'::regnamespace
union all
select 'col ' || a.attrelid::regclass::text || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull::text
  from pg_attribute a join pg_class c on c.oid = a.attrelid
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
union all
select 'con ' || conrelid::regclass::text || ' ' || conname || ' ' || md5(pg_get_constraintdef(oid))
  from pg_constraint where connamespace = 'public'::regnamespace
order by 1;
SQL
}
owner_trust_snapshot >"$cluster_root/owner-trust-before.txt"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013120000_owner_recipient_trust.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/owner-recipient-trust-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261013120000_owner_recipient_trust.sql"
owner_trust_snapshot >"$cluster_root/owner-trust-after-rollback.txt"
if ! diff -u "$cluster_root/owner-trust-before.txt" "$cluster_root/owner-trust-after-rollback.txt"; then
  printf 'Owner recipient trust rollback did not restore the schema exactly.\n' >&2
  exit 1
fi
# The Needs you and Make real link contracts hold on the restored functions
# and again on the reapplied ones.
psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-owner-link-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013120000_owner_recipient_trust.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/owner-recipient-trust-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/needs-you-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/make-real-owner-link-schema.sql"
printf 'Owner recipient trust rollback is exact (%s schema objects compared) and reapplies.\n' \
  "$(wc -l <"$cluster_root/owner-trust-before.txt" | tr -d ' ')"

# #525: owner-approved Ask changes confirm the same touched facts.
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013130000_ask_confirms_owner_facts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/ask-confirmed-facts-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261013130000_ask_confirms_owner_facts.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261013130000_ask_confirms_owner_facts.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/ask-confirmed-facts-schema.sql"
printf 'Workspace SQL checks passed on isolated PostgreSQL at %s (port %s).\n' \
  "$cluster_socket" "$cluster_port"

# Enterprise Customers uses a separate isolated cluster because its fictional
# fixture deliberately has no overlap with the workspace schema proof.  Keep
# the aggregate gate explicit without applying either migration to production.
bash "$repo_root/scripts/check-customer-mapping-sql.sh"

# Inquiry capabilities use their own isolated fictional tenant fixture. This
# validates the additive migration without connecting to production.
bash "$repo_root/scripts/check-inquiry-workspace-sql.sh"


# #261 Team authority, atomic staffing, membership cleanup and invitation acceptance.
catalog_fingerprint >"$cluster_root/catalog-before-agency-team.txt"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011160000_agency_team.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-team-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261011160000_agency_team.sql"
catalog_fingerprint >"$cluster_root/catalog-after-agency-team-rollback.txt"
diff -u "$cluster_root/catalog-before-agency-team.txt" "$cluster_root/catalog-after-agency-team-rollback.txt"
printf 'Agency Team rollback restored the public catalog exactly.\n'
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261011160000_agency_team.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-team-schema.sql"
# Agency-sourced public checks: real RLS, quota races and rollback stop points.
bash "$repo_root/scripts/check-agency-prospects-sql.sh"

psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261012180000_agency_brand.sql"

# #264 agency brand: full-schema behavior, actual rollback/reapply, configured-data refusal.
psql "${psql_args[@]}" --file="$repo_root/tests/agency-brand-schema.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261012180000_agency_brand.sql"
psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/20261012180000_agency_brand.sql"
psql "${psql_args[@]}" --file="$repo_root/tests/agency-brand-schema.sql"
psql "${psql_args[@]}" -c "insert into public.users(id,email,verified_at) values ('b2640000-0000-4000-8000-000000000099','rollback-brand@example.test',now()); insert into public.workspaces(id,kind,name,created_by) values ('b2640000-0000-4000-8000-000000000099','agency','Rollback brand','b2640000-0000-4000-8000-000000000099')"
psql "${psql_args[@]}" -c "update public.workspaces set agency_brand=jsonb_build_object('displayName',name,'accentColor','#447a4f','replyTo',null,'logo',null,'credit','runs_on_strelva') where id='b2640000-0000-4000-8000-000000000099'"
if psql "${psql_args[@]}" --file="$repo_root/supabase/migrations/rollback-20261012180000_agency_brand.sql" >"$cluster_root/brand-rollback-refusal.log" 2>&1; then
  printf 'Agency brand rollback discarded configured brands.\n' >&2; exit 1
fi
grep -q 'agency_brand_rollback_requires_data_preservation' "$cluster_root/brand-rollback-refusal.log"
psql "${psql_args[@]}" -c "update public.workspaces set agency_brand=null where agency_brand is not null"
printf 'Agency brand SQL passed: resolution, revocation, exposure, rollback/reapply and preservation.\n'
