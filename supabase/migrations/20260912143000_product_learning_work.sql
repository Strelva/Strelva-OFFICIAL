-- Internal learning remains in saved_product_work, with optimistic concurrency
-- and both membership and the existing super_admins authority held at commit.
create function public.create_product_learning_work(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_payload jsonb
) returns setof public.saved_product_work
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.super_admins where user_id=p_user_id and revoked_at is null for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspaces where id=p_workspace_id for update;
  if (select count(*) from public.saved_product_work where workspace_id=p_workspace_id)>=500 then raise exception 'learning_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'version' is distinct from '1' or p_payload->>'revision' is distinct from '0'
    or p_payload->>'createdBy' is distinct from p_user_id::text
    or p_payload->>'status' is distinct from 'active'
    or p_payload->>'spentCents' is distinct from '0'
    or p_payload->>'title' is null or char_length(p_payload->>'title') not between 1 and 160
    or jsonb_typeof(p_payload->'sources') is distinct from 'array'
    or p_payload->'history' is distinct from '[]'::jsonb
    then raise exception 'learning_payload_invalid'; end if;
  return query insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
    values(p_workspace_id,'product-learning','learning',p_payload->>'title',p_payload,p_user_id) returning *;
end $$;
revoke all on function public.create_product_learning_work(uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_product_learning_work(uuid,uuid,text,jsonb) to service_role;

create function public.update_product_learning_work(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_revision integer, p_payload jsonb
) returns setof public.saved_product_work
language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.saved_product_work; latest jsonb;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  perform 1 from public.super_admins where user_id=p_user_id and revoked_at is null for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or existing.product_id<>'product-learning' or existing.resource_kind<>'learning' then raise exception 'workspace_access_denied'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 1000 then raise exception 'learning_payload_invalid'; end if;
  if (existing.payload->>'revision')::integer is distinct from p_expected_revision then raise exception 'learning_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'version' is distinct from '1'
    or (p_payload->>'revision')::integer is distinct from p_expected_revision+1
    or p_payload->'createdBy' is distinct from existing.payload->'createdBy'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or p_payload->'sources' is distinct from existing.payload->'sources'
    or p_payload->'budgetCents' is distinct from existing.payload->'budgetCents'
    or jsonb_typeof(p_payload->'spentCents') is distinct from 'number'
    or jsonb_typeof(p_payload->'budgetCents') is distinct from 'number'
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or jsonb_array_length(p_payload->'history') is distinct from jsonb_array_length(existing.payload->'history')+1
    or ((p_payload->'history') - (jsonb_array_length(p_payload->'history')-1)) is distinct from existing.payload->'history'
    or (p_payload->>'spentCents')::integer < (existing.payload->>'spentCents')::integer
    or (p_payload->>'spentCents')::integer > (p_payload->>'budgetCents')::integer
    then raise exception 'learning_payload_invalid'; end if;
  latest := p_payload->'history'->(jsonb_array_length(p_payload->'history')-1);
  if latest->>'actorId' is distinct from p_user_id::text
    or latest->>'revision' is distinct from (p_expected_revision+1)::text
    or latest->>'at' is null or latest->>'kind' is null then raise exception 'learning_payload_invalid'; end if;
  return query update public.saved_product_work set payload=p_payload, updated_at=clock_timestamp()
    where id=p_work_id returning *;
end $$;
revoke all on function public.update_product_learning_work(uuid,uuid,uuid,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.update_product_learning_work(uuid,uuid,uuid,text,integer,jsonb) to service_role;
