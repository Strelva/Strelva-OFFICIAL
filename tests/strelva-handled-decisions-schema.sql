\set ON_ERROR_STOP on
-- Strelva handled lists decided owner decisions (20261009130000). Fictional
-- rows inside a transaction that is rolled back.
begin;
create or replace function pg_temp.hd_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'strelva handled assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.hd_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.hd_assert(
  has_function_privilege('service_role', 'public.read_strelva_handled(uuid,uuid,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_strelva_handled(uuid,uuid,text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.read_strelva_handled(uuid,uuid,text,timestamptz)', 'EXECUTE'),
  'only service_role reads Strelva handled');

insert into public.users(id, email, verified_at) values
  ('ad000000-0000-4000-8000-000000000001', 'hd-owner@example.test', now()),
  ('ad000000-0000-4000-8000-000000000002', 'hd-member@example.test', now()),
  ('ad000000-0000-4000-8000-000000000003', 'hd-other-owner@example.test', now()),
  ('ad000000-0000-4000-8000-000000000004', 'hd-stranger@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('ad000000-0000-4000-8000-000000000010', 'customer', 'Harbor Fixture Pilates', 'ad000000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-000000000011', 'customer', 'Other Fixture Business', 'ad000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('ad000000-0000-4000-8000-000000000010', 'ad000000-0000-4000-8000-000000000001', 'owner', 'ad000000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-000000000010', 'ad000000-0000-4000-8000-000000000002', 'member', 'ad000000-0000-4000-8000-000000000001'),
  ('ad000000-0000-4000-8000-000000000011', 'ad000000-0000-4000-8000-000000000003', 'owner', 'ad000000-0000-4000-8000-000000000003');

create temporary table hd_items(name text primary key, id uuid, workspace uuid);
create function pg_temp.hd_open(p_workspace uuid, p_name text, p_lifecycle text, p_title text, p_hash text) returns void language plpgsql as $$
begin
  insert into hd_items values (p_name, (public.open_owner_decision(p_workspace, jsonb_build_object(
    'kind','customer.commitment','route','owner_decides','title',p_title,
    'approveEffect','The booking is confirmed for this time.','notYetEffect','The time is released and the booking is not confirmed.',
    'sourceLifecycle',p_lifecycle,'sourceId',p_name,'revisionHash',p_hash,'urgent',true,
    'openHref','/workspace/bookings?view=week'))->>'id')::uuid, p_workspace);
end; $$;
select pg_temp.hd_open('ad000000-0000-4000-8000-000000000010', 'keep', 'booking_request', 'Booking request: Dana Reed, Tue 3:00 PM', repeat('a',64));
select pg_temp.hd_open('ad000000-0000-4000-8000-000000000010', 'release', 'booking_request', 'Booking request: Ana Ruiz, Wed 4:00 PM', repeat('b',64));
select pg_temp.hd_open('ad000000-0000-4000-8000-000000000010', 'waiting', 'booking_request', 'Booking request: Lee Park, Thu 10:00 AM', repeat('c',64));
select pg_temp.hd_open('ad000000-0000-4000-8000-000000000010', 'gone', 'booking_request', 'Booking request: Jo Banks, Fri 1:00 PM', repeat('d',64));
select pg_temp.hd_open('ad000000-0000-4000-8000-000000000011', 'theirs', 'booking_request', 'Booking request: Someone Else, Mon 9:00 AM', repeat('e',64));

-- The owner approves one and says Not yet to another; one stays open; one is withdrawn.
select public.claim_owner_decision('ad000000-0000-4000-8000-000000000010', (select id from hd_items where name = 'keep'), repeat('a',64),
  'approve', 'session', 'ad000000-0000-4000-8000-000000000001', 'hd-owner@example.test', null);
select public.finish_owner_decision('ad000000-0000-4000-8000-000000000010', (select id from hd_items where name = 'keep'), 'done', null, 'booking:keep:confirmed');
select public.claim_owner_decision('ad000000-0000-4000-8000-000000000010', (select id from hd_items where name = 'release'), repeat('b',64),
  'not_yet', 'session', 'ad000000-0000-4000-8000-000000000001', 'hd-owner@example.test', null);
select public.finish_owner_decision('ad000000-0000-4000-8000-000000000010', (select id from hd_items where name = 'release'), 'done', null, 'booking:release:declined');
select public.withdraw_owner_decision('ad000000-0000-4000-8000-000000000010', (select id from hd_items where name = 'gone'), 'The customer cancelled the request.');
select public.claim_owner_decision('ad000000-0000-4000-8000-000000000011', (select id from hd_items where name = 'theirs'), repeat('e',64),
  'approve', 'session', 'ad000000-0000-4000-8000-000000000003', 'hd-other-owner@example.test', null);
select public.finish_owner_decision('ad000000-0000-4000-8000-000000000011', (select id from hd_items where name = 'theirs'), 'done', null, null);

create temporary table hd_read as
  select e as entry from jsonb_array_elements(public.read_strelva_handled('ad000000-0000-4000-8000-000000000010',
    'ad000000-0000-4000-8000-000000000002', 'hd-member@example.test', now() - interval '1 day')) e
  where e->>'store' = 'owner_decisions';

select pg_temp.hd_assert((select count(*) from hd_read) = 2, 'approved and declined decisions are listed; open and withdrawn are not');
select pg_temp.hd_assert(exists (select 1 from hd_read where entry->>'id' = (select id::text from hd_items where name = 'keep')
    and entry->>'state' = 'approved' and entry->>'outcome' = 'done' and entry->>'sourceLifecycle' = 'booking_request'
    and entry->>'sourceId' = 'keep' and entry->>'decidedByKind' = 'owner_session' and entry->>'receiptRef' = 'booking:keep:confirmed'
    and entry->>'approveEffect' = 'The booking is confirmed for this time.' and entry ? 'systemId'
    and entry->>'openHref' = '/workspace/bookings?view=week' and entry->>'undo' = 'not_undoable' and entry->>'at' is not null),
  'the approval carries what the receipt needs, and is never one-tap undo in SQL');
select pg_temp.hd_assert(exists (select 1 from hd_read where entry->>'id' = (select id::text from hd_items where name = 'release')
    and entry->>'state' = 'declined' and entry->>'notYetEffect' like 'The time is released%'),
  'the Not yet is listed with its effect');
select pg_temp.hd_assert(not exists (select 1 from hd_read where entry->>'id' = (select id::text from hd_items where name = 'theirs')),
  'another business''s decision never appears');

-- The window still applies.
select pg_temp.hd_assert(not exists (select 1 from jsonb_array_elements(public.read_strelva_handled('ad000000-0000-4000-8000-000000000010',
    'ad000000-0000-4000-8000-000000000001', 'hd-owner@example.test', now() + interval '1 hour')) e where e->>'store' = 'owner_decisions'),
  'nothing decided before the window is listed');

-- Cross-workspace denial: the other business's owner and a stranger read nothing here.
select pg_temp.hd_expect($$select public.read_strelva_handled('ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000003','hd-other-owner@example.test',null)$$,
  'owner_decision_access_denied');
select pg_temp.hd_expect($$select public.read_strelva_handled('ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000004','hd-stranger@example.test',null)$$,
  'owner_decision_access_denied');
select pg_temp.hd_assert((select count(*) from jsonb_array_elements(public.read_strelva_handled('ad000000-0000-4000-8000-000000000011',
    'ad000000-0000-4000-8000-000000000003', 'hd-other-owner@example.test', now() - interval '1 day')) e where e->>'store' = 'owner_decisions') = 1,
  'each business reads only its own decisions');

rollback;
\echo 'Strelva handled decisions SQL checks passed.'
