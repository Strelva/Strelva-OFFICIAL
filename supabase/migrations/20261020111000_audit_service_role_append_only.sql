-- #528 successor: browser access was closed by 20261005100000, but Supabase's
-- default service_role table ACL still allowed rewriting/erasing audit history.
-- The runtime repository only appends and reads. Keep the existing privileged
-- atomic tenant teardown as its explicit cleanup exception; no function body,
-- RLS policy, tenant cleanup, foreign key or deployed migration changes here.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';
lock table public.audit_logs in access exclusive mode;

revoke all on table public.audit_logs from service_role;
grant select, insert on table public.audit_logs to service_role;
-- A table revoke does not remove column UPDATE grants.
do $$
declare column_name text;
begin
  for column_name in
    select attname from pg_attribute
    where attrelid='public.audit_logs'::regclass and attnum>0 and not attisdropped
  loop
    execute format('revoke update (%I) on public.audit_logs from service_role', column_name);
  end loop;
  -- Never broaden this repair to unrelated roles. MEMBER deliberately includes
  -- NOINHERIT memberships: SET ROLE or an ADMIN-option self-grant can activate
  -- their permissions later. Refuse role management too; this ACL cannot bound it.
  if exists(
      select 1 from pg_roles reachable
      where pg_has_role('service_role', reachable.oid, 'MEMBER')
        and (reachable.rolsuper or reachable.rolcreaterole
          or has_table_privilege(reachable.oid, 'public.audit_logs', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege(reachable.oid, 'public.audit_logs', 'UPDATE,REFERENCES'))
    )
    or (select pg_has_role('service_role', relowner, 'MEMBER')
        from pg_class where oid='public.audit_logs'::regclass)
    or has_table_privilege('service_role', 'public.audit_logs', 'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_any_column_privilege('service_role', 'public.audit_logs', 'UPDATE,REFERENCES') then
    raise exception 'audit_service_role_inherited_mutation_privilege' using errcode='42501';
  end if;
  if exists (
    select 1 from (values ('anon'), ('authenticated')) client(role_name)
    where (select pg_has_role(client.role_name, relowner, 'MEMBER')
           from pg_class where oid='public.audit_logs'::regclass)
      or exists(
        select 1 from pg_roles reachable
        where pg_has_role(client.role_name, reachable.oid, 'MEMBER')
          and (reachable.rolsuper or reachable.rolcreaterole
            or has_table_privilege(reachable.oid, 'public.audit_logs', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            or has_any_column_privilege(reachable.oid, 'public.audit_logs', 'SELECT,INSERT,UPDATE,REFERENCES'))
      )
  ) then
    raise exception 'audit_browser_privilege_drift' using errcode='42501';
  end if;
end $$;
commit;
