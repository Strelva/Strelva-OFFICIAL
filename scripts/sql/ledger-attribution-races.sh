# Sourced only by an owned disposable PostgreSQL rehearsal after retained #285 fixture.
check_ledger_attribution_races() {
 local owner="'b2850000-0000-4000-8000-000000000001','attribution-owner@example.test'" business="'b2850000-0000-4000-8000-000000000010'" agency="'b2850000-0000-4000-8000-000000000002','attribution-agency@example.test'"
 local barrier_pid writer_pid completion_pid round
 query "create schema ledger_attribution_race; create table ledger_attribution_race.requests(round integer primary key,id uuid not null);
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('b2850000-0000-4000-8000-000000000021','b2850000-0000-4000-8000-000000000002','owner','b2850000-0000-4000-8000-000000000002');
 create function ledger_attribution_race.pause() returns trigger language plpgsql as \$\$begin perform pg_advisory_xact_lock(2850034);return new;end\$\$;
 create table ledger_attribution_race.frozen(round integer primary key,result jsonb not null);" >/dev/null
 wait_ledger_state(){
  local app="$1" wanted="$2" seen=false
  for ((ledger_wait=0;ledger_wait<100;ledger_wait++));do
   if [[ "$(query "select exists(select 1 from pg_stat_activity where application_name='$app' and $wanted)")" == t ]];then seen=true;break;fi
   sleep 0.05
  done
  [[ "$seen" == true ]] || { printf 'Timed out observing controlled ledger race %s\n' "$app" >&2;return 1; }
 }
 for round in 1 2;do
  local target current line charge
  if [[ "$round" == 1 ]];then target="b2850000-0000-4000-8000-000000000020";current="b2850000-0000-4000-8000-000000000021";else target="b2850000-0000-4000-8000-000000000021";current="b2850000-0000-4000-8000-000000000020";fi
  line="il_AttributionRace$round";charge="ch_AttributionRace$round"
  query "select public.record_business_attribution($business,$owner,'$current','referral',jsonb_build_object('kind','owner_statement','reference','Fictional controlled ledger race $round'),'b2850000-0000-4000-8000-00000000004$((round+2))',(select id from public.workspace_providers where customer_workspace_id=$business and status='active'));
 insert into ledger_attribution_race.requests select $round,(public.request_provider_change($business,$owner,'$target','fictional-ledger-race-$round',null)->>'id')::uuid;
 select public.acknowledge_provider_change_notice((select id from ledger_attribution_race.requests where round=$round),$agency);
 insert into public.invoice_split_sources(source_account_id,invoice_line_id,charge_id,business_workspace_id,payer_workspace_id,payer_kind,customer_id,basis_cents,currency,period_start,period_end) values('platform','$line','$charge',$business,$business,'business','cus_FictionalRace',1000,'cad',clock_timestamp()+interval '1 minute',clock_timestamp()+interval '1 day');" >/dev/null
  PGAPPNAME="ledger-barrier-$round" psql "${psql_args[@]}" -Atq -c "select pg_advisory_lock(2850034);select pg_sleep(30)" > "$cluster_root/race-barrier-$round.log" 2>&1 & barrier_pid=$!
  wait_ledger_state "ledger-barrier-$round" "wait_event='PgSleep'"
  local writer="insert into ledger_attribution_race.frozen select $round,public.accrue_invoice_splits(s.business_workspace_id,s.invoice_line_id,s.period_start,s.period_end,s.source_account_id,s.charge_id,s.basis_cents,s.currency) from public.invoice_split_sources s where s.invoice_line_id='$line'"
  local completion="select public.complete_provider_change((select id from ledger_attribution_race.requests where round=$round),$owner)"
  if [[ "$round" == 1 ]];then
   query "create trigger ledger_race_pause before insert on public.invoice_split_attributions for each row execute function ledger_attribution_race.pause()" >/dev/null
   PGAPPNAME="ledger-writer-$round" psql "${psql_args[@]}" -Atq -c "$writer" > "$cluster_root/race-writer-$round.log" 2>&1 & writer_pid=$!
   wait_ledger_state "ledger-writer-$round" "wait_event='advisory'"
   PGAPPNAME="ledger-completion-$round" psql "${psql_args[@]}" -Atq -c "$completion" > "$cluster_root/race-completion-$round.log" 2>&1 & completion_pid=$!
   wait_ledger_state "ledger-completion-$round" "wait_event='advisory'"
  else
   query "create trigger ledger_race_pause before insert on public.business_attribution_endings for each row execute function ledger_attribution_race.pause()" >/dev/null
   PGAPPNAME="ledger-completion-$round" psql "${psql_args[@]}" -Atq -c "$completion" > "$cluster_root/race-completion-$round.log" 2>&1 & completion_pid=$!
   wait_ledger_state "ledger-completion-$round" "wait_event='advisory'"
   PGAPPNAME="ledger-writer-$round" psql "${psql_args[@]}" -Atq -c "$writer" > "$cluster_root/race-writer-$round.log" 2>&1 & writer_pid=$!
   wait_ledger_state "ledger-writer-$round" "wait_event='advisory'"
  fi
  if [[ "$round" == 1 ]];then
   # A pending accepted lineage insert owns its relation lock. The inverse
   # must time out rather than race past that still-uncommitted admission.
   if psql "${psql_args[@]}" -f "$rollback" > "$cluster_root/race-inverse.log" 2>&1;then
    printf 'Inverse raced through a pending lineage admission\n' >&2;return 1
   fi
   rg -q 'lock timeout' "$cluster_root/race-inverse.log"
  fi
  # This ordinary READ ONLY owner projection finishes while the writers wait.
  query "begin read only;set local statement_timeout='2s';set local role service_role;select public.export_workspace_v3_category($business,$owner,'revenue_splits',0,1000);commit" >/dev/null
  query "select pg_terminate_backend(pid) from pg_stat_activity where application_name='ledger-barrier-$round'" >/dev/null
  wait "$barrier_pid" || true
  wait "$writer_pid";wait "$completion_pid"
  if [[ "$round" == 1 ]];then
   query "drop trigger ledger_race_pause on public.invoice_split_attributions" >/dev/null
   [[ "$(query "select exists(select 1 from public.revenue_splits where invoice_line_id='$line' and beneficiary_kind='agency' and beneficiary_workspace_id='$current') and (select receipt->>'agencyWorkspaceId'='$current' from public.invoice_split_attributions where invoice_line_id='$line')")" == t ]]
  else
   query "drop trigger ledger_race_pause on public.business_attribution_endings" >/dev/null
   [[ "$(query "select not exists(select 1 from public.revenue_splits where invoice_line_id='$line' and beneficiary_kind='agency') and (select receipt->>'status'='no_explicit_attribution' from public.invoice_split_attributions where invoice_line_id='$line')")" == t ]]
  fi
  [[ "$(query "select f.result=public.accrue_invoice_splits(s.business_workspace_id,s.invoice_line_id,s.period_start,s.period_end,s.source_account_id,s.charge_id,s.basis_cents,s.currency) from ledger_attribution_race.frozen f join public.invoice_split_sources s on s.invoice_line_id='$line' where f.round=$round")" == t ]]
 done
 printf 'Actual MO18 completion and new accrual serialize in both directions; exact admitted lineage/replays and READ ONLY readers survive.\n'
}
