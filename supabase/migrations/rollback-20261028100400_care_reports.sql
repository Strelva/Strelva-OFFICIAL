-- Inverse of 20261028100400_care_reports.sql. Refuses once any report, published
-- Release or agency time entry exists: those are retained records.
begin;
set local lock_timeout='3s';
do $$ begin
  if exists (select 1 from public.care_reports) or exists (select 1 from public.care_report_releases)
    or exists (select 1 from public.agency_client_time_entries) then
    raise exception 'care_reports_rollback_populated';
  end if;
end $$;

delete from public.agency_release_flag_ceilings where flag = 'care_reports';
alter table public.workspace_release_flag_changes disable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flag_changes where subject = 'care_reports';
alter table public.workspace_release_flag_changes enable trigger workspace_release_flag_changes_immutable_trg;
delete from public.workspace_release_flags where flag = 'care_reports';

drop function public.list_agency_client_time(uuid,uuid,uuid,text,date);
drop function public.void_agency_client_time(uuid,uuid,text,uuid,text);
drop function public.record_agency_client_time(uuid,uuid,uuid,text,jsonb);
drop function public.list_owner_care_reports(uuid,uuid,text);
drop function public.record_care_report_delivery(uuid,uuid,text,uuid,uuid,text,text,text);
drop function public.reserve_care_report_delivery(uuid,uuid,text);
drop function public.read_shared_care_report(text,integer);
drop function public.revoke_care_report_share_link(uuid,uuid,text);
drop function public.issue_care_report_share_link(uuid,uuid,text,text);
drop function public.publish_care_report(uuid,uuid,text,integer);
drop function public.save_care_report_note(uuid,uuid,text,text,integer);
drop function public.read_care_report(uuid,uuid,text);
drop function public.list_care_reports(uuid,uuid,text,date);
drop function public.generate_care_reports(uuid,uuid,text,date,uuid[],jsonb);
drop function public.care_report_facts(uuid,uuid,date,jsonb);
drop function public.care_report_clients(uuid,uuid,text);
drop function public.care_report_agency_role(uuid,uuid,text);
drop function public.care_report_ts(text);

drop trigger agency_client_time_voids_append_only on public.agency_client_time_voids;
drop trigger agency_client_time_entries_append_only on public.agency_client_time_entries;
drop trigger care_report_releases_append_only on public.care_report_releases;
drop function public.care_report_append_only();

drop table public.agency_client_time_voids;
drop table public.agency_client_time_entries;
drop table public.care_report_deliveries;
drop table public.care_report_share_links;
drop table public.care_report_releases;
drop table public.care_reports;

do $$ declare previous text[] := public.workspace_release_flag_names(); begin
  select coalesce(array_agg(key order by ord), array[]::text[]) into previous from unnest(previous) with ordinality t(key, ord) where key <> 'care_reports';
  execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path = public, pg_temp as %L',
    format('select %L::text[]', previous::text));
end $$;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
