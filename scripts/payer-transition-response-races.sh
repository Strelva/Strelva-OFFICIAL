#!/usr/bin/env bash
# Native two-actor races on the owned disposable database. Mutation SQL is not
# altered. A successful response holds its transaction while the competing
# response is observed waiting on a lock, then the loser must refuse cleanly.
psql "${psql_args[@]}" >/dev/null <<SQL
begin;
\i '$repo_root/tests/support/payer-transition-actions-fixture.sql'
commit;
SQL
payer_response_race() {
  local label="$1" workspace="$2" first_action="$3" first_actor="$4" first_email="$5" second_action="$6" second_actor="$7" second_email="$8" final_status="$9"
  local proposal first_pid second_pid held=0 waiting=0 first_app="pta-${label}-first" second_app="pta-${label}-second"
  proposal="$(psql "${psql_args[@]}" -Atc "select id from public.workspace_payer_transition_command(jsonb_build_object('action','propose','workspaceId','$workspace','successorAgencyWorkspaceId','b2780000-0000-4000-8000-000000000020'),'b2780000-0000-4000-8000-000000000001','pta-owner@example.test')")"
  [[ "$proposal" =~ ^[0-9a-f-]{36}$ ]] || { printf 'Missing payer race proposal.\n' >&2; return 1; }
  PGAPPNAME="$first_app" psql "${psql_args[@]}" -c "begin; set local role service_role; set local statement_timeout='10s'; select status from public.workspace_payer_transition_command(jsonb_build_object('action','$first_action','transitionId','$proposal'),'$first_actor','$first_email'); select pg_sleep(3); commit;" >"$cluster_root/$first_app.log" 2>&1 &
  first_pid=$!
  for _ in $(seq 1 80); do
    if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_stat_activity where application_name='$first_app' and wait_event='PgSleep' and xact_start is not null)")" == t ]]; then held=1; break; fi
    sleep 0.025
  done
  if [[ "$held" != 1 ]]; then cat "$cluster_root/$first_app.log" >&2; printf 'Winning response did not hold its transaction.\n' >&2; wait "$first_pid" || true; return 1; fi
  PGAPPNAME="$second_app" psql "${psql_args[@]}" -c "set role service_role; set statement_timeout='10s'; select status from public.workspace_payer_transition_command(jsonb_build_object('action','$second_action','transitionId','$proposal'),'$second_actor','$second_email');" >"$cluster_root/$second_app.log" 2>&1 &
  second_pid=$!
  for _ in $(seq 1 80); do
    if [[ "$(psql "${psql_args[@]}" -Atc "select exists(select 1 from pg_stat_activity where application_name='$second_app' and wait_event_type='Lock')")" == t ]]; then waiting=1; break; fi
    sleep 0.025
  done
  wait "$first_pid" || { cat "$cluster_root/$first_app.log" >&2; wait "$second_pid" || true; return 1; }
  if wait "$second_pid"; then printf 'Competing response unexpectedly succeeded in %s.\n' "$label" >&2; return 1; fi
  [[ "$waiting" == 1 ]] || { printf 'Competing response did not prove actual lock waiting.\n' >&2; return 1; }
  grep -q 'payer_transition_not_pending' "$cluster_root/$second_app.log"
  psql "${psql_args[@]}" -Atc "select count(*)=1 and bool_and(status='$final_status' and resolved_by='$first_actor' and (accepted_at is not null)=('$final_status'='accepted')) from public.workspace_payer_transitions where workspace_id='$workspace'" | grep -qx t
  psql "${psql_args[@]}" -Atc "select kind=case when '$final_status'='accepted' then 'agency' else 'business' end and (workspace_id is not null)=('$final_status'='accepted') from public.business_payer_party('$workspace')" | grep -qx t
  psql "${psql_args[@]}" -Atc "select count(*)=1 and bool_and(not can_respond and not can_revoke) from public.workspace_payer_transition_snapshot_v2('$workspace','$second_actor','$second_email')" | grep -qx t
  printf 'Payer concurrency %s: loser observed waiting; one %s receipt and correct payer; competing response refused.\n' "$label" "$final_status"
}
payer_response_race accept-before-reject b2780000-0000-4000-8000-000000000010 accept b2780000-0000-4000-8000-000000000002 pta-agency-owner@example.test reject b2780000-0000-4000-8000-000000000003 pta-agency-admin@example.test accepted
payer_response_race reject-before-accept b2780000-0000-4000-8000-000000000011 reject b2780000-0000-4000-8000-000000000003 pta-agency-admin@example.test accept b2780000-0000-4000-8000-000000000002 pta-agency-owner@example.test rejected
psql "${psql_args[@]}" >/dev/null <<'SQL'
begin;
delete from public.workspace_payer_transitions where workspace_id in ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000011');
delete from public.workspace_memberships where workspace_id in ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000011','b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000021');
delete from public.workspaces where id in ('b2780000-0000-4000-8000-000000000010','b2780000-0000-4000-8000-000000000011','b2780000-0000-4000-8000-000000000020','b2780000-0000-4000-8000-000000000021');
delete from public.users where id in ('b2780000-0000-4000-8000-000000000001','b2780000-0000-4000-8000-000000000002','b2780000-0000-4000-8000-000000000003','b2780000-0000-4000-8000-000000000004','b2780000-0000-4000-8000-000000000005','b2780000-0000-4000-8000-000000000006','b2780000-0000-4000-8000-000000000007','b2780000-0000-4000-8000-000000000008','b2780000-0000-4000-8000-000000000009');
commit;
SQL
