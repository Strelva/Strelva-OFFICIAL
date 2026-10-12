-- Display only names/addresses referenced by the current recipient's records
-- and granted fields. The legacy use projection and stored IDs are unchanged.
begin;
set local lock_timeout = '3s';

create function public.read_internal_tool_use_link_labels(
  p_user_id uuid, p_verified_email text, p_work_id uuid,
  p_grant_id uuid, p_release_version integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  access record;
  item jsonb;
  field jsonb;
  linked_id uuid;
  linked_value text;
  display_label text;
  labels jsonb := '[]'::jsonb;
begin
  -- This existing read locks and checks identity, grant, expiry, released state,
  -- record ownership and visible fields before a contact or person is read.
  select * into access from public.read_application_use_v2(p_user_id, p_verified_email, p_work_id);
  if not found or access.id is distinct from p_grant_id
    or access.release_version is distinct from p_release_version then
    raise exception 'application_use_conflict';
  end if;
  for item in select value from jsonb_array_elements(access.records) loop
    for field in select value from jsonb_array_elements(access.released_spec->'fields')
      where value->>'type' in ('contact','assigned_person') loop
      -- access.records already contains only fields of the granted views.
      linked_value := item->'values'->>(field->>'id');
      if linked_value is null or linked_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
      linked_id := linked_value::uuid;
      display_label := null;
      if field->>'type' = 'contact' then
        select concat_ws(' · ', nullif(btrim(contact.name),''), coalesce(contact.email, contact.phone))
          into display_label from public.business_contacts as contact
          where contact.id = linked_id and contact.workspace_id = access.workspace_id;
      else
        select concat_ws(' · ', person.name, person.email)
          into display_label from public.business_people as person
          where person.id = linked_id and person.workspace_id = access.workspace_id;
      end if;
      if nullif(display_label,'') is not null then
        labels := labels || jsonb_build_array(jsonb_build_object(
          'recordId',item->>'id', 'fieldId',field->>'id', 'linkId',linked_value, 'label',display_label));
      end if;
    end loop;
  end loop;
  return jsonb_build_object('workId',access.work_id,'workspaceId',access.workspace_id,
    'grantId',access.id,'releaseVersion',access.release_version,'labels',labels);
end;
$$;
revoke all on function public.read_internal_tool_use_link_labels(uuid,text,uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.read_internal_tool_use_link_labels(uuid,text,uuid,uuid,integer) to service_role;
commit;
