-- Rollback for 20261007110000_business_ownership.sql
-- Forward SHA-256: d3d4a078a8eb6af1ef7e89e961c60c21b2f557802c30282ac5768107df3903cf
-- Batch 3: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_lead_retention()')))) is distinct from 'b19125e0014fd420eecdfb71533cfcd6' then raise exception 'rollback_wrong_order_or_function_drift: tenant_lead_retention'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_unlink_plan(uuid)')))) is distinct from '3433c0bbabb3495f22bdb8ca26a1399f' then raise exception 'rollback_wrong_order_or_function_drift: tenant_unlink_plan'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_provider_guard()')))) is distinct from '8fbc9ccec5c321d47bf08fdb9ec57393' then raise exception 'rollback_wrong_order_or_function_drift: workspace_provider_guard'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_lead_purge_immutable()')))) is distinct from 'c18c5600a2ec076bf4e71918dcc42f57' then raise exception 'rollback_wrong_order_or_function_drift: tenant_lead_purge_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_leads_retain_on_detach()')))) is distinct from 'dc8292f90dcdf9c048f2c6b4015350e2' then raise exception 'rollback_wrong_order_or_function_drift: tenant_leads_retain_on_detach'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.purge_expired_tenant_leads(integer)')))) is distinct from 'd200cc85edbfe9034a036b628e214014' then raise exception 'rollback_wrong_order_or_function_drift: purge_expired_tenant_leads'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_provider_mark_converted()')))) is distinct from '626ff348b89468c3b48427e9b8bba43f' then raise exception 'rollback_wrong_order_or_function_drift: workspace_provider_mark_converted'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.resolve_tenant_owner_recipient(text)')))) is distinct from 'a65f8356b541b1ff70a0776d1b69979c' then raise exception 'rollback_wrong_order_or_function_drift: resolve_tenant_owner_recipient'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_agency_workspace_immutable()')))) is distinct from 'daee6123e62d8ff2dd04cadc47ec8f6e' then raise exception 'rollback_wrong_order_or_function_drift: strelva_agency_workspace_immutable'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.list_provided_clients(uuid,text,uuid)')))) is distinct from 'f098fd6026fd6d9eab56dbd657d83d87' then raise exception 'rollback_wrong_order_or_function_drift: list_provided_clients'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_leads_retain_on_tenant_delete()')))) is distinct from '02bf2db209093b40a4fa88498e4dd15c' then raise exception 'rollback_wrong_order_or_function_drift: tenant_leads_retain_on_tenant_delete'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.operator_owner_invitation_tenants(uuid)')))) is distinct from '2883345874fb88a15f4bf9c396e140a3' then raise exception 'rollback_wrong_order_or_function_drift: operator_owner_invitation_tenants'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.accept_workspace_invitation(text,uuid,text)')))) is distinct from 'd886946ee0f2862880ca1ad8e2a00a76' then raise exception 'rollback_wrong_order_or_function_drift: accept_workspace_invitation'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.operator_owner_invitation_assert(text,uuid)')))) is distinct from 'a2ee90d2eb62161834a92f7d9c484c5c' then raise exception 'rollback_wrong_order_or_function_drift: operator_owner_invitation_assert'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.revoke_operator_owner_invitation(text,uuid)')))) is distinct from '560b49f8ec27e724a40edfe124f2245e' then raise exception 'rollback_wrong_order_or_function_drift: revoke_operator_owner_invitation'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.designate_strelva_agency_workspace(text,uuid)')))) is distinct from 'd985a272cdd033c38d564fbee5377d20' then raise exception 'rollback_wrong_order_or_function_drift: designate_strelva_agency_workspace'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_operator_owner_invitation_state(text,uuid)')))) is distinct from 'a4ce3d646b582f669a1d1d006ed0598f' then raise exception 'rollback_wrong_order_or_function_drift: read_operator_owner_invitation_state'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_tenant_leads(text,integer,timestamp with time zone)')))) is distinct from 'b24fd80a93711e68e296daa8661ba8df' then raise exception 'rollback_wrong_order_or_function_drift: read_tenant_leads'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.create_operator_owner_invitation(text,uuid,text,text,timestamp with time zone)')))) is distinct from '7b94e40cfa3a9226b9857ce285e8b745' then raise exception 'rollback_wrong_order_or_function_drift: create_operator_owner_invitation'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.tenant_lead_purges') and attnum>0 and not attisdropped) <> 8 then raise exception 'rollback_wrong_order_or_table_drift: tenant_lead_purges'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.workspace_providers') and attnum>0 and not attisdropped) <> 10 then raise exception 'rollback_wrong_order_or_table_drift: workspace_providers'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.strelva_agency_workspace') and attnum>0 and not attisdropped) <> 4 then raise exception 'rollback_wrong_order_or_table_drift: strelva_agency_workspace'; end if;
end;
$rollback_guard$;
lock table public."strelva_agency_workspace", public."tenant_lead_purges", public."tenant_leads", public."workspace_invitations", public."workspace_providers" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007110000_strelva_agency_workspace" as table public."strelva_agency_workspace";
revoke all on release_rollback_archive."m20261007110000_strelva_agency_workspace" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007110000_tenant_lead_purges" as table public."tenant_lead_purges";
revoke all on release_rollback_archive."m20261007110000_tenant_lead_purges" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007110000_tenant_leads" as table public."tenant_leads";
revoke all on release_rollback_archive."m20261007110000_tenant_leads" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007110000_workspace_invitations" as table public."workspace_invitations";
revoke all on release_rollback_archive."m20261007110000_workspace_invitations" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007110000_workspace_providers" as table public."workspace_providers";
revoke all on release_rollback_archive."m20261007110000_workspace_providers" from public, anon, authenticated, service_role;
-- Preserve 1.0-only rows before restoring the earlier constraints.
delete from public.tenant_leads l where not exists(select 1 from public.tenants t where t.stable_id=l.tenant_stable_id);
drop trigger "tenants_retain_leads" on public."tenants";
drop trigger "tenant_leads_retain_on_detach" on public."tenant_leads";
drop trigger "workspace_providers_guard" on public."workspace_providers";
drop trigger "tenant_lead_purges_immutable" on public."tenant_lead_purges";
drop trigger "strelva_agency_workspace_immutable" on public."strelva_agency_workspace";
drop trigger "tenant_workspace_links_mark_provider" on public."tenant_workspace_links";
alter table public."tenant_leads" drop constraint "tenant_leads_retention_needs_deletion";
alter table public."tenant_leads" drop constraint "tenant_leads_site_name_at_delete_check";
alter table public."workspace_invitations" drop constraint "workspace_invitations_issued_by_kind_check";
alter table public."workspace_invitations" drop constraint "workspace_invitations_operator_issues_owner_only";
drop index public."tenant_leads_retain_until_idx";
alter table public."tenant_leads" drop column "retain_until";
alter table public."tenant_leads" drop column "tenant_deleted_at";
alter table public."tenant_leads" drop column "site_name_at_delete";
alter table public."workspace_invitations" drop column "issued_by_kind";
alter table public."workspace_providers" drop constraint "workspace_providers_check";
alter table public."workspace_providers" drop constraint "workspace_providers_check1";
alter table public."workspace_providers" drop constraint "workspace_providers_source_check";
alter table public."workspace_providers" drop constraint "workspace_providers_status_check";
alter table public."tenant_lead_purges" drop constraint "tenant_lead_purges_site_name_check";
alter table public."tenant_lead_purges" drop constraint "tenant_lead_purges_tenant_slug_check";
alter table public."tenant_lead_purges" drop constraint "tenant_lead_purges_purged_count_check";
alter table public."workspace_providers" drop constraint "workspace_providers_end_reason_check";
alter table public."strelva_agency_workspace" drop constraint "strelva_agency_workspace_singleton_check";
drop function public.tenant_lead_retention();
drop function public.workspace_provider_guard();
drop function public.tenant_lead_purge_immutable();
drop function public.tenant_leads_retain_on_detach();
drop function public.purge_expired_tenant_leads(integer);
drop function public.workspace_provider_mark_converted();
drop function public.resolve_tenant_owner_recipient(text);
drop function public.strelva_agency_workspace_immutable();
drop function public.list_provided_clients(uuid,text,uuid);
drop function public.tenant_leads_retain_on_tenant_delete();
drop function public.operator_owner_invitation_tenants(uuid);
drop function public.operator_owner_invitation_assert(text,uuid);
drop function public.revoke_operator_owner_invitation(text,uuid);
drop function public.designate_strelva_agency_workspace(text,uuid);
drop function public.read_operator_owner_invitation_state(text,uuid);
drop function public.create_operator_owner_invitation(text,uuid,text,text,timestamp with time zone);
drop table public."strelva_agency_workspace", public."tenant_lead_purges", public."workspace_providers";
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
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_token_hash text, p_actor_id uuid, p_verified_email text)
 RETURNS TABLE(invitation_id uuid, workspace_id uuid, workspace_name text, invited_role text, applied_role text, invitation_status text, already_accepted boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  invitation public.workspace_invitations%rowtype;
  workspace_row public.workspaces%rowtype;
  normalized_email text := lower(btrim(coalesce(p_verified_email,'')));
  existing_role text;
  final_role text;
begin
  perform 1 from public.users where id=p_actor_id and lower(email)=normalized_email
    and verified_at is not null for share;
  if not found then raise exception 'workspace_invitation_identity_required'; end if;
  select * into invitation from public.workspace_invitations where token_hash=p_token_hash for update;
  if not found then raise exception 'workspace_invitation_not_found'; end if;
  if invitation.recipient_email<>normalized_email then raise exception 'workspace_invitation_recipient_mismatch'; end if;
  select * into workspace_row from public.workspaces where id=invitation.workspace_id for share;
  if not found or workspace_row.kind not in ('agency','customer') then raise exception 'workspace_invitation_workspace_invalid'; end if;

  -- A pending link is authority offered by its sponsor, not a durable grant.
  -- Recheck and lock that authority immediately before the first membership
  -- write so a removed, demoted, or unverified sponsor cannot grant access.
  perform 1
    from public.workspace_memberships sponsor_membership
    join public.users sponsor on sponsor.id=invitation.created_by
    where sponsor_membership.workspace_id=invitation.workspace_id
      and sponsor_membership.user_id=invitation.created_by
      and sponsor_membership.role='owner'
      and sponsor.verified_at is not null
    for share of sponsor_membership,sponsor;
  if not found and invitation.status='pending' and invitation.expires_at>clock_timestamp() then
    raise exception 'workspace_invitation_sponsor_invalid';
  end if;

  select membership.role into existing_role from public.workspace_memberships membership
    where membership.workspace_id=invitation.workspace_id and membership.user_id=p_actor_id for update;
  final_role := coalesce(existing_role,invitation.role);
  if existing_role is not null and
    (case existing_role when 'owner' then 3 when 'admin' then 2 else 1 end)
      < (case invitation.role when 'owner' then 3 when 'admin' then 2 else 1 end) then
    final_role := invitation.role;
  end if;

  if invitation.status='accepted' then
    if invitation.accepted_by<>p_actor_id then raise exception 'workspace_invitation_recipient_mismatch'; end if;
    if existing_role is null then raise exception 'workspace_invitation_access_removed'; end if;
    return query select invitation.id,invitation.workspace_id,workspace_row.name,
      invitation.role,existing_role,'accepted'::text,true;
    return;
  end if;
  if invitation.status='revoked' then
    return query select invitation.id,invitation.workspace_id,workspace_row.name,
      invitation.role,final_role,'revoked'::text,false;
    return;
  end if;
  if invitation.status='expired' or invitation.expires_at<=clock_timestamp() then
    if invitation.status='pending' then
      update public.workspace_invitations set status='expired' where id=invitation.id;
    end if;
    return query select invitation.id,invitation.workspace_id,workspace_row.name,
      invitation.role,final_role,'expired'::text,false;
    return;
  end if;

  insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
    values(invitation.workspace_id,p_actor_id,final_role,invitation.created_by)
    on conflict on constraint workspace_memberships_pkey do update set role=
      case
        when (case public.workspace_memberships.role when 'owner' then 3 when 'admin' then 2 else 1 end)
          >= (case excluded.role when 'owner' then 3 when 'admin' then 2 else 1 end)
          then public.workspace_memberships.role
        else excluded.role
      end
    returning role into final_role;
  update public.workspace_invitations set status='accepted',accepted_by=p_actor_id,
    accepted_at=clock_timestamp() where id=invitation.id;
  return query select invitation.id,invitation.workspace_id,workspace_row.name,
    invitation.role,final_role,'accepted'::text,false;
end;
$function$
;
revoke all on function public.accept_workspace_invitation(text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.accept_workspace_invitation(text,uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.read_tenant_leads(p_tenant_id text, p_limit integer, p_before timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stable uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  if p_tenant_id is not null then
    select stable_id into v_stable from public.tenants where id = p_tenant_id;
    if v_stable is null then return '[]'::jsonb; end if;
  end if;
  return coalesce((
    select jsonb_agg(item order by item->>'capturedAt' desc, item->>'id' desc)
    from (
      select jsonb_build_object(
        'id', l.id,
        'tenantId', t.id,
        'tenantStableId', l.tenant_stable_id,
        'siteName', t.site_name,
        'tenantSlugAtCapture', l.tenant_slug_at_capture,
        'workspaceId', l.workspace_id,
        'leadId', l.lead_id,
        'name', l.name,
        'email', l.email,
        'message', l.message,
        'source', l.source,
        'fields', l.fields,
        'capabilityId', l.capability_id,
        'capabilityVersion', l.capability_version,
        'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedAt', to_char(l.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedVia', l.recorded_via
      ) as item
      from public.tenant_leads l
      join public.tenants t on t.stable_id = l.tenant_stable_id
      where (v_stable is null or l.tenant_stable_id = v_stable)
        and (p_before is null or l.captured_at < p_before)
      order by l.captured_at desc, l.id desc
      limit v_limit
    ) page
  ), '[]'::jsonb);
end;
$function$
;
revoke all on function public.read_tenant_leads(text,integer,timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.read_tenant_leads(text,integer,timestamp with time zone) to "service_role";
alter table public."tenant_leads" add constraint "tenant_leads_tenant_stable_id_fkey" FOREIGN KEY (tenant_stable_id) REFERENCES tenants(stable_id) ON DELETE CASCADE;
commit;
