-- Private documents use saved_product_work; this does not publish any external surface.
create function public.update_document_work(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_revision integer, p_payload jsonb
) returns setof public.saved_product_work
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.saved_product_work;
  existing_revision integer;
  next_revision integer;
  existing_history jsonb;
  next_history jsonb;
  latest_receipt jsonb;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id for update;
  if not found or existing.product_id<>'documents' or existing.resource_kind<>'document' then raise exception 'workspace_access_denied'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647 then
    raise exception 'document_payload_invalid';
  end if;
  if existing.payload is null or jsonb_typeof(existing.payload) is distinct from 'object'
    or jsonb_typeof(existing.payload->'revision') is distinct from 'number'
    or existing.payload->>'revision' is null
    or existing.payload->>'revision' !~ '^[0-9]+$'
    or jsonb_typeof(existing.payload->'title') is distinct from 'string'
    or existing.payload->>'title' is null
    or char_length(existing.payload->>'title') not between 1 and 160
    or jsonb_typeof(existing.payload->'text') is distinct from 'string'
    or existing.payload->>'text' is null
    or char_length(existing.payload->>'text') > 50000
    or jsonb_typeof(existing.payload->'history') is distinct from 'array' then
    raise exception 'document_payload_invalid';
  end if;
  begin
    existing_revision := (existing.payload->>'revision')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'document_payload_invalid';
  end;
  if existing_revision is distinct from p_expected_revision then raise exception 'document_revision_conflict'; end if;

  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'version' is distinct from '1'
    or jsonb_typeof(p_payload->'title') is distinct from 'string'
    or p_payload->>'title' is null
    or char_length(p_payload->>'title') not between 1 and 160
    or jsonb_typeof(p_payload->'text') is distinct from 'string'
    or p_payload->>'text' is null
    or char_length(p_payload->>'text') > 50000
    or p_payload->>'revision' is null
    or p_payload->>'revision' !~ '^[0-9]+$'
    or p_payload->'createdBy' is distinct from existing.payload->'createdBy'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or jsonb_typeof(p_payload->'history') is distinct from 'array' then
    raise exception 'document_payload_invalid';
  end if;
  begin
    next_revision := (p_payload->>'revision')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'document_payload_invalid';
  end;
  if next_revision is distinct from p_expected_revision + 1 then raise exception 'document_payload_invalid'; end if;

  existing_history := existing.payload->'history';
  next_history := p_payload->'history';
  if jsonb_array_length(next_history) is distinct from jsonb_array_length(existing_history) + 1
    or (next_history - (jsonb_array_length(next_history) - 1)) is distinct from existing_history then
    raise exception 'document_payload_invalid';
  end if;
  latest_receipt := next_history->(jsonb_array_length(next_history) - 1);
  if latest_receipt is null or jsonb_typeof(latest_receipt) is distinct from 'object'
    or latest_receipt->>'revision' is distinct from (p_expected_revision + 1)::text
    or latest_receipt->>'actorId' is distinct from p_user_id::text
    or latest_receipt->>'at' is null
    or btrim(latest_receipt->>'at') = ''
    or latest_receipt->>'kind' is null
    or latest_receipt->>'kind' not in ('edit', 'undo')
    or jsonb_typeof(latest_receipt->'before') is distinct from 'object'
    or jsonb_typeof(latest_receipt->'after') is distinct from 'object'
    or latest_receipt->'before' is distinct from jsonb_build_object(
      'title', existing.payload->>'title', 'text', existing.payload->>'text')
    or latest_receipt->'after' is distinct from jsonb_build_object(
      'title', p_payload->>'title', 'text', p_payload->>'text') then
    raise exception 'document_payload_invalid';
  end if;
  return query update public.saved_product_work set payload=p_payload, title=p_payload->>'title', updated_at=clock_timestamp()
    where id=p_work_id returning *;
end $$;
revoke all on function public.update_document_work(uuid,uuid,uuid,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.update_document_work(uuid,uuid,uuid,text,integer,jsonb) to service_role;
