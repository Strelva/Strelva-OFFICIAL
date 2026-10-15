\set ON_ERROR_STOP on
-- Policy decision rows and open-for-source reads on fictional rows. Runs in a
-- transaction that is rolled back.
begin;
create or replace function pg_temp.df_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'dedupe flows assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.df_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm <> expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.df_assert(
  has_function_privilege('service_role', 'public.read_open_owner_decision_for_source(uuid,text,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.record_policy_owner_decision(uuid,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.read_open_owner_decision_for_source(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.read_open_owner_decision_for_source(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.record_policy_owner_decision(uuid,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.record_policy_owner_decision(uuid,jsonb,text)', 'EXECUTE'),
  'only service_role executes the new RPCs');

insert into public.users(id, email, verified_at) values ('df000000-0000-4000-8000-000000000001', 'df-owner@example.test', now());
insert into public.workspaces(id, kind, name, created_by) values
  ('df000000-0000-4000-8000-000000000010', 'customer', 'Dedupe Fixture Firm', 'df000000-0000-4000-8000-000000000001'),
  ('df000000-0000-4000-8000-000000000011', 'customer', 'Other Fixture Firm', 'df000000-0000-4000-8000-000000000001');

create temp table df_items(label text, item jsonb);

-- Open (or find) an owner-routed item for a source.
insert into df_items select 'open', public.open_owner_decision('df000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','review.reply','route','owner_decides','title','Reply to Dana','approveEffect','Strelva posts this reply on Google.',
  'notYetEffect','Nothing is posted.','sourceLifecycle','tenant_event','sourceId','df-site:evt-1','revisionHash',repeat('1',64)));
select pg_temp.df_assert((public.read_open_owner_decision_for_source('df000000-0000-4000-8000-000000000010','tenant_event','df-site:evt-1')->>'id')
  = (select item->>'id' from df_items where label = 'open'), 'the open item is found by source');
select pg_temp.df_assert(public.read_open_owner_decision_for_source('df000000-0000-4000-8000-000000000011','tenant_event','df-site:evt-1') is null
  and public.read_open_owner_decision_for_source('df000000-0000-4000-8000-000000000010','tenant_event','df-site:other') is null,
  'another business or source finds nothing');

-- A policy never records while a person's decision is open for the source.
select pg_temp.df_expect($$select public.record_policy_owner_decision('df000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','review.reply','title','Reply to Dana','approveEffect','x','notYetEffect','y','sourceLifecycle','tenant_event','sourceId','df-site:evt-1','revisionHash',repeat('2',64)), 'auto_reply_policy')$$, 'owner_decision_open');

-- One closed receipt per attempt for a source nobody holds open.
insert into df_items select 'policy', public.record_policy_owner_decision('df000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','review.reply','title','Reply to Sam','approveEffect','Strelva posts this reply on Google.','notYetEffect','Nothing is posted.',
  'sourceLifecycle','tenant_event','sourceId','df-site:evt-2','revisionHash',repeat('3',64)), 'auto_reply_policy');
select pg_temp.df_assert((select item->>'status' from df_items where label = 'policy') = 'claimed'
  and (select item->'item'->>'route' from df_items where label = 'policy') = 'handle_after_notice'
  and (select item->'item'->>'state' from df_items where label = 'policy') = 'approved'
  and (select item->'item'->>'decidedByKind' from df_items where label = 'policy') = 'policy'
  and (select item->'item'->>'signInRequired' from df_items where label = 'policy') = 'false'
  and (select item->'item'->>'outcome' from df_items where label = 'policy') is null,
  'a policy row is closed, route handle_after_notice, policy decided, outcome pending');
select pg_temp.df_assert(public.read_open_owner_decision_for_source('df000000-0000-4000-8000-000000000010','tenant_event','df-site:evt-2') is null,
  'a policy row is never the open item');
select pg_temp.df_assert((public.record_policy_owner_decision('df000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','review.reply','title','Reply to Sam','approveEffect','x','notYetEffect','y','sourceLifecycle','tenant_event','sourceId','df-site:evt-2','revisionHash',repeat('3',64)), 'auto_reply_policy')->>'status') = 'already_handled',
  'the same attempt is already handled');
select pg_temp.df_assert((public.record_policy_owner_decision('df000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','review.reply','title','Reply to Sam','approveEffect','x','notYetEffect','y','sourceLifecycle','tenant_event','sourceId','df-site:evt-2','revisionHash',repeat('4',64)), 'auto_reply_policy')->>'status') = 'claimed',
  'a retry attempt is its own row');
-- The outcome is written once with the existing finisher.
select pg_temp.df_assert((public.finish_owner_decision('df000000-0000-4000-8000-000000000010', (select (item->'item'->>'id')::uuid from df_items where label = 'policy'), 'done', null, 'tenant_event:evt-2')->>'outcome') = 'done',
  'the policy row takes its outcome');

-- Invalid policy requests are refused.
select pg_temp.df_expect($$select public.record_policy_owner_decision('df000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','copy.routine','title','x','approveEffect','x','notYetEffect','y','sourceLifecycle','tenant_event','sourceId','df-site:evt-3','revisionHash',repeat('5',64)), 'auto_reply_policy')$$, 'owner_decision_invalid');
select pg_temp.df_expect($$select public.record_policy_owner_decision('df000000-0000-4000-8000-000000000010', jsonb_build_object(
  'kind','review.reply','title','x','approveEffect','x','notYetEffect','y','sourceLifecycle','tenant_event','sourceId','df-site:evt-3','revisionHash',repeat('5',64)), 'someone_else')$$, 'owner_decision_invalid');
select pg_temp.df_expect($$select public.record_policy_owner_decision('df000000-0000-4000-8000-000000000012', jsonb_build_object(
  'kind','review.reply','title','x','approveEffect','x','notYetEffect','y','sourceLifecycle','tenant_event','sourceId','df-site:evt-3','revisionHash',repeat('5',64)), 'auto_reply_policy')$$, 'owner_decision_access_denied');

-- A notice-route row can never be open.
select pg_temp.df_expect($$insert into public.owner_decisions(workspace_id, change_kind, route, title, approve_effect, not_yet_effect,
  source_lifecycle, source_id, revision_hash, sign_in_required, expires_at)
  values ('df000000-0000-4000-8000-000000000010','review.reply','handle_after_notice','x','x','y','tenant_event','df-site:evt-9',repeat('9',64),false, now() + interval '1 day')$$,
  'new row for relation "owner_decisions" violates check constraint "owner_decisions_policy_route_closed"');
rollback;
