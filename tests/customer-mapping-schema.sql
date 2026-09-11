\set ON_ERROR_STOP on

-- Run after the release-one workspace migration on an isolated database.  The
-- fixture deliberately uses only fictional identities and exact UUID links.
-- It is not a mapping loader and must never be pointed at production.

create function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'assertion failed: %', message;
  end if;
end;
$$;

select pg_temp.assert_true(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.customer_relationships'::regclass,
      'public.customer_resources'::regclass,
      'public.customer_assignments'::regclass,
      'public.customer_mapping_audit'::regclass
    )
  ),
  'every customer mapping table must have RLS enabled'
);
select pg_temp.assert_true(
  (select count(*) from pg_policies where schemaname = 'public' and tablename like 'customer_%') = 0,
  'customer mapping tables must not expose browser policies in this slice'
);
select pg_temp.assert_true(
  (
    select bool_and(
      has_table_privilege('service_role', table_name, 'SELECT')
      and has_table_privilege('service_role', table_name, 'INSERT')
      and has_table_privilege('service_role', table_name, 'UPDATE')
    )
    from unnest(array[
      'public.customer_relationships',
      'public.customer_resources',
      'public.customer_assignments'
    ]) as fixture(table_name)
  ),
  'service_role must have only the mapping write privileges used by a reviewed loader'
);
select pg_temp.assert_true(
  has_table_privilege('service_role', 'public.customer_mapping_audit', 'SELECT')
  and has_table_privilege('service_role', 'public.customer_mapping_audit', 'INSERT')
  and not has_table_privilege('service_role', 'public.customer_mapping_audit', 'UPDATE')
  and not has_table_privilege('service_role', 'public.customer_mapping_audit', 'DELETE'),
  'audit must be readable and appendable but not mutable or deletable'
);
select pg_temp.assert_true(
  (
    select bool_and(
      not has_table_privilege(browser_role, table_name, 'SELECT')
      and not has_table_privilege(browser_role, table_name, 'INSERT')
      and not has_table_privilege(browser_role, table_name, 'UPDATE')
      and not has_table_privilege(browser_role, table_name, 'DELETE')
    )
    from unnest(array['anon', 'authenticated']) as roles(browser_role)
    cross join unnest(array[
      'public.customer_relationships',
      'public.customer_resources',
      'public.customer_assignments',
      'public.customer_mapping_audit'
    ]) as fixture(table_name)
  ),
  'browser roles must have no direct customer mapping privileges'
);

insert into public.users (id, email, verified_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'mapping-owner@example.com', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'assigned-agent@example.com', now()),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'second-agent@example.com', now()),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'reviewer@example.com', now());

insert into public.workspaces (id, kind, name, created_by) values
  (
    '11111111-1111-4111-8111-111111111111',
    'agency',
    'Fictional Northstar Agency',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'customer',
    'Fictional Alder Customer',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'personal',
    'Fictional Personal Context',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  );

insert into public.workspace_memberships (workspace_id, user_id, role, created_by) values
  (
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'owner',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'admin',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'member',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'owner',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );

-- Invalid context is rejected before a mapping can become visible.
do $$
declare caught text;
begin
  begin
    insert into public.customer_relationships (
      id, organization_workspace_id, display_name, customer_kind,
      provenance_source, recorded_by, updated_by
    ) values (
      '90000000-0000-4000-8000-000000000001',
      '33333333-3333-4333-8333-333333333333',
      'Should never persist',
      'organization',
      'direct_mapping',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'expected invalid organization context to fail';
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'customer_organization_invalid', 'personal context must not be an organization scope');
end;
$$;

do $$
declare caught text;
begin
  begin
    insert into public.customer_relationships (
      id, organization_workspace_id, customer_workspace_id, display_name,
      customer_kind, provenance_source, recorded_by, updated_by
    ) values (
      '90000000-0000-4000-8000-000000000002',
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      'Wrong context',
      'organization',
      'direct_mapping',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'expected invalid customer context to fail';
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'customer_workspace_invalid', 'direct context must be an explicit customer workspace');
end;
$$;

insert into public.customer_relationships (
  id, organization_workspace_id, customer_workspace_id, display_name,
  customer_kind, display_domain, provenance_source, evidence_reference,
  recorded_by, updated_by
) values
  (
    '10000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'Fictional Alder Customer',
    'organization',
    'alder.example',
    'direct_mapping',
    'fixture:relationship:alder',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    'Fictional Other Customer',
    'organization',
    'other.example',
    'reconciled',
    'fixture:relationship:other',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

insert into public.customer_resources (
  id, organization_workspace_id, customer_relationship_id, resource_kind,
  resource_reference, display_label, provenance_source, evidence_reference,
  recorded_by, updated_by
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    '10000000-0000-4000-8000-000000000001',
    'website',
    'fictional-alder-tenant',
    'Alder website',
    'direct_mapping',
    'fixture:resource:website',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '11111111-1111-4111-8111-111111111111',
    '10000000-0000-4000-8000-000000000001',
    'home_finder_installation',
    'fictional-alder-installation',
    'Alder Home Finder',
    'operator_reviewed',
    'fixture:resource:home-finder',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '11111111-1111-4111-8111-111111111111',
    '10000000-0000-4000-8000-000000000002',
    'website',
    'fictional-other-tenant',
    'Other website',
    'reconciled',
    'fixture:resource:other',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

-- An explicit assignment is required even for an agency owner/admin.  The
-- role values above are intentionally not consulted by this schema.
insert into public.customer_assignments (
  id, organization_workspace_id, user_id, customer_relationship_id,
  customer_resource_id, allowed_operations, grant_source, granted_by, updated_by
) values
  (
    '40000000-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    array['customer:read', 'resource:read']::text[],
    'direct_mapping',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  );

select pg_temp.assert_true(
  (select actor_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid
   from public.customer_mapping_audit
   where record_type = 'assignment'
     and record_id = '40000000-0000-4000-8000-000000000001'
   order by occurred_at desc, id desc limit 1),
  'assignment audit must record the actual updater'
);

-- A Home Finder mapping cannot be widened from a generic resource grant.
do $$
declare caught text;
begin
  begin
    insert into public.customer_assignments (
      id, organization_workspace_id, user_id, customer_relationship_id,
      customer_resource_id, allowed_operations, grant_source, granted_by, updated_by
    ) values (
      '40000000-0000-4000-8000-000000000002',
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      array['customer:read', 'resource:read']::text[],
      'operator_reviewed',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'expected installation scope failure';
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'customer_installation_scope_required', 'Home Finder must require installation:read');
end;
$$;

-- A resource from another relationship cannot be assigned by matching only an
-- organization or by guessing a customer name/domain.
do $$
declare caught text;
begin
  begin
    insert into public.customer_assignments (
      id, organization_workspace_id, user_id, customer_relationship_id,
      customer_resource_id, allowed_operations, grant_source, granted_by, updated_by
    ) values (
      '40000000-0000-4000-8000-000000000003',
      '11111111-1111-4111-8111-111111111111',
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000003',
      array['customer:read', 'resource:read']::text[],
      'reconciled',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    );
    raise exception 'expected cross-relationship resource failure';
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'customer_resource_assignment_invalid', 'resource assignment must preserve relationship scope');
end;
$$;

-- Mapping identity, including an opaque provider reference, is immutable.
do $$
declare caught text;
begin
  begin
    update public.customer_resources
      set resource_reference = 'retargeted-provider-reference'
      where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'expected resource identity failure';
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'customer_mapping_identity_immutable', 'provider reference must not be retargeted');
end;
$$;

update public.customer_relationships
  set display_name = 'Fictional Alder Customer Reviewed',
      updated_by = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  where id = '10000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(
  (select actor_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid
   from public.customer_mapping_audit
   where record_type = 'relationship'
     and record_id = '10000000-0000-4000-8000-000000000001'
   order by occurred_at desc, id desc limit 1),
  'relationship audit must identify the scoped updater rather than the original recorder'
);

-- Removing a native workspace membership revokes its assignment through the FK
-- without deleting the audit trail or blocking the membership operation.
delete from public.workspace_memberships
 where workspace_id = '11111111-1111-4111-8111-111111111111'
   and user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select pg_temp.assert_true(
  not exists (
    select 1 from public.customer_assignments
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  'native membership removal must remove its live assignment'
);
select pg_temp.assert_true(
  exists (
    select 1 from public.customer_mapping_audit
    where record_type = 'assignment'
      and record_id = '40000000-0000-4000-8000-000000000001'
      and action = 'revoked'
      and actor_id is null
      and evidence_reference = 'native-membership-removal'
  ),
  'membership removal must retain truthful system revocation evidence'
);

insert into public.customer_assignments (
  id, organization_workspace_id, user_id, customer_relationship_id,
  customer_resource_id, allowed_operations, grant_source, granted_by, updated_by
) values (
  '40000000-0000-4000-8000-000000000004',
  '11111111-1111-4111-8111-111111111111',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  array['customer:read', 'resource:read']::text[],
  'operator_reviewed',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);
update public.customer_assignments
  set status = 'revoked',
      revoked_by = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      revoked_at = now(),
      updated_by = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  where id = '40000000-0000-4000-8000-000000000004';
select pg_temp.assert_true(
  (select actor_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'::uuid
   from public.customer_mapping_audit
   where record_type = 'assignment'
     and record_id = '40000000-0000-4000-8000-000000000004'
     and action = 'revoked'
   order by occurred_at desc, id desc limit 1),
  'revocation audit must identify the actual revoker'
);

do $$
declare caught text;
begin
  begin
    update public.customer_assignments
      set status = 'active',
          revoked_by = null,
          revoked_at = null,
          updated_by = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      where id = '40000000-0000-4000-8000-000000000004';
    raise exception 'expected reactivation failure';
  exception when others then
    caught := sqlerrm;
  end;
  perform pg_temp.assert_true(caught = 'customer_mapping_reactivation_forbidden', 'revoked mappings must not be silently reactivated');
end;
$$;

select pg_temp.assert_true(
  (select version = 2 from public.customer_relationships where id = '10000000-0000-4000-8000-000000000001'),
  'a successful update must monotonically bump the relationship version'
);
select pg_temp.assert_true(
  (select count(*) >= 6 from public.customer_mapping_audit),
  'all scoped mapping operations must leave append-only audit evidence'
);
