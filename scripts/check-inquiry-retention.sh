#!/usr/bin/env bash
set -euo pipefail
# This helper is invoked only inside the disposable local workspace SQL gate.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
socket_path="${1:?local socket required}"
cluster_port="${2:?local port required}"
[[ "$socket_path" = /* && -S "$socket_path/.s.PGSQL.$cluster_port" ]] || exit 1
psql_args=(--host="$socket_path" --port="$cluster_port" --username="$(id -un)" --set=ON_ERROR_STOP=1 --no-psqlrc)
worker_pid=''
cleanup() {
  if [[ -n "$worker_pid" ]]; then kill "$worker_pid" 2>/dev/null || true; wait "$worker_pid" 2>/dev/null || true; fi
  psql "${psql_args[@]}" --dbname=postgres -c 'drop database if exists inquiry_retention_case with (force)' >/dev/null
}
trap cleanup EXIT
psql "${psql_args[@]}" --dbname=postgres -c 'create database inquiry_retention_case template postgres strategy file_copy' >/dev/null
# The actual full purge fixture leaves realistic retained data after cleanup.
sed 's/^rollback;$/commit;/' "$repo_root/tests/inquiry-lead-retention.sql" |
  psql "${psql_args[@]}" --dbname=inquiry_retention_case >/dev/null
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail,at) values ('f5380000-0000-4000-8000-000000000099','lead_historical_orphan','delivery','system','{"status":"accepted","body":"Historical raw visitor body"}',clock_timestamp()-interval '366 days');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
values (null,'historical-converted-fixture','f5380000-0000-4000-8000-000000000002','f5380000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('f',64),'{"tenantStableId":"f5380000-0000-4000-8000-000000000097"}');
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail,at) values ('f5380000-0000-4000-8000-000000000097','lead_historical_converted_orphan','captured','visitor','{"body":"Retained converted visitor body"}',clock_timestamp()-interval '10 years');
create table public.retention_recovery_snapshot (relation text primary key, rows jsonb not null);
do $$ declare relation record; rows jsonb; begin
  for relation in select tablename from pg_tables where schemaname='public' and
    (tablename like 'inquiry_%' or tablename like 'connected_inquiry_%' or tablename in ('tenant_leads','tenant_lead_purges','tenant_client_records','booking_inquiry_offers'))
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',relation.tablename) into rows;
    insert into public.retention_recovery_snapshot values(relation.tablename, rows);
  end loop;
end $$;
SQL
psql "${psql_args[@]}" --dbname=inquiry_retention_case --file="$repo_root/supabase/migrations/rollback-20261013221000_inquiry_retention_lifecycle.sql" >/dev/null
psql "${psql_args[@]}" --dbname=inquiry_retention_case --file="$repo_root/supabase/migrations/rollback-20261013220000_inquiry_lead_retention.sql" >/dev/null
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null
do $$ declare snapshot record; actual jsonb; begin
  for snapshot in select * from public.retention_recovery_snapshot loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',snapshot.relation) into actual;
    if actual is distinct from snapshot.rows then raise exception 'retention rollback changed %',snapshot.relation; end if;
  end loop;
  begin perform public.purge_expired_tenant_leads(100); raise exception 'rollback purge unexpectedly succeeded';
  exception when others then if sqlerrm<>'inquiry_lead_retention_rolled_back' then raise; end if; end;
  perform set_config('strelva.purging_expired_tenant_leads','on',true);
  begin delete from public.inquiry_events where lead_id='lead_current'; raise exception 'rollback history deletion succeeded';
  exception when others then if sqlerrm<>'inquiry_events_immutable' then raise; end if; end;
end $$;
SQL
psql "${psql_args[@]}" --dbname=inquiry_retention_case --file="$repo_root/supabase/migrations/20261013220000_inquiry_lead_retention.sql" >/dev/null
psql "${psql_args[@]}" --dbname=inquiry_retention_case --file="$repo_root/supabase/migrations/20261013221000_inquiry_retention_lifecycle.sql" >/dev/null
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null
do $$ declare result jsonb; begin
  if not exists(select 1 from public.inquiry_events where lead_id='lead_historical_orphan' and retain_until<=clock_timestamp()) then raise exception 'historical orphan fallback deadline missing'; end if;
  if not exists(select 1 from public.inquiry_events where lead_id='lead_historical_converted_orphan' and workspace_id='f5380000-0000-4000-8000-000000000002' and retain_until is null and detail->>'body'='Retained converted visitor body') then raise exception 'historical converted orphan ownership lost'; end if;
  result:=public.purge_expired_tenant_leads(100);
  if result->>'purged'<>'0' or result->>'minimized'<>'1' then raise exception 'reapplied purge counts incorrect'; end if;
  if not exists(select 1 from public.inquiry_events where lead_id='lead_historical_orphan' and detail='{"retention":"minimized","status":"accepted"}'::jsonb) then raise exception 'historical orphan acceptance preservation failed'; end if;
end $$;
insert into public.tenants(id,site_name) values ('retention-concurrency','Concurrent fixture');
insert into public.tenant_leads(tenant_stable_id,tenant_slug_at_capture,lead_id,submission_hash,name,captured_at,recorded_via,tenant_deleted_at,retain_until)
select stable_id,id,'lead_concurrent_'||n,n::text,'Fictional visitor',clock_timestamp(),'dual_write',
 clock_timestamp()-interval '366 days',clock_timestamp()-interval '1 day'
from public.tenants cross join generate_series(1,3) n where id='retention-concurrency';
SQL
# An overlapping worker holds the first candidate. The second must skip it,
# respect a one-row bound, and finish without waiting for the first's commit.
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null &
set application_name='inquiry-retention-lock-fixture';
begin;
select 1 from public.tenant_leads where lead_id='lead_concurrent_1' for update;
select pg_sleep(2);
do $$ begin if public.purge_expired_tenant_leads(1)->>'purged'<>'1' then raise exception 'first worker count incorrect'; end if; end $$;
commit;
SQL
worker_pid=$!
ready=''
for ((attempt=0; attempt<100; attempt++)); do
  ready="$(psql "${psql_args[@]}" --dbname=inquiry_retention_case --tuples-only --no-align -c "select count(*) from pg_stat_activity where application_name='inquiry-retention-lock-fixture' and wait_event='PgSleep'")"
  [[ "$ready" = 1 ]] && break
  sleep .02
done
[[ "$ready" = 1 ]] || { printf 'Concurrent retention worker failed to acquire its lock.\n' >&2; exit 1; }
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null
set statement_timeout='1s';
do $$ begin
  if public.purge_expired_tenant_leads(1)->>'purged'<>'1' then raise exception 'second worker count incorrect'; end if;
  if not exists(select 1 from public.tenant_leads where lead_id='lead_concurrent_1') then raise exception 'second worker purged locked row'; end if;
end $$;
SQL
wait "$worker_pid"
worker_pid=''
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null
do $$ begin
  if public.purge_expired_tenant_leads(100)->>'purged'<>'1' then raise exception 'remaining batch count incorrect'; end if;
  if public.purge_expired_tenant_leads(100)->>'purged'<>'0' then raise exception 'repeated purge not empty'; end if;
  if exists(select 1 from public.tenant_leads where lead_id like 'lead_concurrent_%') then raise exception 'expired batch remained'; end if;
  if (select sum(purged_count) from public.tenant_lead_purges where tenant_slug='retention-concurrency')<>3 then raise exception 'duplicate or missing purge receipts'; end if;
  if (select count(*) from public.tenant_lead_purges where tenant_slug='retention-concurrency')<>3 then raise exception 'batch bound not respected'; end if;
end $$;
SQL
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null
insert into public.inquiry_events(tenant_stable_id,lead_id,kind,actor,detail,at,retain_until)
select 'f5380000-0000-4000-8000-000000000098','lead_orphan_concurrent_'||n,'delivery','system',
 '{"status":"accepted","body":"Concurrent private body"}',clock_timestamp()-interval '366 days',clock_timestamp()-interval '1 day'
from generate_series(1,2) n;
SQL
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null &
set application_name='inquiry-retention-orphan-lock-fixture';
begin;
select 1 from public.inquiry_events where lead_id='lead_orphan_concurrent_1' for update;
select pg_sleep(2);
do $$ begin if public.purge_expired_tenant_leads(1)->>'minimized'<>'1' then raise exception 'first orphan worker count incorrect'; end if; end $$;
commit;
SQL
worker_pid=$!
ready=''
for ((attempt=0; attempt<100; attempt++)); do
  ready="$(psql "${psql_args[@]}" --dbname=inquiry_retention_case --tuples-only --no-align -c "select count(*) from pg_stat_activity where application_name='inquiry-retention-orphan-lock-fixture' and wait_event='PgSleep'")"
  [[ "$ready" = 1 ]] && break
  sleep .02
done
[[ "$ready" = 1 ]] || { printf 'Concurrent orphan worker failed to acquire its lock.\n' >&2; exit 1; }
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null
set statement_timeout='1s';
do $$ begin
  if public.purge_expired_tenant_leads(1)->>'minimized'<>'1' then raise exception 'second orphan worker count incorrect'; end if;
  if not exists(select 1 from public.inquiry_events where lead_id='lead_orphan_concurrent_1' and retention_minimized_at is null) then raise exception 'second worker minimized locked orphan'; end if;
end $$;
SQL
wait "$worker_pid"
worker_pid=''
psql "${psql_args[@]}" --dbname=inquiry_retention_case <<'SQL' >/dev/null
do $$ begin
  if public.purge_expired_tenant_leads(1)->>'minimized'<>'0' then raise exception 'repeat orphan batch not empty'; end if;
  if (select sum(minimized_count) from public.inquiry_retention_receipts where tenant_stable_id='f5380000-0000-4000-8000-000000000098')<>2 then raise exception 'duplicate orphan receipts'; end if;
  if (select count(*) from public.inquiry_retention_receipts where tenant_stable_id='f5380000-0000-4000-8000-000000000098')<>2 then raise exception 'orphan batch bound violated'; end if;
end $$;
SQL
printf 'Inquiry retention passed: exact rollback preservation, reapply, overlapping SKIP LOCKED workers and bounded batches.\n'
