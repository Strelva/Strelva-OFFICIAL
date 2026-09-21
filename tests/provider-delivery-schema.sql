\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'assertion failed: %', message; end if; end;
$$;

select pg_temp.assert_true(
  not has_table_privilege('authenticated','public.offering_provider_deliveries','SELECT')
  and not has_function_privilege('authenticated','public.accept_provider_delivery(uuid,text,uuid)','EXECUTE'),
  'provider delivery remains behind actor-checked server functions'
);

insert into public.users(id,email,verified_at) values
 ('98000000-0000-4000-8000-000000000001','provider-delivery-owner@example.com',now()),
 ('98000000-0000-4000-8000-000000000002','provider-delivery-staff@example.com',now()),
 ('98000000-0000-4000-8000-000000000003','provider-delivery-member@example.com',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('98000000-0000-4000-8000-000000000010','customer','Provider delivery business','98000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('98000000-0000-4000-8000-000000000010','98000000-0000-4000-8000-000000000001','owner','98000000-0000-4000-8000-000000000001'),
 ('98000000-0000-4000-8000-000000000010','98000000-0000-4000-8000-000000000002','member','98000000-0000-4000-8000-000000000001'),
 ('98000000-0000-4000-8000-000000000010','98000000-0000-4000-8000-000000000003','member','98000000-0000-4000-8000-000000000001');
insert into public.super_admins(user_id,email)
 values('98000000-0000-4000-8000-000000000002','provider-delivery-staff@example.com');

do $$
declare
  owner_id uuid := '98000000-0000-4000-8000-000000000001';
  provider_id uuid := '98000000-0000-4000-8000-000000000002';
  business_id uuid := '98000000-0000-4000-8000-000000000010';
  target_id uuid := gen_random_uuid();
  responsibility public.saved_product_work;
  assigned public.operational_assignments;
  installation public.offering_installations;
  delivery public.offering_provider_deliveries;
  replay public.offering_provider_deliveries;
  payload jsonb;
  caught text;
  expiry timestamptz := clock_timestamp()+interval '1 day';
begin
  payload := jsonb_build_object(
    'version',1,'revision',1,'title','Deliver the approved workflow','intent','Apply one exact local check.',
    'ownerId',owner_id::text,'approvedBy',owner_id::text,'approvedAt',clock_timestamp(),
    'status','ready','createdAt',clock_timestamp(),'updatedAt',clock_timestamp(),
    'steps',jsonb_build_array(jsonb_build_object(
      'id','deliver','operation','application.command','workId',target_id::text,
      'input',jsonb_build_object('kind','rehearse','expectedRevision',0),
      'dependsOn',jsonb_build_array(),'maximumCents',0,'capabilityVersion',1,'status','pending','attempt',0
    )),'history',jsonb_build_array()
  );
  insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
    values(business_id,'operations','responsibility','Deliver the approved workflow',payload,owner_id)
    returning * into responsibility;
  caught:=null;
  begin
    perform public.offer_operational_assignment(
      owner_id,'provider-delivery-owner@example.com',responsibility.id,'provider-delivery-member@example.com','strelva',expiry,'false-strelva-offer'
    );
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='operational_assignment_denied','a caller-selected Strelva label does not grant provider identity');
  select * into assigned from public.offer_operational_assignment(
    owner_id,'provider-delivery-owner@example.com',responsibility.id,'provider-delivery-staff@example.com','strelva',expiry,'provider-delivery-offer'
  );

  insert into public.offering_installations(
    business_workspace_id,definition_id,definition_version,status,configuration,native_resources,
    responsibility,accepted_scope,surface_ids,idempotency_key,command_digest,installed_by,updated_by
  ) values (
    business_id,'private_staff_requests','1.0.0','active','{}',jsonb_build_array(jsonb_build_object('kind','application','id',target_id::text)),
    '{"kind":"provider_requested","providerKind":"strelva","providerName":"Strelva","requestNote":"Deliver only the approved workflow."}',
    array['submit_requests','review_requests'],array['staff_app','business_workspace'],
    'provider-delivery-install',repeat('d',64),owner_id,owner_id
  ) returning * into installation;

  select * into delivery from public.request_provider_delivery(
    owner_id,'provider-delivery-owner@example.com',business_id,installation.id,assigned.id,
    'provider-delivery-request',repeat('a',64)
  );
  perform pg_temp.assert_true(delivery.status='requested' and delivery.accepted_by is null
    and delivery.history->0->>'kind'='requested','customer request remains pending');
  select * into replay from public.request_provider_delivery(
    owner_id,'provider-delivery-owner@example.com',business_id,installation.id,assigned.id,
    'provider-delivery-request',repeat('a',64)
  );
  perform pg_temp.assert_true(replay.id=delivery.id and replay.revision=1,'exact request retry returns the original delivery');
  caught:=null;
  begin
    perform public.accept_provider_delivery(owner_id,'provider-delivery-owner@example.com',delivery.id);
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='provider_delivery_denied','customer cannot accept on behalf of provider');

  update public.super_admins set revoked_at=clock_timestamp() where user_id=provider_id;
  select * into assigned from public.accept_operational_assignment(provider_id,'provider-delivery-staff@example.com',assigned.id);
  caught:=null;
  begin
    perform public.accept_provider_delivery(provider_id,'provider-delivery-staff@example.com',delivery.id);
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='provider_delivery_denied','revoked internal staff cannot accept provider delivery');
  update public.super_admins set revoked_at=null where user_id=provider_id;
  select * into delivery from public.accept_provider_delivery(provider_id,'provider-delivery-staff@example.com',delivery.id);
  perform pg_temp.assert_true(delivery.status='accepted' and delivery.accepted_by=provider_id
    and delivery.customer_decision='pending','exact Strelva assignee explicitly accepts');
  select * into replay from public.accept_provider_delivery(provider_id,'provider-delivery-staff@example.com',delivery.id);
  perform pg_temp.assert_true(replay.id=delivery.id and replay.revision=delivery.revision,'provider acceptance retry is stable');

  caught:=null;
  begin
    perform public.decide_provider_delivery(owner_id,'provider-delivery-owner@example.com',delivery.id,delivery.revision,'confirmed','Already useful.');
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='provider_delivery_work_incomplete','customer cannot confirm incomplete assigned work');
  update public.saved_product_work work
    set payload=jsonb_set(work.payload,'{status}','"completed"') where work.id=responsibility.id;
  select * into delivery from public.decide_provider_delivery(
    owner_id,'provider-delivery-owner@example.com',delivery.id,delivery.revision,'confirmed','The workflow is in use.'
  );
  perform pg_temp.assert_true(delivery.customer_decision='confirmed'
    and delivery.history->2->>'kind'='confirmed','customer confirmation remains a separate durable event');

  -- A second request proves revocation closes assignment authority first while
  -- preserving the customer request and provider history.
  payload:=jsonb_set(payload,'{status}','"ready"');
  payload:=jsonb_set(payload,'{revision}','2');
  insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by)
    values(business_id,'operations','responsibility','Second delivery',payload,owner_id)
    returning * into responsibility;
  select * into assigned from public.offer_operational_assignment(
    owner_id,'provider-delivery-owner@example.com',responsibility.id,'provider-delivery-staff@example.com','strelva',expiry,'provider-delivery-revoke-offer'
  );
  select * into delivery from public.request_provider_delivery(
    owner_id,'provider-delivery-owner@example.com',business_id,installation.id,assigned.id,
    'provider-delivery-revoke',repeat('b',64)
  );
  select * into assigned from public.accept_operational_assignment(provider_id,'provider-delivery-staff@example.com',assigned.id);
  select * into delivery from public.accept_provider_delivery(provider_id,'provider-delivery-staff@example.com',delivery.id);
  caught:=null;
  begin
    perform public.revoke_provider_delivery(
      owner_id,'provider-delivery-owner@example.com',delivery.id,delivery.revision-1,'Stale customer screen.'
    );
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='provider_delivery_revision_conflict'
    and (select status from public.operational_assignments where id=assigned.id)='accepted',
    'stale revoke leaves accepted operational authority unchanged');
  perform public.revoke_operational_assignment(owner_id,'provider-delivery-owner@example.com',assigned.id);
  select * into delivery from public.revoke_provider_delivery(
    owner_id,'provider-delivery-owner@example.com',delivery.id,delivery.revision,'Customer stopped delivery.'
  );
  perform pg_temp.assert_true(delivery.status='revoked' and delivery.accepted_by=provider_id
    and delivery.accepted_at is not null and jsonb_array_length(delivery.history)=3
    and delivery.history->0->>'kind'='requested' and delivery.history->1->>'kind'='accepted'
    and delivery.history->2->>'kind'='revoked','revocation after acceptance preserves provider history');
  caught:=null;
  begin
    perform public.accept_provider_delivery(provider_id,'provider-delivery-staff@example.com',delivery.id);
  exception when others then caught:=sqlerrm; end;
  perform pg_temp.assert_true(caught='provider_delivery_denied','revoked delivery cannot be accepted or executed');
end $$;
