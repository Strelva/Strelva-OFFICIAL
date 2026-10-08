-- Rollback for 20261013220000_provider_seat_tenant_conversion.sql
-- Prepared SQL only. Refuses after any providerRoute receipt was written.
-- No data or tables are dropped; route receipts remain available for a later
-- forward migration if rollback is needed before conversion use.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_workspace_link_guard()')))) is distinct from '5b2ea76fcbcbf8c59aac51ea6fc3961a' then raise exception 'rollback_wrong_order_or_function_drift: tenant_workspace_link_guard'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_conversion_provider_route(uuid,uuid,jsonb,uuid,text,boolean,boolean)')))) is distinct from '8fb9069bc5c83af18eb4338660c5c007' then raise exception 'rollback_wrong_order_or_function_drift: tenant_conversion_provider_route'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.repath_converted_tenant_provider(text,text,uuid,jsonb,text,boolean)')))) is distinct from '689d354f5d9d0bf7c2d0792d68c480a5' then raise exception 'rollback_wrong_order_or_function_drift: repath_converted_tenant_provider'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.tenant_unlink_plan(uuid)')))) is distinct from '0a95476f8313c86cad6f8305c56b903f' then raise exception 'rollback_wrong_order_or_function_drift: tenant_unlink_plan'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.preview_tenant_unlink(text,text)')))) is distinct from 'a9dacd815b2a4dbbf36664d0a20704ff' then raise exception 'rollback_wrong_order_or_function_drift: preview_tenant_unlink'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.unlink_tenant_from_business(text,text,uuid,uuid,text)')))) is distinct from '666878a78dba0bb3fe9d641f3328c35a' then raise exception 'rollback_wrong_order_or_function_drift: unlink_tenant_from_business'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.convert_tenant_to_business(text,text,jsonb,uuid,text)')))) is distinct from '1ddf5fc2bbe22af14229c5abb6c47c95' then raise exception 'rollback_wrong_order_or_function_drift: convert_tenant_to_business'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.operator_owner_invitation_assert(text,uuid)')))) is distinct from 'eaf3a761dfabbd6724788aa7a8ce6d93' then raise exception 'rollback_wrong_order_or_function_drift: operator_owner_invitation_assert'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.accept_workspace_invitation(text,uuid,text)')))) is distinct from '4e71b763103260e38f5c5ece4f8fc05b' then raise exception 'rollback_wrong_order_or_function_drift: accept_workspace_invitation'; end if;
  if exists (select 1 from public.tenant_workspace_links where receipt ? 'providerRoute') then
    raise exception 'provider_seat_tenant_conversion_rollback_has_route_data';
  end if;
end;
$rollback_guard$;
create or replace function public.operator_owner_invitation_assert(p_operator_email text, p_workspace_id uuid)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid;
begin
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  if p_workspace_id is null then raise exception 'operator_owner_invitation_operator_required'; end if;
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'customer'
    where m.workspace_id = p_workspace_id and m.user_id = operator_id and m.role = 'admin'
    for share of m;
  if not found then raise exception 'operator_owner_invitation_operator_required'; end if;
  if not exists (select 1 from public.tenant_workspace_links where workspace_id = p_workspace_id) then
    raise exception 'operator_owner_invitation_not_converted';
  end if;
  return operator_id;
end;
$$;
create or replace function public.accept_workspace_invitation(
  p_token_hash text,
  p_actor_id uuid,
  p_verified_email text
) returns table(
  invitation_id uuid,
  workspace_id uuid,
  workspace_name text,
  invited_role text,
  applied_role text,
  invitation_status text,
  already_accepted boolean
) language plpgsql security definer set search_path=public as $$
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
  if invitation.issued_by_kind='operator' then
    perform 1
      from public.workspace_memberships sponsor_membership
      join public.users sponsor on sponsor.id=invitation.created_by
      join public.super_admins sa on sa.user_id=sponsor.id and sa.revoked_at is null
      where sponsor_membership.workspace_id=invitation.workspace_id
        and sponsor_membership.user_id=invitation.created_by
        and sponsor_membership.role='admin'
        and sponsor.verified_at is not null
      for share of sponsor_membership,sponsor;
  else
    perform 1
      from public.workspace_memberships sponsor_membership
      join public.users sponsor on sponsor.id=invitation.created_by
      where sponsor_membership.workspace_id=invitation.workspace_id
        and sponsor_membership.user_id=invitation.created_by
        and (sponsor_membership.role='owner' or (sponsor_membership.role='admin'
          and workspace_row.kind='agency' and invitation.role in ('admin','member')))
        and sponsor.verified_at is not null
      for share of sponsor_membership,sponsor;
  end if;
  if not found and invitation.status='pending' and invitation.expires_at>clock_timestamp() then
    raise exception 'workspace_invitation_sponsor_invalid';
  end if;
  if invitation.issued_by_kind='operator' and invitation.status='pending' and invitation.expires_at>clock_timestamp()
    and exists(select 1 from public.workspace_memberships other
      where other.workspace_id=invitation.workspace_id and other.role='owner' and other.user_id<>p_actor_id) then
    raise exception 'operator_owner_invitation_owner_exists';
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
  if final_role='owner' and workspace_row.kind='customer' then
    insert into public.memberships(user_id,tenant_id,role,tenant_stable_id)
      select p_actor_id,t.id,'owner',t.stable_id
        from public.tenant_workspace_links l
        join public.tenants t on t.stable_id=l.tenant_stable_id
        where l.workspace_id=invitation.workspace_id
        order by l.linked_at,l.id
      on conflict (user_id,tenant_id) do update set role='owner';
  end if;
  update public.workspace_invitations set status='accepted',accepted_by=p_actor_id,
    accepted_at=clock_timestamp() where id=invitation.id;
  return query select invitation.id,invitation.workspace_id,workspace_row.name,
    invitation.role,final_role,'accepted'::text,false;
end;
$$;
create or replace function public.tenant_workspace_link_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Only the tenant FK's own `on delete set null` may touch a link.
  if tg_op = 'UPDATE' and new.tenant_stable_id is null and old.tenant_stable_id is not null
    and (to_jsonb(new) - 'tenant_stable_id') = (to_jsonb(old) - 'tenant_stable_id') then
    return new;
  end if;
  -- unlink_tenant_from_business removes exactly the link it names, in the
  -- same transaction that records the unlink receipt.
  if tg_op = 'DELETE' and current_setting('strelva.tenant_unlink_link', true) = old.id::text then
    return old;
  end if;
  raise exception 'tenant_workspace_link_immutable';
end;
$$;
create or replace function public.tenant_unlink_plan(p_link_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare plan jsonb; v_workspace uuid; reasons jsonb;
begin
  plan := public.tenant_unlink_plan_before_systems(p_link_id);
  v_workspace := (plan->>'workspaceId')::uuid;
  if v_workspace is null or not (plan->'workspaceKeptBecause' ? 'workspace_in_use:systems') then return plan; end if;
  if exists (select 1 from public.systems s where s.business_workspace_id = v_workspace
      and (s.command_digest <> encode(sha256(convert_to('adopt:' || s.id::text, 'UTF8')), 'hex')
        or exists (select 1 from public.system_revisions r where r.system_id = s.id and r.number > 1))) then
    return plan;
  end if;
  reasons := coalesce((select jsonb_agg(r) from jsonb_array_elements(plan->'workspaceKeptBecause') r
    where r <> to_jsonb('workspace_in_use:systems'::text)), '[]'::jsonb);
  return plan || jsonb_build_object('workspaceKeptBecause', reasons, 'deleteWorkspace', jsonb_array_length(reasons) = 0);
end;
$$;
create or replace function public.preview_tenant_unlink(p_operator_email text, p_tenant_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid; tenant_row record; link public.tenant_workspace_links%rowtype; last_unlink jsonb;
begin
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id into tenant_row from public.tenants t where t.id = p_tenant_id;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  select u.receipt into last_unlink from public.tenant_workspace_unlinks u
    where u.tenant_stable_id = tenant_row.stable_id order by u.unlinked_at desc, u.id desc limit 1;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if not found then
    return jsonb_build_object('tenantId', tenant_row.id, 'tenantStableId', tenant_row.stable_id, 'plan', null, 'lastUnlink', last_unlink);
  end if;
  if not exists (select 1 from public.workspace_memberships where workspace_id = link.workspace_id
      and user_id = operator_id and role in ('owner','admin')) then
    raise exception 'tenant_unlink_access_denied';
  end if;
  return jsonb_build_object('tenantId', tenant_row.id, 'tenantStableId', tenant_row.stable_id,
    'plan', public.tenant_unlink_plan(link.id) - 'actions', 'lastUnlink', last_unlink);
end;
$$;
create or replace function public.unlink_tenant_from_business(
  p_operator_email text, p_tenant_id text, p_workspace_id uuid, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  tenant_row record;
  link public.tenant_workspace_links%rowtype;
  prior public.tenant_workspace_unlinks%rowtype;
  rec public.business_records%rowtype;
  plan jsonb;
  item jsonb;
  before_state jsonb;
  after_state jsonb;
  changes jsonb := '[]'::jsonb;
  leads bigint := 0;
  deleted boolean;
  profile_changed boolean;
  new_sequence bigint;
  new_revision bigint;
  receipt jsonb;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' or p_workspace_id is null then
    raise exception 'tenant_unlink_invalid';
  end if;
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id into tenant_row from public.tenants t where t.id = p_tenant_id for share;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tenant-conversion:' || tenant_row.stable_id::text, 0));

  select * into prior from public.tenant_workspace_unlinks where command_id = p_command_id;
  if found then
    if prior.command_digest <> p_command_digest or prior.tenant_stable_id <> tenant_row.stable_id then
      raise exception 'tenant_unlink_idempotency_conflict';
    end if;
    return prior.receipt || jsonb_build_object('replayed', true, 'alreadyUnlinked', true);
  end if;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if not found then
    select * into prior from public.tenant_workspace_unlinks
      where tenant_stable_id = tenant_row.stable_id and workspace_id = p_workspace_id
      order by unlinked_at desc, id desc limit 1;
    if found then return prior.receipt || jsonb_build_object('replayed', true, 'alreadyUnlinked', true); end if;
    raise exception 'tenant_unlink_not_linked';
  end if;
  if link.workspace_id <> p_workspace_id then raise exception 'tenant_unlink_workspace_mismatch'; end if;

  perform pg_advisory_xact_lock(hashtextextended(link.workspace_id::text, 7415));
  perform 1 from public.workspaces where id = link.workspace_id for update;
  if not exists (select 1 from public.workspace_memberships where workspace_id = link.workspace_id
      and user_id = operator_id and role in ('owner','admin')) then
    raise exception 'tenant_unlink_access_denied';
  end if;
  select * into link from public.tenant_workspace_links where id = link.id for update;

  plan := public.tenant_unlink_plan(link.id);
  deleted := (plan->>'deleteWorkspace')::boolean;
  begin
    for item in select value from jsonb_array_elements(plan->'actions') loop
      before_state := public.business_record_entity_state(link.workspace_id, item->>'entity', item->>'id');
      after_state := nullif(item->'restoreTo', 'null'::jsonb);
      perform public.business_record_entity_write(link.workspace_id, item->>'entity', item->>'id', after_state, operator_id);
      after_state := public.business_record_entity_state(link.workspace_id, item->>'entity', item->>'id');
      changes := changes || jsonb_build_array(jsonb_build_object('entity', item->>'entity', 'id', item->>'id',
        'before', coalesce(before_state, 'null'::jsonb), 'after', coalesce(after_state, 'null'::jsonb)));
    end loop;
  exception when unique_violation or check_violation or foreign_key_violation then
    raise exception 'tenant_unlink_conflict';
  end;

  if link.tenant_stable_id is not null and to_regclass('public.tenant_leads') is not null then
    execute 'update public.tenant_leads set workspace_id = null where tenant_stable_id = $1 and workspace_id = $2'
      using link.tenant_stable_id, link.workspace_id;
    get diagnostics leads = row_count;
  end if;

  perform set_config('strelva.tenant_unlink_link', link.id::text, true);
  delete from public.tenant_workspace_links where id = link.id;
  perform set_config('strelva.tenant_unlink_link', '', true);

  if deleted then
    delete from public.workspaces where id = link.workspace_id;
  elsif jsonb_array_length(changes) > 0 then
    -- The kept business records the unlink as one history row.
    select * into rec from public.business_records where workspace_id = link.workspace_id for update;
    profile_changed := exists (select 1 from jsonb_array_elements(changes) c where c->>'entity' in ('fact','service','person'));
    new_sequence := rec.last_sequence + 1;
    new_revision := rec.revision + case when profile_changed then 1 else 0 end;
    insert into public.business_record_revisions(workspace_id, sequence, record_revision, actor_id, actor_kind, source,
        command_id, command_digest, undo_of_sequence, changes, result)
      values (link.workspace_id, new_sequence, new_revision, operator_id, 'operator', 'tenant_import',
        p_command_id, p_command_digest, null, changes,
        jsonb_build_object('workspaceId', link.workspace_id, 'sequence', new_sequence, 'revision', new_revision,
          'changeCount', jsonb_array_length(changes), 'undoOf', null,
          'contacts', jsonb_build_object('created', 0, 'merged', 0, 'unchanged', 0), 'replayed', false,
          'unlinkOf', jsonb_build_object('linkId', link.id, 'importSequence', (plan->>'importSequence')::bigint)));
    update public.business_records set revision = new_revision, last_sequence = new_sequence,
      updated_by = operator_id, updated_at = clock_timestamp() where workspace_id = link.workspace_id;
  end if;

  receipt := jsonb_build_object(
    'kind', 'tenant_unlink',
    'version', 1,
    'tenantId', tenant_row.id,
    'tenantStableId', tenant_row.stable_id,
    'workspaceId', link.workspace_id,
    'workspaceName', plan->'workspaceName',
    'linkId', link.id,
    'linkedAt', link.linked_at,
    'importSequence', plan->'importSequence',
    'operatorId', operator_id,
    'workspaceDeleted', deleted,
    'workspaceKeptBecause', plan->'workspaceKeptBecause',
    'entities', plan->'entities',
    'kept', plan->'kept',
    'leadsDetached', leads,
    'systemsAdoptedFromTenant', plan->'systemsAdoptedFromTenant',
    'sequence', new_sequence,
    'revision', new_revision,
    'conversionReceipt', link.receipt,
    'unlinkedAt', clock_timestamp(),
    'replayed', false,
    'alreadyUnlinked', false);
  insert into public.tenant_workspace_unlinks(link_id, tenant_stable_id, tenant_slug_at_unlink, workspace_id, link_command_id,
      unlinked_by, command_id, command_digest, receipt)
    values (link.id, tenant_row.stable_id, tenant_row.id, link.workspace_id, link.command_id,
      operator_id, p_command_id, p_command_digest, receipt);
  return receipt;
end;
$$;
create or replace function public.convert_tenant_to_business(
  p_operator_email text, p_tenant_id text, p_import jsonb, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  tenant_row record;
  link public.tenant_workspace_links%rowtype;
  business_id uuid;
  joined boolean := false;
  patch jsonb;
  applied jsonb;
  receipt jsonb;
  workspace_name text;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
    or p_import is null or jsonb_typeof(p_import) <> 'object'
    or (p_import - array['tenantId','tenantStableId','workspaceName','targetWorkspaceId','separateBusiness','billing','account','patch','contacts']::text[]) <> '{}'::jsonb
    -- separateBusiness is present only as true, and never with a join target.
    or (p_import ? 'separateBusiness' and (p_import->'separateBusiness' <> 'true'::jsonb or p_import ? 'targetWorkspaceId'))
    or (p_import ? 'billing' and jsonb_typeof(p_import->'billing') not in ('object','null'))
    or (p_import ? 'account' and jsonb_typeof(p_import->'account') not in ('object','null'))
    or octet_length(coalesce(p_import->'billing', 'null')::text) + octet_length(coalesce(p_import->'account', 'null')::text) > 16000 then
    raise exception 'tenant_conversion_invalid';
  end if;
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id, t.site_name, t.active into tenant_row from public.tenants t where t.id = p_tenant_id for share;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  if p_import->>'tenantId' is distinct from tenant_row.id
    or p_import->>'tenantStableId' is distinct from tenant_row.stable_id::text then
    raise exception 'tenant_conversion_identity_mismatch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tenant-conversion:' || tenant_row.stable_id::text, 0));

  select * into link from public.tenant_workspace_links where command_id = p_command_id;
  if found then
    if link.command_digest <> p_command_digest then raise exception 'tenant_conversion_idempotency_conflict'; end if;
    return link.receipt || jsonb_build_object('replayed', true, 'alreadyConverted', true);
  end if;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if found then
    return link.receipt || jsonb_build_object('replayed', true, 'alreadyConverted', true);
  end if;

  patch := coalesce(p_import->'patch', '{}'::jsonb);
  if jsonb_typeof(patch) <> 'object' then raise exception 'tenant_conversion_invalid'; end if;
  if p_import->>'targetWorkspaceId' is not null then
    begin business_id := (p_import->>'targetWorkspaceId')::uuid;
    exception when invalid_text_representation then raise exception 'tenant_conversion_invalid'; end;
    -- Joining requires a customer business that already holds a converted
    -- site and that this operator already operates.
    perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
    perform 1 from public.workspaces w
      join public.workspace_memberships m on m.workspace_id = w.id and m.user_id = operator_id and m.role in ('owner','admin')
      where w.id = business_id and w.kind = 'customer' for update of w;
    if not found or not exists (select 1 from public.tenant_workspace_links where workspace_id = business_id) then
      raise exception 'tenant_conversion_target_invalid';
    end if;
    if public.workspace_exit_completed(business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
    select name into workspace_name from public.workspaces where id = business_id;
    joined := true;
    patch := jsonb_strip_nulls(jsonb_build_object(
      'facts', (select jsonb_object_agg(e.key, e.value) from jsonb_each(coalesce(patch->'facts', '{}'::jsonb)) e
        where not exists (select 1 from public.business_record_facts f where f.workspace_id = business_id and f.fact_key = e.key)),
      'services', case when exists (select 1 from public.business_services where workspace_id = business_id) then null else patch->'services' end,
      'people', case when exists (select 1 from public.business_people where workspace_id = business_id) then null else patch->'people' end));
  else
    workspace_name := left(btrim(coalesce(p_import->>'workspaceName', tenant_row.site_name)), 120);
    if char_length(workspace_name) < 1 then raise exception 'tenant_conversion_invalid'; end if;
    insert into public.workspaces(kind, name, created_by) values ('customer', workspace_name, operator_id)
      returning id into business_id;
    insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
      values (business_id, operator_id, 'admin', operator_id);
    perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
  end if;

  -- Conversion idempotency lives on the link. When this site was converted
  -- into this same business before and then unlinked, the record's history
  -- already holds the command id, so the new import revision gets its own.
  applied := public.business_record_apply(business_id, operator_id, 'operator', 'tenant_import', patch,
    case when jsonb_array_length(coalesce(p_import->'contacts', '[]'::jsonb)) = 0 then null else p_import->'contacts' end,
    null,
    case when exists (select 1 from public.business_record_revisions where workspace_id = business_id and command_id = p_command_id)
      then gen_random_uuid() else p_command_id end,
    p_command_digest);

  receipt := jsonb_build_object(
    'kind', 'tenant_conversion',
    'version', 1,
    'tenantId', tenant_row.id,
    'tenantStableId', tenant_row.stable_id,
    'tenantActive', tenant_row.active,
    'workspaceId', business_id,
    'workspaceName', workspace_name,
    'joinedExistingWorkspace', joined,
    'separateBusiness', coalesce(p_import->'separateBusiness' = 'true'::jsonb, false),
    'operatorId', operator_id,
    'operatorRole', 'admin',
    'billing', coalesce(p_import->'billing', 'null'::jsonb),
    'account', coalesce(p_import->'account', 'null'::jsonb),
    'sequence', applied->'sequence',
    'revision', applied->'revision',
    'changeCount', applied->'changeCount',
    'counts', jsonb_build_object(
      'facts', (select count(*) from public.business_record_facts where workspace_id = business_id),
      'services', (select count(*) from public.business_services where workspace_id = business_id),
      'people', (select count(*) from public.business_people where workspace_id = business_id),
      'contacts', (select count(*) from public.business_contacts where workspace_id = business_id),
      'contactsCreated', applied#>'{contacts,created}',
      'contactsMerged', applied#>'{contacts,merged}',
      'contactsUnchanged', applied#>'{contacts,unchanged}'),
    'convertedAt', clock_timestamp(),
    'replayed', false,
    'alreadyConverted', false
  );
  insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by,
      command_id, command_digest, receipt)
    values (tenant_row.stable_id, tenant_row.id, business_id, operator_id, p_command_id, p_command_digest, receipt);
  return receipt;
end;
$$;
revoke all on function public.repath_converted_tenant_provider(text, text, uuid, jsonb, text, boolean) from public, anon, authenticated, service_role;
drop function public.repath_converted_tenant_provider(text, text, uuid, jsonb, text, boolean);
revoke all on function public.tenant_conversion_provider_route(uuid, uuid, jsonb, uuid, text, boolean, boolean) from public, anon, authenticated, service_role;
drop function public.tenant_conversion_provider_route(uuid, uuid, jsonb, uuid, text, boolean, boolean);
revoke all on function public.tenant_workspace_link_guard() from public, anon, authenticated;
revoke all on function public.tenant_unlink_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.preview_tenant_unlink(text, text) from public, anon, authenticated;
revoke all on function public.unlink_tenant_from_business(text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.convert_tenant_to_business(text, text, jsonb, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.preview_tenant_unlink(text, text) to service_role;
grant execute on function public.unlink_tenant_from_business(text, text, uuid, uuid, text) to service_role;
grant execute on function public.convert_tenant_to_business(text, text, jsonb, uuid, text) to service_role;
commit;
