# Prepared only. Source from an explicitly owned disposable SQL runner with
# repo_root, cluster_root and psql_args; never invoke against a live stack.
# Fictional shaped ciphertext is not decryptable or a provider qualification.
check_native_google_lifecycle_lock_order() {
 local race_dir first_pid second_pid observed case_name
 race_dir="$cluster_root/native-google-lifecycle-races"
 mkdir -p "$race_dir"
 psql "${psql_args[@]}" -q >"$race_dir/setup.log" 2>&1 <<'SQL' || return 1
begin;
insert into public.users(id,email,verified_at) values('e7140011-0000-4000-8000-000000000001','native-google-race@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('e7140011-0000-4000-8000-000000000010','customer','Native Google lock fixture','e7140011-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('e7140011-0000-4000-8000-000000000010','e7140011-0000-4000-8000-000000000001','owner','e7140011-0000-4000-8000-000000000001');
do $$ declare binding jsonb;begin
 binding:=public.upsert_workspace_account_binding('{"workspaceId":"e7140011-0000-4000-8000-000000000010","provider":"google","subject":"fixture-race-principal","scopes":["openid","https://www.googleapis.com/auth/business.manage"],"accessTokenCiphertext":"enc:v1:AAAA:BBBB:CCCC","refreshTokenCiphertext":"enc:v1:DDDD:EEEE:FFFF","status":"connected"}'::jsonb,'oauth');
 perform public.upsert_workspace_google_location((binding->>'id')::uuid,'accounts/race','race-place',null);
end $$;
commit;
SQL
 for case_name in binding location;do
  psql "${psql_args[@]}" -q >"$race_dir/attempt-$case_name.log" 2>&1 <<'SQL' || return 1
DO $$ declare attempt uuid:=gen_random_uuid();begin
 perform public.native_google_owner_lifecycle('e7140011-0000-4000-8000-000000000001','native-google-race@example.test','e7140011-0000-4000-8000-000000000010','begin_oauth',jsonb_build_object('id',attempt,'accountId','accounts/race','locationId','race-place','nonceHash',repeat('a',64),'stateHash',repeat('b',64)));
 perform public.native_google_owner_lifecycle('e7140011-0000-4000-8000-000000000001','native-google-race@example.test','e7140011-0000-4000-8000-000000000010','consume_oauth',jsonb_build_object('id',attempt,'nonceHash',repeat('a',64),'stateHash',repeat('b',64)));
end $$;
SQL
  psql "${psql_args[@]}" -q >"$race_dir/first-$case_name.log" 2>&1 <<'SQL' &
begin;
set local statement_timeout='8s';set local lock_timeout='6s';
select pg_advisory_xact_lock(771904091);
select 'native-google-global-held';
select pg_sleep(3);
do $$ declare attempt uuid;begin
 select id into strict attempt from public.native_google_oauth_attempts where workspace_id='e7140011-0000-4000-8000-000000000010' and status='exchanging';
 perform public.native_google_owner_lifecycle('e7140011-0000-4000-8000-000000000001','native-google-race@example.test','e7140011-0000-4000-8000-000000000010','finish_oauth',jsonb_build_object('id',attempt,'subject','fixture-race-principal','scopes',jsonb_build_array('openid','https://www.googleapis.com/auth/business.manage'),'accessTokenCiphertext','enc:v1:AAAA:BBBB:CCCC','refreshTokenCiphertext','enc:v1:DDDD:EEEE:FFFF','tokenExpiresAt',(clock_timestamp()+interval '1 hour')::text));
end $$;
commit;
SQL
  first_pid=$!
  for _ in $(seq 1 150);do rg -q native-google-global-held "$race_dir/first-$case_name.log" && break;sleep 0.01;done
  rg -q native-google-global-held "$race_dir/first-$case_name.log" || { wait "$first_pid";return 1; }
  if [[ "$case_name" == binding ]];then
   cat >"$race_dir/second.sql" <<'SQL'
do $$ begin perform public.upsert_workspace_account_binding('{"workspaceId":"e7140011-0000-4000-8000-000000000010","provider":"google","subject":"fixture-race-principal","status":"connected"}'::jsonb,'oauth');end $$;
SQL
  else
   cat >"$race_dir/second.sql" <<'SQL'
do $$ declare binding uuid;begin select id into strict binding from public.workspace_account_bindings where workspace_id='e7140011-0000-4000-8000-000000000010' and provider='google' and origin_tenant_stable_id is null;perform public.upsert_workspace_google_location(binding,'accounts/race','race-place',null);end $$;
SQL
  fi
  PGAPPNAME=native-google-lifecycle-second PGOPTIONS='-c statement_timeout=8000 -c lock_timeout=6000' psql "${psql_args[@]}" -q -f "$race_dir/second.sql" >"$race_dir/second-$case_name.log" 2>&1 &
  second_pid=$!;observed=0
  for _ in $(seq 1 100);do
   if [[ $(psql "${psql_args[@]}" -Atq -c "select count(*) from pg_stat_activity where application_name='native-google-lifecycle-second' and wait_event_type='Lock' and wait_event='advisory'") != 0 ]];then observed=1;break;fi
   sleep 0.01
  done
  wait "$first_pid" || { wait "$second_pid";return 1; }
  wait "$second_pid" || return 1
  [[ "$observed" == 1 ]] || return 1
  printf 'PASS observed native Google %s global-first lock wait without deadlock.\n' "$case_name"
 done
 # Fictional rows stay in this disposable cluster; its owner destroys it.
}
