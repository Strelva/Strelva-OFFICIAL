-- Rollback for 20261028100700_vertical_intake.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Refuses once any numbered Release exists: a Release is a record of what an owner made live.
begin;
set local lock_timeout='3s';

do $$ begin
  if exists (select 1 from public.app_intake_releases) then
    raise exception 'app_intake_rollback_has_releases';
  end if;
end $$;

drop function public.read_app_intake(uuid, uuid, text, text);
drop function public.save_app_intake_draft(uuid, uuid, text, text, jsonb, integer);
drop function public.request_app_intake_live(uuid, uuid, text, text);
drop function public.pause_app_intake(uuid, uuid, text, text, boolean);
drop function public.read_app_intake_sensitive(uuid, uuid, text, uuid);
drop function public.make_app_intake_live(uuid, uuid, integer, uuid, uuid, text);
drop function public.withdraw_app_intake_live_request(uuid, uuid);
drop function public.list_app_intake_live_requests(uuid);
drop function public.record_app_intake_live_check(uuid, jsonb);
drop function public.resolve_public_app_intake(text, text);
drop function public.record_app_intake_submission(text, text, text, uuid, jsonb, text, jsonb);
drop function public.list_open_app_intake_visits(uuid);
drop function public.read_app_intake_visit(uuid, uuid);
drop function public.decide_app_intake_visit(uuid, uuid, text, uuid, uuid);
drop function public.purge_app_intake_sensitive(integer);
drop function public.app_intake_visit_json(public.app_intake_submissions, public.tenant_leads, public.app_intake_releases);
drop function public.app_intake_assert_writer(uuid, uuid, text);
drop function public.app_intake_assert_customer_role(uuid, uuid, text, text[]);
drop function public.app_intake_config_valid(jsonb);

drop function public.app_intake_json(public.app_intake_installs);
drop table public.app_intake_sensitive_reads;
drop table public.app_intake_sensitive;
drop table public.app_intake_submissions;
drop table public.app_intake_releases;
drop function public.app_intake_release_immutable();
drop table public.app_intake_installs;

commit;
