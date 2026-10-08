-- #528: tenant members (viewer through owner) and anon get nothing on the
-- legacy tenant tables through PostgREST. Each attack from the security review
-- runs as the client role with the member's JWT subject and must be refused;
-- the user-session reads the app actually makes still work, and the service
-- role keeps full access. Runs in one transaction and rolls back.
begin;

insert into public.users (id, email, verified_at) values
  ('52800000-0000-4000-8000-000000000001', 'viewer@rls528.example', now()),
  ('52800000-0000-4000-8000-000000000002', 'editor@rls528.example', now()),
  ('52800000-0000-4000-8000-000000000003', 'admin@rls528.example', now()),
  ('52800000-0000-4000-8000-000000000004', 'owner@rls528.example', now()),
  ('52800000-0000-4000-8000-000000000005', 'operator@rls528.example', now());
insert into public.tenants (id, site_name, active, owner_email, plan_override, auto_publish,
    revalidation_secret, slack_webhook_url, google_search_console_key, instagram_access_token)
  values ('rls528-site', 'RLS 528 Fixture', true, 'real-owner@rls528.example', null, false,
    'fixture-revalidation-secret', 'https://hooks.example.test/fixture',
    'fixture-gsc-key', 'fixture-instagram-token');
insert into public.memberships (user_id, tenant_id, role) values
  ('52800000-0000-4000-8000-000000000001', 'rls528-site', 'viewer'),
  ('52800000-0000-4000-8000-000000000002', 'rls528-site', 'editor'),
  ('52800000-0000-4000-8000-000000000003', 'rls528-site', 'admin'),
  ('52800000-0000-4000-8000-000000000004', 'rls528-site', 'owner');
insert into public.super_admins (user_id, email)
  values ('52800000-0000-4000-8000-000000000005', 'operator@rls528.example');
insert into public.integrations (tenant_id, provider, access_token, refresh_token)
  values ('rls528-site', 'google', 'fixture-access-token', 'fixture-refresh-token');
insert into public.audit_logs (id, tenant_id, action, target_type, time)
  values ('rls528-audit', 'rls528-site', 'fixture.action', 'tenant', now());
insert into public.content (tenant_id, section, data)
  values ('rls528-site', 'hero', '{"headline":"Approved"}');
insert into public.pay_links (slug, client_name, door, tenant_id, amount_cents)
  values ('rls528-pay', 'Fixture', 'build', 'rls528-site', 50000);

-- Runs one statement as a client role. Returns 'ok:<rows>' or '<sqlstate>:<message>'.
create function pg_temp.attempt(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare
  v_rows bigint;
  v_result text;
begin
  begin
    perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
    perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, true);
    execute p_sql;
    get diagnostics v_rows = row_count;
    v_result := 'ok:' || v_rows;
    perform set_config('role', 'none', true);
  exception when others then
    v_result := sqlstate || ':' || sqlerrm;
  end;
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v_result;
end $$;

-- Every attack, for anon and every member role, is refused by the grant.
do $attacks$
declare
  member record;
  attack record;
  v_result text;
begin
  for member in
    select null::uuid as id, 'anon' as role
    union all select '52800000-0000-4000-8000-000000000001', 'viewer'
    union all select '52800000-0000-4000-8000-000000000002', 'editor'
    union all select '52800000-0000-4000-8000-000000000003', 'admin'
    union all select '52800000-0000-4000-8000-000000000004', 'owner'
  loop
    for attack in select * from (values
      ('integrations', 'read integration tokens',
        $q$select access_token, refresh_token from public.integrations where tenant_id = 'rls528-site'$q$),
      ('tenants', 'read tenant secrets',
        $q$select revalidation_secret, slack_webhook_url, google_search_console_key, instagram_access_token from public.tenants where id = 'rls528-site'$q$),
      ('tenants', 'change plan, approval and owner email',
        $q$update public.tenants set plan_override = 'pro', auto_publish = true, owner_email = 'attacker@rls528.example' where id = 'rls528-site'$q$),
      ('tenants', 'change billing state',
        $q$update public.tenants set subscription_status = 'active', auto_approve_threshold = 0 where id = 'rls528-site'$q$),
      ('invites', 'invite self as owner',
        $q$insert into public.invites (email, tenant_id, role, expires_at) values ('viewer@rls528.example', 'rls528-site', 'owner', now() + interval '1 day')$q$),
      ('invites', 'read invitations',
        $q$select email, role from public.invites where tenant_id = 'rls528-site'$q$),
      ('audit_logs', 'erase the audit trail',
        $q$delete from public.audit_logs where tenant_id = 'rls528-site'$q$),
      ('audit_logs', 'forge an audit row',
        $q$insert into public.audit_logs (id, tenant_id, action, target_type, time) values ('rls528-forged', 'rls528-site', 'forged', 'tenant', now())$q$),
      ('content', 'publish content without approval',
        $q$update public.content set data = '{"headline":"Unapproved"}' where tenant_id = 'rls528-site'$q$),
      ('pay_links', 'change a pay link amount',
        $q$update public.pay_links set amount_cents = 1 where slug = 'rls528-pay'$q$),
      ('domain_claims', 'claim a domain',
        $q$insert into public.domain_claims (tenant_id, domain, role, status) values ('rls528-site', 'attacker.example.test', 'production', 'verified')$q$),
      ('tenants', 'delete the tenant',
        $q$delete from public.tenants where id = 'rls528-site'$q$)
    ) a(relation, label, statement) loop
      v_result := pg_temp.attempt(member.id, attack.statement);
      if v_result not like '42501:permission denied for table ' || attack.relation then
        raise exception '% could %: %', member.role, attack.label, v_result;
      end if;
    end loop;

    -- memberships kept its super-admin-only write policy: a member's own
    -- promotion is filtered to zero rows.
    v_result := pg_temp.attempt(member.id,
      $q$update public.memberships set role = 'owner' where tenant_id = 'rls528-site'$q$);
    if v_result <> 'ok:0' and v_result not like '42501:%' then
      raise exception '% could promote a membership: %', member.role, v_result;
    end if;
  end loop;
end $attacks$;

-- Nothing the attacks targeted changed.
do $unchanged$
begin
  if (select row(owner_email, plan_override, auto_publish, subscription_status)
      from public.tenants where id = 'rls528-site')
     is distinct from row('real-owner@rls528.example'::text, null::text, false, 'none'::text) then
    raise exception 'tenant row changed under a client attack';
  end if;
  if exists (select 1 from public.invites where tenant_id = 'rls528-site')
     or (select count(*) from public.audit_logs where tenant_id = 'rls528-site') <> 1
     or (select data->>'headline' from public.content where tenant_id = 'rls528-site') <> 'Approved'
     or (select amount_cents from public.pay_links where slug = 'rls528-pay') <> 50000
     or (select role from public.memberships where user_id = '52800000-0000-4000-8000-000000000001') <> 'viewer' then
    raise exception 'client attack left a write behind';
  end if;
end $unchanged$;

-- The user-session reads the app makes still work: the proxy's super-admin
-- check, and a member reading their own identity and memberships.
do $legitimate$
declare v_result text;
begin
  v_result := pg_temp.attempt('52800000-0000-4000-8000-000000000005',
    $q$select user_id from public.super_admins where user_id = '52800000-0000-4000-8000-000000000005' and revoked_at is null$q$);
  if v_result <> 'ok:1' then raise exception 'super admin lost the proxy read: %', v_result; end if;
  v_result := pg_temp.attempt('52800000-0000-4000-8000-000000000001',
    $q$select user_id from public.super_admins where user_id = '52800000-0000-4000-8000-000000000001'$q$);
  if v_result <> 'ok:0' then raise exception 'member super-admin read changed: %', v_result; end if;
  v_result := pg_temp.attempt('52800000-0000-4000-8000-000000000001',
    $q$select role from public.memberships where user_id = '52800000-0000-4000-8000-000000000001'$q$);
  if v_result <> 'ok:1' then raise exception 'member lost the own-membership read: %', v_result; end if;
  v_result := pg_temp.attempt('52800000-0000-4000-8000-000000000001',
    $q$select email from public.users where id = '52800000-0000-4000-8000-000000000001'$q$);
  if v_result <> 'ok:1' then raise exception 'member lost the own-user read: %', v_result; end if;
end $legitimate$;

-- If read grants come back later, the policies still scope by role:
-- any member reads working records; only owner and admin read credentials.
savepoint read_grants;
grant select on public.content, public.integrations, public.tenants to authenticated;
do $policies$
begin
  if pg_temp.attempt('52800000-0000-4000-8000-000000000001', $q$select 1 from public.content where tenant_id = 'rls528-site'$q$) <> 'ok:1'
     or pg_temp.attempt('52800000-0000-4000-8000-000000000001', $q$select 1 from public.integrations where tenant_id = 'rls528-site'$q$) <> 'ok:0'
     or pg_temp.attempt('52800000-0000-4000-8000-000000000002', $q$select 1 from public.tenants where id = 'rls528-site'$q$) <> 'ok:0'
     or pg_temp.attempt('52800000-0000-4000-8000-000000000003', $q$select 1 from public.integrations where tenant_id = 'rls528-site'$q$) <> 'ok:1'
     or pg_temp.attempt('52800000-0000-4000-8000-000000000004', $q$select 1 from public.tenants where id = 'rls528-site'$q$) <> 'ok:1'
     or pg_temp.attempt('52800000-0000-4000-8000-000000000005', $q$select 1 from public.integrations where tenant_id = 'rls528-site'$q$) <> 'ok:1' then
    raise exception 'select policies do not scope reads by role';
  end if;
end $policies$;
rollback to savepoint read_grants;

-- Every legacy table: no client privilege, and only read policies.
do $catalog$
begin
  if exists (
    select 1
    from release_rollback_baseline.m20261005100000_legacy_tenant_grants b,
      lateral (values ('anon'), ('authenticated')) r(role_name),
      lateral (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(privilege)
    where has_table_privilege(r.role_name, b.relation_oid, p.privilege)
  ) or exists (
    select 1 from pg_policies pol
    join release_rollback_baseline.m20261005100000_legacy_tenant_grants b on b.relation_name = pol.tablename
    where pol.schemaname = 'public' and pol.cmd <> 'SELECT'
  ) or (select count(*) from release_rollback_baseline.m20261005100000_legacy_tenant_grants) <> 38
    or has_schema_privilege('authenticated', 'release_rollback_baseline', 'usage')
    or has_schema_privilege('anon', 'release_rollback_baseline', 'usage') then
    raise exception 'legacy tenant tables still expose client privileges';
  end if;
end $catalog$;

-- The server path (service role) keeps exactly the grants it had before, and
-- where it holds Supabase's default write grants (production), it still writes.
do $server_grants$
begin
  if exists (
    select 1
    from release_rollback_baseline.m20261005100000_legacy_tenant_grants b
    join pg_class c on c.oid = b.relation_oid
    where c.relname <> 'audit_logs'
      and (select coalesce(array_agg(a.privilege_type order by a.privilege_type), '{}')
           from aclexplode(b.grants) a where a.grantee = 'service_role'::regrole)
      is distinct from
          (select coalesce(array_agg(a.privilege_type order by a.privilege_type), '{}')
           from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
           where a.grantee = 'service_role'::regrole)
  ) then
    raise exception 'service role grants changed on a legacy tenant table';
  end if;
end $server_grants$;
select has_table_privilege('service_role', 'public.tenants', 'update') as service_role_writes \gset
\if :service_role_writes
set local role service_role;
update public.tenants set owner_email = 'owner-updated@rls528.example' where id = 'rls528-site';
insert into public.invites (email, tenant_id, role, expires_at)
  values ('new-admin@rls528.example', 'rls528-site', 'admin', now() + interval '1 day');
insert into public.audit_logs (id, tenant_id, action, target_type, time)
  values ('rls528-server', 'rls528-site', 'server.action', 'tenant', now());
update public.integrations set access_token = 'rotated' where tenant_id = 'rls528-site';
delete from public.pay_links where slug = 'rls528-pay';
reset role;
do $server$
begin
  if (select owner_email from public.tenants where id = 'rls528-site') <> 'owner-updated@rls528.example'
     or (select count(*) from public.audit_logs where tenant_id = 'rls528-site') <> 2
     or not exists (select 1 from public.invites where email = 'new-admin@rls528.example') then
    raise exception 'service role lost write access';
  end if;
end $server$;
\endif

rollback;
\echo 'Legacy tenant client access (#528): viewer/editor/admin/owner/anon refused; app reads and service role intact.'
