#!/usr/bin/env bash
# Source in the root-owned disposable native cluster with repo_root,
# cluster_root and psql_args already defined. Does not start a daemon.
run_booking_settings_atomicity() (
  set -euo pipefail
  source "$repo_root/scripts/sql/booking-owned-cluster.sh"
  verify_booking_settings_owned_cluster || exit 1
  umask 077
  # Subshell state survives an early function exit until the EXIT trap runs.
  fixture="bs-primary-race-$$" app="bs_primary_race_$$" gate="$((182000 + ($$ % 10000)))" owned=0 stable=''
  helper_pid="$(exec sh -c 'printf %s "$PPID"')"
  signal_status=0 signal_count=0 cleanup_active=0 cleanup_ready=0 cleanup_failed=0 receipt_failed=0
  sessions='[]'
  barrier_pid='' first_pid='' second_pid='' status_log="$cluster_root/booking-settings-cleanup.log"
  printf 'phase=start fixture=%s helper_pid=%s\n' "$fixture" "$helper_pid" >>"$status_log" || exit 1
  # Receipt I/O must never prevent resource cleanup. stderr is the fallback
  # evidence channel; any lost primary receipt permanently refuses qualification.
  bs_log() {
    if ! printf '%s\n' "$*" >>"$status_log"; then
      receipt_failed=1
      printf 'BOOKING_RECEIPT_FAILURE %s\n' "$*" >&2
    fi
    return 0
  }
  bs_signal() {
    local name="$1" code="$2"
    ((signal_count+=1))
    [[ "$signal_status" != 0 ]] || signal_status="$code"
    if ! bs_log "phase=signal name=$name status=$code first_status=$signal_status count=$signal_count cleanup_active=$cleanup_active cleanup_ready=$cleanup_ready"; then printf 'Booking signal receipt retention failed.\n' >&2; fi
    if [[ "$cleanup_active" == 0 ]]; then exit "$signal_status"; fi
    if [[ "$cleanup_ready" == 1 ]]; then
      if ! bs_log "phase=cleanup terminal_signal_status=$signal_status qualification_status=$signal_status cleanup_failed=$cleanup_failed"; then printf 'Booking final signal retention failed.\n' >&2; fi
      exit "$signal_status"
    fi
    return 0 # Cleanup owns the terminal exit after bounded closure/confirmation.
  }
  bs_finish_cleanup() {
    local prior="$1" failed="$2"
    [[ "$receipt_failed" == 0 ]] || failed=1
    cleanup_failed="$failed"
    cleanup_ready=1
    [[ "$signal_status" == 0 ]] || prior="$signal_status"
    if ! bs_log "phase=cleanup complete=$((1-failed)) qualification_status=$prior cleanup_failed=$failed terminal_signal_status=$signal_status signal_count=$signal_count"; then failed=1; cleanup_failed=1; printf 'Booking cleanup receipt retention failed.\n' >&2; fi
    [[ "$receipt_failed" == 0 ]] || { failed=1; cleanup_failed=1; }
    if [[ "$failed" == 1 ]]; then printf 'Booking settings cleanup unconfirmed; qualification failed. See %s\n' "$status_log" >&2; fi
    [[ "$signal_status" == 0 ]] || exit "$signal_status"
    [[ "$failed" == 0 ]] || exit 1
    [[ "$prior" != 0 ]] || printf 'PASS cleanup: owned clients closed, sessions absent, fixture deletion confirmed.\n'
    exit "$prior"
  }
  bs_query() { bash "$repo_root/scripts/sql/booking-psql.sh" "${psql_args[@]}" --set=ON_ERROR_STOP=1 --no-psqlrc -Atq -c "$1"; }
  bs_capture_session() {
    local label="$1" path="$2" expected_app="$3" deadline="$((SECONDS+8))" marker backend_pid backend_started session_app comma
    while ((SECONDS<deadline)); do
      if marker="$(rg -m1 '^BOOKING_OWNED_SESSION\|' "$path")"; then
        IFS='|' read -r marker backend_pid backend_started session_app <<<"$marker"
        [[ "$backend_pid" =~ ^[0-9]+$ && "$backend_started" =~ ^[0-9\ :.+-]+$ && "$session_app" == "$expected_app" ]] || return 1
        comma=''; [[ "$sessions" == '[]' ]] || comma=','
        sessions="${sessions%]}$comma{\"pid\":\"$backend_pid\",\"started\":\"$backend_started\",\"app\":\"$session_app\"}]"
        bs_log "phase=session label=$label backend_pid=$backend_pid backend_start=$backend_started app=$session_app" || return 1
        verify_booking_settings_owned_cluster "$sessions" || return 1
        return 0
      fi
      sleep 0.02
    done
    bs_log "phase=session label=$label identity_captured=0"; return 1
  }
  bs_predicate() { node "$repo_root/scripts/lib/booking-owned-cluster.mjs" predicate "$sessions"; }
  bs_wait() {
    local deadline="$((SECONDS+8))" observed
    while ((SECONDS<deadline)); do
      if ! observed="$(bs_query "$1")"; then bs_log "phase=barrier label=$2 query_failed=1"; return 1; fi
      case "$observed" in t) return 0;; f) ;; *) bs_log "phase=barrier label=$2 malformed=1"; return 1;; esac
      sleep 0.02
    done
    bs_log "phase=barrier label=$2 reached=0"
    printf 'Booking settings barrier was not observed: %s\n' "$2" >&2; return 1
  }
  # Only wait after observing exit; an unresponsive owned client is escalated
  # within seven seconds and always fails qualification, even if then closed.
  bs_close_child() {
    local label="$1" child="$2" expected="$3" deadline="$((SECONDS+5))" escalated=0 result
    [[ -n "$child" ]] || return 0
    bs_log "phase=child_close_start label=$label pid=$child" || return 1
    while kill -0 "$child" 2>/dev/null && ((SECONDS<deadline)); do sleep 0.02; done
    if kill -0 "$child" 2>/dev/null; then
      escalated=1
      if kill -TERM "$child" 2>/dev/null; then bs_log "phase=child label=$label pid=$child signal=TERM sent=1"; else bs_log "phase=child label=$label pid=$child signal=TERM sent=0"; fi
      deadline="$((SECONDS+1))"
      while kill -0 "$child" 2>/dev/null && ((SECONDS<deadline)); do sleep 0.02; done
      if kill -0 "$child" 2>/dev/null; then
        if kill -KILL "$child" 2>/dev/null; then bs_log "phase=child label=$label pid=$child signal=KILL sent=1"; else bs_log "phase=child label=$label pid=$child signal=KILL sent=0"; fi
        deadline="$((SECONDS+1))"
        while kill -0 "$child" 2>/dev/null && ((SECONDS<deadline)); do sleep 0.02; done
      fi
    fi
    if kill -0 "$child" 2>/dev/null; then bs_log "phase=child label=$label pid=$child closed=0 escalated=$escalated"; return 1; fi
    if wait "$child"; then result=0; else result=$?; fi
    bs_log "phase=child label=$label pid=$child closed=1 exit_status=$result expected=$expected escalated=$escalated" || return 1
    [[ "$escalated" == 0 && ( "$expected" == any || "$result" == "$expected" ) ]]
  }
  bs_cleanup() {
    local prior="$1" failed=0 result predicate
    cleanup_active=1
    trap 'bs_signal TERM 143' TERM
    trap 'bs_signal INT 130' INT
    trap - EXIT
    set +e # Keep closing owned clients even if a cleanup query or status append fails.
    bs_log "phase=cleanup start helper_pid=$helper_pid" || failed=1
    if verify_booking_settings_owned_cluster "$sessions" && predicate="$(bs_predicate)"; then
      if result="$(bs_query "select coalesce(bool_and(pg_terminate_backend(pid)),true) from pg_stat_activity where $predicate")"; then
        bs_log "phase=cleanup terminate_query=ok all_terminated=$result" || failed=1
        [[ "$result" == t ]] || failed=1
      else bs_log "phase=cleanup terminate_query=failed"; failed=1; fi
    else bs_log "phase=cleanup terminate_query=not_attempted cluster_or_session_identity_unconfirmed=1"; failed=1; fi
    bs_close_child cleanup-barrier "$barrier_pid" any || failed=1
    bs_close_child cleanup-first "$first_pid" any || failed=1
    bs_close_child cleanup-second "$second_pid" any || failed=1
    if verify_booking_settings_owned_cluster "$sessions" && predicate="$(bs_predicate)" && bs_wait "select not exists(select 1 from pg_stat_activity where $predicate)" owned-session-close && verify_booking_settings_owned_cluster; then
      bs_log "phase=cleanup sessions_absent=t cluster_identity_confirmed=1" || failed=1
    else
      bs_log "phase=cleanup sessions_absent=unconfirmed cluster_identity_confirmed=0"; failed=1
      bs_log "phase=cleanup fixture_delete=not_attempted cluster_identity_unconfirmed=1"
      bs_finish_cleanup "$prior" 1
    fi
    if [[ "$owned" == 1 && -n "$stable" ]]; then
      bs_log "phase=fixture_delete_start" || failed=1
      if result="$(bs_query "begin;delete from public.booking_settings where calendar_key='$stable'::uuid and tenant_stable_id='$stable'::uuid;delete from public.tenants where id='$fixture' and stable_id='$stable'::uuid;commit")"; then
        [[ -z "$result" ]] || bs_log "phase=cleanup fixture_delete_output=$result"
        bs_log "phase=cleanup fixture_delete=ok" || failed=1
      else bs_log "phase=cleanup fixture_delete=failed"; failed=1; fi
    elif [[ "$owned" == 1 ]]; then bs_log "phase=cleanup fixture_delete=not_attempted identity_unconfirmed=1"; failed=1; fi
    if [[ "$owned" == 1 ]]; then
      local remaining="select not exists(select 1 from public.tenants where id='$fixture')"
      [[ -z "$stable" ]] || remaining="select not exists(select 1 from public.tenants where id='$fixture' or stable_id='$stable'::uuid) and not exists(select 1 from public.booking_settings where calendar_key='$stable'::uuid)"
      if result="$(bs_query "$remaining")"; then
        bs_log "phase=cleanup fixture_absent=$result" || failed=1
        [[ "$result" == t ]] || failed=1
      else bs_log "phase=cleanup fixture_confirmation=failed"; failed=1; fi
    fi
    bs_finish_cleanup "$prior" "$failed"
  }
  trap 'bs_signal TERM 143' TERM
  trap 'bs_signal INT 130' INT
  trap 'bs_cleanup "$?"' EXIT
  [[ "$(bs_query "select exists(select 1 from public.tenants where id='$fixture')")" == f ]] || { printf 'Fixture already exists; refusing.\n' >&2; exit 1; }
  owned=1
  stable="$(bs_query "insert into public.tenants(id,site_name,active) values('$fixture','Fictional primary settings race',true) returning stable_id")" || exit 1
  [[ "$stable" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]] || exit 1
  local config='{"bufferMinutes":10,"minNoticeMinutes":1440,"maxAdvanceDays":60,"defaultLengthMinutes":45,"timezone":"America/New_York","bookableHours":[{"day":5,"opens":"10:00","closes":"16:00"}],"legacyRequiresPayment":false}'
  local defaults='{"bufferMinutes":15,"minNoticeMinutes":1440,"maxAdvanceDays":60,"defaultLengthMinutes":60,"timezone":"America/New_York","bookableHours":[],"legacyRequiresPayment":false}'
  local overrides='{"bookableOverrides":[{"date":"2026-12-31","closed":true}]}'
  local config_write="select public.write_tenant_booking_settings_fields('$fixture','config','$config','$defaults')"
  local overrides_write="select public.write_tenant_booking_settings_fields('$fixture','overrides','$overrides','$defaults')"
  local first second start_revision marker_query
  marker_query="select 'BOOKING_OWNED_SESSION|'||pid::text||'|'||backend_start::text||'|'||application_name from pg_stat_activity where pid=pg_backend_pid()"
  for order in config-first overrides-first; do
    sessions='[]'
    verify_booking_settings_owned_cluster || exit 1
    bs_query "select public.upsert_tenant_booking_settings('$fixture','$defaults'::jsonb||'{\"mode\":\"request\",\"maxPerDay\":4,\"bookableOverrides\":[]}'::jsonb,'native')" >/dev/null || exit 1
    start_revision="$(bs_query "select revision from public.booking_settings where calendar_key='$stable'::uuid")" || exit 1
    if [[ "$order" == config-first ]]; then first="$config_write"; second="$overrides_write"; else first="$overrides_write"; second="$config_write"; fi
    bash "$repo_root/scripts/sql/booking-psql.sh" "${psql_args[@]}" --set=ON_ERROR_STOP=1 --no-psqlrc -Atq -c "set statement_timeout='30s';set lock_timeout='8s';set application_name='${app}_barrier'" -c "$marker_query" -c "select pg_advisory_lock($gate);select pg_sleep(20)" >"$cluster_root/booking-settings-$order-barrier.log" 2>&1 & barrier_pid=$!
    bs_capture_session barrier "$cluster_root/booking-settings-$order-barrier.log" "${app}_barrier" || exit 1
    bs_wait "select exists(select 1 from pg_stat_activity where ($(bs_predicate)) and application_name='${app}_barrier' and wait_event='PgSleep')" barrier || exit 1
    # First writer already owns the settings row before waiting at our gate.
    bash "$repo_root/scripts/sql/booking-psql.sh" "${psql_args[@]}" --set=ON_ERROR_STOP=1 --no-psqlrc -Atq -c "set statement_timeout='30s';set lock_timeout='8s';set application_name='${app}_first'" -c "$marker_query" -c "begin;set local role service_role;$first;select pg_advisory_xact_lock($gate);commit" >"$cluster_root/booking-settings-$order-first.log" 2>&1 & first_pid=$!
    bs_capture_session first "$cluster_root/booking-settings-$order-first.log" "${app}_first" || exit 1
    bs_wait "select exists(select 1 from pg_stat_activity where ($(bs_predicate)) and application_name='${app}_first' and wait_event='advisory')" first-writer || exit 1
    bash "$repo_root/scripts/sql/booking-psql.sh" "${psql_args[@]}" --set=ON_ERROR_STOP=1 --no-psqlrc -Atq -c "set statement_timeout='30s';set lock_timeout='8s';set application_name='${app}_second'" -c "$marker_query" -c "set role service_role;$second" >"$cluster_root/booking-settings-$order-second.log" 2>&1 & second_pid=$!
    bs_capture_session second "$cluster_root/booking-settings-$order-second.log" "${app}_second" || exit 1
    bs_wait "select exists(select 1 from pg_stat_activity where ($(bs_predicate)) and application_name='${app}_second' and wait_event_type='Lock')" second-writer-row-lock || exit 1
    verify_booking_settings_owned_cluster "$sessions" || exit 1
    [[ "$(bs_query "select count(*)=1 and bool_and(pg_terminate_backend(pid)) from pg_stat_activity where ($(bs_predicate)) and application_name='${app}_barrier'")" == t ]] || exit 1
    bs_log "phase=release order=$order barrier_terminated=1" || exit 1
    bs_close_child "$order-barrier" "$barrier_pid" any || exit 1; barrier_pid=''
    bs_close_child "$order-first" "$first_pid" 0 || exit 1; first_pid=''
    bs_close_child "$order-second" "$second_pid" 0 || exit 1; second_pid=''
    [[ "$(bs_query "select default_length_minutes=45 and buffer_minutes=10 and mode='request' and max_per_day=4 and recorded_via='native' and bookable_overrides='$overrides'::jsonb->'bookableOverrides' and revision=$start_revision+2 from public.booking_settings where calendar_key=(select stable_id from public.tenants where id='$fixture')")" == t ]] || { printf 'Lost config/overrides/policy in %s.\n' "$order" >&2; exit 1; }
    printf 'PASS %s: second writer waited on the actual settings row; both saves persisted, native policy preserved.\n' "$order"
  done
)
