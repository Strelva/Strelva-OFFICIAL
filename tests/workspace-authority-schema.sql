\set ON_ERROR_STOP on

-- Workspace authority parity. Fictional local fixture only; never production.
-- Seeds owner, admin, member, a delegated-read agency member and an outsider,
-- then proves every write RPC from 20261005120100 allows or denies each one.
-- Concurrent removal and downgrade are proven by the loop that follows this
-- file in scripts/check-workspace-sql.sh.

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'assertion failed: %', message; end if;
end;
$$;

create function pg_temp.expect_error(stmt text, expected text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm <> expected then
      raise exception 'expected % but got % for: %', expected, sqlerrm, stmt;
    end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, stmt;
end;
$$;

create function pg_temp.expect_ok(stmt text)
returns void language plpgsql as $$
begin
  execute stmt;
exception when others then
  raise exception 'expected success but got % for: %', sqlerrm, stmt;
end;
$$;

-- Role x permission table. The Vitest parity test reads the rows between the
-- two markers and compares them with WORKSPACE_ROLE_PERMISSIONS in
-- src/platform/workspaces/permissions.ts, so keep one row per line.
create temp table authority_fixture(role text, permission text, allowed boolean);
insert into authority_fixture(role, permission, allowed) values
-- authority-fixture:start
('owner','create_work',true),
('owner','create_handoff',true),
('owner','record_calendar_receipt',true),
('owner','manage_calendar',true),
('owner','manage_delegations',true),
('owner','manage_handoffs',true),
('owner','manage_work_authority',true),
('owner','manage_ongoing',true),
('owner','manage_offerings',true),
('owner','invite_members',true),
('owner','sponsor_assignment',true),
('owner','exit_workspace',true),
('owner','manage_members',true),
('owner','make_systems',false),
('admin','create_work',true),
('admin','create_handoff',true),
('admin','record_calendar_receipt',true),
('admin','manage_calendar',true),
('admin','manage_delegations',true),
('admin','manage_handoffs',true),
('admin','manage_work_authority',true),
('admin','manage_ongoing',true),
('admin','manage_offerings',true),
('admin','invite_members',false),
('admin','sponsor_assignment',false),
('admin','exit_workspace',false),
('admin','manage_members',false),
('admin','make_systems',false),
('member','create_work',true),
('member','create_handoff',true),
('member','record_calendar_receipt',true),
('member','manage_calendar',false),
('member','manage_delegations',false),
('member','manage_handoffs',false),
('member','manage_work_authority',false),
('member','manage_ongoing',false),
('member','manage_offerings',false),
('member','invite_members',false),
('member','sponsor_assignment',false),
('member','exit_workspace',false),
('member','manage_members',false),
('member','make_systems',false)
-- authority-fixture:end
;

select pg_temp.assert_true(
  not exists(
    select 1 from authority_fixture f
    where public.workspace_role_allows(f.role, f.permission) is distinct from f.allowed
  ),
  'workspace_role_allows matches the role x permission fixture'
);
select pg_temp.assert_true(
  (select count(*) from authority_fixture) = 42,
  'fixture covers 3 roles x 14 permissions'
);
select pg_temp.assert_true(
  public.workspace_role_allows(null, 'create_work') is not true
  and public.workspace_role_allows('viewer', 'create_work') is not true
  and public.workspace_role_allows('editor', 'manage_calendar') is not true,
  'legacy tenant roles and a missing role satisfy no workspace permission'
);
select pg_temp.expect_error($$select public.workspace_role_allows('owner', 'manage_everything')$$, 'workspace_permission_unknown');
select pg_temp.expect_error($$select public.workspace_require('c9000000-0000-4000-8000-0000000000ff', 'c9000000-0000-4000-8000-0000000000ff', 'manage_everything')$$, 'workspace_permission_unknown');

-- Nothing here is callable with a public key.
select pg_temp.assert_true(
  not exists(
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'workspace_role_allows', 'workspace_require',
        'save_workspace_calendar_connection', 'revoke_workspace_calendar_connection',
        'mark_workspace_calendar_connection_error', 'save_workspace_calendar_event_receipt',
        'revoke_workspace_delegation', 'revoke_workspace_handoff',
        'create_workspace_handoff', 'save_workspace_work'
      )
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('public', p.oid, 'execute'))
  ),
  'authority helpers and write RPCs are not callable with a public key'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.save_workspace_work(uuid,uuid,text,text,text,jsonb,jsonb,uuid)'::regprocedure, 'execute')
  and has_function_privilege('service_role', 'public.create_workspace_handoff(uuid,uuid,text,text,timestamptz)'::regprocedure, 'execute')
  and has_function_privilege('service_role', 'public.revoke_workspace_handoff(uuid,uuid)'::regprocedure, 'execute')
  and has_function_privilege('service_role', 'public.revoke_workspace_delegation(uuid,uuid)'::regprocedure, 'execute')
  and has_function_privilege('service_role', 'public.save_workspace_calendar_event_receipt(uuid,jsonb)'::regprocedure, 'execute')
  and has_function_privilege('service_role', 'public.save_workspace_calendar_connection(uuid,uuid,text,text,text,text,text,text[],text,text,timestamptz,jsonb)'::regprocedure, 'execute')
  and has_function_privilege('service_role', 'public.revoke_workspace_calendar_connection(uuid,uuid,text)'::regprocedure, 'execute')
  and has_function_privilege('service_role', 'public.mark_workspace_calendar_connection_error(uuid,uuid,text,text)'::regprocedure, 'execute'),
  'the service role can call every write RPC'
);

-- Fixture: one customer workspace (C) and one agency workspace (G).
--   01 owner, 02 admin, 03 member, 05 leaver (admin) of both
--   04 outsider (member of neither)
--   06 agency-only member: plain G member whose agency has delegated read of C's work
insert into public.users(id, email, verified_at) values
 ('c9000000-0000-4000-8000-000000000001', 'authority-owner@example.test', now()),
 ('c9000000-0000-4000-8000-000000000002', 'authority-admin@example.test', now()),
 ('c9000000-0000-4000-8000-000000000003', 'authority-member@example.test', now()),
 ('c9000000-0000-4000-8000-000000000004', 'authority-outsider@example.test', now()),
 ('c9000000-0000-4000-8000-000000000005', 'authority-leaver@example.test', now()),
 ('c9000000-0000-4000-8000-000000000006', 'authority-agency@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
 ('c9000000-0000-4000-8000-000000000010', 'customer', 'Authority business', 'c9000000-0000-4000-8000-000000000001'),
 ('c9000000-0000-4000-8000-000000000011', 'agency', 'Authority agency', 'c9000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
select w.id, u.id, u.role, 'c9000000-0000-4000-8000-000000000001'
from (values ('c9000000-0000-4000-8000-000000000010'::uuid), ('c9000000-0000-4000-8000-000000000011'::uuid)) w(id)
cross join (values
  ('c9000000-0000-4000-8000-000000000001'::uuid, 'owner'),
  ('c9000000-0000-4000-8000-000000000002'::uuid, 'admin'),
  ('c9000000-0000-4000-8000-000000000003'::uuid, 'member'),
  ('c9000000-0000-4000-8000-000000000005'::uuid, 'admin')
) u(id, role);
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
 ('c9000000-0000-4000-8000-000000000011', 'c9000000-0000-4000-8000-000000000006', 'member', 'c9000000-0000-4000-8000-000000000001');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
 ('c9000000-0000-4000-8000-000000000020', 'c9000000-0000-4000-8000-000000000010', 'scheduling', 'schedule', 'Consultations', '{"reservations":[]}', 'c9000000-0000-4000-8000-000000000001'),
 ('c9000000-0000-4000-8000-000000000021', 'c9000000-0000-4000-8000-000000000011', 'tracker', 'tracker', 'Agency tracker', '{}', 'c9000000-0000-4000-8000-000000000001'),
 ('c9000000-0000-4000-8000-000000000022', 'c9000000-0000-4000-8000-000000000011', 'research', 'application', 'Agency app draft', '{}', 'c9000000-0000-4000-8000-000000000001');
insert into public.workspace_delegations(id, customer_workspace_id, customer_work_id, agency_workspace_id, granted_by, accepted_by) values
 ('c9000000-0000-4000-8000-000000000030', 'c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000020', 'c9000000-0000-4000-8000-000000000011', 'c9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001');
insert into public.workspace_handoffs(id, agency_workspace_id, source_work_id, recipient_email, token_hash, status, expires_at, created_by) values
 ('c9000000-0000-4000-8000-000000000040', 'c9000000-0000-4000-8000-000000000011', 'c9000000-0000-4000-8000-000000000021', 'recipient@example.test', repeat('c9', 32), 'pending', now() + interval '7 days', 'c9000000-0000-4000-8000-000000000001');

-- Each write is written once with :actor and expanded per person below. The
-- race script reuses the same rows (public.authority_parity_calls) so both
-- suites exercise identical calls.
create table public.authority_parity_calls(name text primary key, stmt text not null, tier text not null);
insert into public.authority_parity_calls(name, stmt, tier) values
 ('save_workspace_calendar_connection',
  $$select count(*) from public.save_workspace_calendar_connection('c9000000-0000-4000-8000-000000000010', :actor, 'google', 'primary', 'Bookings', 'America/New_York', 'connected', array['calendar'], 'ciphertext-access', 'ciphertext-refresh', null, '{"mode":"off"}')$$,
  'manager'),
 ('mark_workspace_calendar_connection_error',
  $$select public.mark_workspace_calendar_connection_error('c9000000-0000-4000-8000-000000000010', :actor, 'google', 'provider said no')$$,
  'manager'),
 ('revoke_workspace_calendar_connection',
  $$select public.revoke_workspace_calendar_connection('c9000000-0000-4000-8000-000000000010', :actor, 'google')$$,
  'manager'),
 ('save_workspace_calendar_event_receipt',
  $$select count(*) from public.save_workspace_calendar_event_receipt(:actor, jsonb_build_object(
      'workspace_id','c9000000-0000-4000-8000-000000000010','work_id','c9000000-0000-4000-8000-000000000020',
      'request_id','authority-request','provider','google','calendar_id','primary',
      'idempotency_key','authority:c9000000:request','operation','create','status','writing','revision',1,
      'title','Roof inspection','start_at','2026-10-06T09:00:00Z','end_at','2026-10-06T10:00:00Z',
      'time_zone','America/New_York','reminder_policy',jsonb_build_object('mode','off')))$$,
  'member'),
 ('revoke_workspace_delegation',
  $$select public.revoke_workspace_delegation('c9000000-0000-4000-8000-000000000030', :actor)$$,
  'manager'),
 ('revoke_workspace_handoff',
  $$select public.revoke_workspace_handoff('c9000000-0000-4000-8000-000000000040', :actor)$$,
  'manager'),
 ('create_workspace_handoff',
  $$select count(*) from public.create_workspace_handoff(:actor, 'c9000000-0000-4000-8000-000000000021', 'Next@Example.test', encode(sha256(gen_random_uuid()::text::bytea), 'hex'), now() + interval '7 days')$$,
  'member'),
 ('save_workspace_work',
  $$select count(*) from public.save_workspace_work('c9000000-0000-4000-8000-000000000010', :actor, 'tracker', 'tracker', 'Authority work', '{}', null, null)$$,
  'member');

-- Role matrix. Member-tier writes allow owner, admin and member; manager-tier
-- writes deny a member with workspace_permission_denied. The outsider holds no
-- membership anywhere: workspace_membership_required. The agency member's
-- delegated read of C never satisfies a C write; in G (handoffs) they are a
-- plain member.
do $$
declare
  call record;
  actor_name text;
  actor_id text;
  stmt text;
begin
  for call in select * from public.authority_parity_calls order by name loop
    foreach actor_name in array array['member', 'admin', 'owner', 'outsider', 'agency'] loop
      actor_id := case actor_name
        when 'owner' then 'c9000000-0000-4000-8000-000000000001'
        when 'admin' then 'c9000000-0000-4000-8000-000000000002'
        when 'member' then 'c9000000-0000-4000-8000-000000000003'
        when 'outsider' then 'c9000000-0000-4000-8000-000000000004'
        when 'agency' then 'c9000000-0000-4000-8000-000000000006'
      end;
      stmt := replace(call.stmt, ':actor', quote_literal(actor_id) || '::uuid');
      if actor_name = 'outsider' then
        perform pg_temp.expect_error(stmt, 'workspace_membership_required');
      elsif actor_name = 'agency' then
        if call.name = 'create_workspace_handoff' then
          perform pg_temp.expect_ok(stmt);
        elsif call.name = 'revoke_workspace_handoff' then
          perform pg_temp.expect_error(stmt, 'workspace_permission_denied');
        else
          perform pg_temp.expect_error(stmt, 'workspace_membership_required');
        end if;
      elsif actor_name = 'member' and call.tier = 'manager' then
        perform pg_temp.expect_error(stmt, 'workspace_permission_denied');
      else
        perform pg_temp.expect_ok(stmt);
      end if;
    end loop;
  end loop;
end;
$$;

-- What the allowed calls left behind. Calls run in name order, so the owner's
-- save is the last calendar write; revoke it once more to check the outcome.
select pg_temp.assert_true(
  (select status = 'connected' and access_token_ciphertext = 'ciphertext-access'
     and created_by = 'c9000000-0000-4000-8000-000000000001' and last_error is null
   from public.workspace_calendar_connections
   where workspace_id = 'c9000000-0000-4000-8000-000000000010' and provider = 'google'),
  'a manager save stores the encrypted credentials, clears the error and records the saver'
);
select pg_temp.assert_true(
  public.revoke_workspace_calendar_connection('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000002', 'google')
  and not public.revoke_workspace_calendar_connection('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000002', 'outlook'),
  'revoke reports whether a connection existed'
);
-- Full ordered upgrades also retain receipts for both outcomes. Historical
-- authority-only schemas precede this additive receipt store.
do $$
begin
  if to_regclass('public.provider_disconnect_receipts') is not null then
    perform pg_temp.assert_true(exists(select 1 from public.provider_disconnect_receipts
      where workspace_id='c9000000-0000-4000-8000-000000000010' and provider='google'
        and connection_source='calendar_connection' and actor_user_id='c9000000-0000-4000-8000-000000000002'
        and revocation_outcome='not_attempted' and revocation_error_code='revocation_not_requested'
        and local_cleanup_status='complete' and cleared_stores=array['workspace_calendar_connections']),
      'legacy positive revoke preserves receipt and cleared calendar store');
    perform pg_temp.assert_true(exists(select 1 from public.provider_disconnect_receipts
      where workspace_id='c9000000-0000-4000-8000-000000000010' and provider='outlook'
        and connection_source='calendar_connection' and actor_user_id='c9000000-0000-4000-8000-000000000002'
        and revocation_outcome='not_attempted' and local_cleanup_status='complete' and cleared_stores='{}'::text[]),
      'legacy missing calendar returns false and still preserves cleanup receipt');
  end if;
end $$;
select pg_temp.assert_true(
  (select status = 'revoked' and access_token_ciphertext is null and refresh_token_ciphertext is null
     and created_by = 'c9000000-0000-4000-8000-000000000001'
   from public.workspace_calendar_connections
   where workspace_id = 'c9000000-0000-4000-8000-000000000010' and provider = 'google'),
  'revoke clears stored calendar credentials; the last saver is recorded'
);
select pg_temp.assert_true(
  (select count(*) from public.workspace_calendar_event_receipts where workspace_id = 'c9000000-0000-4000-8000-000000000010' and request_id = 'authority-request') = 1,
  'receipt replays upsert one row per work/request/provider'
);
select pg_temp.assert_true(
  (select status = 'revoked' and revoked_by = 'c9000000-0000-4000-8000-000000000002' from public.workspace_delegations where id = 'c9000000-0000-4000-8000-000000000030')
  and (select status = 'revoked' and revoked_by = 'c9000000-0000-4000-8000-000000000002' from public.workspace_handoffs where id = 'c9000000-0000-4000-8000-000000000040'),
  'the first allowed manager (admin) revokes and is recorded; the owner then sees an already-revoked row'
);
select pg_temp.assert_true(
  public.revoke_workspace_handoff('c9000000-0000-4000-8000-000000000040', 'c9000000-0000-4000-8000-000000000001') = false
  and public.revoke_workspace_delegation('c9000000-0000-4000-8000-000000000030', 'c9000000-0000-4000-8000-000000000001') = false
  and public.revoke_workspace_handoff('c9000000-0000-4000-8000-0000000000ff', 'c9000000-0000-4000-8000-000000000001') = false
  and public.revoke_workspace_delegation('c9000000-0000-4000-8000-0000000000ff', 'c9000000-0000-4000-8000-000000000001') = false,
  'revoking an inactive or missing row returns false'
);
select pg_temp.assert_true(
  (select count(*) from public.workspace_handoffs where source_work_id = 'c9000000-0000-4000-8000-000000000021' and recipient_email = 'next@example.test' and status = 'pending') = 4,
  'member, admin, owner and the agency member each created one normalized pending handoff'
);
select pg_temp.assert_true(
  (select count(*) from public.saved_product_work where workspace_id = 'c9000000-0000-4000-8000-000000000010' and title = 'Authority work') = 3
  and not exists(select 1 from public.saved_product_work where title = 'Authority work' and created_by in ('c9000000-0000-4000-8000-000000000004', 'c9000000-0000-4000-8000-000000000006')),
  'only direct members saved work and each row names its creator'
);

-- Handoffs leave only from agency workspaces, never carry applications, and
-- require a live expiry.
select pg_temp.expect_error($$select count(*) from public.create_workspace_handoff('c9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000020', 'x@example.test', repeat('ab', 32), now() + interval '1 day')$$, 'handoff_agency_only');
select pg_temp.expect_error($$select count(*) from public.create_workspace_handoff('c9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000022', 'x@example.test', repeat('ab', 32), now() + interval '1 day')$$, 'handoff_product_unsupported');
select pg_temp.expect_error($$select count(*) from public.create_workspace_handoff('c9000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000021', 'x@example.test', repeat('ab', 32), now() - interval '1 second')$$, 'handoff_expired');
select pg_temp.expect_error($$select count(*) from public.create_workspace_handoff('c9000000-0000-4000-8000-000000000004', 'c9000000-0000-4000-8000-0000000000ff', 'x@example.test', repeat('ab', 32), now() + interval '1 day')$$, 'workspace_membership_required');

-- Calendar connection inputs are validated inside the boundary too.
select pg_temp.expect_error($$select count(*) from public.save_workspace_calendar_connection('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000001', 'google', 'primary', 'Bookings', 'UTC', 'revoked', array[]::text[], 'ciphertext', null, null, '{"mode":"off"}')$$, 'calendar_connection_invalid');
select pg_temp.expect_error($$select count(*) from public.save_workspace_calendar_connection('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000001', 'google', 'primary', 'Bookings', 'UTC', 'connected', array[]::text[], '  ', null, null, '{"mode":"off"}')$$, 'calendar_connection_invalid');
select pg_temp.expect_error($$select count(*) from public.save_workspace_work('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000001', 'tracker', 'tracker', 'Missing payload', null, null, null)$$, 'saved_work_invalid');

-- Removal and downgrade earlier in the same transaction take effect at once.
begin;
delete from public.workspace_memberships where workspace_id = 'c9000000-0000-4000-8000-000000000010' and user_id = 'c9000000-0000-4000-8000-000000000003';
select pg_temp.expect_error($$select count(*) from public.save_workspace_work('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000003', 'tracker', 'tracker', 'After removal', '{}', null, null)$$, 'workspace_membership_required');
update public.workspace_memberships set role = 'member' where workspace_id = 'c9000000-0000-4000-8000-000000000010' and user_id = 'c9000000-0000-4000-8000-000000000002';
select pg_temp.expect_error($$select public.revoke_workspace_calendar_connection('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000002', 'google')$$, 'workspace_permission_denied');
rollback;

-- A completed workspace exit stops new calendar bindings but still lets a
-- manager disconnect stored credentials.
begin;
insert into public.workspace_exit_requests(
  workspace_id, requested_by, idempotency_key, command_digest, future_work,
  provider_participation, maintained_resource_action, state, completed_at
) values (
  'c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000001', 'authority-exit',
  repeat('0', 64), 'pause', 'keep', 'stop', '{"status":"completed"}'::jsonb, now()
);
select pg_temp.expect_error($$select count(*) from public.save_workspace_calendar_connection('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000001', 'google', 'primary', 'Bookings', 'UTC', 'connected', array[]::text[], 'ciphertext', null, null, '{"mode":"off"}')$$, 'workspace_exit_future_work_blocked');
select pg_temp.expect_ok($$select public.revoke_workspace_calendar_connection('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000001', 'google')$$);
select pg_temp.expect_error($$select count(*) from public.save_workspace_work('c9000000-0000-4000-8000-000000000010', 'c9000000-0000-4000-8000-000000000001', 'tracker', 'tracker', 'After exit', '{}', null, null)$$, 'workspace_exit_future_work_blocked');
rollback;

-- Reset the rows the race script needs: a pending handoff and an active
-- delegation the leaver (05, admin) can act on.
update public.workspace_handoffs set status = 'pending', revoked_at = null, revoked_by = null where id = 'c9000000-0000-4000-8000-000000000040';
update public.workspace_delegations set status = 'active', revoked_at = null, revoked_by = null where id = 'c9000000-0000-4000-8000-000000000030';

select 'workspace authority schema checks passed' as result;
