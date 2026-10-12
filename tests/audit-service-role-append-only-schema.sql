-- #528: exercise actual SQL with the PostgREST server role, not ACL assertions alone.
begin;
insert into public.tenants(id, site_name) values
  ('audit528-site', 'Audit append-only fixture'),
  ('audit528-cascade', 'Audit tenant cascade fixture');
insert into public.users(id, email) values
  ('52800100-0000-4000-8000-000000000001', 'audit-actor@fixture.example');
-- Explicit local fixture grant matches Supabase's user-table defaults, which
-- the shared upgrade shim otherwise omits. Rolled back with all fixture data.
grant select, delete on public.users to service_role;
grant select, update, delete on public.tenants to service_role;
set local role service_role;
insert into public.audit_logs(id, tenant_id, action, target_type, time, actor_user_id)
values ('audit528-original', 'audit528-site', 'fixture.original', 'tenant', now(),
  '52800100-0000-4000-8000-000000000001');
do $$
declare statement text; denied boolean;
begin
  if (select action from public.audit_logs where id = 'audit528-original') <> 'fixture.original' then
    raise exception 'service_role lost audit read';
  end if;
  foreach statement in array array[
    $q$update public.audit_logs set action='forged' where id='audit528-original'$q$,
    $q$delete from public.audit_logs where id='audit528-original'$q$,
    $q$truncate public.audit_logs$q$,
    $q$insert into public.audit_logs(id, tenant_id, action, target_type, time)
       values ('audit528-original', 'audit528-site', 'forged', 'tenant', now())
       on conflict(id) do update set action=excluded.action$q$
  ] loop
    denied := false;
    begin execute statement;
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'service_role could mutate existing audit: %', statement; end if;
  end loop;
  if (select count(*) from public.audit_logs where tenant_id='audit528-site') <> 1
    or (select action from public.audit_logs where id='audit528-original') <> 'fixture.original' then
    raise exception 'audit tampering changed the fixture';
  end if;
end $$;
insert into public.audit_logs(id, tenant_id, action, target_type, time)
values ('audit528-cascade', 'audit528-cascade', 'fixture.cascade', 'tenant', now());
delete from public.tenants where id='audit528-cascade';
do $$
begin
  if exists(select 1 from public.audit_logs where id='audit528-cascade') then
    raise exception 'existing tenant deletion stopped cascading audit cleanup';
  end if;
end $$;
-- Actor account deletion retains the existing ON DELETE SET NULL boundary.
delete from public.users where id='52800100-0000-4000-8000-000000000001';
do $$
begin
  if exists(select 1 from public.audit_logs where id='audit528-original' and actor_user_id is not null)
    or (select action from public.audit_logs where id='audit528-original') <> 'fixture.original' then
    raise exception 'actor account cleanup stopped preserving its audit payload';
  end if;
end $$;
-- Existing tenant identity maintenance uses a parent update and FK cascade.
-- Preserve this path without allowing arbitrary audit payload mutation.
update public.tenants set id='audit528-renamed' where id='audit528-site';
do $$
begin
  if (select tenant_id from public.audit_logs where id='audit528-original') <> 'audit528-renamed'
    or (select action from public.audit_logs where id='audit528-original') <> 'fixture.original' then
    raise exception 'tenant rename stopped preserving its audit';
  end if;
end $$;
-- The existing reviewed SECURITY DEFINER cleanup is the explicit exception:
-- deny raw deletes while retaining atomic tenant deprovision, not a new bypass.
select public.deprovision_tenant_rows('audit528-renamed');
reset role;
do $$
begin
  if exists(select 1 from public.tenants where id in ('audit528-site','audit528-renamed'))
    or exists(select 1 from public.audit_logs where tenant_id in ('audit528-site','audit528-renamed')) then
    raise exception 'authorized atomic tenant cleanup stopped working';
  end if;
end $$;
rollback;
\echo 'Audit #528: direct mutation denial, append/read, preserved payload, actor deletion, tenant rename and explicit cleanup passed.'
