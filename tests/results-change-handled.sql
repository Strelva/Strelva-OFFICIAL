\set ON_ERROR_STOP on
-- Results' "The change that mattered" from a real What changed row
-- (scripts/check-results-change-sql.sh). Fictional rows in a transaction that
-- is rolled back; the two reads are written to the files the runner names.
begin;
insert into public.users(id, email, verified_at) values
  ('ae000000-0000-4000-8000-000000000001', 'rc-owner@example.test', now()),
  ('ae000000-0000-4000-8000-000000000002', 'rc-quiet-owner@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('ae000000-0000-4000-8000-000000000010', 'customer', 'Harbor Fixture Dental', 'ae000000-0000-4000-8000-000000000001'),
  ('ae000000-0000-4000-8000-000000000011', 'customer', 'Quiet Fixture Studio', 'ae000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('ae000000-0000-4000-8000-000000000010', 'ae000000-0000-4000-8000-000000000001', 'owner', 'ae000000-0000-4000-8000-000000000001'),
  ('ae000000-0000-4000-8000-000000000011', 'ae000000-0000-4000-8000-000000000002', 'owner', 'ae000000-0000-4000-8000-000000000002');

create temporary table rc_item as select (public.open_owner_decision('ae000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','customer.commitment','route','owner_decides','title','Booking request: Priya Shah, Tue 3:00 PM',
  'approveEffect','The booking is confirmed for this time.','notYetEffect','The time is released and the booking is not confirmed.',
  'sourceLifecycle','booking_request','sourceId','rc-booking','revisionHash',repeat('a',64),'urgent',true,
  'openHref','/workspace/bookings?view=week'))->>'id')::uuid as id;
select public.claim_owner_decision('ae000000-0000-4000-8000-000000000010', (select id from rc_item), repeat('a',64),
  'approve', 'session', 'ae000000-0000-4000-8000-000000000001', 'rc-owner@example.test', null);
select public.finish_owner_decision('ae000000-0000-4000-8000-000000000010', (select id from rc_item), 'done', null, 'booking:rc:confirmed');

\pset tuples_only on
\pset format unaligned
\o :handled_out
select public.read_strelva_handled('ae000000-0000-4000-8000-000000000010', 'ae000000-0000-4000-8000-000000000001', 'rc-owner@example.test', now() - interval '7 days');
\o :empty_out
select public.read_strelva_handled('ae000000-0000-4000-8000-000000000011', 'ae000000-0000-4000-8000-000000000002', 'rc-quiet-owner@example.test', now() - interval '7 days');
\o
rollback;
