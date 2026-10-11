# Sourced only by an owned native PostgreSQL runner after migration 1008.
check_tenant_connection_generation_lifecycle() {
 local first first_pid second_pid blocked generation_dir
 generation_dir="$cluster_root/tenant-generation-races"
 mkdir -p "$generation_dir"
 for first in cas rename;do
  psql "${psql_args[@]}" -q <<'SQL'
delete from public.tenants where stable_id in ('e8210000-0000-4000-8000-000000000091','e8210000-0000-4000-8000-000000000092');
insert into public.tenants(id,stable_id,site_name,active) values ('generation-old-slug','e8210000-0000-4000-8000-000000000091','Fictional Generation A',true);
select public.record_tenant_client_record('generation-old-slug','provider_connections','google','{"provider":"google","status":"connected","accessToken":"enc:v1:AAAA:BBBB:CCCC"}',repeat('a',64),'2026-10-08T00:00:00Z','dual_write','replace');
SQL
  if [[ "$first" == cas ]];then
   psql "${psql_args[@]}" -q >"$generation_dir/first-$first.log" 2>&1 <<'SQL' &
begin;
select public.mutate_tenant_provider_connection('generation-old-slug','google','{"provider":"google","status":"connected","accessToken":"enc:v1:AAAA:BBBB:CCCC"}','{"provider":"google","status":"connected","accessToken":"enc:v1:DDDD:EEEE:FFFF"}',repeat('c',64),'2026-10-08T00:00:00Z');
select 'generation-lock-held';
select pg_sleep(2);
commit;
SQL
  else
   psql "${psql_args[@]}" -q >"$generation_dir/first-$first.log" 2>&1 <<'SQL' &
begin;
update public.tenants set id='generation-renamed-a' where stable_id='e8210000-0000-4000-8000-000000000091';
insert into public.tenants(id,stable_id,site_name,active) values ('generation-old-slug','e8210000-0000-4000-8000-000000000092','Fictional Generation B',true);
select public.record_tenant_client_record('generation-old-slug','provider_connections','google','{"provider":"google","status":"connected","accessToken":"enc:v1:GGGG:HHHH:IIII"}',repeat('b',64),'2026-10-08T00:00:00Z','dual_write','replace');
select 'generation-lock-held';
select pg_sleep(2);
commit;
SQL
  fi
  first_pid=$!
  for _ in $(seq 1 200);do rg -q generation-lock-held "$generation_dir/first-$first.log" && break;sleep 0.01;done
  rg -q generation-lock-held "$generation_dir/first-$first.log" || { cat "$generation_dir/first-$first.log" >&2;return 1; }
  if [[ "$first" == cas ]];then
   PGAPPNAME=tenant-generation-second psql "${psql_args[@]}" -q >"$generation_dir/second-$first.log" 2>&1 <<'SQL' &
begin;
update public.tenants set id='generation-renamed-a' where stable_id='e8210000-0000-4000-8000-000000000091';
insert into public.tenants(id,stable_id,site_name,active) values ('generation-old-slug','e8210000-0000-4000-8000-000000000092','Fictional Generation B',true);
select public.record_tenant_client_record('generation-old-slug','provider_connections','google','{"provider":"google","status":"connected","accessToken":"enc:v1:GGGG:HHHH:IIII"}',repeat('b',64),'2026-10-08T00:00:00Z','dual_write','replace');
commit;
SQL
  else
   PGAPPNAME=tenant-generation-second psql "${psql_args[@]}" -q >"$generation_dir/second-$first.log" 2>&1 <<'SQL' &
select public.mutate_tenant_provider_connection('generation-old-slug','google','{"provider":"google","status":"connected","accessToken":"enc:v1:AAAA:BBBB:CCCC"}','{"provider":"google","status":"connected","accessToken":"enc:v1:JJJJ:KKKK:LLLL"}',repeat('d',64),'2036-10-08T00:00:00Z');
SQL
  fi
  second_pid=$!
  blocked=0
  for _ in $(seq 1 200);do
   if [[ "$(psql "${psql_args[@]}" -Atc "select count(*) from pg_stat_activity where application_name='tenant-generation-second' and wait_event_type='Lock'")" == 1 ]];then blocked=1;break;fi
   sleep 0.01
  done
  [[ "$blocked" == 1 ]] || { printf 'Lifecycle race did not observe the second session blocked.\n' >&2;return 1; }
  wait "$first_pid"
  if wait "$second_pid";then
   if [[ "$first" == rename ]];then rg -q 'kept' "$generation_dir/second-$first.log" || return 1;fi
  else
   [[ "$first" == rename ]] && rg -q client_record_unknown_tenant "$generation_dir/second-$first.log" || { cat "$generation_dir/second-$first.log" >&2;return 1; }
  fi
  psql "${psql_args[@]}" -q <<'SQL'
do $$ begin
 if (select payload->>'accessToken' from public.tenant_client_records where tenant_stable_id='e8210000-0000-4000-8000-000000000092' and store='provider_connections' and record_id='google') is distinct from 'enc:v1:GGGG:HHHH:IIII' then raise exception 'slug_reuse_grant_overwritten'; end if;
end $$;
SQL
  printf 'PASS generation lifecycle order: %s first; reused slug grant unchanged.\n' "$first"
 done
 psql "${psql_args[@]}" -q -c "delete from public.tenants where stable_id in ('e8210000-0000-4000-8000-000000000091','e8210000-0000-4000-8000-000000000092');"
}
