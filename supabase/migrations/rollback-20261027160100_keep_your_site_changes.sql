begin;
set local lock_timeout='3s';
lock table public.connected_site_change_steps in access exclusive mode;
-- A Release is already a system_revisions row. Review those by hand first.
do $$ begin
 if exists(select 1 from public.connected_site_change_steps where kind='released') then
  raise exception 'keep_your_site_rollback_has_releases';
 end if;
end $$;
drop function public.read_agency_client_sites(uuid, uuid, text, text, uuid, integer);
drop function public.record_connected_site_detection(uuid, uuid, text, text, text, text, text[], boolean);
drop function public.read_connected_site_change_releases(uuid, uuid, text, timestamptz);
drop function public.read_connected_site_change_for_request(uuid, text, uuid);
drop function public.list_connected_site_change_reviews(uuid, uuid, text);
drop function public.withdraw_connected_site_change(uuid, uuid, text, uuid, text);
drop function public.release_connected_site_change_unconfirmed(uuid, uuid, text, uuid, text);
drop function public.record_connected_site_change_check(uuid, uuid, text, uuid, text, text, text);
drop function public.mark_connected_site_change_done(uuid, uuid, text, uuid, text);
drop function public.decide_connected_site_change(uuid, uuid, text, uuid, text);
drop function public.plan_connected_site_change(uuid, uuid, text, uuid, uuid, uuid, text, jsonb);
drop function public.list_connected_site_changes(uuid, uuid, text, uuid);
drop function public.connected_site_change_release(public.connected_site_changes, uuid, text, text, uuid, text);
drop function public.connected_site_change_is_agency(public.connected_site_changes, uuid);
drop function public.connected_site_change_is_direct_manager(uuid, uuid);
drop function public.connected_site_change_verified_user(uuid, text);
drop function public.connected_site_change_lock(uuid, uuid);
drop function public.connected_site_change_json(public.connected_site_changes);
drop function public.connected_site_change_actor(uuid, uuid);
drop function public.connected_site_change_request_stage(uuid);
drop function public.connected_site_change_stage(uuid);
drop function public.connected_site_platform_label(text);
drop table public.connected_site_change_steps, public.connected_site_changes, public.connected_site_detections;
drop function public.connected_site_change_step_immutable();
drop function public.connected_site_change_immutable();
drop function public.record_connected_site_check(uuid, uuid, text, uuid, text, text, text[]);
do $$ declare saved text; begin
 select before_definition into saved from keep_your_site_rollback.functions where signature='public.connected_site_json(public.connected_sites,boolean)';
 if saved is null then raise exception 'keep_your_site_rollback_missing_definition'; end if;
 execute saved;
end $$;
alter table public.connected_sites
 drop column last_checked_at, drop column last_check_result, drop column detected_platform,
 drop column detected_evidence, drop column detected_at;
drop schema keep_your_site_rollback cascade;
notify pgrst,'reload schema';
commit;
