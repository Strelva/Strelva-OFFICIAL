\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end;
$$;

select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.service_requests', 'SELECT')
  and not has_table_privilege('authenticated', 'public.service_request_commands', 'SELECT')
  and not has_function_privilege('authenticated', 'public.save_service_request(uuid,text,uuid,uuid,bigint,text,text,text,jsonb,text[],jsonb,text,text)', 'EXECUTE'),
  'service request records remain behind actor-checked server functions'
);

insert into public.users(id,email,verified_at) values
 ('a9000000-0000-4000-8000-000000000001','service-owner@example.test',now()),
 ('a9000000-0000-4000-8000-000000000002','service-member@example.test',now()),
 ('a9000000-0000-4000-8000-000000000003','service-agency@example.test',now()),
 ('a9000000-0000-4000-8000-000000000004','service-outsider@example.test',now()),
 ('a9000000-0000-4000-8000-000000000005','service-strelva@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('a9000000-0000-4000-8000-000000000010','customer','Service request business','a9000000-0000-4000-8000-000000000001'),
 ('a9000000-0000-4000-8000-000000000011','agency','Eligible agency','a9000000-0000-4000-8000-000000000003'),
 ('a9000000-0000-4000-8000-000000000012','personal','Not an agency','a9000000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('a9000000-0000-4000-8000-000000000010','a9000000-0000-4000-8000-000000000001','owner','a9000000-0000-4000-8000-000000000001'),
 ('a9000000-0000-4000-8000-000000000010','a9000000-0000-4000-8000-000000000002','member','a9000000-0000-4000-8000-000000000001'),
 ('a9000000-0000-4000-8000-000000000011','a9000000-0000-4000-8000-000000000003','owner','a9000000-0000-4000-8000-000000000003');
insert into public.super_admins(user_id,email)
 values ('a9000000-0000-4000-8000-000000000005','service-strelva@example.test');

do $$
declare
  business_id uuid := 'a9000000-0000-4000-8000-000000000010';
  agency_id uuid := 'a9000000-0000-4000-8000-000000000011';
  owner_id uuid := 'a9000000-0000-4000-8000-000000000001';
  member_id uuid := 'a9000000-0000-4000-8000-000000000002';
  agency_user_id uuid := 'a9000000-0000-4000-8000-000000000003';
  outsider_id uuid := 'a9000000-0000-4000-8000-000000000004';
  strelva_id uuid := 'a9000000-0000-4000-8000-000000000005';
  saved public.service_requests;
  replay public.service_requests;
  linked public.service_requests;
  app public.offering_installations;
  assignment public.operational_assignments;
  delivery public.offering_provider_deliveries;
  pending public.service_requests;
  responsibility_id uuid := gen_random_uuid();
  caught text;
begin
  select * into saved from public.save_service_request(
    owner_id,'service-owner@example.test',business_id,null,null,'draft',
    'Prepare a request flow','A private request form and review path.',
    '{"currentProcess":"email"}'::jsonb,array['prepare_request_flow']::text[],
    jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id::text),
    'service-request:draft',repeat('a',64)
  );
  perform pg_temp.assert_true(saved.status='draft' and saved.provider_kind='agency'
    and saved.provider_acceptance='pending' and saved.installation_id is null and saved.delivery_id is null,
    'draft stores need, scope, addressed agency and pending acceptance without installation');

  caught:=null;
  begin
    perform public.save_service_request(
      owner_id,'service-owner@example.test',business_id,null,null,'requested',
      'Address an ineligible workspace','A bounded review.','{}'::jsonb,array['review']::text[],
      jsonb_build_object('kind','agency','agencyWorkspaceId','a9000000-0000-4000-8000-000000000012'),
      'service-request:personal',repeat('9',64)
    );
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='service_request_provider_ineligible','a non-agency workspace cannot be selected as an agency provider');

  select * into replay from public.save_service_request(
    owner_id,'service-owner@example.test',business_id,null,null,'draft',
    'Prepare a request flow','A private request form and review path.',
    '{"currentProcess":"email"}'::jsonb,array['prepare_request_flow']::text[],
    jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id::text),
    'service-request:draft',repeat('a',64)
  );
  perform pg_temp.assert_true(replay.id=saved.id and (select count(*) from public.service_requests)=1,
    'same save key returns one durable request');

  caught:=null;
  begin
    perform public.save_service_request(
      owner_id,'service-owner@example.test',business_id,null,null,'draft',
      'Different request','Different outcome','{}'::jsonb,array['other']::text[],
      jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id::text),
      'service-request:draft',repeat('b',64)
    );
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='service_request_idempotency_conflict','a retry key cannot change the saved request');

  select * into saved from public.save_service_request(
    owner_id,'service-owner@example.test',business_id,saved.id,1,'requested',
    'Please handle the request flow','A private request form and review path.',
    '{"currentProcess":"email"}'::jsonb,array['prepare_request_flow']::text[],
    jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id::text),
    'service-request:submit',repeat('c',64)
  );
  perform pg_temp.assert_true(saved.status='requested' and saved.revision=2 and saved.provider_acceptance='pending',
    'submit makes the request reopenable without claiming provider acceptance');

  caught:=null;
  begin
    perform public.save_service_request(
      owner_id,'service-owner@example.test',business_id,saved.id,1,'requested',
      'Stale edit','Stale outcome','{}'::jsonb,array['stale']::text[],
      jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id::text),
      'service-request:stale',repeat('7',64)
    );
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='service_request_revision_conflict','stale request edits cannot overwrite current input');

  caught:=null;
  begin
    perform public.read_service_request(outsider_id,'service-outsider@example.test',saved.id);
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='service_request_provider_ineligible','an unrelated identity cannot read the provider request');

  select * into replay from public.read_service_request(agency_user_id,'service-agency@example.test',saved.id);
  perform pg_temp.assert_true(replay.id=saved.id and replay.provider_acceptance='pending' and replay.revision=2,
    'the addressed agency member can reopen a requested record without customer membership');

  select * into saved from public.save_service_request(
    owner_id,'service-owner@example.test',business_id,saved.id,2,'requested',
    'Updated request while provider was reviewing','The revised private request form and review path.',
    '{"currentProcess":"email","revisionNote":"clarified"}'::jsonb,array['prepare_request_flow']::text[],
    jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id::text),
    'service-request:provider-review-edit',repeat('8',64)
  );
  perform pg_temp.assert_true(saved.revision=3 and saved.provider_acceptance='pending',
    'a customer edit creates a new pending review revision');

  caught:=null;
  begin
    perform public.respond_service_request(outsider_id,'service-outsider@example.test',saved.id,3,'accepted',null,'service-request:accept-bad',repeat('d',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='service_request_provider_ineligible','an ineligible provider cannot accept');

  caught:=null;
  begin
    perform public.respond_service_request(agency_user_id,'service-agency@example.test',saved.id,2,'accepted',null,'service-request:accept-stale',repeat('e',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='service_request_revision_conflict'
    and (select provider_acceptance='pending' and revision=3 from public.service_requests where id=saved.id),
    'a provider cannot accept a stale request revision');

  select * into saved from public.respond_service_request(
    agency_user_id,'service-agency@example.test',saved.id,3,'accepted','We can review the scope.',
    'service-request:accept-agency',repeat('f',64)
  );
  perform pg_temp.assert_true(saved.provider_acceptance='accepted' and saved.accepted_by=agency_user_id
    and (select count(*) from public.workspace_delegations where customer_workspace_id=business_id)=0,
    'agency acceptance records an explicit decision without granting workspace authority');

  -- A second request exercises the internal Strelva path and delivery linkage.
  select * into saved from public.save_service_request(
    owner_id,'service-owner@example.test',business_id,null,null,'requested',
    'Have Strelva prepare the flow','A private request form and review path.',
    '{"currentProcess":"email"}'::jsonb,array['submit_requests','review_requests']::text[],
    '{"kind":"strelva"}'::jsonb,'service-request:strelva',repeat('f',64)
  );
  select * into saved from public.respond_service_request(
    strelva_id,'service-strelva@example.test',saved.id,1,'accepted',null,
    'service-request:strelva-accept',repeat('1',64)
  );
  perform pg_temp.assert_true(saved.provider_acceptance='accepted' and saved.installation_id is null and saved.delivery_id is null,
    'provider acceptance before installation creates no authority or execution');
  select * into replay from public.respond_service_request(
    strelva_id,'service-strelva@example.test',saved.id,1,'accepted',null,
    'service-request:strelva-accept',repeat('1',64)
  );
  perform pg_temp.assert_true(replay.id=saved.id and replay.revision=saved.revision and replay.provider_acceptance='accepted',
    'provider response retry returns the one accepted request');

  insert into public.saved_product_work(
    id,workspace_id,product_id,resource_kind,title,payload,created_by
  ) values (
    responsibility_id,business_id,'operations','responsibility','Approved request flow',
    jsonb_build_object('version',1,'revision',1,'title','Approved request flow','intent','Prepare one exact flow.',
      'ownerId',owner_id::text,'approvedBy',owner_id::text,'approvedAt',clock_timestamp(),'status','completed',
      'steps',jsonb_build_array(),'history',jsonb_build_array()),owner_id
  );
  insert into public.operational_assignments(
    id,workspace_id,work_id,sponsor_id,sponsor_email,assignee_user_id,assignee_email,assignee_kind,
    offer_key,work_scope,status,expires_at,accepted_at
  ) values (
    'a9000000-0000-4000-8000-000000000020',business_id,responsibility_id,owner_id,'service-owner@example.test',
    strelva_id,'service-strelva@example.test','strelva','service-request-assignment',
    '{"scope":"prepare_request_flow"}'::jsonb,'accepted',clock_timestamp()+interval '1 day',clock_timestamp()
  ) returning * into assignment;
  insert into public.offering_installations(
    id,business_workspace_id,definition_id,definition_version,status,configuration,native_resources,
    responsibility,accepted_scope,surface_ids,idempotency_key,command_digest,installed_by,updated_by
  ) values (
    'a9000000-0000-4000-8000-000000000021',business_id,'private_staff_requests','1.0.0','active','{}'::jsonb,
    jsonb_build_array(jsonb_build_object('kind','application','id',responsibility_id::text)),
    '{"kind":"provider_requested","providerKind":"strelva","providerName":"Strelva"}'::jsonb,
    array['submit_requests','review_requests'],array['staff_app','business_workspace'],
    'service-request-install',repeat('2',64),owner_id,owner_id
  ) returning * into app;
  insert into public.offering_provider_deliveries(
    id,business_workspace_id,installation_id,assignment_id,status,scope,idempotency_key,command_digest,
    requested_by,expires_at,accepted_by,accepted_at,history
  ) values (
    'a9000000-0000-4000-8000-000000000022',business_id,app.id,assignment.id,'accepted',
    array['submit_requests','review_requests'],'service-request-delivery',repeat('3',64),owner_id,clock_timestamp()+interval '1 day',
    strelva_id,clock_timestamp(),jsonb_build_array(jsonb_build_object('kind','requested','actorId',owner_id::text,'at',clock_timestamp()),jsonb_build_object('kind','accepted','actorId',strelva_id::text,'at',clock_timestamp()))
  ) returning * into delivery;

  select * into pending from public.save_service_request(
    owner_id,'service-owner@example.test',business_id,null,null,'requested',
    'Wait for provider acceptance','A private request form and review path.',
    '{}'::jsonb,array['prepare_request_flow']::text[],
    '{"kind":"strelva"}'::jsonb,'service-request:pending-link',repeat('8',64)
  );
  caught:=null;
  begin
    perform public.link_service_request_delivery(owner_id,'service-owner@example.test',business_id,pending.id,app.id,delivery.id,1,'service-request:pending-link-attempt',repeat('9',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='service_request_delivery_not_ready','requested work cannot link delivery before provider acceptance');

  caught:=null;
  begin
    perform public.link_service_request_delivery(owner_id,'service-owner@example.test',business_id,saved.id,app.id,'a9000000-0000-4000-8000-000000000099'::uuid,2,'service-request-link-missing',repeat('4',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='service_request_delivery_missing','a request cannot claim a delivery that is not persisted');

  -- The request above is accepted and the installation/delivery are now live.
  select * into linked from public.link_service_request_delivery(
    owner_id,'service-owner@example.test',business_id,saved.id,app.id,delivery.id,2,
    'service-request-link',repeat('5',64)
  );
  perform pg_temp.assert_true(linked.installation_id=app.id and linked.delivery_id=delivery.id,
    'accepted pre-install request can be tied to the existing accepted delivery');
  select * into replay from public.link_service_request_delivery(
    owner_id,'service-owner@example.test',business_id,saved.id,app.id,delivery.id,3,
    'service-request-link',repeat('5',64)
  );
  perform pg_temp.assert_true(replay.id=linked.id and replay.revision=linked.revision,
    'delivery-link retry is idempotent after the response is lost');

  caught:=null;
  begin
    perform public.link_service_request_delivery(member_id,'service-member@example.test',business_id,saved.id,app.id,delivery.id,3,'service-request-link-unauthorized',repeat('6',64));
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='service_request_access_denied','ordinary business members cannot link service delivery');
end $$;

select 'service request checks passed' as result;
