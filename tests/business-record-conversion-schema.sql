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
create temporary table cv_result(label text primary key, value jsonb);

insert into public.users(id, email, verified_at) values
  ('cf000000-0000-4000-8000-000000000001', 'operator@strelva.example.test', now()),
  ('cf000000-0000-4000-8000-000000000002', 'not-an-operator@example.test', now()),
  ('cf000000-0000-4000-8000-000000000003', 'revoked-operator@strelva.example.test', now()),
  ('cf000000-0000-4000-8000-000000000004', 'other-business-owner@example.test', now());
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
select pg_temp.cv_assert((select value->>'replayed' = 'false' and value->>'alreadyConverted' = 'false' and value->>'operatorRole' = 'admin'
  and value#>>'{billing,billingType}' = 'tier' and value#>>'{billing,grandfathered}' = 'true' and value->'account' = 'null'::jsonb
  from cv_result where label = 'first'), 'receipt records the operator role and billing as observed');
select pg_temp.cv_assert((select kind = 'customer' and name = 'Great Lakes Dried Fruit' and created_by = 'cf000000-0000-4000-8000-000000000001'
  from public.workspaces where id = (select id from cv_ws)), 'customer business created by the operator');
select pg_temp.cv_assert((select count(*) = 1 and bool_and(user_id = 'cf000000-0000-4000-8000-000000000001' and role = 'admin')
  from public.workspace_memberships where workspace_id = (select id from cv_ws)), 'the operator is the only member, as admin; no client user, no owner');
select pg_temp.cv_assert((select count(*) from public.memberships) = (select tenant_memberships from cv_counts_before), 'no tenant membership created');
select pg_temp.cv_assert((select to_jsonb(t) from public.tenants t where id = 'gldf') = (select row from cv_tenant_before), 'tenant row unchanged');

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
  jsonb_build_object('tenantId', 'gldf-second-site', 'tenantStableId', 'c0ffee00-0000-4000-8000-0000000000a2',
    'workspaceName', 'Great Lakes Dried Fruit Wholesale', 'targetWorkspaceId', (select id from cv_ws),
    'billing', null, 'account', jsonb_build_object('id', 'acct-fixture', 'name', 'Great Lakes', 'tenantIds', jsonb_build_array('gldf', 'gldf-second-site'), 'multiSite', true),
    'patch', jsonb_build_object('facts', jsonb_build_object(
      'display_name', jsonb_build_object('value', 'Great Lakes Dried Fruit Wholesale', 'verified', false),
      'legal_name', jsonb_build_object('value', 'Great Lakes Dried Fruit LLC', 'verified', false)),
      'services', jsonb_build_array(jsonb_build_object('op', 'upsert', 'name', 'Pallet orders'))),
    'contacts', jsonb_build_array(jsonb_build_object('email', 'buyer@example.net', 'source', 'inquiry'))),
  'cf000000-0000-4000-8000-0000000000c3', repeat('7', 64));
select pg_temp.cv_assert((select value->>'joinedExistingWorkspace' = 'true' and value->>'workspaceId' = (select id::text from cv_ws) and value#>>'{account,multiSite}' = 'true'
  from cv_result where label = 'second'), 'second site joined the account business');
select pg_temp.cv_assert((select count(*) from public.tenant_workspace_links where workspace_id = (select id from cv_ws)) = 2, 'one business, two linked sites');
select pg_temp.cv_assert((select value #>> '{}' from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'display_name') = 'Great Lakes Dried Fruit'
  and exists (select 1 from public.business_record_facts where workspace_id = (select id from cv_ws) and fact_key = 'legal_name')
  and (select count(*) from public.business_services where workspace_id = (select id from cv_ws)) = 2
  and (select count(*) from public.business_contacts where workspace_id = (select id from cv_ws)) = 4, 'joining fills only missing facts and merges contacts');
select pg_temp.cv_assert((select count(*) from public.workspace_memberships where workspace_id = (select id from cv_ws)) = 1, 'joining granted nobody anything');
select pg_temp.cv_expect($$select public.convert_tenant_to_business('operator@strelva.example.test','quiet-site','{"tenantId":"quiet-site","tenantStableId":"c0ffee00-0000-4000-8000-0000000000a3","workspaceName":"Quiet Site","targetWorkspaceId":"cf000000-0000-4000-8000-000000000010","billing":null,"account":null,"patch":{},"contacts":[]}','cf000000-0000-4000-8000-0000000000c4',repeat('6',64))$$, 'tenant_conversion_target_invalid');

-- A tenant with no owner_recipient fact falls back to tenants.owner_email through the link.
insert into cv_result select 'quiet', public.convert_tenant_to_business('operator@strelva.example.test', 'quiet-site',
  '{"tenantId":"quiet-site","tenantStableId":"c0ffee00-0000-4000-8000-0000000000a3","workspaceName":"Quiet Site","billing":null,"account":null,"patch":{},"contacts":[]}',
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
rollback;
