\set ON_ERROR_STOP on

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.grant_agency_managed_website_draft_edit(uuid,text,uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.execute_agency_managed_website_draft(uuid,text,uuid,uuid,text)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.execute_agency_managed_website_draft(uuid,text,uuid,uuid,text)', 'EXECUTE'),
  'website draft authority stays behind the actor-bearing service boundary'
);
select pg_temp.assert_true(
  (select relrowsecurity from pg_class where oid='public.agency_managed_website_draft_grants'::regclass)
    and (select relrowsecurity from pg_class where oid='public.agency_managed_website_draft_revisions'::regclass)
    and (select relrowsecurity from pg_class where oid='public.agency_managed_website_draft_preparations'::regclass),
  'website draft grants, preparations, and revisions keep RLS enabled'
);

create table if not exists public.content (
  tenant_id text not null,
  section text not null,
  data jsonb not null default '{}'::jsonb,
  primary key (tenant_id, section)
);
create table if not exists public.draft_content (
  tenant_id text not null,
  section text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_id, section)
);

DO $$
declare
  owner_id uuid := 'a4021400-0000-4000-8000-000000000001';
  operator_id uuid := 'a4021400-0000-4000-8000-000000000002';
  outsider_id uuid := 'a4021400-0000-4000-8000-000000000003';
  customer_id uuid := 'a4021400-0000-4000-8000-000000000010';
  agency_id uuid := 'a4021400-0000-4000-8000-000000000011';
  binding_id uuid := 'a4021400-0000-4000-8000-000000000020';
  installation_value uuid := 'a4021400-0000-4000-8000-000000000021';
  responsibility_id uuid := 'a4021400-0000-4000-8000-000000000030';
  request_id uuid := 'a4021400-0000-4000-8000-000000000031';
  delivery_value uuid;
  assignment public.operational_assignments%rowtype;
  delivery public.offering_provider_deliveries%rowtype;
  grant_row public.agency_managed_website_draft_grants%rowtype;
  prep_row public.agency_managed_website_draft_preparations%rowtype;
  revision_row record;
  state_row record;
  responsibility_payload jsonb;
  draft_data jsonb := jsonb_build_object(
    'headline', 'A prepared website draft',
    'subheadline', 'Ready for customer review',
    'tagline', 'Prepared by the named agency operator',
    'ctaText', 'Learn more',
    'ctaLink', '/about',
    'backgroundImageUrl', ''
  );
  expiry timestamptz := clock_timestamp() + interval '7 days';
  caught text;
  website_work uuid:='a4021400-0000-4000-8000-000000000050';
  doc jsonb:='{ "version":2,"siteName":"Agency scoped fictional","theme":{},"assets":{},"redirects":[],"pages":[],"nodes":{"hero":{"type":"Hero","props":{"title":"Original"},"children":["inner","leaf"],"factIds":["credential"]},"header":{"type":"Header","props":{"brand":"Original"},"children":[],"factIds":[]},"inner":{"type":"Hero","props":{},"children":["header"],"factIds":[]},"leaf":{"type":"Hero","props":{},"children":[],"factIds":[]},"container":{"type":"Section","props":{},"children":["hero"],"factIds":[]}},"facts":{"credential":{"text":"Owner confirmed credential","origin":"owner_confirmed","highRisk":true},"source":{"text":"Original sourced sentence","origin":"source","highRisk":false,"verification":{"supported":true,"confidence":1}}} }';
  edited jsonb;
  initial jsonb;
  next_payload jsonb;
  saved public.saved_product_work;
  access jsonb;
  saved_expiry timestamptz;
  commit_sql text;

begin
  insert into public.users(id, email, verified_at) values
    (owner_id, 'website-v2-draft-owner@example.test', clock_timestamp()),
    (operator_id, 'website-v2-draft-operator@example.test', clock_timestamp()),
    (outsider_id, 'website-v2-draft-outsider@example.test', clock_timestamp())
  on conflict (id) do update set email=excluded.email, verified_at=excluded.verified_at;
  insert into public.workspaces(id, kind, name, created_by) values
    (customer_id, 'customer', 'Website draft customer', owner_id),
    (agency_id, 'agency', 'Website draft agency', operator_id)
  on conflict (id) do nothing;
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
    (customer_id, owner_id, 'owner', owner_id),
    (agency_id, operator_id, 'member', operator_id)
  on conflict (workspace_id, user_id) do update set role=excluded.role;
  insert into public.tenants(id, stable_id, site_name, active, subscription_status) values
    ('website-v2-draft-a', binding_id, 'Website draft customer', true, 'active')
  on conflict (id) do update set stable_id=excluded.stable_id, site_name=excluded.site_name, active=true, subscription_status='active';
  insert into public.memberships(user_id, tenant_id, role, tenant_stable_id)
    values (owner_id, 'website-v2-draft-a', 'owner', binding_id)
    on conflict (user_id, tenant_id) do update set role='owner', tenant_stable_id=binding_id;
  insert into public.offering_website_bindings(
    id, business_workspace_id, tenant_stable_id, tenant_id_at_binding, site_name_at_binding,
    idempotency_key, command_digest, created_by, updated_by
  ) values (
    binding_id, customer_id, binding_id, 'website-v2-draft-a', 'Website draft customer',
    'website-v2-draft-binding', repeat('a', 64), owner_id, owner_id
  ) on conflict (id, business_workspace_id) do nothing;

  responsibility_payload := jsonb_build_object(
    'version', 1, 'revision', 0, 'title', 'Prepare the managed website draft',
    'intent', 'Save one customer-reviewed website revision',
    'ownerId', owner_id::text, 'approvedBy', owner_id::text, 'approvedAt', clock_timestamp(),
    'status', 'ready', 'createdAt', clock_timestamp(), 'updatedAt', clock_timestamp(),
    'history', '[]'::jsonb,
    'steps', jsonb_build_array(jsonb_build_object(
      'id', 'website-draft', 'operation', 'website.draft', 'workId', binding_id::text,
      'input', jsonb_build_object('kind', 'draft', 'bindingId', binding_id::text, 'section', 'hero'),
      'dependsOn', '[]'::jsonb, 'maximumCents', 0, 'capabilityVersion', 1,
      'status', 'pending', 'attempt', 0
    ))
  );
  insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by)
    values (responsibility_id, customer_id, 'operations', 'responsibility', 'Prepare the managed website draft', responsibility_payload, owner_id);
  insert into public.offering_installations(
    id, business_workspace_id, definition_id, definition_version, status, configuration, native_resources,
    responsibility, accepted_scope, surface_ids, idempotency_key, command_digest, installed_by, updated_by
  ) values (
    installation_value, customer_id, 'managed_website_changes', '1.0.0', 'active', '{}',
    jsonb_build_array(jsonb_build_object('kind', 'managed_website', 'id', binding_id::text)),
    jsonb_build_object('kind', 'provider_requested', 'providerKind', 'agency', 'providerName', 'Website draft agency', 'agencyWorkspaceId', agency_id::text),
    array['request_changes'], array['managed_website'], 'website-v2-draft-installation', repeat('b', 64), owner_id, owner_id
  );
  insert into public.service_requests(
    id, business_workspace_id, status, request_text, outcome, context, scope, provider_kind,
    provider_agency_workspace_id, provider_acceptance, accepted_by, accepted_at, created_by
  ) values (
    request_id, customer_id, 'requested', 'Prepare one website draft', 'A draft is ready for review', '{}',
    array['request_changes'], 'agency', agency_id, 'accepted', operator_id, clock_timestamp(), owner_id
  );

  select * into assignment from public.offer_agency_operational_assignment(
    owner_id, 'website-v2-draft-owner@example.test', responsibility_id, agency_id,
    'website-v2-draft-operator@example.test', 'agency', expiry, 'website-v2-draft-assignment'
  );
  select * into assignment from public.accept_operational_assignment(operator_id, 'website-v2-draft-operator@example.test', assignment.id);
  select * into delivery from public.request_provider_delivery(
    owner_id, 'website-v2-draft-owner@example.test', customer_id, installation_value,
    assignment.id, 'website-v2-draft-delivery', repeat('c', 64)
  );
  select * into delivery from public.accept_provider_delivery(operator_id, 'website-v2-draft-operator@example.test', delivery.id);
  delivery_value := delivery.id;
  perform pg_temp.assert_true(delivery.status='accepted' and assignment.status='accepted', 'website delivery and assignment are accepted');
  perform pg_temp.assert_true((select installation_id is null and delivery_id is null from public.service_requests where id=request_id), 'customer confirmation has not linked the accepted delivery yet');

  perform pg_temp.assert_true(
    (select count(*) from public.read_agency_managed_website_draft_edit(operator_id, 'website-v2-draft-operator@example.test', binding_id)) = 0,
    'accepted delivery does not imply website draft editing'
  );
  select * into grant_row from public.grant_agency_managed_website_draft_edit(
    owner_id, 'website-v2-draft-owner@example.test', delivery_value, binding_id
  );
  perform pg_temp.assert_true(grant_row.status='active' and grant_row.operator_user_id=operator_id, 'customer names the exact website operator');

  initial:=jsonb_build_object('version',2,'revision',0,'title','Agency scoped fictional','status','published','checkpoint',null,'lastError',null,'approvedCandidateRevision',1,'createdBy',owner_id,'createdAt','2026-10-01T12:00:00Z','history','[]'::jsonb,'tenantId','website-v2-draft-a','launch','{}'::jsonb,'candidate',jsonb_build_object('revision',1,'contentHash',repeat('a',64),'document',doc));
  insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values(website_work,customer_id,'websites','website','Agency scoped fictional',initial,owner_id);
  perform public.append_website_document(customer_id,website_work,owner_id,'website-v2-draft-owner@example.test',0,repeat('a',64),doc);
  perform public.approve_website_document(customer_id,website_work,owner_id,'website-v2-draft-owner@example.test',1,repeat('a',64));
  perform public.publish_website_document(customer_id,website_work,owner_id,'website-v2-draft-owner@example.test',1,repeat('a',64),'website-v2-draft-a',jsonb_build_object('status','published','provider','strelva-hosted','candidateRevision',1,'artifactHash',repeat('a',64)));
  access:=public.read_agency_website_document_candidate(operator_id,'website-v2-draft-operator@example.test',binding_id);
  perform pg_temp.assert_true(access->'work'->>'id'=website_work::text and access->>'section'='hero' and access->'sections'='["hero"]'::jsonb,'native grant discovers exact published catalog work and accepted scope');
  begin perform public.read_agency_website_document_candidate(operator_id,'website-v2-draft-operator@example.test',binding_id,website_work,'document'); raise exception 'unknown section accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  begin perform public.read_agency_website_document_candidate(operator_id,'website-v2-draft-operator@example.test',binding_id,responsibility_id); raise exception 'wrong work accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  edited:=jsonb_set(doc,'{nodes,hero,props,title}','"Agency draft"');
  next_payload:=initial||jsonb_build_object('revision',1,'status','review_ready','approvedCandidateRevision',null,'candidate',jsonb_build_object('revision',2,'contentHash',repeat('b',64),'document',edited),'history',jsonb_build_array(jsonb_build_object('revision',1,'kind','agency_patch','actorId',operator_id,'at','2026-10-01T12:01:00Z')));
  select * into saved from public.commit_agency_website_document_candidate(operator_id,'website-v2-draft-operator@example.test',binding_id,website_work,'hero',0,1,1,repeat('a',64),repeat('b',64),edited,next_payload);
  perform pg_temp.assert_true(saved.payload->>'revision'='1' and saved.payload->>'status'='review_ready' and saved.payload->'approvedCandidateRevision'='null'::jsonb,'agency draft updates only reviewable saved work');
  perform pg_temp.assert_true((select revision=2 and approved_revision is null from public.website_document_heads where website_work_id=website_work),'agency immutable candidate and approval clearing commit atomically');
  perform pg_temp.assert_true((select revision=1 from public.website_document_publications where website_work_id=website_work),'agency draft never changes live published pointer');
  perform pg_temp.assert_true(not exists(select 1 from public.workspace_memberships where workspace_id=customer_id and user_id=operator_id),'scoped editing never creates business membership');
  commit_sql:=format('select public.commit_agency_website_document_candidate(%L,%L,%L,%L,%L,1,2,2,%L,%L,%L,%L)',operator_id,'website-v2-draft-operator@example.test',binding_id,website_work,'hero',repeat('b',64),repeat('c',64),edited,next_payload);
  -- Exact selection prevents the losing actor from overwriting a newer draft.
  begin perform public.commit_agency_website_document_candidate(operator_id,'website-v2-draft-operator@example.test',binding_id,website_work,'hero',0,1,1,repeat('a',64),repeat('b',64),edited,next_payload); raise exception 'stale revision accepted'; exception when others then if sqlerrm<>'website_revision_conflict' then raise; end if; end;
  begin perform public.commit_agency_website_document_candidate(operator_id,'website-v2-draft-operator@example.test',binding_id,website_work,'hero',1,2,2,repeat('f',64),repeat('c',64),edited,next_payload); raise exception 'stale hash accepted'; exception when others then if sqlerrm<>'website_revision_conflict' then raise; end if; end;
  -- Retire each native authority component and prove it is rechecked at commit.
  saved_expiry:=grant_row.expires_at;
  update public.agency_managed_website_draft_grants set created_at=clock_timestamp()-interval '2 days',expires_at=clock_timestamp()-interval '1 day' where id=grant_row.id;
  begin execute commit_sql; raise exception 'expired grant accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  update public.agency_managed_website_draft_grants set expires_at=saved_expiry where id=grant_row.id;
  update public.operational_assignments set status='revoked',revoked_at=clock_timestamp(),revoked_by=owner_id where id=assignment.id;
  begin execute commit_sql; raise exception 'revoked assignment accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  update public.operational_assignments set status='accepted',revoked_at=null,revoked_by=null where id=assignment.id;
  update public.offering_provider_deliveries set expires_at=clock_timestamp()-interval '1 second' where id=delivery_value;
  begin execute commit_sql; raise exception 'expired delivery accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  update public.offering_provider_deliveries set expires_at=expiry where id=delivery_value;
  update public.workspace_memberships set role='admin' where workspace_id=customer_id and user_id=owner_id;
  begin execute commit_sql; raise exception 'nonowner sponsor accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  update public.workspace_memberships set role='owner' where workspace_id=customer_id and user_id=owner_id;
  update public.memberships set role='editor' where tenant_id='website-v2-draft-a' and user_id=owner_id;
  begin execute commit_sql; raise exception 'revoked native sponsor accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  update public.memberships set role='owner' where tenant_id='website-v2-draft-a' and user_id=owner_id;
  insert into public.tenants(id,site_name) values('website-v2-draft-b','Different native tenant');
  update public.website_document_publications set tenant_id='website-v2-draft-b' where website_work_id=website_work;
  begin execute commit_sql; raise exception 'mismatched native tenant accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  update public.website_document_publications set tenant_id='website-v2-draft-a' where website_work_id=website_work;
  begin perform public.read_agency_website_document_candidate(outsider_id,'website-v2-draft-outsider@example.test',binding_id); raise exception 'unassigned operator accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  -- A hero grant cannot rewrite header, container edges or ungranted children.
  for edited in select jsonb_set(doc,'{nodes,header,props,brand}','"Foreign header"') union all select jsonb_set(doc,'{nodes,container,children}','[]') union all select jsonb_set(doc,'{nodes,hero,children}','["header"]') union all select jsonb_set(doc,'{facts,credential,text}','"Forged owner credential"') union all select jsonb_set(doc,'{nodes,hero,children}','["leaf","inner"]') union all select jsonb_set(doc,'{facts,source,verification,confidence}','0.99') union all select jsonb_set(doc,'{facts,source,origin}','"owner_confirmed"') loop
    begin perform public.commit_agency_website_document_candidate(operator_id,'website-v2-draft-operator@example.test',binding_id,website_work,'hero',1,2,2,repeat('b',64),repeat('c',64),edited,next_payload); raise exception 'scope or owner evidence mutation accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
  end loop;
  edited:=saved.payload->'candidate'->'document';
  begin execute commit_sql; raise exception 'malformed candidate projection accepted'; exception when others then if sqlerrm<>'website_candidate_invalid' then raise; end if; end;
  perform pg_temp.assert_true((select count(*) from public.website_documents where website_work_id=website_work)=2 and (select revision from public.website_document_heads where website_work_id=website_work)=2,'all rejected transactions leave document/head unchanged');

  edited:=jsonb_set(edited,'{facts,new_claim}','{"text":"Agency proposed claim","origin":"owner_stated","highRisk":true,"sources":[],"verification":{"supported":false,"confidence":0}}');
  edited:=jsonb_set(edited,'{nodes,hero,factIds}','["credential","new_claim"]');
  next_payload:=saved.payload||jsonb_build_object('revision',2,'candidate',jsonb_build_object('revision',3,'contentHash',repeat('c',64),'document',edited),'history',(saved.payload->'history')||jsonb_build_array(jsonb_build_object('revision',2,'kind','agency_patch','actorId',operator_id,'at','2026-10-01T12:02:00Z')));
  select * into saved from public.commit_agency_website_document_candidate(operator_id,'website-v2-draft-operator@example.test',binding_id,website_work,'hero',1,2,2,repeat('b',64),repeat('c',64),edited,next_payload);
  perform pg_temp.assert_true(saved.payload->'candidate'->'document'->'facts'->'new_claim'->'verification'->'supported'='false'::jsonb,'new scoped agency facts remain unsupported for owner review');
  begin perform public.approve_website_document(customer_id,website_work,owner_id,'website-v2-draft-owner@example.test',3,repeat('c',64)); raise exception 'unsupported agency facts approved'; exception when others then if sqlerrm<>'website_facts_unresolved' then raise; end if; end;
  begin perform public.approve_website_document(customer_id,website_work,operator_id,'website-v2-draft-operator@example.test',2,repeat('b',64)); raise exception 'agency approval accepted'; exception when others then if sqlerrm<>'workspace_access_denied' then raise; end if; end;
  begin perform public.publish_website_document(customer_id,website_work,operator_id,'website-v2-draft-operator@example.test',2,repeat('b',64),'website-v2-draft-a','{}'); raise exception 'agency publish accepted'; exception when others then if sqlerrm<>'workspace_access_denied' then raise; end if; end;
  begin perform public.manage_website_document(customer_id,website_work,operator_id,'website-v2-draft-operator@example.test'); raise exception 'agency owner confirmation accepted'; exception when others then if sqlerrm<>'workspace_access_denied' then raise; end if; end;
  begin perform public.manage_published_website_tenant(customer_id,website_work,operator_id,'website-v2-draft-operator@example.test','website-v2-draft-a'); raise exception 'agency domain authority accepted'; exception when others then if sqlerrm<>'workspace_access_denied' then raise; end if; end;
  perform public.revoke_agency_managed_website_draft_edit(owner_id,'website-v2-draft-owner@example.test',grant_row.id);
  begin execute commit_sql; raise exception 'revoked grant accepted'; exception when others then if sqlerrm<>'agency_managed_website_draft_denied' then raise; end if; end;
end $$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.read_agency_website_document_candidate(uuid,text,uuid,uuid,text,boolean)','execute') and not has_function_privilege('anon','public.commit_agency_website_document_candidate(uuid,text,uuid,uuid,text,integer,integer,integer,text,text,jsonb,jsonb,boolean)','execute'),'v2 agency draft RPCs are service only');
