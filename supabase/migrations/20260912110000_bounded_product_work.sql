-- Local release only. Private application, schedule and investigation revisions share SavedWork authority.
create function public.update_bounded_product_work(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_product_id text, p_expected_revision integer, p_payload jsonb
) returns setof public.saved_product_work
language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.saved_product_work; latest jsonb;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or p_product_id is null or p_product_id not in ('applications','scheduling','investigations') or existing.product_id is distinct from p_product_id then raise exception 'workspace_access_denied'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647 then raise exception 'bounded_payload_invalid'; end if;
  if existing.payload->>'revision' is distinct from p_expected_revision::text then raise exception 'bounded_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>2000000
    or jsonb_typeof(p_payload->'version') is distinct from 'number'
    or jsonb_typeof(p_payload->'revision') is distinct from 'number'
    or p_payload->>'version' is distinct from '1'
    or p_payload->>'revision' is distinct from (p_expected_revision+1)::text
    or jsonb_typeof(p_payload->'title') is distinct from 'string'
    or char_length(p_payload->>'title') not between 1 and 160
    or p_payload->'createdBy' is distinct from existing.payload->'createdBy'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or jsonb_typeof(existing.payload->'history') is distinct from 'array' then raise exception 'bounded_payload_invalid'; end if;
  if jsonb_array_length(p_payload->'history')<>jsonb_array_length(existing.payload->'history')+1
    or jsonb_array_length(p_payload->'history')>500
    or ((p_payload->'history')-(jsonb_array_length(p_payload->'history')-1)) is distinct from existing.payload->'history' then raise exception 'bounded_payload_invalid'; end if;
  latest := p_payload->'history'->(jsonb_array_length(p_payload->'history')-1);
  if jsonb_typeof(latest->'revision') is distinct from 'number'
    or latest->>'revision' is distinct from (p_expected_revision+1)::text
    or latest->>'actorId' is distinct from p_user_id::text
    or coalesce(latest->>'kind','')=''
    or coalesce(latest->>'at','')='' then raise exception 'bounded_payload_invalid'; end if;
  return query update public.saved_product_work set payload=p_payload,title=p_payload->>'title',updated_at=clock_timestamp() where id=p_work_id returning *;
end $$;
revoke all on function public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb) to service_role;
