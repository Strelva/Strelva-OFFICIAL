\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

-- Rows from the documented pre-workspace schema survive the upgrade, including
-- the stable identity mirror populated by the earlier identity-spine trigger.
select pg_temp.assert_true(
  exists(select 1 from public.report_snapshots where tenant_id = 'upgrade-site'
    and period = '2026-08' and metrics = '{"retained":true}'::jsonb)
  and (select relrowsecurity from pg_class where oid = 'public.report_snapshots'::regclass),
  'existing report snapshots and their RLS survive the full upgrade'
);
select pg_temp.assert_true(
  exists(select 1 from public.tenants where id = 'upgrade-site' and site_name = 'Upgrade Fixture Site'),
  'the representative tenant survives the workspace upgrade'
);
select pg_temp.assert_true(
  exists(
    select 1
    from public.content content
    join public.tenants tenant on tenant.id = content.tenant_id
    where content.tenant_id = 'upgrade-site'
      and content.section = 'hero'
      and content.tenant_stable_id = tenant.stable_id
      and content.data->>'headline' = 'Before the workspace upgrade'
  ),
  'pre-upgrade content and its stable tenant mirror survive'
);

-- Key identity and permission boundaries remain fail-closed after every ordered
-- migration. Browser roles receive neither direct workspace data access nor the
-- service-role-only workspace creation RPC.
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.create_owned_workspace(uuid,text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.create_owned_workspace(uuid,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.create_owned_workspace(uuid,text,text,text)', 'EXECUTE'),
  'workspace creation stays behind the service role'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.workspaces', 'SELECT')
  and not has_table_privilege('authenticated', 'public.saved_product_work', 'SELECT')
  and not has_table_privilege('anon', 'public.workspaces', 'SELECT'),
  'browser roles have no direct workspace table access'
);
select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid = 'public.workspaces'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.workspace_operations'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.job_economics'::regclass),
  'workspace, recovery, and economics tables retain RLS'
);

-- A verified owner can still enter the new workspace boundary, while the same
-- command rejects an unverified identity. This is a real RPC failure path, not
-- just an inspection of table metadata.
do $$
declare
  created_workspace_id uuid;
  caught text;
begin
  select id into created_workspace_id
  from public.create_owned_workspace(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'owner@upgrade.example',
    'personal',
    'Upgrade rehearsal workspace'
  );
  perform pg_temp.assert_true(
    exists(
      select 1 from public.workspace_memberships
      where workspace_memberships.workspace_id = created_workspace_id
        and user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        and role = 'owner'
    ),
    'verified owner receives a workspace membership'
  );

  caught := null;
  begin
    perform public.create_owned_workspace(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'unverified@upgrade.example',
      'personal',
      'Should be denied'
    );
    raise exception 'unverified workspace creation was accepted';
  exception when others then caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'verified_identity_required', 'unverified identity remains denied');
end;
$$;

select 'workspace full-schema upgrade checks passed' as result;
