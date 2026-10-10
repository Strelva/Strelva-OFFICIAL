\set ON_ERROR_STOP on
-- The payer is a party (20261009154000_payer_party.sql), on fictional rows:
-- an owner proposes an agency as payer, the agency's owner/admin accepts,
-- the billing home and new job budgets name the agency, the agency's
-- owners/admins read the bill and sign job limits, and the owner can switch
-- back to the business. The person-successor path still works as before.
-- Agency authority is current: a removed or demoted signer is refused.
-- Runs inside a transaction that is rolled back.
begin;
create or replace function pg_temp.pp_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'payer party assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.pp_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;
create or replace function pg_temp.pp_command(p_command jsonb, p_actor uuid, p_email text) returns public.workspace_payer_transitions
language sql as $$ select * from public.workspace_payer_transition_command(p_command, p_actor, p_email) $$;
-- The job ids the actor's payer inbox lists.
create or replace function pg_temp.pp_inbox(p_actor uuid, p_email text) returns uuid[] language sql as $$
  select coalesce(array_agg(j.id), '{}') from public.job_economics_payer_inbox(p_actor, p_email) j
$$;
create or replace function pg_temp.pp_act(p_action text, p_job uuid, p_actor uuid, p_email text) returns public.job_economics language sql as $$
  select * from public.job_economics_command_with_payer_authority(jsonb_build_object('action',p_action,'jobId',p_job), p_actor, p_email)
$$;
create or replace function pg_temp.pp_job(p_work uuid) returns public.job_economics language sql as $$
  select * from public.job_economics_create_with_payer_transition(jsonb_build_object('action','create',
    'workspaceId','6d000000-0000-4000-8000-000000000010','workId',p_work,'productId','tracker','resourceKind','tracker',
    'payerId','6d000000-0000-4000-8000-000000000001','estimateCents',null,'maxAuthorizedCents',500),
    '6d000000-0000-4000-8000-000000000001','pp-owner@example.test')
$$;

select pg_temp.pp_assert(
  has_function_privilege('service_role', 'public.read_business_billing(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.workspace_payer_transition_snapshot(uuid,uuid,text)', 'execute')
  and has_function_privilege('service_role', 'public.workspace_payer_transition_inbox(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.workspace_payer_transition_inbox(uuid,text)', 'execute')
  and not has_function_privilege('service_role', 'public.business_payer_party(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.business_billing_json(uuid)', 'execute'),
  'service-role entry points only; the rule stays internal');
select pg_temp.pp_assert((select count(*) from information_schema.columns where table_schema = 'public'
  and column_name in ('payer_kind', 'payer_workspace_id')
  and table_name in ('accounts', 'job_economics', 'work_allowances', 'work_allowance_subscription_entitlements')) = 8,
  'every payer ledger carries the party');

insert into public.users(id, email, verified_at) values
  ('6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test', now()),
  ('6d000000-0000-4000-8000-000000000002', 'pp-agency-owner@agency.example.test', now()),
  ('6d000000-0000-4000-8000-000000000003', 'pp-agency-admin@agency.example.test', now()),
  ('6d000000-0000-4000-8000-000000000004', 'pp-agency-member@agency.example.test', now()),
  ('6d000000-0000-4000-8000-000000000005', 'pp-bookkeeper@example.test', now()),
  ('6d000000-0000-4000-8000-000000000006', 'pp-stranger@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('6d000000-0000-4000-8000-000000000010', 'customer', 'Payer Client', '6d000000-0000-4000-8000-000000000001'),
  ('6d000000-0000-4000-8000-000000000011', 'customer', 'Payer Client Two', '6d000000-0000-4000-8000-000000000001'),
  ('6d000000-0000-4000-8000-000000000020', 'agency', 'Paying Agency', '6d000000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('6d000000-0000-4000-8000-000000000010', '6d000000-0000-4000-8000-000000000001', 'owner', '6d000000-0000-4000-8000-000000000001'),
  ('6d000000-0000-4000-8000-000000000011', '6d000000-0000-4000-8000-000000000001', 'owner', '6d000000-0000-4000-8000-000000000001'),
  ('6d000000-0000-4000-8000-000000000020', '6d000000-0000-4000-8000-000000000002', 'owner', '6d000000-0000-4000-8000-000000000002'),
  ('6d000000-0000-4000-8000-000000000020', '6d000000-0000-4000-8000-000000000003', 'admin', '6d000000-0000-4000-8000-000000000002'),
  ('6d000000-0000-4000-8000-000000000020', '6d000000-0000-4000-8000-000000000004', 'member', '6d000000-0000-4000-8000-000000000002');
insert into public.saved_product_work(id, workspace_id, product_id, resource_kind, title, payload, created_by) values
  ('6d000000-0000-4000-8000-000000000031', '6d000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Agency-paid job', '{}', '6d000000-0000-4000-8000-000000000001'),
  ('6d000000-0000-4000-8000-000000000032', '6d000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Business-paid job', '{}', '6d000000-0000-4000-8000-000000000001'),
  ('6d000000-0000-4000-8000-000000000033', '6d000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Person-signed job', '{}', '6d000000-0000-4000-8000-000000000001'),
  ('6d000000-0000-4000-8000-000000000034', '6d000000-0000-4000-8000-000000000010', 'tracker', 'tracker', 'Revoked-signer job', '{}', '6d000000-0000-4000-8000-000000000001');
insert into public.accounts(name, workspace_id, billing_type) values ('Payer Client', '6d000000-0000-4000-8000-000000000010', 'subscription');

-- Default: the business pays.
select pg_temp.pp_assert((select payer_kind = 'business' and payer_workspace_id is null from public.accounts
  where workspace_id = '6d000000-0000-4000-8000-000000000010'), 'billing home starts business-paid');
select pg_temp.pp_assert(public.business_billing_json('6d000000-0000-4000-8000-000000000010')->'payerParty'
  = '{"kind":"business","workspaceId":"6d000000-0000-4000-8000-000000000010","name":"Payer Client"}'::jsonb, 'payerParty names the business');
select pg_temp.pp_expect($$update public.accounts set payer_kind = 'agency' where workspace_id = '6d000000-0000-4000-8000-000000000010'$$,
  '%accounts_payer_party%');

-- Only the owner proposes, and only an agency workspace can be an agency payer.
select pg_temp.pp_expect($$select pg_temp.pp_command(jsonb_build_object('action','propose','workspaceId','6d000000-0000-4000-8000-000000000010',
  'successorAgencyWorkspaceId','6d000000-0000-4000-8000-000000000020'), '6d000000-0000-4000-8000-000000000002', 'pp-agency-owner@agency.example.test')$$,
  'payer_transition_owner_required');
select pg_temp.pp_expect($$select pg_temp.pp_command(jsonb_build_object('action','propose','workspaceId','6d000000-0000-4000-8000-000000000010',
  'successorAgencyWorkspaceId','6d000000-0000-4000-8000-000000000011'), '6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test')$$,
  'payer_transition_successor_unavailable');
select pg_temp.pp_expect($$select pg_temp.pp_command(jsonb_build_object('action','propose','workspaceId','6d000000-0000-4000-8000-000000000010',
  'successorKind','agency'), '6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test')$$, 'payer_transition_command_invalid');

create temporary table pp_t(name text primary key, id uuid) on commit drop;
insert into pp_t values ('agency', (pg_temp.pp_command(jsonb_build_object('action','propose','workspaceId','6d000000-0000-4000-8000-000000000010',
  'successorAgencyWorkspaceId','6d000000-0000-4000-8000-000000000020'), '6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test')).id);
select pg_temp.pp_assert((select successor_kind = 'agency' and successor_user_id is null and status = 'pending'
  from public.workspace_payer_transitions where id = (select id from pp_t where name = 'agency')), 'agency proposal recorded');
select pg_temp.pp_assert((pg_temp.pp_command(jsonb_build_object('action','propose','workspaceId','6d000000-0000-4000-8000-000000000010',
  'successorAgencyWorkspaceId','6d000000-0000-4000-8000-000000000020'), '6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test')).id
  = (select id from pp_t where name = 'agency'), 'proposing again replays');
select pg_temp.pp_assert(exists (select 1 from public.workspace_payer_transition_inbox('6d000000-0000-4000-8000-000000000002',
  'pp-agency-owner@agency.example.test') i where i.id = (select id from pp_t where name = 'agency') and i.successor_workspace_name = 'Paying Agency'),
  'the agency owner sees the proposal');
select pg_temp.pp_assert(not exists (select 1 from public.workspace_payer_transition_inbox('6d000000-0000-4000-8000-000000000004',
  'pp-agency-member@agency.example.test')), 'a plain agency member does not');

-- Only the agency's owners/admins accept for it.
select pg_temp.pp_expect(format($$select pg_temp.pp_command(jsonb_build_object('action','accept','transitionId',%L),
  '6d000000-0000-4000-8000-000000000004', 'pp-agency-member@agency.example.test')$$, (select id from pp_t where name = 'agency')),
  'payer_transition_successor_required');
select pg_temp.pp_expect(format($$select pg_temp.pp_command(jsonb_build_object('action','accept','transitionId',%L),
  '6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test')$$, (select id from pp_t where name = 'agency')),
  'payer_transition_successor_required');
select pg_temp.pp_assert((pg_temp.pp_command(jsonb_build_object('action','accept','transitionId',(select id from pp_t where name = 'agency')),
  '6d000000-0000-4000-8000-000000000003', 'pp-agency-admin@agency.example.test')).status = 'accepted', 'agency admin accepts');

-- The billing home names the agency; its owners/admins read the bill.
select pg_temp.pp_assert((select payer_kind = 'agency' and payer_workspace_id = '6d000000-0000-4000-8000-000000000020' from public.accounts
  where workspace_id = '6d000000-0000-4000-8000-000000000010'), 'billing home is agency-paid');
select pg_temp.pp_assert(public.business_billing_json('6d000000-0000-4000-8000-000000000010')->'payerParty'
  = '{"kind":"agency","workspaceId":"6d000000-0000-4000-8000-000000000020","name":"Paying Agency"}'::jsonb
  and public.business_billing_json('6d000000-0000-4000-8000-000000000010')->'payer'
  = '{"email":"pp-agency-owner@agency.example.test","name":"Paying Agency","from":"agency_owner"}'::jsonb, 'bill goes to the agency');
select pg_temp.pp_assert(public.read_business_billing('6d000000-0000-4000-8000-000000000010', '6d000000-0000-4000-8000-000000000002',
  'pp-agency-owner@agency.example.test')->>'accountId' is not null, 'paying agency owner reads billing');
select pg_temp.pp_assert(public.read_business_billing('6d000000-0000-4000-8000-000000000010', '6d000000-0000-4000-8000-000000000001',
  'pp-owner@example.test')->>'accountId' is not null, 'business owner still reads billing');
select pg_temp.pp_expect($$select public.read_business_billing('6d000000-0000-4000-8000-000000000010', '6d000000-0000-4000-8000-000000000004',
  'pp-agency-member@agency.example.test')$$, 'business_billing_denied');
select pg_temp.pp_assert(exists (select 1 from public.workspace_payer_transition_snapshot('6d000000-0000-4000-8000-000000000010',
  '6d000000-0000-4000-8000-000000000003', 'pp-agency-admin@agency.example.test') s where s.successor_kind = 'agency' and s.status = 'accepted'),
  'the agency sees the transition it accepted');
select pg_temp.pp_expect($$select * from public.workspace_payer_transition_snapshot('6d000000-0000-4000-8000-000000000010',
  '6d000000-0000-4000-8000-000000000006', 'pp-stranger@example.test')$$, 'payer_transition_workspace_denied');

-- A new job budget is agency-paid: signed by the accepting admin, then by any agency owner/admin.
create temporary table pp_jobs(name text primary key, id uuid) on commit drop;
insert into pp_jobs values ('agency', (pg_temp.pp_job('6d000000-0000-4000-8000-000000000031')).id);
select pg_temp.pp_assert((select payer_kind = 'agency' and payer_workspace_id = '6d000000-0000-4000-8000-000000000020'
  and payer_id = '6d000000-0000-4000-8000-000000000003' and status = 'draft' from public.job_economics
  where id = (select id from pp_jobs where name = 'agency')), 'job names the agency party');
select pg_temp.pp_assert(exists (select 1 from public.job_economics_payer_inbox('6d000000-0000-4000-8000-000000000002',
  'pp-agency-owner@agency.example.test') j where j.id = (select id from pp_jobs where name = 'agency')), 'agency owner sees the limit');
select pg_temp.pp_assert(not exists (select 1 from public.job_economics_payer_inbox('6d000000-0000-4000-8000-000000000004',
  'pp-agency-member@agency.example.test')), 'a plain member does not');
select pg_temp.pp_expect(format($$select * from public.job_economics_command_with_payer_authority(jsonb_build_object('action','accept','jobId',%L),
  '6d000000-0000-4000-8000-000000000004', 'pp-agency-member@agency.example.test')$$, (select id from pp_jobs where name = 'agency')),
  'job_economics_%');
select pg_temp.pp_assert((select status = 'accepted' and payer_id = '6d000000-0000-4000-8000-000000000002'
  and accepted_by = '6d000000-0000-4000-8000-000000000002'
  from public.job_economics_command_with_payer_authority(jsonb_build_object('action','accept','jobId',(select id from pp_jobs where name = 'agency')),
    '6d000000-0000-4000-8000-000000000002', 'pp-agency-owner@agency.example.test')), 'agency owner signs the limit for the agency');

-- Agency authority is current, never captured. The admin who accepted the
-- payer transition is the draft's stored signer; that stores no authority.
insert into pp_jobs values ('revoked', (pg_temp.pp_job('6d000000-0000-4000-8000-000000000034')).id);
select pg_temp.pp_assert((select payer_kind = 'agency' and payer_id = '6d000000-0000-4000-8000-000000000003' and status = 'draft'
  from public.job_economics where id = (select id from pp_jobs where name = 'revoked')), 'the stored signer is the accepting admin');
-- Removed from the agency: the stored signer sees, reads, accepts and cancels nothing.
delete from public.workspace_memberships
  where workspace_id = '6d000000-0000-4000-8000-000000000020' and user_id = '6d000000-0000-4000-8000-000000000003';
select pg_temp.pp_assert(not ((select id from pp_jobs where name = 'revoked') = any(pg_temp.pp_inbox('6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test'))) and cardinality(pg_temp.pp_inbox('6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test')) = 0, 'removed signer: empty payer inbox');
select pg_temp.pp_expect(format($$select * from public.get_job_economics(%L, '6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test')$$, (select id from pp_jobs where name = 'revoked')), 'job_economics_workspace_denied');
select pg_temp.pp_expect(format($$select pg_temp.pp_act('accept', %L, '6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test')$$, (select id from pp_jobs where name = 'revoked')), 'job_economics_payer_required');
select pg_temp.pp_expect(format($$select pg_temp.pp_act('cancel', %L, '6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test')$$, (select id from pp_jobs where name = 'revoked')), 'job_economics_payer_required');
select pg_temp.pp_expect($$select public.read_business_billing('6d000000-0000-4000-8000-000000000010', '6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test')$$, 'business_billing_denied');
-- Back as a plain member (demoted), even with direct access to the client
-- business that the native command honours: still refused.
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('6d000000-0000-4000-8000-000000000020', '6d000000-0000-4000-8000-000000000003', 'member', '6d000000-0000-4000-8000-000000000002'),
  ('6d000000-0000-4000-8000-000000000010', '6d000000-0000-4000-8000-000000000003', 'member', '6d000000-0000-4000-8000-000000000001');
select pg_temp.pp_assert(cardinality(pg_temp.pp_inbox('6d000000-0000-4000-8000-000000000003', 'pp-agency-admin@agency.example.test')) = 0,
  'demoted signer: empty payer inbox');
select pg_temp.pp_expect(format($$select pg_temp.pp_act('accept', %L, '6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test')$$, (select id from pp_jobs where name = 'revoked')), 'job_economics_payer_required');
select pg_temp.pp_expect(format($$select pg_temp.pp_act('cancel', %L, '6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test')$$, (select id from pp_jobs where name = 'revoked')), 'job_economics_payer_required');
delete from public.workspace_memberships
  where workspace_id = '6d000000-0000-4000-8000-000000000010' and user_id = '6d000000-0000-4000-8000-000000000003';
select pg_temp.pp_assert((select status = 'draft' from public.job_economics where id = (select id from pp_jobs where name = 'revoked')),
  'nothing changed while refused');
-- Reinstated as admin: the authority comes back with the membership.
update public.workspace_memberships set role = 'admin'
  where workspace_id = '6d000000-0000-4000-8000-000000000020' and user_id = '6d000000-0000-4000-8000-000000000003';
select pg_temp.pp_assert((select id from pp_jobs where name = 'revoked') = any(pg_temp.pp_inbox('6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test')), 'reinstated admin sees the limit');
select pg_temp.pp_assert((select status = 'accepted' and payer_id = '6d000000-0000-4000-8000-000000000003'
  and accepted_by = '6d000000-0000-4000-8000-000000000003' from pg_temp.pp_act('accept', (select id from pp_jobs where name = 'revoked'),
  '6d000000-0000-4000-8000-000000000003', 'pp-agency-admin@agency.example.test')), 'reinstated admin signs');
-- Demoted after signing: cannot cancel what they signed; a current owner can.
update public.workspace_memberships set role = 'member'
  where workspace_id = '6d000000-0000-4000-8000-000000000020' and user_id = '6d000000-0000-4000-8000-000000000003';
select pg_temp.pp_expect(format($$select pg_temp.pp_act('cancel', %L, '6d000000-0000-4000-8000-000000000003',
  'pp-agency-admin@agency.example.test')$$, (select id from pp_jobs where name = 'revoked')), 'job_economics_payer_required');
select pg_temp.pp_assert(exists (select 1 from public.get_job_economics((select id from pp_jobs where name = 'revoked'),
  '6d000000-0000-4000-8000-000000000002', 'pp-agency-owner@agency.example.test')), 'a current agency owner reads the job without client access');
select pg_temp.pp_assert((select status = 'cancelled' from pg_temp.pp_act('cancel', (select id from pp_jobs where name = 'revoked'),
  '6d000000-0000-4000-8000-000000000002', 'pp-agency-owner@agency.example.test')), 'a current agency owner cancels');
update public.workspace_memberships set role = 'admin'
  where workspace_id = '6d000000-0000-4000-8000-000000000020' and user_id = '6d000000-0000-4000-8000-000000000003';

-- A billing home created later for an agency-paid business is stamped agency.
select pg_temp.pp_command(jsonb_build_object('action','accept','transitionId',
  (pg_temp.pp_command(jsonb_build_object('action','propose','workspaceId','6d000000-0000-4000-8000-000000000011',
    'successorAgencyWorkspaceId','6d000000-0000-4000-8000-000000000020'), '6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test')).id),
  '6d000000-0000-4000-8000-000000000002', 'pp-agency-owner@agency.example.test');
insert into public.accounts(name, workspace_id, billing_type) values ('Payer Client Two', '6d000000-0000-4000-8000-000000000011', 'none');
select pg_temp.pp_assert((select payer_kind = 'agency' from public.accounts where workspace_id = '6d000000-0000-4000-8000-000000000011'),
  'new billing home stamped from the accepted transition');
-- Detaching a billing home clears its party.
update public.accounts set workspace_id = null where workspace_id = '6d000000-0000-4000-8000-000000000011';
select pg_temp.pp_assert((select payer_kind = 'business' and payer_workspace_id is null from public.accounts where name = 'Payer Client Two'),
  'detached billing home is business-paid');

-- The owner switches back to the business; only an owner accepts that.
insert into pp_t values ('business', (pg_temp.pp_command(jsonb_build_object('action','propose','workspaceId','6d000000-0000-4000-8000-000000000010',
  'successorKind','business'), '6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test')).id);
select pg_temp.pp_expect(format($$select pg_temp.pp_command(jsonb_build_object('action','accept','transitionId',%L),
  '6d000000-0000-4000-8000-000000000002', 'pp-agency-owner@agency.example.test')$$, (select id from pp_t where name = 'business')),
  'payer_transition_successor_required');
select pg_temp.pp_command(jsonb_build_object('action','accept','transitionId',(select id from pp_t where name = 'business')),
  '6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test');
select pg_temp.pp_assert((select payer_kind = 'business' and payer_workspace_id is null from public.accounts
  where workspace_id = '6d000000-0000-4000-8000-000000000010'), 'back to business-paid');
insert into pp_jobs values ('business', (pg_temp.pp_job('6d000000-0000-4000-8000-000000000032')).id);
select pg_temp.pp_assert((select payer_kind = 'business' and payer_id = '6d000000-0000-4000-8000-000000000001'
  from public.job_economics where id = (select id from pp_jobs where name = 'business')), 'new job is business-paid again');
-- The business-paid path is unchanged: the signer sees and signs; the agency does not.
select pg_temp.pp_assert((select id from pp_jobs where name = 'business') = any(pg_temp.pp_inbox('6d000000-0000-4000-8000-000000000001',
  'pp-owner@example.test')) and not ((select id from pp_jobs where name = 'business') = any(pg_temp.pp_inbox(
  '6d000000-0000-4000-8000-000000000002', 'pp-agency-owner@agency.example.test'))), 'business job: signer inbox only');
select pg_temp.pp_expect(format($$select pg_temp.pp_act('accept', %L, '6d000000-0000-4000-8000-000000000002',
  'pp-agency-owner@agency.example.test')$$, (select id from pp_jobs where name = 'business')), 'job_economics_%');
select pg_temp.pp_assert((select status = 'accepted' and accepted_by = '6d000000-0000-4000-8000-000000000001'
  from pg_temp.pp_act('accept', (select id from pp_jobs where name = 'business'), '6d000000-0000-4000-8000-000000000001',
  'pp-owner@example.test')), 'business signer accepts');
select pg_temp.pp_expect($$select public.read_business_billing('6d000000-0000-4000-8000-000000000010', '6d000000-0000-4000-8000-000000000002',
  'pp-agency-owner@agency.example.test')$$, 'business_billing_denied');

-- The person path is unchanged: a named person signs for the business.
insert into pp_t values ('person', (pg_temp.pp_command(jsonb_build_object('action','propose','workspaceId','6d000000-0000-4000-8000-000000000010',
  'successorEmail','pp-bookkeeper@example.test'), '6d000000-0000-4000-8000-000000000001', 'pp-owner@example.test')).id);
select pg_temp.pp_expect(format($$select pg_temp.pp_command(jsonb_build_object('action','accept','transitionId',%L),
  '6d000000-0000-4000-8000-000000000006', 'pp-stranger@example.test')$$, (select id from pp_t where name = 'person')),
  'payer_transition_successor_required');
select pg_temp.pp_command(jsonb_build_object('action','accept','transitionId',(select id from pp_t where name = 'person')),
  '6d000000-0000-4000-8000-000000000005', 'pp-bookkeeper@example.test');
insert into pp_jobs values ('person', (pg_temp.pp_job('6d000000-0000-4000-8000-000000000033')).id);
select pg_temp.pp_assert((select payer_kind = 'business' and payer_id = '6d000000-0000-4000-8000-000000000005'
  from public.job_economics where id = (select id from pp_jobs where name = 'person')), 'person-signed job stays business-paid');
-- A named payer with no business access still sees, reads and signs, as before 7A.
select pg_temp.pp_assert((select id from pp_jobs where name = 'person') = any(pg_temp.pp_inbox('6d000000-0000-4000-8000-000000000005',
  'pp-bookkeeper@example.test')) and exists (select 1 from public.get_job_economics((select id from pp_jobs where name = 'person'),
  '6d000000-0000-4000-8000-000000000005', 'pp-bookkeeper@example.test')), 'person signer sees and reads the job');
select pg_temp.pp_assert((select status = 'accepted' from pg_temp.pp_act('accept', (select id from pp_jobs where name = 'person'),
  '6d000000-0000-4000-8000-000000000005', 'pp-bookkeeper@example.test')), 'person signer accepts');
select pg_temp.pp_assert((select payer_kind = 'business' from public.accounts where workspace_id = '6d000000-0000-4000-8000-000000000010'),
  'a person successor keeps the business as payer');

rollback;
