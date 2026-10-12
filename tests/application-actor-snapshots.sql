\set ON_ERROR_STOP on
begin;
-- This test runs only in the disposable local cluster. Supply the Auth name
-- column the production provider owns; the baseline shim intentionally omits it.
alter table auth.users add column if not exists raw_user_meta_data jsonb;
create function pg_temp.actor_assert(value boolean, label text) returns void language plpgsql as $$
begin if value is not true then raise exception 'actor snapshot assertion: %', label; end if; end;
$$;
select pg_temp.actor_assert(not has_function_privilege('service_role', 'public.application_action_actor_snapshot(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.application_action_actor_snapshot(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.application_action_actor_snapshot(uuid,uuid)', 'EXECUTE'), 'internal snapshot lookup is unexposed');
do $$
declare
  owner_id uuid := '83000000-0000-4000-8000-000000000001';
  staff_id uuid := '83000000-0000-4000-8000-000000000002';
  business_id uuid := '83000000-0000-4000-8000-000000000010';
  agency_id uuid := '83000000-0000-4000-8000-000000000011';
  app_id uuid := '83000000-0000-4000-8000-000000000020';
  spec jsonb; payload jsonb; caught text;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (owner_id,'actor-owner@example.test',now(),'{"full_name":"Sheri"}'),
    (staff_id,'actor-staff@example.test',now(),'{"name":"Alex"}');
  -- The focused workspace owner has the minimal Auth shim rather than the
  -- historical Auth provisioning trigger. Supply the matching app identities
  -- explicitly; full-history provisioning may already have created them.
  insert into public.users(id,email,verified_at) values
    (owner_id,'actor-owner@example.test',now()),
    (staff_id,'actor-staff@example.test',now())
    on conflict (id) do update set email=excluded.email,verified_at=excluded.verified_at;
  insert into public.workspaces(id,kind,name,created_by) values
    (business_id,'customer','Actor Fixture',owner_id),(agency_id,'agency','North Studio',staff_id);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
    (business_id,owner_id,'owner',owner_id),(agency_id,staff_id,'owner',staff_id);
  perform public.choose_business_provider(owner_id,'actor-owner@example.test',business_id,agency_id);
  perform public.set_agency_client_staff(staff_id,'actor-staff@example.test',agency_id,business_id,staff_id,true);
  spec := jsonb_build_object('title','Staff requests','maintenanceOwner',owner_id::text,
    'fields',jsonb_build_array(jsonb_build_object('id','request','label','Request','type','text','required',true)),
    'components',jsonb_build_array(jsonb_build_object('kind','form','fields',jsonb_build_array('request'))));
  insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by)
    values(app_id,business_id,'applications','application','Staff requests',jsonb_build_object(
      'version',1,'revision',0,'title','Staff requests','spec',spec,'specVersion',1,'status','draft',
      'versions',jsonb_build_array(jsonb_build_object('version',1,'spec',spec)),
      'history','[]'::jsonb,'records','[]'::jsonb,'rehearsal',null),owner_id);
  select w.payload into payload from public.saved_product_work w where id=app_id;
  perform pg_temp.actor_assert(payload->'maintenanceActor'='{"kind":"person","displayName":"Sheri"}'::jsonb,'maintenance identity captured at creation');
  -- Actual compatibility receipt writer used by every native application RPC.
  perform public.application_touch_compatibility(app_id,staff_id,'rehearse_candidate','{}');
  select w.payload into payload from public.saved_product_work w where id=app_id;
  perform pg_temp.actor_assert(payload->'history'->0->'actor'='{"kind":"agency","displayName":"North Studio"}'::jsonb,'native command receipt captures the staffed agency');
  update public.workspaces set name='Later Studio' where id=agency_id;
  perform public.application_touch_compatibility(app_id,owner_id,'revise_candidate','{}');
  select w.payload into payload from public.saved_product_work w where id=app_id;
  perform pg_temp.actor_assert(payload->'history'->0->'actor'->>'displayName'='North Studio','earlier agency snapshot survives a rename');
  perform pg_temp.actor_assert(payload->'history'->1->'actor'='{"kind":"person","displayName":"Sheri"}'::jsonb,'owner action is a person, not the agency brand');
  update auth.users set raw_user_meta_data='{}' where id=owner_id;
  perform public.application_touch_compatibility(app_id,owner_id,'revise_candidate','{}');
  select w.payload into payload from public.saved_product_work w where id=app_id;
  perform pg_temp.actor_assert(payload->'history'->2->'actor'='null'::jsonb,'missing name stays unknown, never email or platform');
  perform pg_temp.actor_assert(payload->'maintenanceActor'->>'displayName'='Sheri','maintenance snapshot survives projection and later writes');
  -- A preexisting unmapped row is not attributed using today's membership.
  update public.saved_product_work w set payload=jsonb_set(w.payload,'{history,0}',(w.payload->'history'->0)-'actor') where id=app_id;
  perform public.application_touch_compatibility(app_id,staff_id,'rehearse_candidate','{}');
  select w.payload into payload from public.saved_product_work w where id=app_id;
  perform pg_temp.actor_assert(not (payload->'history'->0 ? 'actor'),'legacy gaps are not backfilled');
  perform pg_temp.actor_assert(payload->'history'->3->'actor'->>'displayName'='Later Studio','next action captures its own current name');
  -- The existing service boundary still refuses calling internal writers.
  set local role service_role;
  begin perform public.application_touch_compatibility(app_id,staff_id,'fake','{}');
    exception when insufficient_privilege then caught := sqlstate; end;
  reset role;
  perform pg_temp.actor_assert(caught='42501','snapshot trigger grants no direct mutation authority');
end;
$$;
rollback;
