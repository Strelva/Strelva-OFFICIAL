-- Editable trackers remain in the existing saved-work authority.
create function public.update_tracker_work(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_revision integer, p_payload jsonb
) returns setof public.saved_product_work
language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.saved_product_work;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  -- A delegated reader cannot mutate a tracker. Hold membership through commit.
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or existing.product_id<>'tracker' or existing.resource_kind<>'tracker' then raise exception 'workspace_access_denied'; end if;
  if (existing.payload->'tracker'->>'revision')::integer is distinct from p_expected_revision then raise exception 'tracker_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object'
    or (p_payload->'tracker'->>'revision')::integer is distinct from p_expected_revision+1
    or p_payload->'tracker'->'originalSource' is distinct from existing.payload->'tracker'->'originalSource'
    or p_payload->'tracker'->>'id' is distinct from existing.payload->'tracker'->>'id'
    then raise exception 'tracker_payload_invalid'; end if;
  return query update public.saved_product_work set payload=p_payload, updated_at=clock_timestamp()
    where id=p_work_id returning *;
end $$;
revoke all on function public.update_tracker_work(uuid,uuid,uuid,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.update_tracker_work(uuid,uuid,uuid,text,integer,jsonb) to service_role;
