\set ON_ERROR_STOP on
-- Sites by code (20261027120000-120200): a coding agent picks up website Requests
-- its own agency accepted and reports a preview and a deploy. Fictional rows on a
-- disposable cluster, inside a transaction that is rolled back.
begin;
create or replace function pg_temp.sc_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'sites by code assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.sc_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got % (%)', expected, sqlerrm, statement; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

-- ---- privileges ----
select pg_temp.sc_assert(
  not has_function_privilege('service_role', 'public.website_change_record_step(uuid,uuid,text,uuid,text,jsonb,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.website_change_receipts_json(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.website_change_may_deploy(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.agent_list_website_change_requests(text,text,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.agent_record_website_change(text,text,uuid,uuid,text,jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.list_website_change_reviews(uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.agent_record_website_change(text,text,uuid,uuid,text,jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.agent_list_website_change_requests(text,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.list_website_change_reviews(uuid,uuid,text)', 'execute'),
  'the step is internal; the agent tools and Needs you read are service-role only');
select pg_temp.sc_assert((select provolatile = 'v' from pg_proc where oid = 'public.list_website_change_reviews(uuid,uuid,text)'::regprocedure), 'the Needs you read is volatile');
select pg_temp.sc_assert('sites_by_code' = any(public.workspace_release_flag_names()), 'the flag is a known release flag');

insert into public.users(id, email, verified_at) values
  ('5bc00000-0000-4000-8000-000000000001', 'sc-owner@example.test', now()),
  ('5bc00000-0000-4000-8000-000000000002', 'sc-a-admin@agency-a.example.test', now()),
  ('5bc00000-0000-4000-8000-000000000003', 'sc-a-staff@agency-a.example.test', now()),
  ('5bc00000-0000-4000-8000-000000000005', 'sc-b-staff@agency-b.example.test', now()),
  ('5bc00000-0000-4000-8000-000000000007', 'sc-operator@strelva.example.test', now());
insert into public.super_admins(user_id, email) values ('5bc00000-0000-4000-8000-000000000007', 'sc-operator@strelva.example.test');
insert into public.workspaces(id, kind, name, created_by) values
  ('5bc00000-0000-4000-8000-000000000010', 'customer', 'Code Client', '5bc00000-0000-4000-8000-000000000001'),
  ('5bc00000-0000-4000-8000-000000000020', 'agency', 'Agency A', '5bc00000-0000-4000-8000-000000000002'),
  ('5bc00000-0000-4000-8000-000000000030', 'agency', 'Agency B', '5bc00000-0000-4000-8000-000000000005');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('5bc00000-0000-4000-8000-000000000010', '5bc00000-0000-4000-8000-000000000001', 'owner', '5bc00000-0000-4000-8000-000000000001'),
  ('5bc00000-0000-4000-8000-000000000020', '5bc00000-0000-4000-8000-000000000002', 'owner', '5bc00000-0000-4000-8000-000000000002'),
  ('5bc00000-0000-4000-8000-000000000020', '5bc00000-0000-4000-8000-000000000003', 'member', '5bc00000-0000-4000-8000-000000000002'),
  ('5bc00000-0000-4000-8000-000000000030', '5bc00000-0000-4000-8000-000000000005', 'owner', '5bc00000-0000-4000-8000-000000000005');
insert into public.tenants(id, site_name, stable_id, delivery_model, custom_repo, production_domain)
  values ('sc-code-client', 'Code Client Site', '5bc00000-0000-4000-8000-0000000000a0', 'custom_repo', '{"repoUrl":"https://github.com/example/code-client","repoName":"code-client"}', 'code-client.example.test')
  on conflict (id) do nothing;

do $$
declare
  owner_id uuid := '5bc00000-0000-4000-8000-000000000001';
  a_admin uuid := '5bc00000-0000-4000-8000-000000000002';
  a_staff uuid := '5bc00000-0000-4000-8000-000000000003';
  b_staff uuid := '5bc00000-0000-4000-8000-000000000005';
  ws uuid := '5bc00000-0000-4000-8000-000000000010';
  agency_a uuid := '5bc00000-0000-4000-8000-000000000020';
  agency_b uuid := '5bc00000-0000-4000-8000-000000000030';
  req uuid := '5bc00000-0000-4000-8000-0000000000c1';
  req_b uuid := '5bc00000-0000-4000-8000-0000000000c2';
  work public.saved_product_work;
  site text;
  seat uuid;
  conn uuid;
  tok constant text := repeat('a', 64);
  owner_tok constant text := repeat('b', 64);
  res constant text := 'https://strelva.example.test/api/mcp';
  listed jsonb;
  saved jsonb;
begin
  perform public.choose_business_provider(owner_id, 'sc-owner@example.test', ws, agency_a);
  perform public.set_agency_client_staff(a_admin, 'sc-a-admin@agency-a.example.test', agency_a, ws, a_staff, true);
  select id into seat from public.provider_seats where customer_workspace_id = ws and agency_workspace_id = agency_a and status = 'active';
  select * into work from public.claim_website_rebuild(ws, owner_id, 'sc-owner@example.test', 'sc-request-one', 'code-client.example.test',
    '{"url":"https://code-client.example.test"}', jsonb_build_object('version', 2, 'revision', 0, 'title', 'Code Client',
      'status', 'building', 'createdBy', owner_id, 'createdAt', '2026-10-07T10:00:00Z', 'history', '[]'::jsonb));
  site := public.system_origin_id(ws, 'saved_work', work.id::text)::text;
  perform public.submit_agency_qualification(a_admin, 'sc-a-admin@agency-a.example.test', agency_a, '5bc00000-0000-4000-8000-0000000000e1', 'publish', 'https://example.test/sc-proof', 'Fictional release and recovery evidence');
  perform public.decide_agency_qualification('sc-operator@strelva.example.test', '5bc00000-0000-4000-8000-0000000000e1', 'verified', 'Fictional evidence independently reviewed');

  -- An agency Request that agency A accepted, one nobody accepted, and the owner's.
  insert into public.service_requests(id, business_workspace_id, status, request_text, outcome, context, scope, provider_kind, provider_agency_workspace_id,
      provider_acceptance, accepted_by, accepted_at, created_by) values
    (req, ws, 'requested', 'Add a menu page', 'A menu page', jsonb_build_object('source', 'website_change', 'systemId', site, 'tenantStableId', '5bc00000-0000-4000-8000-0000000000a0', 'implementation', 'custom_repo', 'page', 'Menu'),
      array['website.repo_change'], 'agency', agency_a, 'accepted', a_admin, now(), owner_id),
    (req_b, ws, 'requested', 'Change the footer', 'A new footer', jsonb_build_object('source', 'website_change', 'systemId', site, 'implementation', 'custom_repo'),
      array['website.repo_change'], 'agency', agency_b, 'pending', null, null, owner_id);

  -- Agency A's connection (business:read + website:code), and an owner's own.
  insert into public.assistant_connections(id, client_id, client_name, resource, scopes, workspace_id, user_id, verified_email, agency_id, seat_id)
    values ('5bc00000-0000-4000-8000-0000000000d1', 'client', 'Coding agent', res, array['business:read', 'website:code'], ws, a_staff, 'sc-a-staff@agency-a.example.test', agency_a, seat)
    returning id into conn;
  insert into public.assistant_tokens(token_hash, client_id, resource, scopes, workspace_id, user_id, verified_email, agency_id, seat_id, connection_id)
    values (tok, 'client', res, array['business:read', 'website:code'], ws, a_staff, 'sc-a-staff@agency-a.example.test', agency_a, seat, conn);
  insert into public.assistant_tokens(token_hash, client_id, resource, scopes, workspace_id, user_id, verified_email)
    values (owner_tok, 'client', res, array['website:code'], ws, owner_id, 'sc-owner@example.test');

  -- The scope: an agency holds business:read and website:code, nothing more.
  perform pg_temp.sc_expect(format($q$select public.issue_agent_oauth_connection_code(%L, 'sc-a-staff@agency-a.example.test', %L, %L, %L, 'c', 'Coding agent', 'http://localhost/cb', %L, repeat('c', 43), array['website:code','inquiries:read'])$q$,
    a_staff, ws, agency_a, repeat('1', 64), res), '%oauth_invalid_scope%');
  perform pg_temp.sc_assert((public.issue_agent_oauth_connection_code(a_staff, 'sc-a-staff@agency-a.example.test', ws, agency_a, repeat('2', 64), 'c', 'Coding agent', 'http://localhost/cb', res, repeat('c', 43), array['business:read','website:code'])->>'issued')::boolean,
    'an agency may be granted business:read + website:code');
  perform pg_temp.sc_assert((public.issue_agent_oauth_connection_code(owner_id, 'sc-owner@example.test', ws, null, repeat('3', 64), 'c', 'Coding agent', 'http://localhost/cb', res, repeat('c', 43), array['website:code'])->>'issued')::boolean,
    'an owner may be granted website:code');

  -- The agent sees only the Requests its own agency accepted work on.
  listed := public.agent_list_website_change_requests(tok, res, ws);
  perform pg_temp.sc_assert(jsonb_array_length(listed) = 1 and listed->0->>'id' = req::text, 'only agency A''s Request');
  perform pg_temp.sc_assert(listed->0->>'page' = 'Menu' and listed->0->>'repoName' = 'code-client' and listed->0->>'tenantId' = 'sc-code-client'
    and listed->0->>'productionDomain' = 'code-client.example.test', 'the Request carries its site');
  perform pg_temp.sc_assert((listed->0->>'mayDeploy')::boolean = false, 'no publish mandate yet, so no deploy');
  perform pg_temp.sc_expect(format('select public.agent_list_website_change_requests(%L, %L, %L)', tok, res, '5bc00000-0000-4000-8000-000000000011'), '%oauth_invalid_token%');
  perform pg_temp.sc_expect(format('select public.agent_list_website_change_requests(%L, %L, %L)', repeat('9', 64), res, ws), '%oauth_invalid_token%');

  -- A preview, reported by the agent.
  perform pg_temp.sc_expect(format($q$select public.agent_record_website_change(%L, %L, %L, %L, 'preview', '{"previewUrl":"https://p.example.test"}')$q$, tok, res, ws, req_b), '%website_change_not_accepted%');
  perform pg_temp.sc_expect(format($q$select public.agent_record_website_change(%L, %L, %L, %L, 'approved', '{}')$q$, tok, res, ws, req), '%website_change_invalid%');
  perform pg_temp.sc_expect(format($q$select public.agent_record_website_change(%L, %L, %L, %L, 'preview', '{"previewUrl":"https://p.example.test","ownerFacing":"yes"}')$q$, tok, res, ws, req), '%website_change_invalid%');
  perform pg_temp.sc_expect(format($q$select public.agent_record_website_change(%L, %L, %L, %L, 'preview', '{"previewUrl":"https://p.example.test","sourceCommitSha":"nope"}')$q$, tok, res, ws, req), '%website_change_invalid%');
  perform pg_temp.sc_expect(format($q$select public.agent_record_website_change(%L, %L, %L, %L, 'preview', '{"previewUrl":"https://p.example.test"}')$q$, owner_tok, res, ws, req), '%website_change_operator_required%');
  saved := public.agent_record_website_change(tok, res, ws, req, 'preview',
    '{"previewUrl":"https://menu-git.example.test","sourceCommitSha":"ABC1234DEF","branch":"strelva/menu","summary":"A menu page with hours","ownerFacing":true}');
  perform pg_temp.sc_assert(saved->>'reportedBy' = 'coding_agent' and saved->>'sourceCommitSha' = 'abc1234def' and saved->>'branch' = 'strelva/menu'
    and saved->>'summary' = 'A menu page with hours' and (saved->>'ownerFacing')::boolean, 'the preview says a coding agent reported it');

  -- Needs you: the owner sees one item to approve; nobody else does.
  listed := public.list_website_change_reviews(ws, owner_id, 'sc-owner@example.test');
  perform pg_temp.sc_assert(jsonb_array_length(listed) = 1 and listed->0->>'requestId' = req::text and listed->0->>'siteName' = 'Code Client Site'
    and listed->0->>'previewUrl' = 'https://menu-git.example.test' and listed->0->>'reportedBy' = 'coding_agent', 'the owner sees the preview waiting');
  perform pg_temp.sc_assert(public.list_website_change_reviews(ws, a_staff, 'sc-a-staff@agency-a.example.test') = '[]'::jsonb, 'an agency staff member sees no owner decision');

  -- A deploy needs the publish mandate the owner grants, and the owner's approval first.
  perform pg_temp.sc_expect(format($q$select public.agent_record_website_change(%L, %L, %L, %L, 'deployed', '{"commitSha":"abc1234","deploymentUrl":"https://x.example.test","readBack":"confirmed"}')$q$, tok, res, ws, req), '%acting_provider_no_mandate%');
  perform public.grant_client_resource_mandate(owner_id, 'sc-owner@example.test', ws, agency_a, 'publish', 'website', site);
  perform pg_temp.sc_assert((public.agent_list_website_change_requests(tok, res, ws)->0->>'mayDeploy')::boolean, 'with the mandate the agent may deploy');
  perform pg_temp.sc_expect(format($q$select public.agent_record_website_change(%L, %L, %L, %L, 'deployed', '{"commitSha":"abc1234","deploymentUrl":"https://x.example.test","readBack":"confirmed"}')$q$, tok, res, ws, req), '%website_change_out_of_order%');
  saved := public.record_website_change_receipt(ws, owner_id, 'sc-owner@example.test', req, 'approved', '{}');
  perform pg_temp.sc_assert(saved->>'reportedBy' = 'person' and saved->>'sourceCommitSha' is null, 'the owner''s decision is a person''s');
  perform pg_temp.sc_assert(public.list_website_change_reviews(ws, owner_id, 'sc-owner@example.test') = '[]'::jsonb, 'an approved Request leaves Needs you');
  saved := public.agent_record_website_change(tok, res, ws, req, 'deployed',
    '{"commitSha":"ABC1234DEF","deploymentUrl":"https://code-client.example.test","readBack":"not_checked","summary":"Menu page is live"}');
  perform pg_temp.sc_assert(saved->>'kind' = 'deployed' and saved->>'commitSha' = 'abc1234def' and saved->>'readBack' = 'not_checked' and saved->>'reportedBy' = 'coding_agent', 'the deploy is recorded as reported');

  -- The web path lists the same receipts, in order, with provenance.
  listed := public.list_website_change_requests(ws, owner_id, 'sc-owner@example.test', site::uuid);
  perform pg_temp.sc_assert((select jsonb_agg(x->>'reportedBy') from jsonb_array_elements((select r from jsonb_array_elements(listed) r where r->>'id' = req::text)->'receipts') x)
    = '["coding_agent","person","coding_agent"]'::jsonb, 'receipts say who recorded each step');
  perform pg_temp.sc_assert((select r->>'page' from jsonb_array_elements(listed) r where r->>'id' = req::text) = 'Menu', 'the list carries the page');

  -- A revoked connection stops at once.
  update public.assistant_connections set revoked_at = now() where id = conn;
  perform pg_temp.sc_expect(format('select public.agent_list_website_change_requests(%L, %L, %L)', tok, res, ws), '%oauth_invalid_token%');
end $$;

rollback;
\echo 'Sites by code SQL checks passed.'
