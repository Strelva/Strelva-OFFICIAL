\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end; $$;

select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.read_offering_business_snapshot(uuid,uuid,text,uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.bind_offering_website(uuid,uuid,text,text,text,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.revoke_offering_website_binding(uuid,uuid,uuid,text,bigint,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.bind_offering_website(uuid,uuid,text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.bind_offering_website(uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'website attachment must remain behind actor-bearing service functions'
);
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.offering_website_bindings', 'SELECT')
    and not has_table_privilege('service_role', 'public.offering_website_bindings', 'INSERT')
    and not has_table_privilege('service_role', 'public.offering_website_bindings', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.offering_website_bindings', 'SELECT'),
  'the service and browser roles must not bypass website attachment commands'
);
select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid='public.offering_website_bindings'::regclass),
  'website attachments must have RLS enabled'
);
select pg_temp.assert_true(
  not has_function_privilege('service_role', 'public.read_offering_installations(uuid,uuid,text,uuid)', 'EXECUTE'),
  'the superseded split read function must not remain callable by the service role'
);

insert into public.users(id,email,verified_at) values
 ('99000000-0000-4000-8000-000000000001','offering-website-owner@example.com',now()),
 ('99000000-0000-4000-8000-000000000002','offering-website-member@example.com',now()),
 ('99000000-0000-4000-8000-000000000003','offering-website-editor@example.com',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('99000000-0000-4000-8000-000000000010','customer','Website business','99000000-0000-4000-8000-000000000001'),
 ('99000000-0000-4000-8000-000000000011','customer','Second website business','99000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('99000000-0000-4000-8000-000000000010','99000000-0000-4000-8000-000000000001','owner','99000000-0000-4000-8000-000000000001'),
 ('99000000-0000-4000-8000-000000000010','99000000-0000-4000-8000-000000000002','member','99000000-0000-4000-8000-000000000001'),
 ('99000000-0000-4000-8000-000000000010','99000000-0000-4000-8000-000000000003','admin','99000000-0000-4000-8000-000000000001'),
 ('99000000-0000-4000-8000-000000000011','99000000-0000-4000-8000-000000000001','owner','99000000-0000-4000-8000-000000000001');
insert into public.tenants(id,stable_id,site_name,active) values
 ('offering-website-a','99000000-0000-4000-8000-000000000020','Offering Website A',true),
 ('offering-website-b','99000000-0000-4000-8000-000000000021','Offering Website B',true);
insert into public.memberships(user_id,tenant_id,role,tenant_stable_id) values
 ('99000000-0000-4000-8000-000000000001','offering-website-a','owner','99000000-0000-4000-8000-000000000020'),
 ('99000000-0000-4000-8000-000000000003','offering-website-b','editor','99000000-0000-4000-8000-000000000021');

do $$
declare
  owner_id uuid := '99000000-0000-4000-8000-000000000001';
  member_id uuid := '99000000-0000-4000-8000-000000000002';
  editor_id uuid := '99000000-0000-4000-8000-000000000003';
  business_id uuid := '99000000-0000-4000-8000-000000000010';
  second_business_id uuid := '99000000-0000-4000-8000-000000000011';
  binding record;
  replay record;
  installed public.offering_installations%rowtype;
  snapshot jsonb;
  caught text;
  membership_count bigint;
begin
  caught := null;
  begin
    perform public.bind_offering_website(
      business_id,editor_id,'offering-website-editor@example.com',
      'offering-website-b','website-b:first',repeat('a',64)
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_tenant_owner_required', 'workspace management does not imply tenant ownership');

  select * into binding from public.bind_offering_website(
    business_id,owner_id,'offering-website-owner@example.com',
    'offering-website-a','website-a:first',repeat('b',64)
  );
  perform pg_temp.assert_true(
    binding.status='active' and binding.revision=1 and binding.tenant_id='offering-website-a'
      and binding.actor_has_tenant_access,
    'the same verified workspace manager and tenant owner can create an attachment'
  );

  caught := null;
  begin
    perform public.bind_offering_website(
      business_id,owner_id,'offering-website-owner@example.com',
      'offering-website-a','website-a:null-digest',null
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_website_idempotency_invalid', 'a null attachment command digest is rejected before replay comparison');

  select * into replay from public.bind_offering_website(
    business_id,owner_id,'offering-website-owner@example.com',
    'offering-website-a','website-a:first',repeat('b',64)
  );
  perform pg_temp.assert_true(replay.id=binding.id, 'attachment retries return the original durable binding');
  caught := null;
  begin
    perform public.bind_offering_website(
      business_id,owner_id,'offering-website-owner@example.com',
      'offering-website-a','website-a:first',repeat('c',64)
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_website_idempotency_conflict', 'one attachment retry key cannot name another command');

  caught := null;
  begin
    perform public.bind_offering_website(
      second_business_id,owner_id,'offering-website-owner@example.com',
      'offering-website-a','website-a:second-business',repeat('d',64)
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_website_already_bound', 'one tenant cannot have contradictory active business attachments');

  snapshot := public.read_offering_business_snapshot(
    business_id,member_id,'offering-website-member@example.com',null
  );
  perform pg_temp.assert_true(
    snapshot->>'workspaceRole'='member'
      and jsonb_array_length(snapshot->'websiteBindings')=1
      and (snapshot->'websiteBindings'->0->>'actor_has_tenant_access')::boolean is false,
    'a business member can see the attachment without receiving tenant access'
  );

  select * into installed from public.install_offering(
    business_id,owner_id,'offering-website-owner@example.com',
    'managed_website_changes','1.0.0','website-offering:first',repeat('e',64),
    '{}'::jsonb,jsonb_build_array(jsonb_build_object('kind','managed_website','id',binding.id::text)),
    '{"kind":"customer_operated","providerName":"Website business"}'::jsonb,
    array['request_changes'],array['managed_website']
  );
  perform pg_temp.assert_true(
    installed.status='active' and installed.native_resources->0->>'id'=binding.id::text,
    'website installation references the verified binding UUID rather than a slug or URL'
  );

  caught := null;
  begin
    perform public.install_offering(
      second_business_id,owner_id,'offering-website-owner@example.com',
      'managed_website_changes','1.0.0','website-offering:missing-kind',repeat('1',64),
      '{}'::jsonb,jsonb_build_array(jsonb_build_object('id',binding.id::text)),
      '{"kind":"customer_operated","providerName":"Second website business"}'::jsonb,
      array['request_changes'],array['managed_website']
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_native_resources_invalid', 'a valid binding UUID without its managed resource kind is rejected');

  caught := null;
  begin
    perform public.install_offering(
      second_business_id,owner_id,'offering-website-owner@example.com',
      'managed_website_changes','1.0.0','website-offering:missing-provider',repeat('2',64),
      '{}'::jsonb,jsonb_build_array(jsonb_build_object('kind','managed_website','id',binding.id::text)),
      '{"kind":"provider_requested","providerName":"Strelva"}'::jsonb,
      array['request_changes'],array['managed_website']
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_responsibility_invalid', 'a provider request cannot omit its provider kind');

  update public.tenants set id='offering-website-renamed',site_name='Renamed Website A'
    where stable_id='99000000-0000-4000-8000-000000000020';
  snapshot := public.read_offering_business_snapshot(
    business_id,owner_id,'offering-website-owner@example.com',installed.id
  );
  perform pg_temp.assert_true(
    snapshot->'websiteBindings'->0->>'tenant_id'='offering-website-renamed'
      and snapshot->'websiteBindings'->0->>'site_name'='Renamed Website A'
      and snapshot->'installations'->0->>'id'=installed.id::text,
    'snapshots resolve current tenant labels from immutable identity and keep the requested installation business-scoped'
  );

  caught := null;
  begin
    perform public.revoke_offering_website_binding(
      business_id,binding.id,owner_id,'offering-website-owner@example.com',null::bigint,'missing revision'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_website_revision_conflict', 'a null expected revision cannot bypass compare-and-swap');

  caught := null;
  begin
    perform public.revoke_offering_website_binding(
      business_id,binding.id,owner_id,'offering-website-owner@example.com',2,'stale command'
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_website_revision_conflict', 'attachment revocation uses compare-and-swap');

  select count(*) into membership_count from public.memberships
    where tenant_stable_id='99000000-0000-4000-8000-000000000020';
  select * into binding from public.revoke_offering_website_binding(
    business_id,binding.id,owner_id,'offering-website-owner@example.com',1,'Website left this business'
  );
  perform pg_temp.assert_true(
    binding.status='revoked' and binding.revision=2
      and (select count(*) from public.memberships where tenant_stable_id='99000000-0000-4000-8000-000000000020')=membership_count
      and exists(select 1 from public.offering_installations where id=installed.id),
    'revocation retains installation history and never changes tenant permissions'
  );
  caught := null;
  begin
    perform public.install_offering(
      business_id,owner_id,'offering-website-owner@example.com',
      'managed_website_changes','1.0.0','website-offering:revoked',repeat('f',64),
      '{}'::jsonb,jsonb_build_array(jsonb_build_object('kind','managed_website','id',binding.id::text)),
      '{"kind":"customer_operated","providerName":"Website business"}'::jsonb,
      array['request_changes'],array['managed_website']
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_native_resource_outside_business', 'revoked attachments cannot authorize another installation');

  delete from public.memberships where tenant_stable_id='99000000-0000-4000-8000-000000000020';
  delete from public.tenants where stable_id='99000000-0000-4000-8000-000000000020';
  snapshot := public.read_offering_business_snapshot(
    business_id,owner_id,'offering-website-owner@example.com',installed.id
  );
  perform pg_temp.assert_true(
    exists(select 1 from public.offering_website_bindings where id=binding.id and tenant_stable_id is null)
      and snapshot->'websiteBindings'->0->>'tenant_id'='offering-website-a'
      and (snapshot->'websiteBindings'->0->>'tenant_active')::boolean is false,
    'tenant deprovision keeps an unavailable binding tombstone without blocking the existing delete path'
  );
end; $$;

select 'offering website checks passed' as result;
