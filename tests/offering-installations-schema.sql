\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$ begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end; $$;

select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.install_offering(uuid,uuid,text,text,text,text,text,jsonb,jsonb,jsonb,text[],text[])', 'EXECUTE')
    and has_function_privilege('service_role', 'public.prepare_staff_request_offering(uuid,uuid,text,text,text,jsonb,jsonb,text[],text[])', 'EXECUTE')
    and has_function_privilege('service_role', 'public.activate_offering(uuid,uuid,uuid,text,bigint)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.update_offering_configuration(uuid,uuid,uuid,text,bigint,jsonb)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.retire_offering(uuid,uuid,uuid,text,bigint,text)', 'EXECUTE'),
  'service role must use the offering command functions'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.install_offering(uuid,uuid,text,text,text,text,text,jsonb,jsonb,jsonb,text[],text[])', 'EXECUTE')
    and not has_function_privilege('anon', 'public.install_offering(uuid,uuid,text,text,text,text,text,jsonb,jsonb,jsonb,text[],text[])', 'EXECUTE'),
  'browser roles must not install offerings directly'
);
select pg_temp.assert_true(
  not has_table_privilege('service_role', 'public.offering_installations', 'SELECT')
    and not has_table_privilege('service_role', 'public.offering_installations', 'INSERT')
    and not has_table_privilege('service_role', 'public.offering_installations', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.offering_installations', 'SELECT'),
  'table writes must remain behind actor-checked functions'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.read_offering_installations(uuid,uuid,text,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.read_offering_installations(uuid,uuid,text,uuid)', 'EXECUTE'),
  'reads must remain behind the actor-bearing snapshot function'
);
select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid = 'public.offering_installations'::regclass),
  'offering installations must have RLS enabled'
);

insert into public.users(id,email,verified_at) values
 ('95000000-0000-4000-8000-000000000001','offering-owner@example.com',now()),
 ('95000000-0000-4000-8000-000000000002','offering-member@example.com',now()),
 ('95000000-0000-4000-8000-000000000003','offering-foreign-owner@example.com',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('95000000-0000-4000-8000-000000000010','customer','Offering business','95000000-0000-4000-8000-000000000001'),
 ('95000000-0000-4000-8000-000000000011','customer','Foreign business','95000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('95000000-0000-4000-8000-000000000010','95000000-0000-4000-8000-000000000001','owner','95000000-0000-4000-8000-000000000001'),
 ('95000000-0000-4000-8000-000000000010','95000000-0000-4000-8000-000000000002','member','95000000-0000-4000-8000-000000000001'),
 ('95000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000003','owner','95000000-0000-4000-8000-000000000003');

do $$
declare
  owner_id uuid := '95000000-0000-4000-8000-000000000001';
  member_id uuid := '95000000-0000-4000-8000-000000000002';
  foreign_owner_id uuid := '95000000-0000-4000-8000-000000000003';
  business_id uuid := '95000000-0000-4000-8000-000000000010';
  foreign_business_id uuid := '95000000-0000-4000-8000-000000000011';
  app_id uuid := '95000000-0000-4000-8000-000000000020';
  foreign_app_id uuid := '95000000-0000-4000-8000-000000000021';
  spec jsonb := '{"title":"Staff requests","maintenanceOwner":"95000000-0000-4000-8000-000000000001","fields":[{"id":"request","label":"Request","type":"text","required":true}],"components":[{"kind":"form","fields":["request"]},{"kind":"list","fields":["request"]}]}';
  foreign_spec jsonb := '{"title":"Foreign requests","maintenanceOwner":"95000000-0000-4000-8000-000000000003","fields":[{"id":"request","label":"Request","type":"text","required":true}],"components":[{"kind":"form","fields":["request"]},{"kind":"list","fields":["request"]}]}';
  installed public.offering_installations%rowtype;
  replay public.offering_installations%rowtype;
  configured public.offering_installations%rowtype;
  retired public.offering_installations%rowtype;
  original_resources jsonb;
  original_responsibility jsonb;
  original_scope text[];
  prepared public.offering_installations%rowtype;
  activated public.offering_installations%rowtype;
  prepared_app_id uuid;
  read_row record;
  caught text;
begin
  insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
    (app_id,business_id,'applications','application','Staff requests',jsonb_build_object(
      'version',1,'revision',0,'title','Staff requests','spec',spec,'specVersion',1,'status','draft',
      'versions',jsonb_build_array(jsonb_build_object('version',1,'spec',spec)),
      'rehearsal',null,'records','[]'::jsonb,'history','[]'::jsonb),owner_id),
    (foreign_app_id,foreign_business_id,'applications','application','Foreign requests',jsonb_build_object(
      'version',1,'revision',0,'title','Foreign requests','spec',foreign_spec,'specVersion',1,'status','draft',
      'versions',jsonb_build_array(jsonb_build_object('version',1,'spec',foreign_spec)),
      'rehearsal',null,'records','[]'::jsonb,'history','[]'::jsonb),foreign_owner_id);
  perform public.rehearse_application_candidate(app_id,business_id,owner_id,'offering-owner@example.com',0);
  perform public.publish_application_candidate(app_id,business_id,owner_id,'offering-owner@example.com',0,0);
  perform public.rehearse_application_candidate(foreign_app_id,foreign_business_id,foreign_owner_id,'offering-foreign-owner@example.com',0);
  perform public.publish_application_candidate(foreign_app_id,foreign_business_id,foreign_owner_id,'offering-foreign-owner@example.com',0,0);

  caught := null;
  begin
    perform public.install_offering(
      business_id,owner_id,'offering-owner@example.com',
      'private_staff_requests','1.0.0',null,repeat('0',64),'{}'::jsonb,
      jsonb_build_array(jsonb_build_object('kind','application','id',app_id::text)),
      '{"kind":"customer_operated","providerName":"Offering business"}'::jsonb,
      array['submit_requests','review_requests'],array['staff_app','business_workspace']
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_idempotency_invalid', 'a null idempotency key is rejected at the command boundary');

  caught := null;
  begin
    perform public.install_offering(
      business_id,owner_id,'offering-owner@example.com',
      'private_staff_requests','1.0.0','install:invalid-responsibility',repeat('0',64),'{}'::jsonb,
      jsonb_build_array(jsonb_build_object('kind','application','id',app_id::text)),
      '{"kind":"customer_operated"}'::jsonb,
      array['submit_requests','review_requests'],array['staff_app','business_workspace']
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_responsibility_invalid', 'responsibility metadata requires its provider name');

  select * into installed from public.install_offering(
    business_id, owner_id, 'offering-owner@example.com',
    'private_staff_requests', '1.0.0', 'install:first', repeat('a',64),
    '{"displayName":"Staff help"}'::jsonb,
    jsonb_build_array(jsonb_build_object('kind','application','id',app_id::text)),
    '{"kind":"customer_operated","providerName":"Offering business"}'::jsonb,
    array['submit_requests','review_requests'], array['staff_app','business_workspace']
  );
  original_resources := installed.native_resources;
  original_responsibility := installed.responsibility;
  original_scope := installed.accepted_scope;
  perform pg_temp.assert_true(installed.status='active' and installed.revision=1, 'install creates one active versioned record');

  select * into replay from public.install_offering(
    business_id, owner_id, 'offering-owner@example.com',
    'private_staff_requests', '1.0.0', 'install:first', repeat('a',64),
    '{"displayName":"Staff help"}'::jsonb,
    jsonb_build_array(jsonb_build_object('kind','application','id',app_id::text)),
    '{"kind":"customer_operated","providerName":"Offering business"}'::jsonb,
    array['submit_requests','review_requests'], array['staff_app','business_workspace']
  );
  perform pg_temp.assert_true(replay.id=installed.id and (select count(*) from public.offering_installations where business_workspace_id=business_id)=1, 'idempotent install returns the original record');

  caught := null;
  begin
    perform public.install_offering(
      business_id, owner_id, 'offering-owner@example.com',
      'private_staff_requests', '1.0.0', 'install:first', repeat('b',64),
      '{}'::jsonb, jsonb_build_array(jsonb_build_object('kind','application','id',app_id::text)),
      '{"kind":"customer_operated","providerName":"Offering business"}'::jsonb,
      array['submit_requests','review_requests'], array['staff_app','business_workspace']
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_idempotency_conflict', 'one idempotency key cannot name another command');

  caught := null;
  begin
    perform public.install_offering(
      business_id, owner_id, 'offering-owner@example.com',
      'private_staff_requests', '1.0.0', 'install:foreign', repeat('c',64),
      '{}'::jsonb, jsonb_build_array(jsonb_build_object('kind','application','id',foreign_app_id::text)),
      '{"kind":"customer_operated","providerName":"Offering business"}'::jsonb,
      array['submit_requests','review_requests'], array['staff_app','business_workspace']
    );
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_native_resource_outside_business', 'an installation cannot attach another business resource');

  caught := null;
  begin
    perform public.update_offering_configuration(business_id,installed.id,member_id,'offering-member@example.com',1,'{}'::jsonb);
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_manage_membership_required', 'ordinary members cannot configure offerings');

  select * into configured from public.update_offering_configuration(
    business_id,installed.id,owner_id,'offering-owner@example.com',1,
    '{"displayName":"Staff requests","instructions":"Display-only offering note"}'::jsonb
  );
  perform pg_temp.assert_true(configured.revision=2 and configured.configuration->>'displayName'='Staff requests', 'configuration uses a revision check');
  caught := null;
  begin
    perform public.update_offering_configuration(business_id,installed.id,owner_id,'offering-owner@example.com',null,'{}'::jsonb);
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_revision_conflict', 'a null configuration revision cannot bypass compare-and-swap');
  caught := null;
  begin
    perform public.update_offering_configuration(business_id,installed.id,owner_id,'offering-owner@example.com',1,'{}'::jsonb);
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_revision_conflict', 'stale configuration cannot overwrite a newer revision');

  delete from public.workspace_memberships where workspace_id=business_id and user_id=owner_id;
  caught := null;
  begin
    perform public.retire_offering(business_id,installed.id,owner_id,'offering-owner@example.com',2,'No longer needed');
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_business_membership_required', 'every command rechecks current business membership');
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
    values (business_id,owner_id,'owner',owner_id);

  caught := null;
  begin
    perform public.retire_offering(business_id,installed.id,owner_id,'offering-owner@example.com',null,'No longer needed');
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_revision_conflict', 'a null retirement revision cannot bypass compare-and-swap');
  caught := null;
  begin
    perform public.retire_offering(business_id,installed.id,owner_id,'offering-owner@example.com',2,null);
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_retirement_reason_invalid', 'retirement requires an explicit reason');

  select * into retired from public.retire_offering(
    business_id,installed.id,owner_id,'offering-owner@example.com',2,'No longer needed'
  );
  perform pg_temp.assert_true(
    retired.status='retired' and retired.revision=3
      and retired.native_resources=original_resources
      and retired.responsibility=original_responsibility
      and retired.accepted_scope=original_scope
      and retired.configuration=configured.configuration
      and (select lifecycle_status from public.application_states where work_id=app_id)='installed',
    'retirement retains installation and native application data'
  );

  caught := null;
  begin
    perform public.update_offering_configuration(business_id,installed.id,owner_id,'offering-owner@example.com',3,'{}'::jsonb);
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_installation_retired', 'retired installations cannot be changed');

  select * into prepared from public.prepare_staff_request_offering(
    business_id, owner_id, 'offering-owner@example.com',
    'install:default-template', repeat('d',64),
    '{"displayName":"Staff request setup"}'::jsonb,
    '{"kind":"customer_operated","providerName":"Offering business"}'::jsonb,
    array['submit_requests','review_requests'], array['staff_app','business_workspace']
  );
  prepared_app_id := (prepared.native_resources->0->>'id')::uuid;
  perform pg_temp.assert_true(
    prepared.status='draft'
      and (select count(*) from public.saved_product_work where id=prepared_app_id and workspace_id=business_id and product_id='applications')=1
      and (select lifecycle_status from public.application_states where work_id=prepared_app_id)='draft',
    'default setup atomically creates one native application draft and one bound installation'
  );
  select * into replay from public.prepare_staff_request_offering(
    business_id, owner_id, 'offering-owner@example.com',
    'install:default-template', repeat('d',64),
    '{"displayName":"Staff request setup"}'::jsonb,
    '{"kind":"customer_operated","providerName":"Offering business"}'::jsonb,
    array['submit_requests','review_requests'], array['staff_app','business_workspace']
  );
  perform pg_temp.assert_true(
    replay.id=prepared.id and (select count(*) from public.saved_product_work where id=prepared_app_id)=1,
    'default setup retry returns the same application and installation without an orphan'
  );
  caught := null;
  begin
    perform public.activate_offering(business_id,prepared.id,owner_id,'offering-owner@example.com',null);
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_revision_conflict', 'a null activation revision cannot bypass compare-and-swap');
  caught := null;
  begin
    perform public.activate_offering(business_id,prepared.id,owner_id,'offering-owner@example.com',1);
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_native_release_required', 'a draft offering cannot become usable before native publication');

  perform public.rehearse_application_candidate(prepared_app_id,business_id,owner_id,'offering-owner@example.com',0);
  perform public.publish_application_candidate(prepared_app_id,business_id,owner_id,'offering-owner@example.com',0,0);
  select * into activated from public.activate_offering(
    business_id,prepared.id,owner_id,'offering-owner@example.com',1
  );
  perform pg_temp.assert_true(activated.status='active' and activated.revision=2, 'activation follows the successful native release');

  select * into read_row from public.read_offering_installations(
    business_id,member_id,'offering-member@example.com',activated.id
  );
  perform pg_temp.assert_true(
    read_row.workspace_role='member' and read_row.installation->>'id'=activated.id::text
      and not (read_row.installation ? 'command_digest') and not (read_row.installation ? 'idempotency_key'),
    'actor-bearing reads return only the requested business installation and omit replay secrets'
  );
  delete from public.workspace_memberships where workspace_id=business_id and user_id=member_id;
  caught := null;
  begin
    perform public.read_offering_installations(business_id,member_id,'offering-member@example.com',activated.id);
  exception when others then caught := sqlerrm; end;
  perform pg_temp.assert_true(caught='offering_business_membership_required', 'read snapshots recheck current membership');
end; $$;

select 'offering installation checks passed' as result;
