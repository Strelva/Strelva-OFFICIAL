-- Contact links for finished-app use grants. Additive wrapper; the legacy submit
-- RPC and flags-off HTTP path remain untouched. No recipient gets contact-list access.
set local lock_timeout = '3s';

create or replace function public.resolve_internal_tool_links(
  p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_links jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  release_spec jsonb;
  link jsonb;
  field jsonb;
  field_id text;
  link_email text;
  link_phone text;
  link_key text;
  email_match uuid;
  phone_match uuid;
  found_id uuid;
  apply_result jsonb;
  result jsonb := '{}'::jsonb;
begin
  if p_user_id is null or p_verified_email is null or not exists (
    select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then raise exception 'workspace_membership_required'; end if;
  perform 1 from public.workspace_memberships where workspace_id = p_workspace_id and user_id = p_user_id for share;
  if not found and not exists (
    select 1 from public.application_use_grants g where g.workspace_id = p_workspace_id and g.work_id = p_work_id
      and g.recipient_email = lower(btrim(p_verified_email)) and g.status = 'active'
      and g.expires_at > clock_timestamp() and g.record_submit and 'form' = any(g.views)
  ) then raise exception 'workspace_membership_required'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer';
  if not found then raise exception 'application_record_link_denied'; end if;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  select r.spec into release_spec
    from public.saved_product_work w
    join public.application_states s on s.work_id = w.id and s.workspace_id = w.workspace_id
    join public.application_releases r on r.work_id = s.work_id and r.version = s.current_release_version
    where w.id = p_work_id and w.workspace_id = p_workspace_id and w.product_id = 'applications'
      and s.lifecycle_status = 'installed';
  if release_spec is null then raise exception 'application_access_denied'; end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) not between 1 and 30 then
    raise exception 'application_record_invalid';
  end if;

  for link in select value from jsonb_array_elements(p_links) loop
    field_id := link->>'fieldId';
    select item.field_value into field from jsonb_array_elements(release_spec->'fields') as item(field_value)
      where item.field_value->>'id' = field_id;
    if field is null or field->>'type' is distinct from link->>'kind' or result ? field_id then
      raise exception 'application_record_invalid';
    end if;
    link_email := nullif(lower(btrim(coalesce(link->>'email', ''))), '');
    link_phone := nullif(btrim(coalesce(link->>'phone', '')), '');

    if link->>'kind' = 'assigned_person' then
      if link_email is null then raise exception 'application_record_invalid'; end if;
      select p.id into found_id from public.business_people p
        where p.workspace_id = p_workspace_id and p.email = link_email and p.active
        order by p.created_at, p.id limit 1;
      if found_id is null then raise exception 'application_record_person_unknown'; end if;
      result := result || jsonb_build_object(field_id, jsonb_build_object('id', found_id, 'created', false, 'conflict', false));
    else
      link_key := public.business_contact_phone_key(link_phone);
      if (link_email is null and link_phone is null)
        or (link_email is not null and not public.business_record_email_valid(link_email))
        or (link_phone is not null and link_key is null) then
        raise exception 'application_record_invalid';
      end if;
      select c.id into email_match from public.business_contacts c where c.workspace_id = p_workspace_id and c.email = link_email;
      select c.id into phone_match from public.business_contacts c where c.workspace_id = p_workspace_id and c.phone_key = link_key;
      apply_result := public.business_record_apply(
        p_workspace_id, p_user_id, 'member', 'internal_app', null,
        jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'name', nullif(btrim(coalesce(link->>'name', '')), ''),
          'email', link_email, 'phone', link_phone, 'source', 'internal_app'))),
        null, gen_random_uuid(),
        encode(sha256(convert_to(p_work_id::text || ':' || field_id || ':' || coalesce(link_email, '') || ':' || coalesce(link_key, ''), 'UTF8')), 'hex'));
      found_id := coalesce(
        (select c.id from public.business_contacts c where c.workspace_id = p_workspace_id and c.email = link_email),
        (select c.id from public.business_contacts c where c.workspace_id = p_workspace_id and c.phone_key = link_key));
      if found_id is null then raise exception 'business_record_conflict'; end if;
      result := result || jsonb_build_object(field_id, jsonb_build_object(
        'id', found_id,
        'created', email_match is null and phone_match is null,
        'conflict', email_match is not null and phone_match is not null and email_match <> phone_match));
    end if;
    field := null; found_id := null; email_match := null; phone_match := null;
  end loop;
  return result;
end;
$$;

revoke all on function public.resolve_internal_tool_links(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_internal_tool_links(uuid, uuid, uuid, text, jsonb) to service_role;


create function public.submit_internal_tool_use_record(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_grant_id uuid,
  p_release_version integer, p_record jsonb, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.application_states%rowtype;
  release_spec jsonb;
  links jsonb := '[]'::jsonb;
  resolved jsonb;
  values_json jsonb := p_record->'values';
  field jsonb;
  value text;
  context jsonb;
begin
  perform public.application_lock_work((select workspace_id from public.saved_product_work where id = p_work_id), p_work_id);
  select * into app from public.application_states where work_id = p_work_id;
  if not found then raise exception 'application_use_denied'; end if;
  -- Read the grant before any link writes; final submit repeats under the same lock.
  perform 1 from public.application_use_grants g where g.id = p_grant_id and g.work_id = p_work_id
    and g.recipient_email = lower(btrim(p_verified_email)) and g.status = 'active'
    and g.expires_at > clock_timestamp() and g.record_submit and 'form' = any(g.views) for share;
  if not found then raise exception 'application_use_denied'; end if;
  if app.current_release_version is distinct from p_release_version or app.lifecycle_status = 'retired' then
    raise exception 'application_release_conflict';
  end if;
  select spec into release_spec from public.application_releases where work_id = p_work_id and version = p_release_version;
  for field in select f from jsonb_array_elements(release_spec->'fields') f
    where f->>'type' in ('contact','assigned_person') loop
    value := values_json->>(field->>'id');
    if nullif(btrim(value), '') is null or value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
    links := links || jsonb_build_array(jsonb_build_object('fieldId',field->>'id','kind',field->>'type') ||
      case when field->>'type' = 'assigned_person' or position('@' in value)>0 then jsonb_build_object('email',value)
      else jsonb_build_object('phone',value) end);
  end loop;
  if jsonb_array_length(links)>0 then
    resolved := public.resolve_internal_tool_links(app.workspace_id,p_work_id,p_user_id,p_verified_email,links);
  end if;
  for field in select f from jsonb_array_elements(links) f loop
    values_json := jsonb_set(values_json,array[field->>'fieldId'],resolved->(field->>'fieldId')->'id');
  end loop;
  -- This RPC returns a table. Keep its established row shape inside a JSON array.
  select to_jsonb(result) into context from public.submit_application_use_record_v2(
    p_user_id,p_verified_email,p_work_id,p_grant_id,p_release_version,
    jsonb_set(p_record,'{values}',values_json),p_idempotency_key) result;
  return context;
end;
$$;
revoke all on function public.submit_internal_tool_use_record(uuid,text,uuid,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_internal_tool_use_record(uuid,text,uuid,uuid,integer,jsonb,text) to service_role;
