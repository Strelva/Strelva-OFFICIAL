-- Rollback for 20261008130000_system_possibilities.sql
-- Forward SHA-256: 47c86d063608ad154a3cbd8aef9193549c070f5a51f7c12883fe85e248e08b43
-- Batch 5: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_unlink_plan(uuid)')))) is distinct from '1b0f167443a499af8389746714afa202' then raise exception 'rollback_wrong_order_or_function_drift: tenant_unlink_plan'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.pause_tenant_systems(text)')))) is distinct from '711a7e6c09a12c997ca813a3d71457eb' then raise exception 'rollback_wrong_order_or_function_drift: pause_tenant_systems'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.adopt_systems_on_conversion()')))) is distinct from '71bcde73fbbafa2d5ed30cde23c95993' then raise exception 'rollback_wrong_order_or_function_drift: adopt_systems_on_conversion'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_possibility_append_only()')))) is distinct from 'dd255fc293e2cc3e0cbcdbf73fc253f2' then raise exception 'rollback_wrong_order_or_function_drift: system_possibility_append_only'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.observe_tenant_content(text,text)')))) is distinct from '28ab5913ef8dbc56a8f81a1de1bc8a8a' then raise exception 'rollback_wrong_order_or_function_drift: observe_tenant_content'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_revision_content_immutable()')))) is distinct from 'fcae0744451aa7464e688e1933cffbe8' then raise exception 'rollback_wrong_order_or_function_drift: system_revision_content_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.adopt_converted_tenant_systems(uuid)')))) is distinct from '5fba46d606be4220382dcb8eab42075f' then raise exception 'rollback_wrong_order_or_function_drift: adopt_converted_tenant_systems'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_possibilities_follow_revision()')))) is distinct from '0b2528024014e08c932e43dd1ddbbff5' then raise exception 'rollback_wrong_order_or_function_drift: system_possibilities_follow_revision'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_unlink_plan_before_systems(uuid)')))) is distinct from 'ea5218d838e2f5b472b5f296c1244442' then raise exception 'rollback_wrong_order_or_function_drift: tenant_unlink_plan_before_systems'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.list_system_possibilities(uuid,uuid,text)')))) is distinct from '068eba66db45417edef124c9323d50f2' then raise exception 'rollback_wrong_order_or_function_drift: list_system_possibilities'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_possibility_body_valid(jsonb,uuid)')))) is distinct from '571c6eab27860b0d4b7013b0e974e609' then raise exception 'rollback_wrong_order_or_function_drift: system_possibility_body_valid'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_system_possibility(uuid,uuid,text,uuid)')))) is distinct from '7db3e9a2b940fae0ebac3a4caddf520b' then raise exception 'rollback_wrong_order_or_function_drift: read_system_possibility'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.observe_system_revision(uuid,uuid,jsonb,text)')))) is distinct from '6223042accc621bb58f17fc9b9ad0b3b' then raise exception 'rollback_wrong_order_or_function_drift: observe_system_revision'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_possibility_in_scope(uuid,uuid,uuid[])')))) is distinct from 'e8e1ec840f265a3c43fccf1f137effa2' then raise exception 'rollback_wrong_order_or_function_drift: system_possibility_in_scope'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_system_revision_content(uuid,uuid,text,text)')))) is distinct from 'ebe294457d84e123b00628c3d30c1b9d' then raise exception 'rollback_wrong_order_or_function_drift: read_system_revision_content'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_possibility_time(timestamp with time zone)')))) is distinct from 'f730af05a7069cdb7065296382963186' then raise exception 'rollback_wrong_order_or_function_drift: system_possibility_time'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_system_possibility_preview(uuid,uuid,integer)')))) is distinct from '79ac5fa91be84aa67e90df8de2e515d5' then raise exception 'rollback_wrong_order_or_function_drift: read_system_possibility_preview'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.withdraw_idle_system_possibilities(integer,integer)')))) is distinct from 'd3ec0e5e67ca5b226ac2e649741aad96' then raise exception 'rollback_wrong_order_or_function_drift: withdraw_idle_system_possibilities'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.create_system_possibility(uuid,uuid,text,jsonb,text)')))) is distinct from '906c8b133b51d88191be4f0128123b92' then raise exception 'rollback_wrong_order_or_function_drift: create_system_possibility'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_possibility_json(system_possibilities,integer)')))) is distinct from '348fca139a91bcc84f93c12ab1b315f0' then raise exception 'rollback_wrong_order_or_function_drift: system_possibility_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_possibility_write_pins(uuid,uuid,jsonb,uuid[])')))) is distinct from 'fd93e77412dde60a5209c64b9d61ef43' then raise exception 'rollback_wrong_order_or_function_drift: system_possibility_write_pins'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.put_system_revision_content(uuid,uuid,text,text,jsonb)')))) is distinct from '3aa5d049d5b9f70e82a54e54074022c6' then raise exception 'rollback_wrong_order_or_function_drift: put_system_revision_content'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.save_system_possibility(uuid,uuid,text,uuid,integer,jsonb)')))) is distinct from '5dac7ce4ea818f3a58bbe4a881f29496' then raise exception 'rollback_wrong_order_or_function_drift: save_system_possibility'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.adopt_system_with_revision(uuid,text,text,text,text,jsonb,boolean,uuid)')))) is distinct from '75b54f46689f4b7737a2ac511dd2c54b' then raise exception 'rollback_wrong_order_or_function_drift: adopt_system_with_revision'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.system_possibilities') and attnum>0 and not attisdropped) <> 12 then raise exception 'rollback_wrong_order_or_table_drift: system_possibilities'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.system_revision_contents') and attnum>0 and not attisdropped) <> 5 then raise exception 'rollback_wrong_order_or_table_drift: system_revision_contents'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.system_possibility_events') and attnum>0 and not attisdropped) <> 9 then raise exception 'rollback_wrong_order_or_table_drift: system_possibility_events'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.system_possibility_pins') and attnum>0 and not attisdropped) <> 4 then raise exception 'rollback_wrong_order_or_table_drift: system_possibility_pins'; end if;
end;
$rollback_guard$;
lock table public."system_possibilities", public."system_possibility_events", public."system_possibility_pins", public."system_revision_contents" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008130000_system_possibilities" as table public."system_possibilities";
revoke all on release_rollback_archive."m20261008130000_system_possibilities" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008130000_system_possibility_events" as table public."system_possibility_events";
revoke all on release_rollback_archive."m20261008130000_system_possibility_events" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008130000_system_possibility_pins" as table public."system_possibility_pins";
revoke all on release_rollback_archive."m20261008130000_system_possibility_pins" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261008130000_system_revision_contents" as table public."system_revision_contents";
revoke all on release_rollback_archive."m20261008130000_system_revision_contents" from public, anon, authenticated, service_role;
drop trigger "systems_possibilities_follow_revision" on public."systems";
drop trigger "system_revision_contents_immutable" on public."system_revision_contents";
drop trigger "tenant_workspace_links_adopt_systems" on public."tenant_workspace_links";
drop trigger "system_possibility_events_append_only" on public."system_possibility_events";
alter table public."system_possibilities" drop constraint "system_possibilities_body_check";
alter table public."system_possibilities" drop constraint "system_possibilities_status_check";
alter table public."system_possibilities" drop constraint "system_possibilities_revision_check";
alter table public."system_possibilities" drop constraint "system_possibilities_source_ref_check";
alter table public."system_possibilities" drop constraint "system_possibilities_activation_id_check";
alter table public."system_possibility_events" drop constraint "system_possibility_events_kind_check";
alter table public."system_revision_contents" drop constraint "system_revision_contents_content_check";
alter table public."system_possibility_events" drop constraint "system_possibility_events_detail_check";
alter table public."system_possibilities" drop constraint "system_possibilities_candidate_revision_check";
alter table public."system_possibility_events" drop constraint "system_possibility_events_actor_id_check";
alter table public."system_possibility_events" drop constraint "system_possibility_events_revision_check";
alter table public."system_revision_contents" drop constraint "system_revision_contents_content_hash_check";
drop function public.pause_tenant_systems(text);
drop function public.adopt_systems_on_conversion();
drop function public.system_possibility_append_only();
drop function public.observe_tenant_content(text,text);
drop function public.system_revision_content_immutable();
drop function public.adopt_converted_tenant_systems(uuid);
drop function public.system_possibilities_follow_revision();
drop function public.tenant_unlink_plan_before_systems(uuid);
drop function public.list_system_possibilities(uuid,uuid,text);
drop function public.system_possibility_body_valid(jsonb,uuid);
drop function public.read_system_possibility(uuid,uuid,text,uuid);
drop function public.observe_system_revision(uuid,uuid,jsonb,text);
drop function public.system_possibility_in_scope(uuid,uuid,uuid[]);
drop function public.read_system_revision_content(uuid,uuid,text,text);
drop function public.system_possibility_time(timestamp with time zone);
drop function public.read_system_possibility_preview(uuid,uuid,integer);
drop function public.withdraw_idle_system_possibilities(integer,integer);
drop function public.create_system_possibility(uuid,uuid,text,jsonb,text);
drop function public.system_possibility_json(system_possibilities,integer);
drop function public.system_possibility_write_pins(uuid,uuid,jsonb,uuid[]);
drop function public.put_system_revision_content(uuid,uuid,text,text,jsonb);
drop function public.save_system_possibility(uuid,uuid,text,uuid,integer,jsonb);
drop function public.adopt_system_with_revision(uuid,text,text,text,text,jsonb,boolean,uuid);
drop table public."system_possibilities", public."system_possibility_events", public."system_possibility_pins", public."system_revision_contents";
CREATE OR REPLACE FUNCTION public.tenant_unlink_plan(p_link_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  link public.tenant_workspace_links%rowtype;
  import_rev public.business_record_revisions%rowtype;
  ws public.workspaces%rowtype;
  change jsonb;
  current_state jsonb;
  before_state jsonb;
  after_state jsonb;
  action text;
  actions jsonb := '[]'::jsonb;
  kept jsonb := '[]'::jsonb;
  removing integer := 0;
  restoring integer := 0;
  keeping integer := 0;
  reverted integer := 0;
  remaining bigint;
  reasons text[] := '{}';
  fk record;
  in_use boolean;
  leads bigint := 0;
  adopted bigint := 0;
begin
  select * into link from public.tenant_workspace_links where id = p_link_id;
  if not found then raise exception 'tenant_unlink_not_linked'; end if;
  select * into ws from public.workspaces where id = link.workspace_id;
  select * into import_rev from public.business_record_revisions
    where workspace_id = link.workspace_id and sequence = (link.receipt->>'sequence')::bigint and source = 'tenant_import';
  if not found then raise exception 'tenant_unlink_import_missing'; end if;

  -- One revision may touch an entity more than once (a contact created and
  -- then merged by a later lead), so compare against its net effect: the
  -- first "before" and the last "after".
  for change in
    select jsonb_build_object('entity', x.entity, 'id', x.id,
        'before', (array_agg(t.value->'before' order by t.n))[1],
        'after', (array_agg(t.value->'after' order by t.n desc))[1])
      from jsonb_array_elements(import_rev.changes) with ordinality t(value, n)
      cross join lateral (select t.value->>'entity' as entity, t.value->>'id' as id) x
      group by x.entity, x.id
      order by min(t.n) desc
  loop
    current_state := public.business_record_entity_state(link.workspace_id, change->>'entity', change->>'id');
    before_state := nullif(change->'before', 'null'::jsonb);
    after_state := nullif(change->'after', 'null'::jsonb);
    if before_state is not distinct from after_state then continue; end if;
    action := case
      when current_state is not distinct from before_state then 'already_reverted'
      when current_state is not distinct from after_state then case when before_state is null then 'remove' else 'restore' end
      else 'keep' end;
    case action
      when 'remove' then removing := removing + 1;
      when 'restore' then restoring := restoring + 1;
      when 'keep' then
        keeping := keeping + 1;
        if jsonb_array_length(kept) < 200 then
          kept := kept || jsonb_build_array(jsonb_build_object('entity', change->>'entity', 'id', change->>'id',
            'reason', case when current_state is null then 'deleted_after_import' else 'changed_after_import' end));
        end if;
      else reverted := reverted + 1;
    end case;
    if action in ('remove','restore') then
      actions := actions || jsonb_build_array(jsonb_build_object('entity', change->>'entity', 'id', change->>'id',
        'action', action, 'restoreTo', coalesce(before_state, 'null'::jsonb)));
    end if;
  end loop;

  if coalesce((link.receipt->>'joinedExistingWorkspace')::boolean, true) then
    reasons := array_append(reasons, 'joined_existing_workspace');
  end if;
  if ws.created_by is distinct from link.linked_by then reasons := array_append(reasons, 'workspace_not_created_by_conversion'); end if;
  if exists (select 1 from public.tenant_workspace_links where workspace_id = link.workspace_id and id <> link.id) then
    reasons := array_append(reasons, 'other_sites_linked');
  end if;
  if exists (select 1 from public.workspace_memberships where workspace_id = link.workspace_id
      and not (user_id = link.linked_by and role = 'admin')) then
    reasons := array_append(reasons, 'other_members');
  end if;
  remaining := (select count(*) from public.business_record_facts where workspace_id = link.workspace_id)
    + (select count(*) from public.business_services where workspace_id = link.workspace_id)
    + (select count(*) from public.business_people where workspace_id = link.workspace_id)
    + (select count(*) from public.business_contacts where workspace_id = link.workspace_id)
    - removing;
  if remaining > 0 then reasons := array_append(reasons, 'record_has_other_data'); end if;
  if exists (select 1 from public.business_record_revisions where workspace_id = link.workspace_id
      and sequence <> import_rev.sequence and undo_of_sequence is distinct from import_rev.sequence) then
    reasons := array_append(reasons, 'record_history_after_import');
  end if;
  -- Every other table that points at the workspace counts as use. New tables
  -- are covered without changing this function.
  for fk in
    select c.conrelid::regclass as rel, a.attname as col
      from pg_constraint c
      cross join lateral unnest(c.conkey, c.confkey) as k(local_col, ref_col)
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = k.ref_col and ra.attname = 'id'
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.local_col
      where c.contype = 'f' and c.confrelid = 'public.workspaces'::regclass
        and c.conrelid not in ('public.workspace_memberships'::regclass, 'public.business_records'::regclass,
          'public.tenant_workspace_links'::regclass)
        and c.conrelid is distinct from to_regclass('public.tenant_leads')
        -- The provider mark is conversion machinery, like the operator's
        -- membership; it grants nothing and goes with the business.
        and c.conrelid is distinct from to_regclass('public.workspace_providers')
      order by 1, 2
  loop
    execute format('select exists (select 1 from %s where %I = $1)', fk.rel, fk.col) into in_use using link.workspace_id;
    if in_use then reasons := array_append(reasons, ('workspace_in_use:' || fk.rel::text)); end if;
  end loop;

  if link.tenant_stable_id is not null and to_regclass('public.tenant_leads') is not null then
    execute 'select count(*) from public.tenant_leads where tenant_stable_id = $1 and workspace_id = $2'
      into leads using link.tenant_stable_id, link.workspace_id;
  end if;
  if link.tenant_stable_id is not null and to_regclass('public.systems') is not null then
    execute $q$select count(*) from public.systems where business_workspace_id = $1 and origin_kind = 'tenant' and origin_ref = $2$q$
      into adopted using link.workspace_id, link.tenant_stable_id::text;
  end if;

  return jsonb_build_object(
    'linkId', link.id,
    'tenantStableId', link.tenant_stable_id,
    'workspaceId', link.workspace_id,
    'workspaceName', ws.name,
    'linkedAt', link.linked_at,
    'importSequence', import_rev.sequence,
    'deleteWorkspace', cardinality(reasons) = 0,
    'workspaceKeptBecause', to_jsonb(reasons),
    'entities', jsonb_build_object('removed', removing, 'restored', restoring, 'kept', keeping, 'alreadyReverted', reverted),
    'kept', kept,
    'leadsDetached', leads,
    'systemsAdoptedFromTenant', adopted,
    'actions', actions);
end;
$function$
;
revoke all on function public.tenant_unlink_plan(uuid) from public, anon, authenticated, service_role;
commit;
