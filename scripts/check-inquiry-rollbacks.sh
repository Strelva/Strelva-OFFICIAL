#!/usr/bin/env bash
set -euo pipefail

# Called only by the isolated workspace SQL gate, never against a remote DB.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
socket_path="${1:?local socket required}"
cluster_port="${2:?local port required}"
[[ "$socket_path" = /* && -S "$socket_path/.s.PGSQL.$cluster_port" ]] || exit 1
psql_args=(--host="$socket_path" --port="$cluster_port" --username="$(id -un)" --set=ON_ERROR_STOP=1 --no-psqlrc)
cleanup() {
  psql "${psql_args[@]}" --dbname=postgres -c 'drop database if exists inquiry_rollback_case' -c 'drop database if exists inquiry_rollback_template' >/dev/null
}
trap cleanup EXIT

# Retain the existing contract fixtures, including accepted/ambiguous notices,
# as committed fictional rows in a clone. Production and the aggregate fixture
# remain untouched. Each rollback gets an independent copy of this template.
psql "${psql_args[@]}" --dbname=postgres -c 'create database inquiry_rollback_template template postgres strategy file_copy' >/dev/null
fixture_index=90
for fixture in connected-inquiry-owner-notices inquiry-decision-notice-events inquiry-business-facts inquiry-booking-handoff inquiry-workspace-replies; do
  # Contracts normally roll back and may reuse keys. Keep them separate when
  # committing their fictional rows into the retention-proof template.
  fixture_key="$(printf '%024d' "$fixture_index")"
  fixture_token="$(printf '%032d' "$fixture_index")"
  fixture_index=$((fixture_index+1))
  printf 'Retaining fictional rollback fixture: %s\n' "$fixture"
  sed -e 's/^rollback;$/commit;/' -e "s/repeat('n',24)/'$fixture_key'/g" \
    -e "s/repeat('n',32)/'$fixture_token'/g" -e 's/ir-/rollback-ir-/g' \
    -e "s/'lead_/'lead_rollback_/g" -e 's/"lead_/"lead_rollback_/g' "$repo_root/tests/$fixture-schema.sql" |
    psql "${psql_args[@]}" --dbname=inquiry_rollback_template >/dev/null
done
psql "${psql_args[@]}" --dbname=inquiry_rollback_template <<'SQL' >/dev/null
insert into public.inquiry_engine_reply_claims(lead_row_id,attempt_id)
  select id,gen_random_uuid() from public.tenant_leads limit 1 on conflict do nothing;
create table public.inquiry_rollback_snapshots (table_name text primary key, rows jsonb not null);
do $$
declare relation record; snapshot jsonb;
begin
  for relation in select tablename from pg_tables where schemaname='public' and
    (tablename like 'inquiry_%' or tablename like 'connected_inquiry_%' or
     tablename in ('tenant_leads','owner_decisions','business_record_facts','business_record_revisions',
       'business_bookings','business_booking_history','business_booking_messages'))
    and tablename <> 'inquiry_rollback_snapshots'
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',relation.tablename) into snapshot;
    insert into public.inquiry_rollback_snapshots values(relation.tablename,snapshot);
  end loop;
end $$;
SQL

rollbacks=(
  inquiry-workspace-replies w6-inquiry-outcome-proof inquiry-weekly-outcomes
  inquiry-context-notices w6-connected-inquiry-records inquiry-urgent-decisions
  inquiry-inbox inquiry-reply-purpose inquiry-cache-presence
  connected-inquiry-owner-notices inquiry-export-before-teardown
  inquiry-decision-notice-claims inquiry-decision-notice-events
  tenant-lead-parity-completeness inquiry-member-replies inquiry-business-facts
  inquiry-operator-authority inquiry-booking-handoff inquiry-operator-review
)
for rollback in "${rollbacks[@]}"; do
  psql "${psql_args[@]}" --dbname=postgres -c 'create database inquiry_rollback_case template inquiry_rollback_template strategy file_copy' >/dev/null
  psql "${psql_args[@]}" --dbname=inquiry_rollback_case --file="$repo_root/supabase/migrations/rollback-$rollback.sql" >/dev/null
  psql "${psql_args[@]}" --dbname=inquiry_rollback_case --file="$repo_root/tests/inquiry-rollback-retention-schema.sql" >/dev/null
  psql "${psql_args[@]}" --dbname=postgres -c 'drop database inquiry_rollback_case' >/dev/null
  printf 'Inquiry rollback passed with exact retained evidence: %s\n' "$rollback"
done
psql "${psql_args[@]}" --dbname=postgres -c 'create database inquiry_rollback_case template inquiry_rollback_template strategy file_copy' >/dev/null
for ((index=${#rollbacks[@]}-1; index>=0; index--)); do
  psql "${psql_args[@]}" --dbname=inquiry_rollback_case --file="$repo_root/supabase/migrations/rollback-${rollbacks[index]}.sql" >/dev/null
done
psql "${psql_args[@]}" --dbname=inquiry_rollback_case --file="$repo_root/tests/inquiry-rollback-retention-schema.sql" >/dev/null
psql "${psql_args[@]}" --dbname=postgres -c 'drop database inquiry_rollback_case' >/dev/null
psql "${psql_args[@]}" --dbname=postgres -c 'drop database inquiry_rollback_template' >/dev/null
trap - EXIT
printf 'All 19 inquiry rollbacks passed individually and in reverse order with retained evidence.\n'
