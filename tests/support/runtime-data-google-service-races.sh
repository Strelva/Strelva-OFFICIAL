# Sourced only by an owned disposable PostgreSQL runner after actual migration1010.
# Fictional authority rows remain until that runner destroys its owned cluster.
check_google_service_authority_admission_wait() {
 local race_dir first_pid second_pid blocked case_name original_session
 race_dir="$cluster_root/google-service-admission-races"
 mkdir -p "$race_dir"
 python3 - "$repo_root/tests/runtime-data-google-service-authority.sql" "$race_dir/setup.sql" <<'PY'
import sys
source=open(sys.argv[1]).read().split('create function pg_temp.gs_check')[0]
source=source.replace('6c000000','e8211010').replace('pa-fixture-site','gs-admission-site').replace('pa-','gs-admission-')
source=source.replace('create temporary table gs_fixture(request jsonb,decision uuid,session uuid) on commit drop;','create table public.gs_authority_fixture(request jsonb,decision uuid,session uuid);').replace('gs_fixture','public.gs_authority_fixture')
open(sys.argv[2],'w').write(source+'\ncommit;\n')
PY
 psql "${psql_args[@]}" -q -f "$race_dir/setup.sql" >"$race_dir/setup.log" 2>&1 || { cat "$race_dir/setup.log" >&2;return 1; }
 original_session=$(psql "${psql_args[@]}" -Atq -c 'select session from public.gs_authority_fixture')
 for case_name in recipient member clock;do
  if [[ "$case_name" == clock ]];then
   # An append-only fixture session genuinely crosses its 30-minute deadline.
   psql "${psql_args[@]}" -q <<'SQL'
insert into public.strelva_service_actions(id,workspace_id,purpose,action,on_behalf_user_id,on_behalf_role,subject,provider_workspace_id,created_at)
select 'e8211010-0000-4000-8000-000000000060',workspace_id,purpose,action,on_behalf_user_id,on_behalf_role,subject,provider_workspace_id,clock_timestamp()-interval '29 minutes 59 seconds' from public.strelva_service_actions where id=(select session from public.gs_authority_fixture);
update public.gs_authority_fixture set session='e8211010-0000-4000-8000-000000000060';
select public.record_strelva_service_action('e8211010-0000-4000-8000-000000000010',(select session from public.gs_authority_fixture),'run','possibility:e8211010-0000-4000-8000-000000000052@1','Clock fixture');
SQL
  fi
  {
   cat <<'SQL'
begin;
select 1 from public.provider_seats where customer_workspace_id='e8211010-0000-4000-8000-000000000010' and status='active' for update;
SQL
   if [[ "$case_name" == recipient ]];then
    printf "%s\n" "update public.business_owner_recipient_trust set email='replacement@example.test' where workspace_id='e8211010-0000-4000-8000-000000000010';"
   elif [[ "$case_name" == member ]];then
    printf "%s\n" "delete from public.workspace_memberships where workspace_id='e8211010-0000-4000-8000-000000000010' and user_id='e8211010-0000-4000-8000-000000000001';"
   fi
   cat <<'SQL'
select 'google-admission-lock-held';
select pg_sleep(2);
commit;
SQL
  } >"$race_dir/first.sql"
  psql "${psql_args[@]}" -q -f "$race_dir/first.sql" >"$race_dir/first-$case_name.log" 2>&1 &
  first_pid=$!
  for _ in $(seq 1 200);do rg -q google-admission-lock-held "$race_dir/first-$case_name.log" && break;sleep 0.01;done
  rg -q google-admission-lock-held "$race_dir/first-$case_name.log" || { cat "$race_dir/first-$case_name.log" >&2;return 1; }
  PGAPPNAME=google-service-admission-second psql "${psql_args[@]}" -q >"$race_dir/second-$case_name.log" 2>&1 <<'SQL' &
do $$ declare f public.gs_authority_fixture%rowtype;begin
 select * into f from public.gs_authority_fixture;
 begin
  perform public.check_google_make_real_service_authority('e8211010-0000-4000-8000-000000000010',f.session,f.decision,f.request,'approve','e8211010-0000-4000-8000-000000000052',null);
 exception when others then
  if sqlerrm='google_service_denied' then raise notice 'google-admission-denied-after-wait';return;end if;
  raise;
 end;
 raise exception 'stale_google_authority_returned_after_wait';
end $$;
SQL
  second_pid=$!
  blocked=0
  for _ in $(seq 1 150);do
   if [[ $(psql "${psql_args[@]}" -Atq -c "select count(*) from pg_stat_activity where application_name='google-service-admission-second' and wait_event_type='Lock'") != 0 ]];then blocked=1;break;fi
   sleep 0.01
  done
  [[ "$blocked" == 1 ]] || { cat "$race_dir/second-$case_name.log" >&2;return 1; }
  wait "$first_pid" || { cat "$race_dir/first-$case_name.log" >&2;return 1; }
  wait "$second_pid" || { cat "$race_dir/second-$case_name.log" >&2;return 1; }
  rg -q google-admission-denied-after-wait "$race_dir/second-$case_name.log" || { cat "$race_dir/second-$case_name.log" >&2;return 1; }
  if [[ "$case_name" == recipient ]];then
   psql "${psql_args[@]}" -q -c "update public.business_owner_recipient_trust set email='gs-admission-tenant-owner@example.test' where workspace_id='e8211010-0000-4000-8000-000000000010'"
  elif [[ "$case_name" == member ]];then
   psql "${psql_args[@]}" -q -c "insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('e8211010-0000-4000-8000-000000000010','e8211010-0000-4000-8000-000000000001','admin','e8211010-0000-4000-8000-000000000001')"
  else
   psql "${psql_args[@]}" -q -c "update public.gs_authority_fixture set session='$original_session'"
  fi
 done
}
