-- Rollback for 20261007190100_onboarding_revisions.sql
-- Forward SHA-256: 87e87f78b94d38aa7621cf97a2142f6dace139288ccf483c5a1d72ce7105df93
-- Batch 4: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.onboarding_revision_append_only()')))) is distinct from '299baefbe449de97a55e400e6cd1d3bf' then raise exception 'rollback_wrong_order_or_function_drift: onboarding_revision_append_only'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.update_onboarding_work(uuid,uuid,uuid,text,integer,jsonb)')))) is distinct from '8302c0d20bcf3ea4f25cc716c7c53e68' then raise exception 'rollback_wrong_order_or_function_drift: update_onboarding_work'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.onboarding_revisions') and attnum>0 and not attisdropped) <> 5 then raise exception 'rollback_wrong_order_or_table_drift: onboarding_revisions'; end if;
end;
$rollback_guard$;
lock table public."onboarding_revisions" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007190100_onboarding_revisions" as table public."onboarding_revisions";
revoke all on release_rollback_archive."m20261007190100_onboarding_revisions" from public, anon, authenticated, service_role;
drop trigger "onboarding_revision_append_only_trg" on public."onboarding_revisions";
alter table public."onboarding_revisions" drop constraint "onboarding_revisions_check";
alter table public."onboarding_revisions" drop constraint "onboarding_revisions_entry_check";
alter table public."onboarding_revisions" drop constraint "onboarding_revisions_revision_check";
drop function public.onboarding_revision_append_only();
drop table public."onboarding_revisions";
CREATE OR REPLACE FUNCTION public.update_onboarding_work(p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_expected_revision integer, p_payload jsonb)
 RETURNS SETOF saved_product_work
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  existing public.saved_product_work;
  existing_revision integer;
  latest jsonb;
  history_count integer;
begin
  if not exists (
    select 1
    from public.users
    where id = p_user_id
      and lower(email) = lower(btrim(p_verified_email))
      and verified_at is not null
  ) then
    raise exception 'workspace_access_denied';
  end if;

  perform 1
  from public.workspace_memberships
  where workspace_id = p_workspace_id and user_id = p_user_id
  for share;
  if not found then raise exception 'workspace_access_denied'; end if;

  select * into existing
  from public.saved_product_work
  where id = p_work_id and workspace_id = p_workspace_id
  for update;
  if not found or existing.product_id is distinct from 'onboarding'
    or existing.resource_kind is distinct from 'case' then
    raise exception 'workspace_access_denied';
  end if;

  if p_expected_revision is null or p_expected_revision < 1
    or p_expected_revision >= 2147483647 then
    raise exception 'onboarding_payload_invalid';
  end if;
  if existing.payload is null
    or jsonb_typeof(existing.payload) is distinct from 'object'
    or jsonb_typeof(existing.payload->'revision') is distinct from 'number'
    or existing.payload->>'revision' is null
    or existing.payload->>'revision' !~ '^[0-9]+$'
    or jsonb_typeof(existing.payload->'history') is distinct from 'array' then
    raise exception 'onboarding_payload_invalid';
  end if;
  begin
    existing_revision := (existing.payload->>'revision')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'onboarding_payload_invalid';
  end;
  if existing_revision is distinct from p_expected_revision then
    raise exception 'onboarding_revision_conflict';
  end if;

  if p_payload is null
    or jsonb_typeof(p_payload) is distinct from 'object'
    or jsonb_typeof(p_payload->'version') is distinct from 'number'
    or jsonb_typeof(p_payload->'revision') is distinct from 'number'
    or p_payload->>'version' is distinct from '1'
    or p_payload->>'revision' is null
    or p_payload->>'revision' !~ '^[0-9]+$'
    or p_payload->>'title' is null
    or char_length(p_payload->>'title') not between 1 and 160
    or jsonb_typeof(p_payload->'createdBy') is distinct from 'string'
    or jsonb_typeof(p_payload->'createdAt') is distinct from 'string'
    or p_payload->'createdBy' is distinct from existing.payload->'createdBy'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or jsonb_typeof(p_payload->'status') is distinct from 'string'
    or p_payload->>'status' not in ('in_progress', 'complete')
    or coalesce(jsonb_typeof(p_payload->'assignee'), 'missing') not in ('object', 'null')
    or jsonb_typeof(p_payload->'requirements') is distinct from 'array'
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or octet_length(p_payload::text) > 2_000_000 then
    raise exception 'onboarding_payload_invalid';
  end if;

  if (p_payload->>'revision')::integer is distinct from p_expected_revision + 1 then
    raise exception 'onboarding_payload_invalid';
  end if;
  history_count := jsonb_array_length(p_payload->'history');
  if history_count is distinct from jsonb_array_length(existing.payload->'history') + 1
    or history_count > 500
    or ((p_payload->'history') - (history_count - 1)) is distinct from existing.payload->'history' then
    raise exception 'onboarding_payload_invalid';
  end if;
  latest := p_payload->'history'->(history_count - 1);
  if jsonb_typeof(latest) is distinct from 'object'
    or jsonb_typeof(latest->'revision') is distinct from 'number'
    or latest->>'revision' is distinct from (p_expected_revision + 1)::text
    or latest->>'actorId' is distinct from p_user_id::text
    or latest->>'at' is null
    or latest->>'kind' not in ('assigned', 'supplied', 'reviewed', 'correction_requested', 'accepted')
    or coalesce(jsonb_typeof(latest->'requirementId'), 'missing') not in ('string', 'null') then
    raise exception 'onboarding_payload_invalid';
  end if;

  return query
  update public.saved_product_work
  set payload = p_payload,
      title = p_payload->>'title',
      updated_at = clock_timestamp()
  where id = p_work_id
  returning *;
end
$function$
;
revoke all on function public.update_onboarding_work(uuid,uuid,uuid,text,integer,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.update_onboarding_work(uuid,uuid,uuid,text,integer,jsonb) to "service_role";
commit;
