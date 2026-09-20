-- Private onboarding cases use the existing saved_product_work authority.
-- The payload is an aggregate so each requirement transition and its history
-- move together under one revision check. Uploaded file bytes/provenance live
-- in a private saved_product_work document linked by work id and revision.
create function public.update_onboarding_work(
  p_work_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_expected_revision integer,
  p_payload jsonb
) returns setof public.saved_product_work
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.update_onboarding_work(uuid, uuid, uuid, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_onboarding_work(uuid, uuid, uuid, text, integer, jsonb)
  to service_role;
