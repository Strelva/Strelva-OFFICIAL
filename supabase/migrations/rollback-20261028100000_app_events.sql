-- Rollback for 20261028100000_app_events.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Run rollback-20261028100100_app_event_sources.sql first (it drops the triggers that write here).
-- Events, dead letters and Webhook endpoints are history: with any rows present this
-- refuses unless run after `set app_events.allow_drop = '1'`, which also drops them.
begin;
set local lock_timeout='3s';

do $$ begin
 if (exists(select 1 from public.app_events) or exists(select 1 from public.app_event_dead_letters)
   or exists(select 1 from public.app_event_webhook_endpoints))
   and coalesce(current_setting('app_events.allow_drop', true),'') <> '1' then
  raise exception 'app_events_rollback_has_data';
 end if;
end $$;

delete from public.agency_release_flag_ceilings where flag='app_events';
alter table public.workspace_release_flag_changes disable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flag_changes where subject='app_events';
alter table public.workspace_release_flag_changes enable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flags where flag='app_events';

do $$ declare previous text[]:=public.workspace_release_flag_names(); begin
 select coalesce(array_agg(key order by ord),array[]::text[]) into previous from unnest(previous) with ordinality t(key,ord) where key<>'app_events';
 execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path=public,pg_temp as %L','select '||quote_literal(previous)||'::text[]');
end $$;

-- Functions first (several take the table row types), then the tables.
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname = any(array[
   'agent_read_app_events','set_app_event_webhook_endpoint','create_app_event_webhook_endpoint',
   'operator_retry_app_event_dead_letter','retry_app_event_dead_letter','read_operator_app_event_deliveries',
   'read_app_event_deliveries','set_app_event_capture','read_app_event_capture','app_event_health','purge_app_events',
   'app_event_finish_replay','app_event_claim_replays','app_event_disable_endpoint','app_event_skip','app_event_release',
   'app_event_fail','app_event_ack','app_event_claim_lanes','app_event_active_webhook_endpoints','app_event_ensure_cursors',
   'app_event_recent_workspaces','app_event_deliveries_view','app_event_endpoint_json','app_event_agency_name',
   'app_event_subscriber_visible','app_event_webhook_allows','app_event_lock_scope','app_event_actor_scope',
   'app_event_emit_safe','app_event_emit','app_event_json','app_event_static_area','app_event_capture_on'])
  order by p.oid desc loop
  execute 'drop function '||fn.sig;
 end loop;
end $$;

drop table public.app_event_webhook_endpoint_changes;
drop table public.app_event_webhook_endpoints;
drop table public.app_event_dead_letters;
drop table public.app_event_cursors;
drop table public.app_event_emit_failures;
drop table public.app_events;
drop table public.app_event_streams;
drop table public.app_event_capture_changes;
drop table public.app_event_settings;
drop function public.app_event_history_immutable();
drop function public.app_event_types();

commit;
