\set ON_ERROR_STOP on
-- Tenant -> business conversion against a synthetic gldf-like tenant. The
-- import comes from tests/fixtures/business-record-tenant-import.json, which
-- src/__tests__/business-record-tenant-import.test.ts proves is exactly what
-- the TypeScript planner builds from tests/fixtures/business-record-tenant-source.json.
-- Run with: psql --set=tenant_import="$(cat tests/fixtures/business-record-tenant-import.json)"
begin;
create or replace function pg_temp.cv_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'conversion assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.cv_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

create temporary table cv_fixture(value jsonb);
insert into cv_fixture values (:'tenant_import'::jsonb);
create function pg_temp.cv_route(payload jsonb) returns jsonb language sql as $$
  select payload || case when to_regprocedure('public.repath_converted_tenant_provider(text,text,uuid,jsonb,text,boolean)') is null then '{}'::jsonb
    else jsonb_build_object('agencyWorkspaceId', 'cf000000-0000-4000-8000-000000000011',
      'agencyStaffEmails', jsonb_build_array('provider-staff@agency.example.test'), 'agencySelectionBasis', 'existing_contract') end
$$;
update cv_fixture set value = jsonb_set(value, '{payload}', pg_temp.cv_route(value->'payload'));
create temporary table cv_result(label text primary key, value jsonb);

insert into public.users(id, email, verified_at) values
  ('cf000000-0000-4000-8000-000000000001', 'operator@strelva.example.test', now()),
  ('cf000000-0000-4000-8000-000000000002', 'not-an-operator@example.test', now()),
  ('cf000000-0000-4000-8000-000000000003', 'revoked-operator@strelva.example.test', now()),
  ('cf000000-0000-4000-8000-000000000004', 'other-business-owner@example.test', now()),
  ('cf000000-0000-4000-8000-000000000007', 'provider-staff@agency.example.test', now());
insert into public.super_admins(user_id, email) values
  ('cf000000-0000-4000-8000-000000000001', 'operator@strelva.example.test');
insert into public.super_admins(user_id, email, revoked_at) values
  ('cf000000-0000-4000-8000-000000000003', 'revoked-operator@strelva.example.test', now());
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('gldf', 'c0ffee00-0000-4000-8000-0000000000a1', 'Great Lakes Dried Fruit', true, 'owner@example.com'),
  ('gldf-second-site', 'c0ffee00-0000-4000-8000-0000000000a2', 'Great Lakes Dried Fruit Wholesale', true, 'owner@example.com'),
  ('quiet-site', 'c0ffee00-0000-4000-8000-0000000000a3', 'Quiet Site', true, 'quiet-owner@example.com');
insert into public.workspaces(id, kind, name, created_by) values
  ('cf000000-0000-4000-8000-000000000010', 'customer', 'Unrelated Business', 'cf000000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('cf000000-0000-4000-8000-000000000010', 'cf000000-0000-4000-8000-000000000004', 'owner', 'cf000000-0000-4000-8000-000000000004');
insert into public.workspaces(id, kind, name, created_by) values
  ('cf000000-0000-4000-8000-000000000011', 'agency', 'Fictional Agency', 'cf000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('cf000000-0000-4000-8000-000000000011', 'cf000000-0000-4000-8000-000000000007', 'member', 'cf000000-0000-4000-8000-000000000001');
create temporary table cv_tenant_before as select to_jsonb(t) as row from public.tenants t where id = 'gldf';
create temporary table cv_counts_before as select
  (select count(*) from public.workspaces) as workspaces,
  (select count(*) from public.memberships) as tenant_memberships;

-- Only an active, verified Strelva operator may convert or read link state.
select pg_temp.cv_expect(format($$select public.convert_tenant_to_business('not-an-operator@example.test','gldf',%L::jsonb,%L::uuid,%L)$$,
  (select value->'payload' from cv_fixture), (select value->>'commandId' from cv_fixture), (select value->>'digest' from cv_fixture)), 'tenant_conversion_operator_required');
select pg_temp.cv_expect(format($$select public.convert_tenant_to_business('revoked-operator@strelva.example.test','gldf',%L::jsonb,%L::uuid,%L)$$,
  (select value->'payload' from cv_fixture), (select value->>'commandId' from cv_fixture), (select value->>'digest' from cv_fixture)), 'tenant_conversion_operator_required');
select pg_temp.cv_expect($$select public.read_tenant_workspace_link('not-an-operator@example.test','gldf')$$, 'tenant_conversion_operator_required');
-- A plan made for a different tenant identity is refused.
select pg_temp.cv_expect(format($$select public.convert_tenant_to_business('operator@strelva.example.test','gldf',%L::jsonb,%L::uuid,%L)$$,
  (select jsonb_set(value->'payload', '{tenantStableId}', '"c0ffee00-0000-4000-8000-0000000000ff"') from cv_fixture),
  (select value->>'commandId' from cv_fixture), (select value->>'digest' from cv_fixture)), 'tenant_conversion_identity_mismatch');
select pg_temp.cv_assert((public.read_tenant_workspace_link('operator@strelva.example.test', 'gldf')->'link') = 'null'::jsonb, 'no link before conversion');

-- A storage failure mid-conversion leaves nothing behind.
create function pg_temp.cv_reject_contact() returns trigger language plpgsql as $$ begin raise exception 'synthetic_contact_failure'; end; $$;
create trigger cv_reject_contact before insert on public.business_contacts for each row execute function pg_temp.cv_reject_contact();
select pg_temp.cv_expect(format($$select public.convert_tenant_to_business('operator@strelva.example.test','gldf',%L::jsonb,%L::uuid,%L)$$,
  (select value->'payload' from cv_fixture), (select value->>'commandId' from cv_fixture), (select value->>'digest' from cv_fixture)), 'synthetic_contact_failure');
drop trigger cv_reject_contact on public.business_contacts;
select pg_temp.cv_assert((select count(*) from public.workspaces) = (select workspaces from cv_counts_before)
  and not exists (select 1 from public.tenant_workspace_links), 'failed conversion left no workspace and no link');

-- Convert.
insert into cv_result select 'first', public.convert_tenant_to_business('operator@strelva.example.test', 'gldf',
  (select value->'payload' from cv_fixture), (select (value->>'commandId')::uuid from cv_fixture), (select value->>'digest' from cv_fixture));
create temporary table cv_ws as select (value->>'workspaceId')::uuid as id from cv_result where label = 'first';
select pg_temp.cv_assert((select value->>'replayed' = 'false' and value->>'alreadyConverted' = 'false'
  and value->>'operatorRole' = case when value ? 'operatorMembershipCreated' then 'none' else 'admin' end
  and value#>>'{billing,billingType}' = 'tier' and value#>>'{billing,grandfathered}' = 'true' and value->'account' = 'null'::jsonb
  from cv_result where label = 'first'), 'receipt records the operator role and billing as observed');
select pg_temp.cv_assert((select kind = 'customer' and name = 'Great Lakes Dried Fruit' and created_by = 'cf000000-0000-4000-8000-000000000001'
  from public.workspaces where id = (select id from cv_ws)), 'customer business created by the operator');
select pg_temp.cv_assert((select case when to_regprocedure('public.repath_converted_tenant_provider(text,text,uuid,jsonb,text,boolean)') is null
  then count(*) = 1 and bool_and(user_id = 'cf000000-0000-4000-8000-000000000001' and role = 'admin')
  else count(*) = 0 end from public.workspace_memberships where workspace_id = (select id from cv_ws)),
  'conversion creates no direct admin membership');
select pg_temp.cv_assert((select count(*) from public.memberships) = (select tenant_memberships from cv_counts_before), 'no tenant membership created');
-- `account_id` is excluded: once the business billing migration
-- (20261007180000) is applied, its link trigger points the tenant at the
-- business's billing account on purpose. Every other column must hold.
select pg_temp.cv_assert((select to_jsonb(t) - 'account_id' from public.tenants t where id = 'gldf') = (select row - 'account_id' from cv_tenant_before), 'tenant row unchanged');

-- Record contents: facts, provenance, services, people, contacts, history.
select pg_temp.cv_assert((select count(*) from public.business_record_facts where workspace_id = (select id from cv_ws)) = 9, 'nine facts imported');
select pg_temp.cv_assert((select bool_and(source = 'tenant_import' and not verified) from public.business_record_facts where workspace_id = (select id from cv_ws)), 'facts carry tenant_import provenance, unverified');
select pg_temp.cv_assert((select value #>> '{}' from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'phone') = '716-555-0199', 'phone fact');
select pg_temp.cv_assert((select value->'weekly' = '[{"day":1,"opens":"10:00","closes":"16:00"},{"day":2,"opens":"12:00","closes":"18:00"}]'::jsonb
  and value->>'timezone' = 'America/New_York' and value#>>'{overrides,0,date}' = '2026-12-25'
  from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'hours'), 'weekly hours and the date override');
select pg_temp.cv_assert((select jsonb_array_length(value) = 5 from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'links'), 'five links');
select pg_temp.cv_assert((select string_agg(name || ':' || coalesce(duration_minutes::text, '-') || ':' || active::text, ',' order by position)
  from public.business_services where workspace_id = (select id from cv_ws)) = 'Tasting visit:30:true,Wholesale consult:-:false', 'services with duration and coming-soon state');
select pg_temp.cv_assert((select name = 'Pat Example' and role_title = 'Owner' and email = 'owner@example.com' and user_id is null
  from public.business_people where workspace_id = (select id from cv_ws)), 'owner person imported without a user link');
select pg_temp.cv_assert((select count(*) from public.business_contacts where workspace_id = (select id from cv_ws)) = 3, 'five lead/booking contacts deduplicate to three');
select pg_temp.cv_assert((select sources = array['booking','inquiry'] and email = 'casey@example.net' from public.business_contacts
  where workspace_id = (select id from cv_ws) and phone_key = '17165550122'), 'Casey merged across a phone-only lead and a booking');
select pg_temp.cv_assert((select first_seen_at = '2026-08-01T14:00:00Z' and last_seen_at = '2026-09-01T14:00:00Z' from public.business_contacts
  where workspace_id = (select id from cv_ws) and email = 'jordan@example.org'), 'Jordan keeps first and last sighting');
select pg_temp.cv_assert((select count(*) = 1 and bool_and(source = 'tenant_import' and actor_kind = 'operator') from public.business_record_revisions
  where workspace_id = (select id from cv_ws)), 'one tenant_import revision by the operator');
select pg_temp.cv_assert((select value#>>'{counts,facts}' = '9' and value#>>'{counts,contacts}' = '3' and value#>>'{counts,services}' = '2'
  from cv_result where label = 'first'), 'receipt counts');
select pg_temp.cv_assert((public.read_business_record((select id from cv_ws), 'cf000000-0000-4000-8000-000000000001', 'operator@strelva.example.test')->>'access') = 'admin', 'operator reads the record as admin');

-- The owner recipient comes from the record, imported from tenants.owner_email.
select pg_temp.cv_assert((select public.resolve_business_owner_recipient(id) from cv_ws)
  = '{"email":"owner@example.com","name":"Pat Example","from":"record","source":"tenant_import","verified":false,"tenantId":null}'::jsonb, 'owner recipient from the imported fact');

-- Reruns are no-ops: the same command replays; a new plan for a linked tenant returns the existing receipt.
insert into cv_result select 'replay', public.convert_tenant_to_business('operator@strelva.example.test', 'gldf',
  (select value->'payload' from cv_fixture), (select (value->>'commandId')::uuid from cv_fixture), (select value->>'digest' from cv_fixture));
select pg_temp.cv_assert((select value from cv_result where label = 'replay')
  = (select value from cv_result where label = 'first') || '{"replayed":true,"alreadyConverted":true}'::jsonb, 'same command replays the receipt');
select pg_temp.cv_expect(format($$select public.convert_tenant_to_business('operator@strelva.example.test','gldf',%L::jsonb,%L::uuid,%L)$$,
  (select value->'payload' from cv_fixture), (select value->>'commandId' from cv_fixture), repeat('9', 64)), 'tenant_conversion_idempotency_conflict');
insert into cv_result select 'rerun', public.convert_tenant_to_business('operator@strelva.example.test', 'gldf',
  (select jsonb_set(value->'payload', '{contacts}', '[{"email":"new-lead@example.test","source":"inquiry"}]') from cv_fixture),
  'cf000000-0000-4000-8000-0000000000c2', repeat('8', 64));
select pg_temp.cv_assert((select value->>'alreadyConverted' = 'true' and value->>'workspaceId' = (select id::text from cv_ws) from cv_result where label = 'rerun'), 'rerun with a changed plan is a no-op');
select pg_temp.cv_assert((select count(*) from public.workspaces) = (select workspaces from cv_counts_before) + 1
  and (select count(*) from public.business_contacts where workspace_id = (select id from cv_ws)) = 3
  and (select count(*) from public.tenant_workspace_links) = 1, 'reruns wrote nothing');
select pg_temp.cv_assert((public.read_tenant_workspace_link('operator@strelva.example.test', 'gldf')#>>'{link,workspaceId}') = (select id::text from cv_ws), 'link readable by the operator');
select pg_temp.cv_expect($$update public.tenant_workspace_links set receipt = '{}'$$, 'tenant_workspace_link_immutable');

-- A second site of the same account joins the same business; existing facts are kept.
insert into cv_result select 'second', public.convert_tenant_to_business('operator@strelva.example.test', 'gldf-second-site',
  pg_temp.cv_route(jsonb_build_object('tenantId', 'gldf-second-site', 'tenantStableId', 'c0ffee00-0000-4000-8000-0000000000a2',
    'workspaceName', 'Great Lakes Dried Fruit Wholesale', 'targetWorkspaceId', (select id from cv_ws),
    'billing', null, 'account', jsonb_build_object('id', 'acct-fixture', 'name', 'Great Lakes', 'tenantIds', jsonb_build_array('gldf', 'gldf-second-site'), 'multiSite', true),
    'patch', jsonb_build_object('facts', jsonb_build_object(
      'display_name', jsonb_build_object('value', 'Great Lakes Dried Fruit Wholesale', 'verified', false),
      'legal_name', jsonb_build_object('value', 'Great Lakes Dried Fruit LLC', 'verified', false)),
      'services', jsonb_build_array(jsonb_build_object('op', 'upsert', 'name', 'Pallet orders'))),
    'contacts', jsonb_build_array(jsonb_build_object('email', 'buyer@example.net', 'source', 'inquiry')))),
  'cf000000-0000-4000-8000-0000000000c3', repeat('7', 64));
select pg_temp.cv_assert((select value->>'joinedExistingWorkspace' = 'true' and value->>'workspaceId' = (select id::text from cv_ws) and value#>>'{account,multiSite}' = 'true'
  from cv_result where label = 'second'), 'second site joined the account business');
select pg_temp.cv_assert((select count(*) from public.tenant_workspace_links where workspace_id = (select id from cv_ws)) = 2, 'one business, two linked sites');
select pg_temp.cv_assert((select value #>> '{}' from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'display_name') = 'Great Lakes Dried Fruit'
  and exists (select 1 from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'legal_name')
  and (select count(*) from public.business_services where workspace_id = (select id from cv_ws)) = 2
  and (select count(*) from public.business_contacts where workspace_id = (select id from cv_ws)) = 4, 'joining fills only missing facts and merges contacts');
select pg_temp.cv_assert((select count(*) from public.workspace_memberships where workspace_id = (select id from cv_ws)) = 1, 'joining granted nobody anything');
select pg_temp.cv_expect(format($$select public.convert_tenant_to_business('operator@strelva.example.test','quiet-site',%L::jsonb,'cf000000-0000-4000-8000-0000000000c4',repeat('6',64))$$,
  pg_temp.cv_route('{"tenantId":"quiet-site","tenantStableId":"c0ffee00-0000-4000-8000-0000000000a3","workspaceName":"Quiet Site","targetWorkspaceId":"cf000000-0000-4000-8000-000000000010","billing":null,"account":null,"patch":{},"contacts":[]}'::jsonb)), 'tenant_conversion_target_invalid');

-- A tenant with no owner_recipient fact falls back to tenants.owner_email through the link.
insert into cv_result select 'quiet', public.convert_tenant_to_business('operator@strelva.example.test', 'quiet-site',
  pg_temp.cv_route('{"tenantId":"quiet-site","tenantStableId":"c0ffee00-0000-4000-8000-0000000000a3","workspaceName":"Quiet Site","billing":null,"account":null,"patch":{},"contacts":[]}'::jsonb),
  'cf000000-0000-4000-8000-0000000000c5', repeat('5', 64));
select pg_temp.cv_assert((select public.resolve_business_owner_recipient((value->>'workspaceId')::uuid) from cv_result where label = 'quiet')
  = '{"email":"quiet-owner@example.com","name":null,"from":"tenant_fallback","source":null,"verified":false,"tenantId":"quiet-site"}'::jsonb, 'owner recipient falls back to the linked tenant');

-- Workspace isolation: another business's owner sees none of this.
select pg_temp.cv_expect(format($$select public.read_business_record(%L,'cf000000-0000-4000-8000-000000000004','other-business-owner@example.test')$$, (select id from cv_ws)), 'business_record_access_denied');
select pg_temp.cv_expect(format($$select public.patch_business_record(%L,'cf000000-0000-4000-8000-000000000004','other-business-owner@example.test','owner',1,'{"facts":{"phone":{"value":"716-555-0100"}}}','cf000000-0000-4000-8000-0000000000c6',repeat('4',64))$$, (select id from cv_ws)), 'business_record_access_denied');
select pg_temp.cv_expect($$select public.read_tenant_workspace_link('other-business-owner@example.test','gldf')$$, 'tenant_conversion_operator_required');

-- Deprovisioning a tenant keeps the business and the receipt; the link loses only its tenant reference.
delete from public.tenants where id = 'quiet-site';
select pg_temp.cv_assert((select tenant_stable_id is null and tenant_slug_at_link = 'quiet-site' and receipt->>'tenantId' = 'quiet-site'
  from public.tenant_workspace_links where command_id = 'cf000000-0000-4000-8000-0000000000c5'), 'tenant deletion clears only the reference');
-- Renames keep the link: it is keyed on stable id, not slug.
update public.tenants set id = 'gldf-renamed' where id = 'gldf';
select pg_temp.cv_assert((public.read_tenant_workspace_link('operator@strelva.example.test', 'gldf-renamed')#>>'{link,workspaceId}') = (select id::text from cv_ws), 'link survives a slug rename');

-- Unlink: the full reverse of one conversion (unlink_tenant_from_business).
-- Service role only; the plan helper is internal; receipts never change.
select pg_temp.cv_assert(has_function_privilege('service_role', 'public.unlink_tenant_from_business(text,text,uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.preview_tenant_unlink(text,text)', 'execute')
  and not has_function_privilege('anon', 'public.unlink_tenant_from_business(text,text,uuid,uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.unlink_tenant_from_business(text,text,uuid,uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.preview_tenant_unlink(text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.preview_tenant_unlink(text,text)', 'execute')
  and not has_function_privilege('service_role', 'public.tenant_unlink_plan(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.tenant_unlink_plan(uuid)', 'execute'), 'unlink is service-role only');
select pg_temp.cv_assert((select relrowsecurity from pg_class where oid = 'public.tenant_workspace_unlinks'::regclass)
  and not has_table_privilege('service_role', 'public.tenant_workspace_unlinks', 'select')
  and not has_table_privilege('authenticated', 'public.tenant_workspace_unlinks', 'select')
  and not has_table_privilege('anon', 'public.tenant_workspace_unlinks', 'select'), 'unlink receipts are locked down');

insert into public.users(id, email, verified_at) values
  ('cf000000-0000-4000-8000-000000000005', 'second-operator@strelva.example.test', now()),
  ('cf000000-0000-4000-8000-000000000006', 'client-owner@example.test', now());
insert into public.super_admins(user_id, email) values ('cf000000-0000-4000-8000-000000000005', 'second-operator@strelva.example.test');
insert into public.tenants(id, stable_id, site_name, active, owner_email) values
  ('unlink-site', 'c0ffee00-0000-4000-8000-0000000000d1', 'Unlink Fixture Site', true, 'owner@example.com'),
  ('undo-site', 'c0ffee00-0000-4000-8000-0000000000d2', 'Undo Fixture Site', true, 'undo@example.com');
create temporary table cv_unlink_tenant_before as select to_jsonb(t) as row from public.tenants t where id = 'unlink-site';
create temporary table cv_unlink_payload as select jsonb_set(jsonb_set(jsonb_set(value->'payload',
  '{tenantId}', '"unlink-site"'), '{tenantStableId}', '"c0ffee00-0000-4000-8000-0000000000d1"'), '{workspaceName}', '"Unlink Fixture Business"') as payload
  from cv_fixture;
create temporary table cv_w1_before as select
  (select count(*) from public.business_record_facts where workspace_id = (select id from cv_ws)) as facts,
  (select count(*) from public.business_contacts where workspace_id = (select id from cv_ws)) as contacts,
  (select last_sequence from public.business_records where workspace_id = (select id from cv_ws)) as last_sequence;

-- Leads the site captured before conversion (when the lead store exists here).
do $$ begin
  if to_regclass('public.tenant_leads') is not null then
    perform public.record_tenant_lead('unlink-site', jsonb_build_object('leadId', 'lead_u1', 'submissionHash', 'u1', 'name', 'Ada',
      'email', 'ada@example.test', 'capturedAt', '2026-10-01T12:00:00Z'), 'backfill');
    perform public.record_tenant_lead('unlink-site', jsonb_build_object('leadId', 'lead_u2', 'submissionHash', 'u2', 'name', 'Bo',
      'email', 'bo@example.test', 'capturedAt', '2026-10-02T12:00:00Z'), 'backfill');
    perform public.record_tenant_lead('gldf-renamed', jsonb_build_object('leadId', 'lead_g1', 'submissionHash', 'g1', 'name', 'Gil',
      'email', 'gil@example.test', 'capturedAt', '2026-10-02T12:00:00Z'), 'dual_write');
  end if;
end $$;

insert into cv_result select 'unlink-convert', public.convert_tenant_to_business('operator@strelva.example.test', 'unlink-site',
  (select payload from cv_unlink_payload), 'cf000000-0000-4000-8000-0000000000d0', repeat('d', 64));
create temporary table cv_uws as select (value->>'workspaceId')::uuid as id from cv_result where label = 'unlink-convert';
do $$ begin
  if to_regclass('public.tenant_leads') is not null then
    perform public.record_tenant_lead('unlink-site', jsonb_build_object('leadId', 'lead_u3', 'submissionHash', 'u3', 'name', 'Cy',
      'email', 'cy@example.test', 'capturedAt', '2026-10-06T12:00:00Z'), 'dual_write');
    execute $q$select pg_temp.cv_assert((select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000d1'
      and workspace_id = (select id from cv_uws)) = 3, 'conversion attached earlier leads and the new lead landed in the business')$q$;
  end if;
end $$ ;

-- Preview writes nothing and names exactly what would go.
select pg_temp.cv_assert((select p->'plan'->>'deleteWorkspace' = 'true' and p->'plan'->'workspaceKeptBecause' = '[]'::jsonb
  and p#>>'{plan,entities,removed}' = '15' and p#>>'{plan,entities,kept}' = '0' and not (p->'plan' ? 'actions')
  and p->'lastUnlink' = 'null'::jsonb
  from (select public.preview_tenant_unlink('operator@strelva.example.test', 'unlink-site') p) x), 'preview: whole business would go');
select pg_temp.cv_assert(exists (select 1 from public.tenant_workspace_links where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000d1'), 'preview wrote nothing');

-- Denials: a non-operator, a revoked operator, an operator who does not run
-- this business, and a business id other than the linked one.
select pg_temp.cv_expect(format($$select public.unlink_tenant_from_business('other-business-owner@example.test','unlink-site',%L,'cf000000-0000-4000-8000-0000000000d9',repeat('a',64))$$, (select id from cv_uws)), 'tenant_conversion_operator_required');
select pg_temp.cv_expect(format($$select public.unlink_tenant_from_business('revoked-operator@strelva.example.test','unlink-site',%L,'cf000000-0000-4000-8000-0000000000d9',repeat('a',64))$$, (select id from cv_uws)), 'tenant_conversion_operator_required');
select pg_temp.cv_expect(format($$select public.unlink_tenant_from_business('second-operator@strelva.example.test','unlink-site',%L,'cf000000-0000-4000-8000-0000000000d9',repeat('a',64))$$, (select id from cv_uws)), 'tenant_unlink_access_denied');
select pg_temp.cv_expect($$select public.preview_tenant_unlink('second-operator@strelva.example.test','unlink-site')$$, 'tenant_unlink_access_denied');
select pg_temp.cv_expect(format($$select public.unlink_tenant_from_business('operator@strelva.example.test','unlink-site',%L,'cf000000-0000-4000-8000-0000000000d9',repeat('a',64))$$, (select id from cv_ws)), 'tenant_unlink_workspace_mismatch');
select pg_temp.cv_expect(format($$select public.unlink_tenant_from_business('operator@strelva.example.test','unlink-site',%L,null,repeat('a',64))$$, (select id from cv_uws)), 'tenant_unlink_invalid');
select pg_temp.cv_expect(format($$select public.unlink_tenant_from_business('operator@strelva.example.test','no-such-site',%L,'cf000000-0000-4000-8000-0000000000d9',repeat('a',64))$$, (select id from cv_uws)), 'tenant_conversion_tenant_not_found');
select pg_temp.cv_expect(format($$select public.unlink_tenant_from_business('operator@strelva.example.test','quiet-site',%L,'cf000000-0000-4000-8000-0000000000d9',repeat('a',64))$$, (select id from cv_uws)), 'tenant_conversion_tenant_not_found');

-- A storage failure mid-unlink leaves the conversion fully in place.
create function pg_temp.cv_reject_unlink() returns trigger language plpgsql as $$ begin raise exception 'synthetic_unlink_failure'; end; $$;
create trigger cv_reject_unlink before insert on public.tenant_workspace_unlinks for each row execute function pg_temp.cv_reject_unlink();
select pg_temp.cv_expect(format($$select public.unlink_tenant_from_business('operator@strelva.example.test','unlink-site',%L,'cf000000-0000-4000-8000-0000000000e1',repeat('e',64))$$, (select id from cv_uws)), 'synthetic_unlink_failure');
drop trigger cv_reject_unlink on public.tenant_workspace_unlinks;
select pg_temp.cv_assert(exists (select 1 from public.workspaces where id = (select id from cv_uws))
  and exists (select 1 from public.tenant_workspace_links where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000d1')
  and (select count(*) from public.business_record_facts where workspace_id = (select id from cv_uws)) = 9
  and (select count(*) from public.business_contacts where workspace_id = (select id from cv_uws)) = 3
  and not exists (select 1 from public.tenant_workspace_unlinks), 'failed unlink left the conversion intact');

-- Unlink a pristine conversion: the business it created goes with it.
insert into cv_result select 'unlink-1', public.unlink_tenant_from_business('operator@strelva.example.test', 'unlink-site',
  (select id from cv_uws), 'cf000000-0000-4000-8000-0000000000e1', repeat('e', 64));
select pg_temp.cv_assert((select value->>'workspaceDeleted' = 'true' and value->'workspaceKeptBecause' = '[]'::jsonb
  and value#>>'{entities,removed}' = '15' and value->>'replayed' = 'false' and value->>'alreadyUnlinked' = 'false'
  and value#>>'{conversionReceipt,workspaceId}' = (select id::text from cv_uws) and value->'sequence' = 'null'::jsonb
  from cv_result where label = 'unlink-1'), 'unlink receipt');
select pg_temp.cv_assert(not exists (select 1 from public.workspaces where id = (select id from cv_uws))
  and not exists (select 1 from public.workspace_memberships where workspace_id = (select id from cv_uws))
  and not exists (select 1 from public.business_records where workspace_id = (select id from cv_uws))
  and not exists (select 1 from public.business_record_revisions where workspace_id = (select id from cv_uws))
  and not exists (select 1 from public.business_contacts where workspace_id = (select id from cv_uws))
  and not exists (select 1 from public.tenant_workspace_links where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000d1'), 'business, membership, record and link are gone');
select pg_temp.cv_assert((select to_jsonb(t) - 'account_id' from public.tenants t where id = 'unlink-site') = (select row - 'account_id' from cv_unlink_tenant_before), 'tenant row unchanged by unlink (account_id: see the billing note above)');
select pg_temp.cv_assert((public.read_tenant_workspace_link('operator@strelva.example.test', 'unlink-site')->'link') = 'null'::jsonb, 'link state reads unlinked');
select pg_temp.cv_assert((select count(*) from public.business_record_facts where workspace_id = (select id from cv_ws)) = (select facts from cv_w1_before)
  and (select count(*) from public.business_contacts where workspace_id = (select id from cv_ws)) = (select contacts from cv_w1_before)
  and (select last_sequence from public.business_records where workspace_id = (select id from cv_ws)) = (select last_sequence from cv_w1_before)
  and (select count(*) from public.tenant_workspace_links where workspace_id = (select id from cv_ws)) = 2, 'other businesses untouched');
do $$ begin
  if to_regclass('public.tenant_leads') is not null then
    execute $q$select pg_temp.cv_assert((select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000d1') = 3
      and (select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000d1' and workspace_id is not null) = 0
      and (select workspace_id from public.tenant_leads where lead_id = 'lead_g1') = (select id from cv_ws)
      and (select value->>'leadsDetached' = '3' from cv_result where label = 'unlink-1'), 'leads kept, detached from the business only')$q$;
    execute $q$select pg_temp.cv_assert((public.record_tenant_lead('unlink-site', jsonb_build_object('leadId', 'lead_u4', 'submissionHash', 'u4', 'name', 'Di',
      'email', 'di@example.test', 'capturedAt', '2026-10-07T12:00:00Z'), 'dual_write')->'workspaceId') = 'null'::jsonb, 'a lead after unlink lands unattached')$q$;
  end if;
end $$;

-- Unlink twice: the same command replays; a new command is a no-op that returns the last receipt.
insert into cv_result select 'unlink-replay', public.unlink_tenant_from_business('operator@strelva.example.test', 'unlink-site',
  (select id from cv_uws), 'cf000000-0000-4000-8000-0000000000e1', repeat('e', 64));
select pg_temp.cv_assert((select value from cv_result where label = 'unlink-replay')
  = (select value from cv_result where label = 'unlink-1') || '{"replayed":true,"alreadyUnlinked":true}'::jsonb, 'same unlink command replays');
insert into cv_result select 'unlink-again', public.unlink_tenant_from_business('operator@strelva.example.test', 'unlink-site',
  (select id from cv_uws), 'cf000000-0000-4000-8000-0000000000e2', repeat('f', 64));
select pg_temp.cv_assert((select value->>'alreadyUnlinked' = 'true' and value->>'linkId' = (select value->>'linkId' from cv_result where label = 'unlink-1')
  from cv_result where label = 'unlink-again') and (select count(*) from public.tenant_workspace_unlinks) = 1, 'second unlink wrote nothing');
select pg_temp.cv_expect(format($$select public.unlink_tenant_from_business('operator@strelva.example.test','unlink-site',%L,'cf000000-0000-4000-8000-0000000000e1',repeat('0',64))$$, (select id from cv_uws)), 'tenant_unlink_idempotency_conflict');
select pg_temp.cv_expect($$select public.unlink_tenant_from_business('operator@strelva.example.test','undo-site','cf000000-0000-4000-8000-000000000010','cf000000-0000-4000-8000-0000000000e3',repeat('a',64))$$, 'tenant_unlink_not_linked');
select pg_temp.cv_assert((select p->'plan' = 'null'::jsonb and p#>>'{lastUnlink,linkId}' = (select value->>'linkId' from cv_result where label = 'unlink-1')
  from (select public.preview_tenant_unlink('operator@strelva.example.test', 'unlink-site') p) x), 'preview shows the last unlink');
select pg_temp.cv_expect($$update public.tenant_workspace_unlinks set receipt = '{}'$$, 'tenant_workspace_unlink_immutable');
select pg_temp.cv_expect($$delete from public.tenant_workspace_unlinks$$, 'tenant_workspace_unlink_immutable');
select pg_temp.cv_expect($$delete from public.tenant_workspace_links$$, 'tenant_workspace_link_immutable');

-- Reconvert with the very same plan: a fresh business, leads attach again.
insert into cv_result select 'reconvert', public.convert_tenant_to_business('operator@strelva.example.test', 'unlink-site',
  (select payload from cv_unlink_payload), 'cf000000-0000-4000-8000-0000000000d0', repeat('d', 64));
create temporary table cv_rws as select (value->>'workspaceId')::uuid as id from cv_result where label = 'reconvert';
select pg_temp.cv_assert((select value->>'alreadyConverted' = 'false' and value->>'replayed' = 'false' and (value->>'workspaceId')::uuid <> (select id from cv_uws)
  from cv_result where label = 'reconvert')
  and (select count(*) from public.business_record_facts where workspace_id = (select id from cv_rws)) = 9
  and (select count(*) from public.business_contacts where workspace_id = (select id from cv_rws)) = 3, 'reconversion after unlink starts clean');
do $$ begin
  if to_regclass('public.tenant_leads') is not null then
    execute $q$select pg_temp.cv_assert((select count(*) from public.tenant_leads where tenant_stable_id = 'c0ffee00-0000-4000-8000-0000000000d1'
      and workspace_id = (select id from cv_rws)) = 4, 'reconversion reattached every lead')$q$;
  end if;
end $$;

-- Unlink after an owner edit: owner data and the business stay; the rest of the import goes.
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
  select id, 'cf000000-0000-4000-8000-000000000006', 'owner', 'cf000000-0000-4000-8000-000000000001' from cv_rws;
select public.patch_business_record((select id from cv_rws), 'cf000000-0000-4000-8000-000000000006', 'client-owner@example.test', 'owner', 1,
  '{"facts":{"phone":{"value":"716-555-0100"}},"services":[{"op":"upsert","name":"Gift boxes"}]}', 'cf000000-0000-4000-8000-0000000000e4', repeat('1', 64));
insert into cv_result select 'unlink-edited', public.unlink_tenant_from_business('operator@strelva.example.test', 'unlink-site',
  (select id from cv_rws), 'cf000000-0000-4000-8000-0000000000e5', repeat('2', 64));
select pg_temp.cv_assert((select value->>'workspaceDeleted' = 'false'
  and value->'workspaceKeptBecause' = '["other_members","record_has_other_data","record_history_after_import"]'::jsonb
  and value#>>'{entities,removed}' = '14' and value#>>'{entities,kept}' = '1'
  and value->'kept' = '[{"entity":"fact","id":"phone","reason":"changed_after_import"}]'::jsonb
  and value->>'sequence' = '3'
  from cv_result where label = 'unlink-edited'), 'unlink receipt names what it kept and why');
select pg_temp.cv_assert((select string_agg(fact_key || '=' || (value #>> '{}') || ':' || source, ',') from public.business_record_facts where workspace_id = (select id from cv_rws))
  = 'phone=716-555-0100:owner', 'only the owner-edited fact remains');
select pg_temp.cv_assert((select string_agg(name || ':' || source, ',') from public.business_services where workspace_id = (select id from cv_rws)) = 'Gift boxes:owner'
  and not exists (select 1 from public.business_people where workspace_id = (select id from cv_rws))
  and not exists (select 1 from public.business_contacts where workspace_id = (select id from cv_rws)), 'owner service kept; imported services, people and contacts removed');
select pg_temp.cv_assert((select count(*) = 2 from public.workspace_memberships where workspace_id = (select id from cv_rws))
  and not exists (select 1 from public.tenant_workspace_links where workspace_id = (select id from cv_rws)), 'business kept with both members; link gone');
select pg_temp.cv_assert((select actor_kind = 'operator' and source = 'tenant_import' and undo_of_sequence is null and result#>>'{unlinkOf,importSequence}' = '1'
  and jsonb_array_length(changes) = 14
  from public.business_record_revisions where workspace_id = (select id from cv_rws) and sequence = 3), 'the unlink is one history row in the kept record');
select pg_temp.cv_assert((public.read_business_record((select id from cv_rws), 'cf000000-0000-4000-8000-000000000006', 'client-owner@example.test')->>'revision') = '3', 'owner still reads the kept record');
do $$ begin
  if to_regclass('public.tenant_leads') is not null then
    execute $q$select pg_temp.cv_assert(not exists (select 1 from public.tenant_leads where workspace_id = (select id from cv_rws)), 'leads detached from the kept business')$q$;
  end if;
end $$;

-- A joined site unlinks without touching what its business held before: only
-- the fact and contact it brought go. Its exact plan can then join again.
insert into cv_result select 'unlink-joined', public.unlink_tenant_from_business('operator@strelva.example.test', 'gldf-second-site',
  (select id from cv_ws), 'cf000000-0000-4000-8000-0000000000e6', repeat('3', 64));
select pg_temp.cv_assert((select value->>'workspaceDeleted' = 'false' and value->'workspaceKeptBecause' ? 'joined_existing_workspace'
  and value->'workspaceKeptBecause' ? 'other_sites_linked' and value#>>'{entities,removed}' = '2'
  from cv_result where label = 'unlink-joined'), 'joined unlink keeps the business');
select pg_temp.cv_assert(not exists (select 1 from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'legal_name')
  and (select value #>> '{}' from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'display_name') = 'Great Lakes Dried Fruit'
  and (select count(*) from public.business_record_facts where workspace_id = (select id from cv_ws)) = 9
  and (select count(*) from public.business_services where workspace_id = (select id from cv_ws)) = 2
  and (select count(*) from public.business_contacts where workspace_id = (select id from cv_ws)) = 3
  and (select count(*) from public.tenant_workspace_links where workspace_id = (select id from cv_ws)) = 1, 'pre-existing record intact; the other site stays linked');
insert into cv_result select 'rejoin', public.convert_tenant_to_business('operator@strelva.example.test', 'gldf-second-site',
  pg_temp.cv_route(jsonb_build_object('tenantId', 'gldf-second-site', 'tenantStableId', 'c0ffee00-0000-4000-8000-0000000000a2',
    'workspaceName', 'Great Lakes Dried Fruit Wholesale', 'targetWorkspaceId', (select id from cv_ws),
    'billing', null, 'account', jsonb_build_object('id', 'acct-fixture', 'name', 'Great Lakes', 'tenantIds', jsonb_build_array('gldf', 'gldf-second-site'), 'multiSite', true),
    'patch', jsonb_build_object('facts', jsonb_build_object(
      'display_name', jsonb_build_object('value', 'Great Lakes Dried Fruit Wholesale', 'verified', false),
      'legal_name', jsonb_build_object('value', 'Great Lakes Dried Fruit LLC', 'verified', false)),
      'services', jsonb_build_array(jsonb_build_object('op', 'upsert', 'name', 'Pallet orders'))),
    'contacts', jsonb_build_array(jsonb_build_object('email', 'buyer@example.net', 'source', 'inquiry')))),
  'cf000000-0000-4000-8000-0000000000c3', repeat('7', 64));
select pg_temp.cv_assert((select value->>'alreadyConverted' = 'false' and value->>'joinedExistingWorkspace' = 'true' from cv_result where label = 'rejoin')
  and (select count(*) from public.tenant_workspace_links where workspace_id = (select id from cv_ws)) = 2
  and exists (select 1 from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'legal_name'), 'the same join plan applies again after unlink');

-- An import already undone through history still unlinks, and the business it
-- created still goes: its only history is the import and that undo.
insert into cv_result select 'undo-convert', public.convert_tenant_to_business('operator@strelva.example.test', 'undo-site',
  pg_temp.cv_route('{"tenantId":"undo-site","tenantStableId":"c0ffee00-0000-4000-8000-0000000000d2","workspaceName":"Undo Site","billing":null,"account":null,"patch":{"facts":{"display_name":{"value":"Undo Site"}}},"contacts":[{"email":"undo-lead@example.test","source":"inquiry"}]}'::jsonb),
  'cf000000-0000-4000-8000-0000000000e7', repeat('5', 64));
select public.undo_business_record_revision((value->>'workspaceId')::uuid, 'cf000000-0000-4000-8000-000000000001', 'operator@strelva.example.test', 'operator', 1,
  'cf000000-0000-4000-8000-0000000000e8', repeat('6', 64)) from cv_result where label = 'undo-convert';
insert into cv_result select 'undo-unlink', public.unlink_tenant_from_business('operator@strelva.example.test', 'undo-site',
  (value->>'workspaceId')::uuid, 'cf000000-0000-4000-8000-0000000000e9', repeat('7', 64)) from cv_result where label = 'undo-convert';
select pg_temp.cv_assert((select value->>'workspaceDeleted' = 'true' and value#>>'{entities,alreadyReverted}' = '2' and value#>>'{entities,removed}' = '0'
  from cv_result where label = 'undo-unlink')
  and not exists (select 1 from public.workspaces where id = (select (value->>'workspaceId')::uuid from cv_result where label = 'undo-convert')), 'undone import unlinks cleanly');
rollback;
