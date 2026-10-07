-- Rollback for 20261009153000_platform_service_actor.sql
-- Forward SHA-256: ad5a0709f58cac8151d163ba99ab490d9ec7a7b318fb73825cb6401d5159d757
-- Batch 7A: reverse file order (20261009154000 first); undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.platform_service_effect(text)')))) is distinct from 'a131abe1de0da0024e6123326a1d60f1' then raise exception 'rollback_wrong_order_or_function_drift: platform_service_effect'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.platform_serving_provider(uuid,text)')))) is distinct from 'c08b7c6b1146749a7a20a9c4d052f415' then raise exception 'rollback_wrong_order_or_function_drift: platform_serving_provider'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.platform_serves_business(uuid,text)')))) is distinct from '34c294dc103d0ce02399d2caa11e0c69' then raise exception 'rollback_wrong_order_or_function_drift: platform_serves_business'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.platform_service_identity(uuid,uuid)')))) is distinct from '3eeca1b9e1d8c6a2447be03c88b94b06' then raise exception 'rollback_wrong_order_or_function_drift: platform_service_identity'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_runs_business(uuid)')))) is distinct from '99d1cd37525be4ab8dc73b230ce4c338' then raise exception 'rollback_wrong_order_or_function_drift: strelva_runs_business'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_service_reader(uuid,text)')))) is distinct from '6d0e6e23f33a73f0035a0c965fbd2737' then raise exception 'rollback_wrong_order_or_function_drift: strelva_service_reader'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.strelva_make_real_link_session(uuid,uuid,text)')))) is distinct from 'bfd8259a1f62fbac27dc16bd1a03b1cb' then raise exception 'rollback_wrong_order_or_function_drift: strelva_make_real_link_session'; end if;
  if to_regprocedure('public.business_payer_party(uuid)') is not null then raise exception 'rollback_wrong_order: a later 7A file is still applied'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.strelva_service_actions') and attnum>0 and not attisdropped) <> 12 then raise exception 'rollback_wrong_order_or_table_drift: strelva_service_actions'; end if;
end;
$rollback_guard$;
lock table public."strelva_service_actions" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009153000_strelva_service_actions" as select id, provider_workspace_id from public."strelva_service_actions" where provider_workspace_id is not null;
revoke all on release_rollback_archive."m20261009153000_strelva_service_actions" from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.strelva_runs_business(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.kind = 'customer')
    and (exists (select 1 from public.tenant_workspace_links l where l.workspace_id = p_workspace_id)
      or exists (select 1 from public.workspace_providers p
        join public.strelva_agency_workspace a on a.workspace_id = p.provider_workspace_id
        where p.customer_workspace_id = p_workspace_id and p.status = 'active'))
$function$
;
revoke all on function public.strelva_runs_business(uuid) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.strelva_service_reader(p_workspace_id uuid, p_purpose text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  reader record;
  session_id uuid;
begin
  if p_workspace_id is null or p_purpose is null or p_purpose not in ('needs_you_sync', 'make_real_resume') then
    raise exception 'strelva_service_invalid';
  end if;
  if not public.strelva_runs_business(p_workspace_id) then return null; end if;
  select u.id as user_id, lower(u.email) as email, wm.role into reader
    from public.workspace_memberships wm
    join public.users u on u.id = wm.user_id and u.verified_at is not null
    where wm.workspace_id = p_workspace_id and wm.role in ('owner', 'admin')
    order by case wm.role when 'owner' then 0 else 1 end, wm.created_at, wm.user_id
    limit 1;
  if not found then return null; end if;
  insert into public.strelva_service_actions(workspace_id, purpose, action, on_behalf_user_id, on_behalf_role)
    values (p_workspace_id, p_purpose, 'session', reader.user_id, reader.role)
    returning id into session_id;
  return jsonb_build_object('sessionId', session_id, 'workspaceId', p_workspace_id, 'purpose', p_purpose,
    'label', 'Strelva (system)', 'role', reader.role, 'userId', reader.user_id, 'verifiedEmail', reader.email);
end;
$function$
;
revoke all on function public.strelva_service_reader(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.strelva_service_reader(uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.strelva_make_real_link_session(p_workspace_id uuid, p_decision_id uuid, p_recipient text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  item public.owner_decisions%rowtype;
  owner_recipient jsonb;
  reader record;
  session_id uuid;
begin
  if p_workspace_id is null or p_decision_id is null or p_recipient is null or btrim(p_recipient) = '' then
    raise exception 'strelva_service_invalid';
  end if;
  select * into item from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id;
  if not found or item.source_lifecycle <> 'make_real' or item.route <> 'owner_decides'
    or item.sign_in_required or item.state <> 'open' then
    raise exception 'strelva_service_access_denied';
  end if;
  owner_recipient := public.resolve_business_owner_recipient(p_workspace_id);
  if owner_recipient is null or lower(btrim(owner_recipient->>'email')) <> lower(btrim(p_recipient)) then
    raise exception 'owner_decision_recipient_not_owner';
  end if;
  -- An owner with an account decides as themselves (needs_you_owner_actor).
  if public.needs_you_owner_actor(p_workspace_id, p_recipient) is not null then
    raise exception 'strelva_service_owner_has_account';
  end if;
  if not public.strelva_runs_business(p_workspace_id) then return null; end if;
  select u.id as user_id, lower(u.email) as email, wm.role into reader
    from public.workspace_memberships wm
    join public.users u on u.id = wm.user_id and u.verified_at is not null
    where wm.workspace_id = p_workspace_id and wm.role in ('owner', 'admin')
    order by case wm.role when 'owner' then 0 else 1 end, wm.created_at, wm.user_id
    limit 1;
  if not found then return null; end if;
  insert into public.strelva_service_actions(workspace_id, purpose, action, on_behalf_user_id, on_behalf_role, subject, detail)
    values (p_workspace_id, 'make_real_link', 'session', reader.user_id, reader.role, 'owner_decision:' || item.id::text,
      'Signed owner link for a Make real plan; the owner has no account.')
    returning id into session_id;
  return jsonb_build_object('sessionId', session_id, 'workspaceId', p_workspace_id, 'purpose', 'make_real_link',
    'label', 'Strelva (system)', 'role', reader.role, 'userId', reader.user_id, 'verifiedEmail', reader.email,
    'decisionId', item.id);
end;
$function$
;
revoke all on function public.strelva_make_real_link_session(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.strelva_make_real_link_session(uuid,uuid,text) to "service_role";
drop function public.platform_service_identity(uuid,uuid);
drop function public.platform_serves_business(uuid,text);
drop function public.platform_serving_provider(uuid,text);
drop function public.platform_service_effect(text);
alter table public."strelva_service_actions" drop column "provider_workspace_id";
commit;
