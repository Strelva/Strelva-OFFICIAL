-- Sibling comparison is a read of reusable shape, never data or bindings.
begin;
set local lock_timeout='2s';
create function public.system_version_sibling_changes(p_version public.system_versions) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare before jsonb:=p_version.baseline_definition; after jsonb:=p_version.baseline_definition;
  item record; parts text[]; idx integer; result jsonb;
begin
  for item in select path,value from public.system_version_overrides where version_id=p_version.id order by char_length(path),position loop
    if item.path='*' then
      if jsonb_typeof(item.value) is distinct from 'object' then return '{"state":"unavailable","changes":[]}'::jsonb; end if;
      after:=item.value;
    else
      parts:=string_to_array(item.path,'.');
      for idx in 1..cardinality(parts)-1 loop
        if jsonb_typeof(after#>parts[1:idx]) is distinct from 'object' then return '{"state":"unavailable","changes":[]}'::jsonb; end if;
      end loop;
      if item.value is null then after:=after#-parts; else after:=jsonb_set(after,parts,item.value,true); end if;
    end if;
  end loop;
  begin
    perform public.agency_package_assert_shareable(before);
    perform public.agency_package_assert_shareable(after);
    -- These fields can be local authority even when their values are UUIDs.
    if jsonb_path_exists(before,'$.**.maintenanceOwner') or jsonb_path_exists(after,'$.**.maintenanceOwner')
      or jsonb_path_exists(before,'$.**.localData') or jsonb_path_exists(after,'$.**.localData')
      or jsonb_path_exists(before,'$.**.people') or jsonb_path_exists(after,'$.**.people') then
      return '{"state":"unavailable","changes":[]}'::jsonb;
    end if;
  exception when others then return '{"state":"unavailable","changes":[]}'::jsonb;
  end;
  with recursive diff(path,before,after) as (
    select ''::text,before,after
    union all
    select case when d.path='' then k.key else d.path||'.'||k.key end,d.before->k.key,d.after->k.key
    from diff d cross join lateral (select jsonb_object_keys(case when jsonb_typeof(d.before)='object' and jsonb_typeof(d.after)='object' then d.before||d.after else '{}'::jsonb end) key) k
    where d.before is distinct from d.after
  ) select coalesce(jsonb_agg(jsonb_build_object('path',path,'beforePresent',diff.before is not null,'afterPresent',diff.after is not null,'before',diff.before,'after',diff.after) order by path),'[]'::jsonb)
    into result from diff where path<>'' and diff.before is distinct from diff.after
      and not (coalesce(jsonb_typeof(diff.before),'')='object' and coalesce(jsonb_typeof(diff.after),'')='object');
  return jsonb_build_object('state','ready','changes',result);
end $$;
revoke all on function public.system_version_sibling_changes(public.system_versions) from public,anon,authenticated,service_role;
alter function public.read_business_versions(uuid,uuid,text) rename to read_business_versions_sibling_core;
revoke all on function public.read_business_versions_sibling_core(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.read_business_versions(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare original jsonb; versions jsonb:='[]'; v jsonb; sibling jsonb; siblings jsonb; row public.system_versions;
begin
  original:=public.read_business_versions_sibling_core(p_workspace_id,p_user_id,p_verified_email);
  for v in select value from jsonb_array_elements(original->'versions') loop
    siblings:='[]';
    for sibling in select value from jsonb_array_elements(v->'siblings') loop
      select * into row from public.system_versions where id=(sibling->>'id')::uuid and business_workspace_id=p_workspace_id;
      if found then siblings:=siblings||jsonb_build_array(sibling||jsonb_build_object('comparison',public.system_version_sibling_changes(row))); end if;
    end loop;
    versions:=versions||jsonb_build_array(jsonb_set(v,'{siblings}',siblings));
  end loop;
  return jsonb_set(original,'{versions}',versions);
end $$;
revoke all on function public.read_business_versions(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_business_versions(uuid,uuid,text) to service_role;
commit;
