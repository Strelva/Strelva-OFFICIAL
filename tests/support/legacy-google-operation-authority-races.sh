# PREPARED / UNRUN. Source only from the repository's owned disposable native
# PostgreSQL runner after all forwards. No connection string or live-stack mode.
# Use a SEPARATE fresh disposable runner; this intentionally leaves fictional
# Google rows for that runner's immediate teardown. Never continue native
# isolation/parity proofs in the same database after calling this helper.
# Filesystem admission is read-only, so refusal never creates an artifact or
# opens a log. The owning runner must retain its mktemp/initdb/PID/teardown
# receipt; a path, environment label or empty database is not that receipt.
legacy_google_race_path_mode() {
 local mode
 if mode="$(/usr/bin/stat -c '%a' "$1" 2>/dev/null)";then printf '%s\n' "$mode";
 else /usr/bin/stat -f '%Lp' "$1" 2>/dev/null;fi
}
legacy_google_race_private_mode() {
 local permissions
 [[ -O "$1" && "$(legacy_google_race_path_mode "$1")" == "$2" ]] || return 1
 if ! permissions="$(/usr/bin/env -i LC_ALL=C /bin/ls -lde "$1" 2>/dev/null)";then
  permissions="$(/usr/bin/env -i LC_ALL=C /bin/ls -ld "$1")" || return 1
 fi
 # Mode bits alone cannot rule out an inherited named ACL on a private path.
 # macOS displays @ instead of + when xattrs are also present; -e still lists
 # the ACL on extra lines. GNU ls uses the + permission suffix.
 [[ "$permissions" != *$'\n'* && "${permissions%% *}" != *+* ]]
}
legacy_google_race_canonical_directory() {
 local remaining="${1#/}" component current=""
 [[ "$1" == /* && "$1" != / && "$1" != */ ]] || return 1
 while [[ -n "$remaining" ]];do
  component="${remaining%%/*}"
  [[ -n "$component" && "$component" != . && "$component" != .. ]] || return 1
  current="$current/$component"
  [[ -d "$current" && ! -L "$current" ]] || return 1
  if [[ "$remaining" == */* ]];then remaining="${remaining#*/}";else remaining="";fi
 done
}
legacy_google_race_filesystem_admission() {
 local directory file
 [[ "${cluster_root:-}" == /* && "${cluster_data:-}" == "$cluster_root/data"
  && "${cluster_socket:-}" == "$cluster_root/socket" && "${cluster_port:-}" =~ ^[0-9]+$
  && "$cluster_port" -ge 1024 && "$cluster_port" -le 65535 ]] || return 1
 for directory in "$cluster_root" "$cluster_data" "$cluster_socket";do
  legacy_google_race_canonical_directory "$directory" || return 1
  legacy_google_race_private_mode "$directory" 700 || return 1
 done
 for file in "$cluster_data/PG_VERSION" "$cluster_data/postmaster.pid";do
  [[ -f "$file" && ! -L "$file" ]] && legacy_google_race_private_mode "$file" 600 || return 1
 done
 [[ -S "$cluster_socket/.s.PGSQL.$cluster_port" && ! -L "$cluster_socket/.s.PGSQL.$cluster_port"
  && -O "$cluster_socket/.s.PGSQL.$cluster_port"
  && ! -e "$cluster_root/legacy-google-operation-races" && ! -L "$cluster_root/legacy-google-operation-races" ]]
}
check_legacy_google_operation_authority_races() (
 set -euo pipefail
 umask 077
 set -o noclobber
 local race_dir case_name case_scope order mutation first_pid="" second_pid="" observed waiting arg attempt file pid
 local host_seen=0 port_seen=0 user_seen=0 db_seen=0 stop_seen=0 rc_seen=0 psql_binary race_app_name
 [[ "${STRELVA_LEGACY_GOOGLE_OPERATION_RACE_PROOF:-}" == owned-disposable-fresh ]] || return 1
 legacy_google_race_filesystem_admission || return 1
 # Resolve one executable, rather than an inherited psql function or alias.
 # Every child below receives a finite environment and fixed local arguments.
 psql_binary="$(type -P psql)" || return 1
 [[ "$psql_binary" == /* ]] || return 1
 # The caller supplies the actual binary directory (for Homebrew, Cellar/bin),
 # not an opt/bin symlink. Reject ancestors rather than normalizing them away.
 legacy_google_race_canonical_directory "${psql_binary%/*}" || return 1
 [[ -f "$psql_binary" && ! -L "$psql_binary" && -x "$psql_binary" ]] || return 1
 race_psql() {
  local -a launch=(/usr/bin/env -i PATH=/usr/bin:/bin LC_ALL=C PGCONNECT_TIMEOUT=5
   'PGOPTIONS=-c statement_timeout=10000 -c lock_timeout=8000'
   "PGAPPNAME=${race_app_name:-legacy-google-authority-main}" "$psql_binary" "$@")
  # Background workers replace themselves so $! is the actual psql PID;
  # failure cleanup cannot kill only a wrapper and leave its client running.
  if [[ "${race_exec:-0}" == 1 ]];then exec "${launch[@]}";fi
  "${launch[@]}"
 }
 trap 'for pid in $(jobs -pr);do if [[ "$pid" == "$first_pid" || "$pid" == "$second_pid" ]];then kill "$pid" 2>/dev/null || true;wait "$pid" 2>/dev/null || true;fi;done' EXIT
 [[ "$(declare -p psql_args 2>/dev/null)" == 'declare -a '* ]] || return 1
 for arg in "${psql_args[@]}";do
  case "$arg" in
   "--host=$cluster_socket") host_seen=$((host_seen+1));;
   "--port=$cluster_port") port_seen=$((port_seen+1));;
   "--username=$(/usr/bin/id -un)") user_seen=$((user_seen+1));;
   --dbname=postgres) db_seen=$((db_seen+1));;
   --set=ON_ERROR_STOP=1) stop_seen=$((stop_seen+1));;
   --no-psqlrc) rc_seen=$((rc_seen+1));;
   *) return 1;;
  esac
 done
 [[ "$host_seen:$port_seen:$user_seen:$db_seen:$stop_seen:$rc_seen" == 1:1:1:1:1:1 ]] || return 1
 race_dir="$cluster_root/legacy-google-operation-races"
 # An atomic fresh directory replaces mkdir -p/chmod on caller-owned paths.
 /bin/mkdir -m 700 "$race_dir" || return 1
 legacy_google_race_private_mode "$race_dir" 700 || return 1
 printf 'scope=prepared-owned-disposable\ncluster_root=%s\ncluster_data=%s\ncluster_socket=%s\ncluster_port=%s\n' "$cluster_root" "$cluster_data" "$cluster_socket" "$cluster_port" >"$race_dir/filesystem-admission.log"
 IFS= read -r pid <"$cluster_data/postmaster.pid"
 [[ "$pid" =~ ^[0-9]+$ && "$pid" -gt 1 ]] || return 1
 printf 'declared_postmaster_pid=%s\ncluster_and_teardown_receipt=retained-by-owning-runner\n' "$pid" >>"$race_dir/filesystem-admission.log"
 race_psql "${psql_args[@]}" -q --set="owned_data=$cluster_data" --set="owned_socket=$cluster_socket" --set="owned_port=$cluster_port" --set="owned_user=$(/usr/bin/id -un)" >"$race_dir/identity.log" 2>&1 <<'SQL' || return 1
select current_setting('data_directory')=:'owned_data'
 and current_setting('unix_socket_directories')=:'owned_socket'
 and current_setting('port')=:'owned_port' and current_setting('listen_addresses')=''
 and inet_server_addr() is null and current_database()='postgres'
 and current_user=session_user and current_user=:'owned_user'
 and (select rolsuper from pg_roles where rolname=current_user)
 and pg_get_userbyid((select datdba from pg_database where datname=current_database()))=current_user
 and not exists(select 1 from public.tenant_client_records where record_id='google' and store in ('provider_connections','provider_metadata'))
 and not exists(select 1 from public.workspace_account_bindings)
 and not exists(select 1 from public.native_google_oauth_attempts)
 and not exists(select 1 from public.native_google_disconnect_receipts)
 and not exists(select 1 from public.legacy_google_operation_watermarks) as owned_fresh_race \gset
\if :owned_fresh_race
\else
\quit 41
\endif
SQL
 race_psql "${psql_args[@]}" -q >"$race_dir/setup.log" 2>&1 <<'SQL' || return 1
begin;
insert into public.users(id,email,verified_at) values('e7510011-0000-4000-8000-000000000001','legacy-google-race@example.test',now());
insert into public.tenants(id,stable_id,site_name,active) values('legacy-google-race-fixture','e7510011-0000-4000-8000-000000000020','Legacy Google authority race fixture',true);
insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) values('e7510011-0000-4000-8000-000000000001','legacy-google-race-fixture','e7510011-0000-4000-8000-000000000020','editor');
insert into public.workspaces(id,kind,name,created_by) values('e7510011-0000-4000-8000-000000000010','customer','Legacy Google contention fixture','e7510011-0000-4000-8000-000000000001');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values('e7510011-0000-4000-8000-000000000020','legacy-google-race-fixture','e7510011-0000-4000-8000-000000000010','e7510011-0000-4000-8000-000000000001','e7510011-0000-4000-8000-000000000030',repeat('a',64),'{}');
create table public.lg_authority_race_fixture(pin jsonb not null,input jsonb not null,before_state jsonb);
insert into public.lg_authority_race_fixture(pin,input)
 select public.read_legacy_google_operation('legacy-google-race-fixture')||jsonb_build_object('startedAt',clock_timestamp()::text),
 jsonb_build_object('grant',jsonb_build_object('workspaceId','e7510011-0000-4000-8000-000000000010','originTenantStableId','e7510011-0000-4000-8000-000000000020',
 'subject',null,'scopes',jsonb_build_array('https://www.googleapis.com/auth/business.manage'),
 'refreshTokenCiphertext','enc:v1:AAAA:BBBB:CCCC','accessTokenCiphertext','enc:v1:DDDD:EEEE:FFFF',
 'tokenExpiresAt',(clock_timestamp()+interval '1 hour')::text,'status','connected'));
commit;
SQL
 for case_name in role email tenant workspace link;do
  case_scope=authority-withdrawal
  if [[ "$case_name" == role ]];then
   mutation="update public.memberships set role='viewer' where user_id='e7510011-0000-4000-8000-000000000001';"
  elif [[ "$case_name" == email ]];then
   mutation="update public.users set email='legacy-google-race-changed@example.test' where id='e7510011-0000-4000-8000-000000000001';"
  elif [[ "$case_name" == tenant ]];then
   case_scope=parent-row-lock-contention
   mutation="select stable_id from public.tenants where stable_id='e7510011-0000-4000-8000-000000000020' for update;"
  elif [[ "$case_name" == workspace ]];then
   case_scope=parent-row-lock-contention
   mutation="select id from public.workspaces where id='e7510011-0000-4000-8000-000000000010' for update;"
  else
   case_scope=parent-row-lock-contention
   mutation="select id from public.tenant_workspace_links where tenant_stable_id='e7510011-0000-4000-8000-000000000020' for update;"
  fi
  # Parent cases hold existing rows. They do not delete tenants/workspaces,
  # unlink resources, or establish teardown/disconnect semantics.
  for order in apply-first mutation-first;do
   race_psql "${psql_args[@]}" -q >"$race_dir/reset-$case_name-$order.log" 2>&1 <<'SQL' || return 1
update public.memberships set role='editor' where user_id='e7510011-0000-4000-8000-000000000001';
update public.users set email='legacy-google-race@example.test' where id='e7510011-0000-4000-8000-000000000001';
update public.lg_authority_race_fixture set pin=public.read_legacy_google_operation('legacy-google-race-fixture')||jsonb_build_object('startedAt',clock_timestamp()::text),
 before_state=jsonb_build_object('bindings',(select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]') from public.workspace_account_bindings b where b.workspace_id='e7510011-0000-4000-8000-000000000010'),
 'locations',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from public.workspace_google_locations l where l.workspace_id='e7510011-0000-4000-8000-000000000010'),
 'records',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.tenant_client_records r where r.tenant_stable_id='e7510011-0000-4000-8000-000000000020'),
 'watermarks',(select coalesce(jsonb_agg(to_jsonb(w)),'[]') from public.legacy_google_operation_watermarks w where w.tenant_stable_id='e7510011-0000-4000-8000-000000000020'));
SQL
   if [[ "$order" == apply-first ]];then
    /bin/cat >"$race_dir/first-$case_name-$order.sql" <<'SQL'
begin;
set local statement_timeout='8s';set local lock_timeout='6s';
select public.apply_legacy_google_operation('e7510011-0000-4000-8000-000000000001','legacy-google-race@example.test',pin,'oauth',input) from public.lg_authority_race_fixture;
select 'legacy-google-authority-held';
select pg_sleep(3);
commit;
SQL
    printf 'begin;\nset local statement_timeout=\x278s\x27;set local lock_timeout=\x276s\x27;\n%s\ncommit;\n' "$mutation" >"$race_dir/second-$case_name-$order.sql"
   else
    printf 'begin;\nset local statement_timeout=\x278s\x27;set local lock_timeout=\x276s\x27;\n%s\nselect \x27legacy-google-authority-held\x27;\nselect pg_sleep(3);\ncommit;\n' "$mutation" >"$race_dir/first-$case_name-$order.sql"
    /bin/cat >"$race_dir/second-$case_name-$order.sql" <<'SQL'
begin;
set local statement_timeout='8s';set local lock_timeout='6s';
do $$ declare fixture public.lg_authority_race_fixture%rowtype; actual jsonb;begin
 select * into strict fixture from public.lg_authority_race_fixture;
 begin
  perform public.apply_legacy_google_operation('e7510011-0000-4000-8000-000000000001','legacy-google-race@example.test',fixture.pin,'oauth',fixture.input);
  raise exception 'fixture_expected_contention_refusal';
 exception when others then if sqlerrm is distinct from 'legacy_google_operation_superseded' then raise;end if;end;
 actual:=jsonb_build_object('bindings',(select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]') from public.workspace_account_bindings b where b.workspace_id='e7510011-0000-4000-8000-000000000010'),
 'locations',(select coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]') from public.workspace_google_locations l where l.workspace_id='e7510011-0000-4000-8000-000000000010'),
 'records',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from public.tenant_client_records r where r.tenant_stable_id='e7510011-0000-4000-8000-000000000020'),
 'watermarks',(select coalesce(jsonb_agg(to_jsonb(w)),'[]') from public.legacy_google_operation_watermarks w where w.tenant_stable_id='e7510011-0000-4000-8000-000000000020'));
 if actual is distinct from fixture.before_state then raise exception 'fixture_refusal_changed_durable_state';end if;
end $$;
commit;
SQL
    if [[ "$case_name" == tenant || "$case_name" == workspace || "$case_name" == link ]];then
     /bin/cat >>"$race_dir/second-$case_name-$order.sql" <<'SQL'
do $$ begin
 begin
  perform public.read_legacy_google_operation('legacy-google-race-fixture');
  raise exception 'fixture_expected_snapshot_contention_refusal';
 exception when others then if sqlerrm is distinct from 'legacy_google_operation_superseded' then raise;end if;end;
end $$;
SQL
    fi
   fi
   race_exec=1 race_psql "${psql_args[@]}" -q -f "$race_dir/first-$case_name-$order.sql" >"$race_dir/first-$case_name-$order.log" 2>&1 &
   first_pid=$!
   for ((attempt=0;attempt<150;attempt++));do /usr/bin/grep -q legacy-google-authority-held "$race_dir/first-$case_name-$order.log" && break;/bin/sleep 0.01;done
   /usr/bin/grep -q legacy-google-authority-held "$race_dir/first-$case_name-$order.log" || { wait "$first_pid";return 1; }
   race_app_name=legacy-google-authority-second race_exec=1 race_psql "${psql_args[@]}" -q -f "$race_dir/second-$case_name-$order.sql" >"$race_dir/second-$case_name-$order.log" 2>&1 &
   second_pid=$!;observed=0
   printf 'first_client_pid=%s\nsecond_client_pid=%s\n' "$first_pid" "$second_pid" >"$race_dir/pids-$case_name-$order.log"
   if [[ "$order" == apply-first ]];then
    for ((attempt=0;attempt<100;attempt++));do
     waiting="$(race_psql "${psql_args[@]}" -Atq -c "select count(*) from pg_stat_activity where application_name='legacy-google-authority-second' and wait_event_type='Lock'")" || return 1
     [[ "$waiting" =~ ^[0-9]+$ ]] || return 1
     if [[ "$waiting" -gt 0 ]];then observed=1;break;fi
     /bin/sleep 0.01
    done
   else
    # NOWAIT admission must finish while the competing authority mutation is
    # still sleeping, with an exact superseded refusal and unchanged rows.
    wait "$second_pid" || { wait "$first_pid";return 1; }
    kill -0 "$first_pid" 2>/dev/null || return 1
    observed=1
   fi
   wait "$first_pid" || { wait "$second_pid";return 1; }
   if [[ "$order" == apply-first ]];then wait "$second_pid" || return 1;fi
   [[ "$observed" == 1 ]] || return 1
   if [[ "$case_name" == role || "$case_name" == email ]];then
    race_psql "${psql_args[@]}" -q >"$race_dir/after-$case_name-$order.log" 2>&1 <<'SQL' || return 1
do $$ declare fixture public.lg_authority_race_fixture%rowtype;begin
 select * into strict fixture from public.lg_authority_race_fixture;
 fixture.pin:=public.read_legacy_google_operation('legacy-google-race-fixture')||jsonb_build_object('startedAt',clock_timestamp()::text);
 begin
  perform public.apply_legacy_google_operation('e7510011-0000-4000-8000-000000000001','legacy-google-race@example.test',fixture.pin,'oauth',fixture.input);
  raise exception 'fixture_expected_permission_refusal';
 exception when others then if sqlerrm is distinct from 'google_settings_permission_denied' then raise;end if;end;
end $$;
SQL
   fi
   printf 'PASS observed legacy Google %s %s %s ordering; delete/unlink semantics untested.\n' "$case_name" "$case_scope" "$order"
  done
 done
 for file in "$race_dir"/*;do
  [[ -f "$file" && ! -L "$file" ]] && legacy_google_race_private_mode "$file" 600 || return 1
 done
)
