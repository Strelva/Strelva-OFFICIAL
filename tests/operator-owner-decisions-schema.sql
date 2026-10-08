\set ON_ERROR_STOP on
-- #530 M8: a Strelva operator never decides an owner item, even holding an
-- admin seat on the business. Fictional rows inside a rolled-back transaction.
-- Run with --set=after_rollback=true to prove the rollback restores the old
-- member branch.
\if :{?after_rollback}
\else
\set after_rollback false
\endif
begin;
create or replace function pg_temp.od_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'operator owner decision assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.od_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.od_assert(
  has_function_privilege('service_role', 'public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.claim_owner_decision(uuid,uuid,text,text,text,uuid,text,text)', 'EXECUTE'),
  'only service_role claims decisions');

insert into public.users(id, email, verified_at) values
  ('af530000-0000-4000-8000-000000000001', 'od-owner@example.test', now()),
  ('af530000-0000-4000-8000-000000000002', 'od-admin@example.test', now()),
  ('af530000-0000-4000-8000-000000000003', 'od-operator-admin@strelva.example.test', now()),
  ('af530000-0000-4000-8000-000000000004', 'od-operator-owner@strelva.example.test', now()),
  ('af530000-0000-4000-8000-000000000005', 'od-revoked-operator@strelva.example.test', now()),
  ('af530000-0000-4000-8000-000000000006', 'od-agency-staff@agency.example.test', now()),
  ('af530000-0000-4000-8000-000000000007', 'od-agency-member@agency.example.test', now());
insert into public.super_admins(user_id, email, revoked_at) values
  ('af530000-0000-4000-8000-000000000003', 'od-operator-admin@strelva.example.test', null),
  ('af530000-0000-4000-8000-000000000004', 'od-operator-owner@strelva.example.test', null),
  ('af530000-0000-4000-8000-000000000005', 'od-revoked-operator@strelva.example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('af530000-0000-4000-8000-000000000010', 'customer', 'Operator Decision Fixture Firm', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000011', 'customer', 'Operator Owned Fixture Firm', 'af530000-0000-4000-8000-000000000004'),
  ('af530000-0000-4000-8000-000000000012', 'agency', 'Fixture Provider Agency', 'af530000-0000-4000-8000-000000000006');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000001', 'owner', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000002', 'admin', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000003', 'admin', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000005', 'admin', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000011', 'af530000-0000-4000-8000-000000000004', 'owner', 'af530000-0000-4000-8000-000000000004'),
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000004', 'admin', 'af530000-0000-4000-8000-000000000001'),
  -- Agency staff holding a direct admin seat on the business, and an
  -- unstaffed member of the same agency with one too.
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000006', 'admin', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000007', 'admin', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000012', 'af530000-0000-4000-8000-000000000006', 'owner', 'af530000-0000-4000-8000-000000000006'),
  ('af530000-0000-4000-8000-000000000012', 'af530000-0000-4000-8000-000000000007', 'member', 'af530000-0000-4000-8000-000000000006');
insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by) values
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000012', 'owner', 'af530000-0000-4000-8000-000000000001');
insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by) values
  ('af530000-0000-4000-8000-000000000012', 'af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000006', 'af530000-0000-4000-8000-000000000006');
insert into public.tenants(id, stable_id, site_name, active) values
  ('od-agency-fixture', 'af530000-0000-4000-8000-000000000020', 'Operator Decision Fixture Site', true);
insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by, command_id, command_digest, receipt) values
  ('af530000-0000-4000-8000-000000000020', 'od-agency-fixture', 'af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000001', gen_random_uuid(), repeat('a', 64), '{}'::jsonb);

create temporary table od_items(name text primary key, id uuid not null) on commit drop;
grant select on od_items to service_role;
select format('grant usage on schema %I to service_role',nspname) from pg_namespace where oid=pg_my_temp_schema() \gexec
-- Owner items an admin may decide (adminMayDecide), one per decider.
insert into od_items
select 'item-' || n, (public.open_owner_decision('af530000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','system.go_live','route','owner_decides','title','Put the fixture page live ' || n,'approveEffect','It goes live',
  'notYetEffect','Nothing goes live','sourceLifecycle','website_document','sourceId','od-page-' || n,'revisionHash', repeat(n::text, 64),
  'adminMayDecide', true))->>'id')::uuid
from generate_series(1, 6) n;
insert into od_items select 'second-operator-admin', (public.open_owner_decision('af530000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','system.go_live','route','owner_decides','title','Second operator is not this owner','approveEffect','It goes live',
  'notYetEffect','Nothing goes live','sourceLifecycle','website_document','sourceId','od-second-operator','revisionHash', repeat('7',64),
  'adminMayDecide',true))->>'id')::uuid;
insert into od_items select 'owned', (public.open_owner_decision('af530000-0000-4000-8000-000000000011', jsonb_build_object(
  'kind','system.go_live','route','owner_decides','title','Put the operator''s own page live','approveEffect','It goes live',
  'notYetEffect','Nothing goes live','sourceLifecycle','website_document','sourceId','od-owned','revisionHash', repeat('5', 64),
  'adminMayDecide', true))->>'id')::uuid;

\if :after_rollback
-- Rolled back: the old member branch lets the operator's admin seat decide.
set local role service_role;
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-1'),repeat('1',64),'approve','session','af530000-0000-4000-8000-000000000003','od-operator-admin@strelva.example.test',null)->>'status') = 'claimed',
  'rollback restores the original member branch');
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-5'),repeat('5',64),'approve','session','af530000-0000-4000-8000-000000000006','od-agency-staff@agency.example.test',null)->>'status') = 'claimed',
  'rollback lets agency staff with an admin seat decide again');
select pg_temp.od_assert(to_regprocedure('public.business_agency_seat(uuid,uuid)') is null
  and to_regprocedure('public.tenant_agency_seat(text,uuid)') is null, 'rollback drops the agency seat lookups');
\else
-- The agency seat lookups: service_role reads the tenant one only.
select pg_temp.od_assert(
  has_function_privilege('service_role', 'public.tenant_agency_seat(text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.tenant_agency_seat(text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.tenant_agency_seat(text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.business_agency_seat(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.business_agency_seat(uuid,uuid)', 'EXECUTE'),
  'only service_role reads agency seats');
select pg_temp.od_assert(public.tenant_agency_seat('od-agency-fixture', 'af530000-0000-4000-8000-000000000006') = 'af530000-0000-4000-8000-000000000012',
  'staff resolve to their agency through the linked tenant');
select pg_temp.od_assert(public.tenant_agency_seat('od-agency-fixture', 'af530000-0000-4000-8000-000000000007') = 'af530000-0000-4000-8000-000000000012',
  'an unstaffed member of the provider agency is still the agency');
select pg_temp.od_assert(public.tenant_agency_seat('od-agency-fixture', 'af530000-0000-4000-8000-000000000001') is null
  and public.tenant_agency_seat('od-agency-fixture', 'af530000-0000-4000-8000-000000000002') is null
  and public.tenant_agency_seat('no-such-tenant', 'af530000-0000-4000-8000-000000000006') is null,
  'the owner, an ordinary admin and an unlinked tenant are not agency');
-- Agency staff (staffed or not) with an admin seat are refused an owner item.
set local role service_role;
select pg_temp.od_expect(format($$select public.claim_owner_decision('af530000-0000-4000-8000-000000000010',%L,%L,'approve','session','af530000-0000-4000-8000-000000000006','od-agency-staff@agency.example.test',null)$$,
  (select id from od_items where name = 'item-5'), repeat('5',64)), 'owner_decision_owner_only');
select pg_temp.od_expect(format($$select public.claim_owner_decision('af530000-0000-4000-8000-000000000010',%L,%L,'not_yet','session','af530000-0000-4000-8000-000000000007','od-agency-member@agency.example.test',null)$$,
  (select id from od_items where name = 'item-6'), repeat('6',64)), 'owner_decision_owner_only');
reset role;
select to_regprocedure('public.needs_you_provider_id(uuid,uuid,text)') is not null as provider_gate \gset
\if :provider_gate
-- The same ordinary agency actor may decide platform work with no direct
-- customer membership. The operator exclusion must not revoke this authority.
delete from public.workspace_memberships where workspace_id='af530000-0000-4000-8000-000000000010'
  and user_id='af530000-0000-4000-8000-000000000006';
insert into od_items select 'platform', (public.open_owner_decision('af530000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','system.go_live','route','strelva_reviews','title','Review fixture platform work','approveEffect','It proceeds',
  'notYetEffect','Nothing proceeds','sourceLifecycle','website_document','sourceId','od-platform','revisionHash',repeat('7',64)))->>'id')::uuid;
set local role service_role;
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name='platform'),repeat('7',64),'approve','operator','af530000-0000-4000-8000-000000000006','od-agency-staff@agency.example.test',null)->>'status')='claimed',
  'staffed agency decides platform work without direct client membership or superadmin');
select pg_temp.od_expect(format($$select public.claim_owner_decision('af530000-0000-4000-8000-000000000010',%L,%L,'approve','operator','af530000-0000-4000-8000-000000000006','od-agency-staff@agency.example.test',null)$$,
  (select id from od_items where name='item-5'),repeat('5',64)), 'owner_decision_owner_only');
reset role;
\endif
-- Once the seat ends they are only an admin again.
update public.provider_seats set status = 'ended', ended_by = 'af530000-0000-4000-8000-000000000001', ended_at = clock_timestamp(), end_reason = 'fixture'
  where customer_workspace_id = 'af530000-0000-4000-8000-000000000010';
select pg_temp.od_assert(public.tenant_agency_seat('od-agency-fixture', 'af530000-0000-4000-8000-000000000006') is null, 'an ended seat is no agency');
set local role service_role;
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-6'),repeat('6',64),'approve','session','af530000-0000-4000-8000-000000000007','od-agency-member@agency.example.test',null)->>'status') = 'claimed',
  'after the seat ends their admin seat decides as an admin');
-- An operator with an admin seat is refused on an owner item, approve or not yet.
select pg_temp.od_expect(format($$select public.claim_owner_decision('af530000-0000-4000-8000-000000000010',%L,%L,'approve','session','af530000-0000-4000-8000-000000000003','od-operator-admin@strelva.example.test',null)$$,
  (select id from od_items where name = 'item-1'), repeat('1',64)), 'owner_decision_owner_only');
select pg_temp.od_expect(format($$select public.claim_owner_decision('af530000-0000-4000-8000-000000000010',%L,%L,'not_yet','session','af530000-0000-4000-8000-000000000003','od-operator-admin@strelva.example.test',null)$$,
  (select id from od_items where name = 'item-1'), repeat('1',64)), 'owner_decision_owner_only');
reset role;
select pg_temp.od_assert((select state = 'open' and decided_by is null from public.owner_decisions where id = (select id from od_items where name = 'item-1')),
  'the refused item stays open and undecided');
-- Every active operator is refused, not just a representative registry row.
-- This second operator owns another business, but is only an admin here.
select pg_temp.od_expect(format($$select public.claim_owner_decision('af530000-0000-4000-8000-000000000010',%L,%L,'approve','session','af530000-0000-4000-8000-000000000004','od-operator-owner@strelva.example.test',null)$$,
  (select id from od_items where name='second-operator-admin'),repeat('7',64)), 'owner_decision_owner_only');
select pg_temp.od_expect(format($$select public.claim_owner_decision('af530000-0000-4000-8000-000000000010',%L,%L,'not_yet','session','af530000-0000-4000-8000-000000000004','od-operator-owner@strelva.example.test',null)$$,
  (select id from od_items where name='second-operator-admin'),repeat('7',64)), 'owner_decision_owner_only');
select pg_temp.od_assert((select state='open' and decided_by is null from public.owner_decisions where id=(select id from od_items where name='second-operator-admin')),
  'both active operators remain unable to decide for this owner');
-- A revoked super admin is no longer an operator: their admin seat decides as an admin.
set local role service_role;
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-2'),repeat('2',64),'approve','session','af530000-0000-4000-8000-000000000005','od-revoked-operator@strelva.example.test',null)->>'status') = 'claimed',
  'a revoked operator''s admin seat decides as an admin');
\endif

-- Unchanged: an ordinary admin decides an admin_may_decide item; the owner decides theirs.
set local role service_role;
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-3'),repeat('3',64),'approve','session','af530000-0000-4000-8000-000000000002','od-admin@example.test',null)->>'status') = 'claimed',
  'an ordinary admin still decides an admin_may_decide item');
reset role;
select pg_temp.od_assert((select decided_by_kind = 'admin_session' from public.owner_decisions where id = (select id from od_items where name = 'item-3')),
  'recorded as an admin session');
set local role service_role;
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-4'),repeat('4',64),'not_yet','session','af530000-0000-4000-8000-000000000001','od-owner@example.test',null)->>'status') = 'claimed',
  'the owner decides');
-- A super admin who owns the business decides as its owner.
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000011',(select id from od_items where name = 'owned'),repeat('5',64),'approve','session','af530000-0000-4000-8000-000000000004','od-operator-owner@strelva.example.test',null)->>'status') = 'claimed',
  'a super admin who is the owner decides as the owner');
reset role;
select pg_temp.od_assert((select decided_by_kind = 'owner_session' from public.owner_decisions where id = (select id from od_items where name = 'owned')),
  'recorded as an owner session');

rollback;
\echo 'Operator owner decision SQL checks passed.'
