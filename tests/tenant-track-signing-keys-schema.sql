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
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tenant_track_signing_keys' and column_name='previous_public_key'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='tenant_track_signing_keys' and column_name='previous_valid_until'
  ) then
    raise exception 'site signing key rotation window is missing';
  end if;
  if not has_function_privilege('service_role','public.rotate_tenant_track_signing_key(text,text)','execute')
     or has_function_privilege('anon','public.rotate_tenant_track_signing_key(text,text)','execute')
     or has_function_privilege('authenticated','public.rotate_tenant_track_signing_key(text,text)','execute') then
    raise exception 'site signing key rotation must be service-role-only';
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tenant_track_signing_keys') then
    raise exception 'tenant_track_signing_keys must have no browser policies';
  end if;
end
$$;

-- The atomic teardown owns the tenant delete; its FK must remove the keys.
begin;
insert into public.tenants(id,site_name) values ('track-teardown-fixture','Signing key teardown');
insert into public.tenant_track_signing_keys(tenant_id,public_key)
values ('track-teardown-fixture',repeat('k',100));
select public.deprovision_tenant_rows('track-teardown-fixture');
do $$ begin
  if exists (select 1 from public.tenant_track_signing_keys where tenant_id='track-teardown-fixture') then
    raise exception 'atomic teardown retained tenant signing keys';
  end if;
end $$;
rollback;
