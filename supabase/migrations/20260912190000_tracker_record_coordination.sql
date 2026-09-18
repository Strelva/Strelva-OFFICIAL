-- Native tracker coordination shares the tracker revision and SavedWork authority.
-- Existing cell commands retain their wire shape. New metadata never grants access.
create or replace function public.update_tracker_work(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_revision integer, p_payload jsonb
) returns setof public.saved_product_work
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.saved_product_work; target public.saved_product_work;
  next_row jsonb; prior_row jsonb; before_coord jsonb; after_coord jsonb; next_link jsonb;
  latest jsonb; empty_coord jsonb := '{"assigneeId":null,"links":[]}'::jsonb; changed_count integer := 0;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or existing.product_id<>'tracker' or existing.resource_kind<>'tracker' then raise exception 'workspace_access_denied'; end if;
  if p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 then raise exception 'tracker_payload_invalid'; end if;
  if existing.payload->'tracker'->>'revision' is distinct from p_expected_revision::text then raise exception 'tracker_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->'tracker'->>'revision' is distinct from (p_expected_revision+1)::text
    or p_payload->'tracker'->'originalSource' is distinct from existing.payload->'tracker'->'originalSource'
    or p_payload->'tracker'->>'id' is distinct from existing.payload->'tracker'->>'id'
    or jsonb_typeof(p_payload->'tracker'->'rows') is distinct from 'array'
    or jsonb_typeof(p_payload->'tracker'->'history') is distinct from 'array' then raise exception 'tracker_payload_invalid'; end if;
  latest := p_payload->'tracker'->'history'->(jsonb_array_length(p_payload->'tracker'->'history')-1);
  for next_row in select value from jsonb_array_elements(p_payload->'tracker'->'rows') loop
    select value into prior_row from jsonb_array_elements(existing.payload->'tracker'->'rows') where value->>'id'=next_row->>'id';
    before_coord := coalesce(prior_row->'coordination',empty_coord);
    after_coord := coalesce(next_row->'coordination',empty_coord);
    if before_coord is not distinct from after_coord then continue; end if;
    changed_count := changed_count+1;
    if prior_row is null or prior_row->>'state' is distinct from 'active' or next_row->>'state' is distinct from 'active'
      or jsonb_typeof(after_coord) is distinct from 'object'
      or (after_coord - array['assigneeId','links']) <> '{}'::jsonb
      or coalesce(jsonb_typeof(after_coord->'assigneeId'),'missing') not in ('string','null')
      or jsonb_typeof(after_coord->'links') is distinct from 'array'
      or latest->>'actorId' is distinct from p_user_id::text
      or latest->>'revision' is distinct from (p_expected_revision+1)::text
      or coalesce(latest->>'kind','') not in ('coordinate_records','undo_change')
      or jsonb_typeof(latest->'coordinationChanges') is distinct from 'array' then raise exception 'tracker_payload_invalid'; end if;
    if jsonb_array_length(after_coord->'links')>20
      or jsonb_array_length(p_payload->'tracker'->'history') <> jsonb_array_length(existing.payload->'tracker'->'history')+1
      or ((p_payload->'tracker'->'history') - (jsonb_array_length(p_payload->'tracker'->'history')-1)) is distinct from existing.payload->'tracker'->'history'
      or not exists(select 1 from jsonb_array_elements(latest->'coordinationChanges') receipt(value) where receipt.value->>'rowId'=next_row->>'id' and receipt.value->'before'=before_coord and receipt.value->'after'=after_coord) then raise exception 'tracker_payload_invalid'; end if;
    if after_coord->>'assigneeId' is not null and after_coord->'assigneeId' is distinct from before_coord->'assigneeId' then
      if after_coord->>'assigneeId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'tracker_payload_invalid'; end if;
      perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=(after_coord->>'assigneeId')::uuid for share;
      if not found then raise exception 'workspace_access_denied'; end if;
    end if;
    if (select count(distinct (value->>'workId',value->>'rowId')) from jsonb_array_elements(after_coord->'links')) <> jsonb_array_length(after_coord->'links') then raise exception 'tracker_payload_invalid'; end if;
    for next_link in select value from jsonb_array_elements(after_coord->'links') loop
      if exists(select 1 from jsonb_array_elements(before_coord->'links') previous(value) where previous.value=next_link) then continue; end if;
      if jsonb_typeof(next_link) is distinct from 'object'
        or (next_link - array['workId','rowId','linkedRevision']) <> '{}'::jsonb
        or coalesce(next_link->>'workId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or char_length(coalesce(next_link->>'rowId','')) not between 1 and 200
        or jsonb_typeof(next_link->'linkedRevision') is distinct from 'number'
        or coalesce(next_link->>'linkedRevision','') !~ '^[0-9]+$'
        or (next_link->>'workId'=p_work_id::text and next_link->>'rowId'=next_row->>'id') then raise exception 'tracker_payload_invalid'; end if;
      select * into target from public.saved_product_work where id=(next_link->>'workId')::uuid and workspace_id=p_workspace_id and product_id='tracker' and resource_kind='tracker' for share;
      if not found then raise exception 'workspace_access_denied'; end if;
      if target.payload->'tracker'->>'revision' is distinct from next_link->>'linkedRevision'
        or not exists(select 1 from jsonb_array_elements(target.payload->'tracker'->'rows') row(value) where row.value->>'id'=next_link->>'rowId' and row.value->>'state'='active') then raise exception 'tracker_revision_conflict'; end if;
    end loop;
  end loop;
  if changed_count>0 and (select count(distinct value->>'rowId') from jsonb_array_elements(latest->'coordinationChanges')) <> changed_count then raise exception 'tracker_payload_invalid'; end if;
  return query update public.saved_product_work set payload=p_payload,updated_at=clock_timestamp() where id=p_work_id returning *;
end $$;
revoke all on function public.update_tracker_work(uuid,uuid,uuid,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.update_tracker_work(uuid,uuid,uuid,text,integer,jsonb) to service_role;
