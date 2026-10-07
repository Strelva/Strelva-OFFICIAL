-- Rollback for 20261009151000_provider_seats.sql
-- Forward SHA-256: 13c5b17bc9110b64b7fa69a5c7ff07c018292c38a21ad393b68c5571e75c2d10
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
  if (select md5(pg_get_functiondef(to_regprocedure('public.provider_seat_guard()')))) is distinct from '1b16ea228cc97a41b390a07f423f647b' then raise exception 'rollback_wrong_order_or_function_drift: provider_seat_guard'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_client_staff_guard()')))) is distinct from 'afb066750666d44b6fd171bb9d26899f' then raise exception 'rollback_wrong_order_or_function_drift: agency_client_staff_guard'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.provider_seat_end_staff()')))) is distinct from '03e200b66d3c380e0704d1aa3d9f480a' then raise exception 'rollback_wrong_order_or_function_drift: provider_seat_end_staff'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_provider_end_seat()')))) is distinct from 'b45af7efb32025adee473c3a5d20e616' then raise exception 'rollback_wrong_order_or_function_drift: workspace_provider_end_seat'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.provider_seat_direct_role()')))) is distinct from '76789189197faa88f4a4557207327bb0' then raise exception 'rollback_wrong_order_or_function_drift: provider_seat_direct_role'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.provider_seat_role(uuid,uuid,boolean)')))) is distinct from 'f493033e4a7955260029e8c8fdd6f55e' then raise exception 'rollback_wrong_order_or_function_drift: provider_seat_role'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.provider_seat_businesses(uuid,text)')))) is distinct from 'adf6dd59bab91bf7feac7da93c892621' then raise exception 'rollback_wrong_order_or_function_drift: provider_seat_businesses'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.provider_seat_assert_owner(uuid,uuid,text)')))) is distinct from 'f86e006b126d998ee7ca6e3be4cfc765' then raise exception 'rollback_wrong_order_or_function_drift: provider_seat_assert_owner'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.choose_business_provider(uuid,text,uuid,uuid)')))) is distinct from '773d625a3e907f3745a6fa8b8be2ef17' then raise exception 'rollback_wrong_order_or_function_drift: choose_business_provider'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.end_business_provider(uuid,text,uuid,text)')))) is distinct from '8c543f9d4b9266b8b0410bae7bad8043' then raise exception 'rollback_wrong_order_or_function_drift: end_business_provider'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.end_provider_seat(uuid,text,uuid,uuid,text)')))) is distinct from 'b90f40dbab28ee31d50ac6f6b1605403' then raise exception 'rollback_wrong_order_or_function_drift: end_provider_seat'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.set_agency_client_staff(uuid,text,uuid,uuid,uuid,boolean)')))) is distinct from '719bf76c8ebd2e0dab86b69f11b7263c' then raise exception 'rollback_wrong_order_or_function_drift: set_agency_client_staff'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_agency_provider_seats(uuid,text,uuid)')))) is distinct from 'e4ffcb882cdd13b5226e19486ef3e5c0' then raise exception 'rollback_wrong_order_or_function_drift: read_agency_provider_seats'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_record_assert_actor(uuid,uuid,text,boolean)')))) is distinct from 'f4ab36121534ef70ed118ed6ad0044ae' then raise exception 'rollback_wrong_order_or_function_drift: business_record_assert_actor'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_actor_scope(uuid,uuid,text,boolean)')))) is distinct from 'eff3a2539757874966764f2946273ab3' then raise exception 'rollback_wrong_order_or_function_drift: system_actor_scope'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_version_actor(uuid,text)')))) is distinct from 'c0a7059a059459616184915f094611a8' then raise exception 'rollback_wrong_order_or_function_drift: read_version_actor'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_version_member_role(uuid,uuid,text)')))) is distinct from '4b1b092f50751d854e8fc17ee969ad95' then raise exception 'rollback_wrong_order_or_function_drift: system_version_member_role'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.system_version_actor_workspaces(uuid,text)')))) is distinct from '5b117a0ff6cc14194200b36ce8b2f55e' then raise exception 'rollback_wrong_order_or_function_drift: system_version_actor_workspaces'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_require(uuid,uuid,text)')))) is distinct from 'f57a7b855ba3f1c4f653afa8ebc103af' then raise exception 'rollback_wrong_order_or_function_drift: workspace_require'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.list_provided_clients(uuid,text,uuid)')))) is distinct from '4e7e97d99a33a3738ca9e089b0d9ba38' then raise exception 'rollback_wrong_order_or_function_drift: list_provided_clients'; end if;
  if to_regclass('public.agency_verifications') is not null then raise exception 'rollback_wrong_order: a later 7A file is still applied'; end if;
end;
$rollback_guard$;
lock table public."workspace_providers", public."provider_seats", public."agency_client_staff" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009151000_provider_seats" as table public."provider_seats";
revoke all on release_rollback_archive."m20261009151000_provider_seats" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009151000_agency_client_staff" as table public."agency_client_staff";
revoke all on release_rollback_archive."m20261009151000_agency_client_staff" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009151000_workspace_providers" as select * from public."workspace_providers" where source = 'business_choice';
revoke all on release_rollback_archive."m20261009151000_workspace_providers" from public, anon, authenticated, service_role;
drop trigger "workspace_providers_end_seat" on public."workspace_providers";
CREATE OR REPLACE FUNCTION public.business_record_assert_actor(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor_role text;
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then
    raise exception 'business_record_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'business_record_access_denied'; end if;
  if p_write then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
    perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer' for update;
    if not found then raise exception 'business_record_access_denied'; end if;
  end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and w.kind = 'customer'
    for share of wm;
  if actor_role is null and exists (
    select 1
      from public.operational_assignments a
      join public.offering_provider_deliveries d
        on d.assignment_id = a.id and d.business_workspace_id = a.workspace_id
      join public.workspaces agency on agency.id = a.assignee_workspace_id and agency.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = agency.id and am.user_id = p_user_id
      join public.workspaces customer on customer.id = a.workspace_id and customer.kind = 'customer'
      where a.workspace_id = p_workspace_id
        and a.assignee_kind = 'agency'
        and a.assignee_user_id = p_user_id
        and a.status = 'accepted' and a.expires_at > clock_timestamp()
        and d.status = 'accepted' and d.expires_at > clock_timestamp()
  ) then
    actor_role := 'agency';
  end if;
  if actor_role is null or (p_write and actor_role not in ('owner','admin','agency')) then
    raise exception 'business_record_access_denied';
  end if;
  if p_write and public.workspace_exit_completed(p_workspace_id) then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  return actor_role;
end;
$function$
;
revoke all on function public.business_record_assert_actor(uuid,uuid,text,boolean) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.system_actor_scope(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean, OUT access text, OUT work_ids uuid[])
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_write then
    access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  elsif exists (select 1 from public.workspace_memberships wm
      join public.workspaces w on w.id = wm.workspace_id and w.kind = 'customer'
      where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id) then
    access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  else
    access := 'agency';
  end if;
  if access <> 'agency' then
    work_ids := null;
    return;
  end if;
  work_ids := public.business_record_agency_work_ids(p_workspace_id, p_user_id, p_verified_email, p_write);
  if cardinality(work_ids) = 0 then raise exception 'business_record_access_denied'; end if;
end;
$function$
;
revoke all on function public.system_actor_scope(uuid,uuid,text,boolean) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.read_version_actor(p_user_id uuid, p_verified_email text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('userId', p_user_id, 'memberships', coalesce(jsonb_agg(jsonb_build_object(
    'businessId', wm.workspace_id, 'role', wm.role) order by wm.workspace_id), '[]'::jsonb))
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id and w.kind in ('customer','agency')
  join public.users u on u.id = wm.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
  where wm.user_id = p_user_id
$function$
;
revoke all on function public.read_version_actor(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.read_version_actor(uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.system_version_member_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select wm.role from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id and w.kind in ('customer','agency')
    join public.users u on u.id = wm.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
$function$
;
revoke all on function public.system_version_member_role(uuid,uuid,text) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.system_version_actor_workspaces(p_user_id uuid, p_verified_email text)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(array_agg(wm.workspace_id), '{}') from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id and w.kind in ('customer','agency')
    join public.users u on u.id = wm.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
    where wm.user_id = p_user_id
$function$
;
revoke all on function public.system_version_actor_workspaces(uuid,text) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.workspace_require(p_workspace_id uuid, p_user_id uuid, p_permission text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  actor_role text;
begin
  if p_workspace_id is null or p_user_id is null then
    raise exception 'workspace_membership_required';
  end if;
  select wm.role into actor_role
  from public.workspace_memberships wm
  where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
  for share;
  if actor_role is null then
    -- Validate the permission name even on the deny path so a typo can never
    -- hide behind "not a member".
    perform public.workspace_role_allows('member', p_permission);
    raise exception 'workspace_membership_required';
  end if;
  if not public.workspace_role_allows(actor_role, p_permission) then
    raise exception 'workspace_permission_denied';
  end if;
  return actor_role;
end;
$function$
;
revoke all on function public.workspace_require(uuid,uuid,text) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.list_provided_clients(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_user_id is null or p_verified_email is null or p_agency_workspace_id is null then
    raise exception 'workspace_provider_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'workspace_provider_access_denied'; end if;
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where m.workspace_id = p_agency_workspace_id and m.user_id = p_user_id;
  if not found then raise exception 'workspace_provider_access_denied'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('customerWorkspaceId', p.customer_workspace_id, 'name', w.name,
        'role', m.role, 'source', p.source,
        'startedAt', to_char(p.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      order by w.name, p.customer_workspace_id)
    from public.workspace_providers p
    join public.workspaces w on w.id = p.customer_workspace_id and w.kind = 'customer'
    join public.workspace_memberships m on m.workspace_id = p.customer_workspace_id and m.user_id = p_user_id
    where p.provider_workspace_id = p_agency_workspace_id and p.status = 'active'
  ), '[]'::jsonb);
end;
$function$
;
revoke all on function public.list_provided_clients(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.list_provided_clients(uuid,text,uuid) to "service_role";
drop function public.read_agency_provider_seats(uuid,text,uuid);
drop function public.set_agency_client_staff(uuid,text,uuid,uuid,uuid,boolean);
drop function public.end_provider_seat(uuid,text,uuid,uuid,text);
drop function public.end_business_provider(uuid,text,uuid,text);
drop function public.choose_business_provider(uuid,text,uuid,uuid);
drop function public.provider_seat_assert_owner(uuid,uuid,text);
drop function public.provider_seat_businesses(uuid,text);
drop function public.provider_seat_role(uuid,uuid,boolean);
drop function public.provider_seat_direct_role();
drop table public."agency_client_staff";
drop table public."provider_seats";
drop function public.agency_client_staff_guard();
drop function public.provider_seat_end_staff();
drop function public.provider_seat_guard();
drop function public.workspace_provider_end_seat();
-- Owner-chosen provider rows did not exist before 7A; they are archived above.
alter table public."workspace_providers" disable trigger "workspace_providers_guard";
delete from public."workspace_providers" where source = 'business_choice';
alter table public."workspace_providers" enable trigger "workspace_providers_guard";
alter table public."workspace_providers" drop constraint "workspace_providers_source_check";
alter table public."workspace_providers" add constraint "workspace_providers_source_check"
  check (source in ('tenant_conversion', 'operator'));
commit;
