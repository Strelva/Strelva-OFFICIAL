\set ON_ERROR_STOP on
-- Run after the ordered migrations in the disposable agency-workflow cluster.
-- Fictional records only. This tests attribution, not hosted delivery or permission promotion.
begin;
alter table auth.users add column if not exists raw_user_meta_data jsonb;
create function pg_temp.chrome_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'chrome attribution: %',label; end if; end $$;
do $$
declare
  owner_id uuid := '83500000-0000-4000-8000-000000000001';
  staff_id uuid := '83500000-0000-4000-8000-000000000002';
  business_id uuid := '83500000-0000-4000-8000-000000000010';
  agency_id uuid := '83500000-0000-4000-8000-000000000020';
  system_id uuid := '83500000-0000-4000-8000-000000000030';
  release_id uuid := '83500000-0000-4000-8000-000000000040';
  saved public.service_requests; replay public.service_requests; projection jsonb; caught text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (owner_id,'chrome-owner@example.test',now(),'{"name":"Jo"}'),
    (staff_id,'chrome-staff@example.test',now(),'{"name":"Agency member"}');
  insert into public.users(id,email,verified_at) values
    (owner_id,'chrome-owner@example.test',now()),(staff_id,'chrome-staff@example.test',now())
    on conflict (id) do update set email=excluded.email, verified_at=excluded.verified_at;
  insert into public.workspaces(id,kind,name,created_by) values
    (business_id,'customer','Chrome fixture business',owner_id),(agency_id,'agency','Original Studio',staff_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
    (business_id,owner_id,'owner',owner_id),(agency_id,staff_id,'owner',staff_id);
  perform public.choose_business_provider(owner_id,'chrome-owner@example.test',business_id,agency_id);
  perform public.set_agency_client_staff(staff_id,'chrome-staff@example.test',agency_id,business_id,staff_id,true);
  insert into public.systems(id,business_workspace_id,name,kind,command_id,command_digest,created_by,updated_by)
    values(system_id,business_id,'Fixture intake','website',system_id,repeat('a',64),staff_id,staff_id);
  insert into public.system_revisions(id,system_id,business_workspace_id,number,implementation,summary,command_id,command_digest,created_by)
    values(release_id,system_id,business_id,1,'{"kind":"website","ref":"fixture"}','Updated intake',release_id,repeat('b',64),staff_id);
  perform pg_temp.chrome_assert((select actor_snapshot = '{"kind":"agency","displayName":"Original Studio"}'::jsonb from public.system_revisions where id=release_id),'release captures the actor at the action');
  select * into saved from public.save_service_request(owner_id,'chrome-owner@example.test',business_id,null,null,'requested','Prepare intake','Intake flow','{"source":"ask_strelva","actor":{"kind":"platform"},"agencyName":"Spoofed"}',array['help_request'],jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id),'chrome-ask-receipt',repeat('c',64));
  perform pg_temp.chrome_assert(saved.context->'actor' = '{"kind":"person","displayName":"Jo"}'::jsonb and saved.context->>'agencyName' = 'Original Studio','request ignores supplied identity and records the filer and recipient');
  update public.workspaces set name='Renamed Studio' where id=agency_id;
  update auth.users set raw_user_meta_data='{"name":"Renamed person"}' where id=owner_id;
  projection := public.read_agency_client_home(business_id,staff_id,'chrome-staff@example.test');
  perform pg_temp.chrome_assert(projection->'changes'->0->'actor' = '{"kind":"agency","displayName":"Original Studio"}'::jsonb,'shared Home retains the historical agency after a rename');
  select * into replay from public.save_service_request(owner_id,'chrome-owner@example.test',business_id,null,null,'requested','Prepare intake','Intake flow','{"source":"ask_strelva","actor":{"kind":"platform"},"agencyName":"Spoofed"}',array['help_request'],jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id),'chrome-ask-receipt',repeat('c',64));
  perform pg_temp.chrome_assert(replay.id=saved.id and replay.context=saved.context,'idempotent replay retains the original identity');
  update public.service_requests set context='{"source":"ask_strelva","agencyName":"Spoofed again","actor":{"kind":"platform"}}' where id=saved.id;
  perform pg_temp.chrome_assert((select context->'actor'=saved.context->'actor' and context->'agencyName'=saved.context->'agencyName' from public.service_requests where id=saved.id),'request updates cannot overwrite original receipt identity');
  begin
    update public.system_revisions set actor_snapshot='{"kind":"platform"}' where id=release_id;
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.chrome_assert(caught like '%system_revision_immutable%','release identity is immutable');
end $$;
select pg_temp.chrome_assert(not has_function_privilege('anon','public.system_revision_capture_actor()','EXECUTE')
  and not has_function_privilege('authenticated','public.ask_request_capture_identity()','EXECUTE')
  and not has_function_privilege('service_role','public.ask_request_capture_identity()','EXECUTE'),'capture helpers are not callable APIs');
rollback;
