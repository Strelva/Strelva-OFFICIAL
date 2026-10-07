do $$
declare
  v_table regclass := to_regclass('public.tenant_track_signing_keys');
begin
  if v_table is null then raise exception 'tenant_track_signing_keys missing'; end if;
  if not (select relrowsecurity from pg_class where oid=v_table) then
    raise exception 'tenant_track_signing_keys must have RLS enabled';
  end if;
  if has_table_privilege('anon',v_table,'select') or has_table_privilege('anon',v_table,'insert')
     or has_table_privilege('authenticated',v_table,'select') or has_table_privilege('authenticated',v_table,'insert') then
    raise exception 'browser roles can access site signing keys';
  end if;
  if not has_table_privilege('service_role',v_table,'select')
     or not has_table_privilege('service_role',v_table,'insert')
     or not has_table_privilege('service_role',v_table,'update')
     or not has_table_privilege('service_role',v_table,'delete') then
    raise exception 'service role is missing signing key access';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid=v_table and contype='f' and confupdtype='c' and confdeltype='c'
  ) then
    raise exception 'site signing key must follow tenant rename and deletion';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tenant_track_signing_keys') then
    raise exception 'tenant_track_signing_keys must have no browser policies';
  end if;
end
$$;
