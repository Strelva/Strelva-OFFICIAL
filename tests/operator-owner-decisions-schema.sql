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
  ('af530000-0000-4000-8000-000000000005', 'od-revoked-operator@strelva.example.test', now());
insert into public.super_admins(user_id, email, revoked_at) values
  ('af530000-0000-4000-8000-000000000003', 'od-operator-admin@strelva.example.test', null),
  ('af530000-0000-4000-8000-000000000004', 'od-operator-owner@strelva.example.test', null),
  ('af530000-0000-4000-8000-000000000005', 'od-revoked-operator@strelva.example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('af530000-0000-4000-8000-000000000010', 'customer', 'Operator Decision Fixture Firm', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000011', 'customer', 'Operator Owned Fixture Firm', 'af530000-0000-4000-8000-000000000004');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000001', 'owner', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000002', 'admin', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000003', 'admin', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000010', 'af530000-0000-4000-8000-000000000005', 'admin', 'af530000-0000-4000-8000-000000000001'),
  ('af530000-0000-4000-8000-000000000011', 'af530000-0000-4000-8000-000000000004', 'owner', 'af530000-0000-4000-8000-000000000004');

create temporary table od_items(name text primary key, id uuid not null) on commit drop;
-- Owner items an admin may decide (adminMayDecide), one per decider.
insert into od_items
select 'item-' || n, (public.open_owner_decision('af530000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','system.go_live','route','owner_decides','title','Put the fixture page live ' || n,'approveEffect','It goes live',
  'notYetEffect','Nothing goes live','sourceLifecycle','website_document','sourceId','od-page-' || n,'revisionHash', repeat(n::text, 64),
  'adminMayDecide', true))->>'id')::uuid
from generate_series(1, 4) n;
insert into od_items select 'owned', (public.open_owner_decision('af530000-0000-4000-8000-000000000011', jsonb_build_object(
  'kind','system.go_live','route','owner_decides','title','Put the operator''s own page live','approveEffect','It goes live',
  'notYetEffect','Nothing goes live','sourceLifecycle','website_document','sourceId','od-owned','revisionHash', repeat('5', 64),
  'adminMayDecide', true))->>'id')::uuid;

\if :after_rollback
-- Rolled back: the old member branch lets the operator's admin seat decide.
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-1'),repeat('1',64),'approve','session','af530000-0000-4000-8000-000000000003','od-operator-admin@strelva.example.test',null)->>'status') = 'claimed',
  'rollback restores the original member branch');
\else
-- An operator with an admin seat is refused on an owner item, approve or not yet.
select pg_temp.od_expect(format($$select public.claim_owner_decision('af530000-0000-4000-8000-000000000010',%L,%L,'approve','session','af530000-0000-4000-8000-000000000003','od-operator-admin@strelva.example.test',null)$$,
  (select id from od_items where name = 'item-1'), repeat('1',64)), 'owner_decision_owner_only');
select pg_temp.od_expect(format($$select public.claim_owner_decision('af530000-0000-4000-8000-000000000010',%L,%L,'not_yet','session','af530000-0000-4000-8000-000000000003','od-operator-admin@strelva.example.test',null)$$,
  (select id from od_items where name = 'item-1'), repeat('1',64)), 'owner_decision_owner_only');
select pg_temp.od_assert((select state = 'open' and decided_by is null from public.owner_decisions where id = (select id from od_items where name = 'item-1')),
  'the refused item stays open and undecided');
-- A revoked super admin is no longer an operator: their admin seat decides as an admin.
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-2'),repeat('2',64),'approve','session','af530000-0000-4000-8000-000000000005','od-revoked-operator@strelva.example.test',null)->>'status') = 'claimed',
  'a revoked operator''s admin seat decides as an admin');
\endif

-- Unchanged: an ordinary admin decides an admin_may_decide item; the owner decides theirs.
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-3'),repeat('3',64),'approve','session','af530000-0000-4000-8000-000000000002','od-admin@example.test',null)->>'status') = 'claimed',
  'an ordinary admin still decides an admin_may_decide item');
select pg_temp.od_assert((select decided_by_kind = 'admin_session' from public.owner_decisions where id = (select id from od_items where name = 'item-3')),
  'recorded as an admin session');
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000010',(select id from od_items where name = 'item-4'),repeat('4',64),'not_yet','session','af530000-0000-4000-8000-000000000001','od-owner@example.test',null)->>'status') = 'claimed',
  'the owner decides');
-- A super admin who owns the business decides as its owner.
select pg_temp.od_assert((public.claim_owner_decision('af530000-0000-4000-8000-000000000011',(select id from od_items where name = 'owned'),repeat('5',64),'approve','session','af530000-0000-4000-8000-000000000004','od-operator-owner@strelva.example.test',null)->>'status') = 'claimed',
  'a super admin who is the owner decides as the owner');
select pg_temp.od_assert((select decided_by_kind = 'owner_session' from public.owner_decisions where id = (select id from od_items where name = 'owned')),
  'recorded as an owner session');

rollback;
\echo 'Operator owner decision SQL checks passed.'
