\set ON_ERROR_STOP on

-- Runs after offering-installations-schema.sql, whose fictional owner and
-- business are reused. Every probe row is rolled back.

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end; $$;

do $$
declare
  owner_id uuid := '95000000-0000-4000-8000-000000000001';
  business_id uuid := '95000000-0000-4000-8000-000000000010';
  caught text;
begin
  caught := null;
  begin
    perform public.install_offering(
      business_id, owner_id, 'offering-owner@example.com',
      'home_finder', '1.0.0', 'home-finder:probe', repeat('0', 64), '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('kind', 'home_finder_installation', 'id', 'installation-fixture-1')),
      '{"kind":"provider_requested","providerKind":"named_third_party","providerName":"John Leone, Agency Partner"}'::jsonb,
      array['read_installation_summary', 'read_readiness', 'list_delivery_receipts', 'read_delivery_receipt'],
      array['home_finder_management']
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught = 'offering_definition_not_installable',
    'the unqualified Home Finder definition is refused by the install command: ' || coalesce(caught, 'accepted'));
  perform pg_temp.assert_true(
    not exists (select 1 from public.offering_installations where definition_id = 'home_finder'),
    'a refused Home Finder install leaves no row');

  caught := null;
  begin
    insert into public.offering_installations (
      business_workspace_id, definition_id, definition_version, native_resources, responsibility,
      accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by
    ) values (
      business_id, 'home_finder', '1.0.0',
      jsonb_build_array(jsonb_build_object('kind', 'home_finder_installation', 'id', 'installation-fixture-1')),
      '{"kind":"customer_operated","providerName":"Probe"}'::jsonb,
      array['read_readiness'], array['home_finder_management'], 'home-finder:shape-probe', repeat('0', 64),
      owner_id, owner_id
    );
    raise exception 'shape_probe_rollback';
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught = 'shape_probe_rollback',
    'the declared Home Finder resource kind satisfies the kind constraint: ' || coalesce(caught, 'none'));

  caught := null;
  begin
    insert into public.offering_installations (
      business_workspace_id, definition_id, definition_version, native_resources, responsibility,
      accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by
    ) values (
      business_id, 'home_finder', '1.0.0',
      jsonb_build_array(jsonb_build_object('kind', 'home_finder_installation', 'id', 'https://example.com/admin')),
      '{"kind":"customer_operated","providerName":"Probe"}'::jsonb,
      array['read_readiness'], array['home_finder_management'], 'home-finder:bad-id-probe', repeat('0', 64),
      owner_id, owner_id
    );
  exception when check_violation then caught := 'check_violation'; end;
  perform pg_temp.assert_true(caught = 'check_violation', 'a Home Finder reference must be a bounded installation id');

  caught := null;
  begin
    insert into public.offering_installations (
      business_workspace_id, definition_id, definition_version, native_resources, responsibility,
      accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by
    ) values (
      business_id, 'private_staff_requests', '1.0.0',
      jsonb_build_array(jsonb_build_object('kind', 'mls_feed', 'id', 'feed-1')),
      '{"kind":"customer_operated","providerName":"Probe"}'::jsonb,
      array['submit_requests'], array['staff_app'], 'unknown-kind-probe', repeat('0', 64),
      owner_id, owner_id
    );
  exception when check_violation then caught := 'check_violation'; end;
  perform pg_temp.assert_true(caught = 'check_violation', 'an undeclared native resource kind is rejected');

  caught := null;
  begin
    insert into public.offering_installations (
      business_workspace_id, definition_id, definition_version, native_resources, responsibility,
      accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by
    ) values (
      business_id, 'private_staff_requests', '1.0.0',
      jsonb_build_array(jsonb_build_object('id', 'missing-kind')),
      '{"kind":"customer_operated","providerName":"Probe"}'::jsonb,
      array['submit_requests'], array['staff_app'], 'missing-kind-probe', repeat('0', 64),
      owner_id, owner_id
    );
  exception when check_violation then caught := 'check_violation'; end;
  perform pg_temp.assert_true(caught = 'check_violation', 'a native resource without a kind is rejected');
end $$;
