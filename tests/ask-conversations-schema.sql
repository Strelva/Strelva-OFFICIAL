\set ON_ERROR_STOP on
-- Ask Strelva conversation history on fictional rows. Rolled back.
begin;
create or replace function pg_temp.ac_assert(condition boolean, message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'ask history assertion failed: %', message; end if; end; $$;
create or replace function pg_temp.ac_expect(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlerrm not like expected then raise exception 'expected % but got %', expected, sqlerrm; end if;
    return;
  end;
  raise exception 'expected % but the statement succeeded: %', expected, statement;
end; $$;

select pg_temp.ac_assert(
  not has_table_privilege('service_role', 'public.ask_conversations', 'SELECT')
  and not has_table_privilege('authenticated', 'public.ask_messages', 'SELECT')
  and not has_table_privilege('service_role', 'public.ask_messages', 'INSERT')
  and (select bool_and(relrowsecurity) from pg_class where oid in ('public.ask_conversations'::regclass, 'public.ask_messages'::regclass))
  and has_function_privilege('service_role', 'public.append_ask_message(uuid,uuid,text,uuid,uuid,text,text,jsonb,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.list_ask_conversations(uuid,uuid,text,uuid,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.read_ask_conversation(uuid,uuid,text,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.append_ask_message(uuid,uuid,text,uuid,uuid,text,text,jsonb,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.read_ask_conversation(uuid,uuid,text,uuid,integer)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.ask_history_actor_role(uuid,uuid,text)', 'EXECUTE'),
  'tables are RLS-on with no direct grants; only service_role runs the three functions');

insert into public.users(id, email, verified_at) values
  ('7a000000-0000-4000-8000-000000000001', 'ac-owner@example.test', now()),
  ('7a000000-0000-4000-8000-000000000002', 'ac-admin@example.test', now()),
  ('7a000000-0000-4000-8000-000000000003', 'ac-member@example.test', now()),
  ('7a000000-0000-4000-8000-000000000004', 'ac-other@example.test', now()),
  ('7a000000-0000-4000-8000-000000000005', 'ac-unverified@example.test', null);
insert into public.workspaces(id, kind, name, created_by) values
  ('7a000000-0000-4000-8000-000000000010', 'customer', 'Lakeshore Dried Goods', '7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-000000000011', 'customer', 'Harbor Wellness', '7a000000-0000-4000-8000-000000000004'),
  ('7a000000-0000-4000-8000-000000000012', 'personal', 'Personal', '7a000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id, user_id, role, created_by) values
  ('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000001', 'owner', '7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000002', 'admin', '7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000003', 'member', '7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000005', 'member', '7a000000-0000-4000-8000-000000000001'),
  ('7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000004', 'owner', '7a000000-0000-4000-8000-000000000004'),
  ('7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000001', 'owner', '7a000000-0000-4000-8000-000000000001');

do $$
declare
  ws uuid := '7a000000-0000-4000-8000-000000000010';
  other_ws uuid := '7a000000-0000-4000-8000-000000000011';
  owner_id uuid := '7a000000-0000-4000-8000-000000000001';
  admin_id uuid := '7a000000-0000-4000-8000-000000000002';
  member_id uuid := '7a000000-0000-4000-8000-000000000003';
  site uuid := '7a000000-0000-4000-8000-0000000000aa';
  first jsonb;
  second jsonb;
  member_first jsonb;
  read jsonb;
  listed jsonb;
begin
  -- The owner starts a conversation on the website System; Strelva's reply keeps its result.
  first := public.append_ask_message(ws, owner_id, 'AC-OWNER@example.test', null, site, 'user', 'Put the holiday boxes   at the top of the homepage', null, null);
  perform pg_temp.ac_assert((first->>'seq')::int = 1, 'first message is seq 1');
  second := public.append_ask_message(ws, owner_id, 'ac-owner@example.test', (first->>'conversationId')::uuid, site, 'assistant',
    'I drafted the hero change. It is not live yet; it needs your yes in Needs you.', '{"kind":"draft","items":[{"kind":"draft","ids":["evt_1"]}]}'::jsonb, null);
  perform pg_temp.ac_assert((second->>'seq')::int = 2 and second->>'conversationId' = first->>'conversationId', 'reply joins the same conversation');
  read := public.read_ask_conversation(ws, owner_id, 'ac-owner@example.test', (first->>'conversationId')::uuid, 100);
  perform pg_temp.ac_assert(jsonb_array_length(read->'messages') = 2
    and read->'messages'->0->>'role' = 'user' and read->'messages'->1->'result'->>'kind' = 'draft'
    and read->>'title' = 'Put the holiday boxes at the top of the homepage'
    and (read->>'systemId')::uuid = site, 'messages come back in order with the result and a collapsed title');

  -- A member's own conversation on Home.
  member_first := public.append_ask_message(ws, member_id, 'ac-member@example.test', null, null, 'user', 'How many inquiries came in this week?', null, null);
  listed := public.list_ask_conversations(ws, member_id, 'ac-member@example.test', null, 20);
  perform pg_temp.ac_assert(jsonb_array_length(listed) = 1 and listed->0->>'id' = member_first->>'conversationId', 'a member lists only their own');
  listed := public.list_ask_conversations(ws, admin_id, 'ac-admin@example.test', null, 20);
  perform pg_temp.ac_assert(jsonb_array_length(listed) = 2, 'an admin lists every conversation in the business');
  listed := public.list_ask_conversations(ws, owner_id, 'ac-owner@example.test', site, 20);
  perform pg_temp.ac_assert(jsonb_array_length(listed) = 1 and (listed->0->>'mine')::boolean, 'filtered to one System');
  read := public.read_ask_conversation(ws, admin_id, 'ac-admin@example.test', (first->>'conversationId')::uuid, 100);
  perform pg_temp.ac_assert(not (read->>'mine')::boolean, 'an admin reads the owner''s conversation, marked not theirs');

  -- Operators asking on the owner's behalf are recorded as such.
  perform public.append_ask_message(ws, admin_id, 'ac-admin@example.test', null, null, 'user', 'Owner emailed: add estate planning consults', null, 'email');
end $$;

-- Refusals: unverified, outsiders, other businesses, personal workspaces, someone else's thread, mismatched System, bad payloads.
select pg_temp.ac_expect($$select public.append_ask_message('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000005', 'ac-unverified@example.test', null, null, 'user', 'hi', null, null)$$, '%ask_history_access_denied%');
select pg_temp.ac_expect($$select public.append_ask_message('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000001', 'ac-other@example.test', null, null, 'user', 'hi', null, null)$$, '%ask_history_access_denied%');
select pg_temp.ac_expect($$select public.list_ask_conversations('7a000000-0000-4000-8000-000000000010', '7a000000-0000-4000-8000-000000000004', 'ac-other@example.test', null, 20)$$, '%ask_history_access_denied%');
select pg_temp.ac_expect($$select public.append_ask_message('7a000000-0000-4000-8000-000000000012', '7a000000-0000-4000-8000-000000000001', 'ac-owner@example.test', null, null, 'user', 'hi', null, null)$$, '%ask_history_access_denied%');
do $$
declare
  ws uuid := '7a000000-0000-4000-8000-000000000010';
  owner_conversation uuid;
  member_conversation uuid;
begin
  select id into owner_conversation from public.ask_conversations where workspace_id = ws and created_by = '7a000000-0000-4000-8000-000000000001';
  select id into member_conversation from public.ask_conversations where workspace_id = ws and created_by = '7a000000-0000-4000-8000-000000000003';
  -- Cross-workspace: the other business's owner can't read or add to it, even with its id.
  perform pg_temp.ac_expect(format($q$select public.read_ask_conversation('7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000004', 'ac-other@example.test', %L, 10)$q$, owner_conversation), '%ask_conversation_not_found%');
  perform pg_temp.ac_expect(format($q$select public.append_ask_message('7a000000-0000-4000-8000-000000000011', '7a000000-0000-4000-8000-000000000004', 'ac-other@example.test', %L, null, 'user', 'hi', null, null)$q$, owner_conversation), '%ask_conversation_not_found%');
  -- A member can't read or add to the owner's conversation.
  perform pg_temp.ac_expect(format($q$select public.read_ask_conversation(%L, '7a000000-0000-4000-8000-000000000003', 'ac-member@example.test', %L, 10)$q$, ws, owner_conversation), '%ask_conversation_not_found%');
  -- An admin reads but never writes into someone else's conversation.
  perform pg_temp.ac_expect(format($q$select public.append_ask_message(%L, '7a000000-0000-4000-8000-000000000002', 'ac-admin@example.test', %L, null, 'user', 'hi', null, null)$q$, ws, member_conversation), '%ask_conversation_not_found%');
  -- The System is fixed for a conversation.
  perform pg_temp.ac_expect(format($q$select public.append_ask_message(%L, '7a000000-0000-4000-8000-000000000001', 'ac-owner@example.test', %L, null, 'user', 'hi', null, null)$q$, ws, owner_conversation), '%ask_conversation_system_mismatch%');
  -- Payload rules.
  perform pg_temp.ac_expect(format($q$select public.append_ask_message(%L, '7a000000-0000-4000-8000-000000000001', 'ac-owner@example.test', null, null, 'assistant', 'hi', null, null)$q$, ws), '%ask_history_invalid%');
  perform pg_temp.ac_expect(format($q$select public.append_ask_message(%L, '7a000000-0000-4000-8000-000000000001', 'ac-owner@example.test', null, null, 'user', 'hi', '{"kind":"answer"}', null)$q$, ws), '%ask_history_invalid%');
  perform pg_temp.ac_expect(format($q$select public.append_ask_message(%L, '7a000000-0000-4000-8000-000000000001', 'ac-owner@example.test', null, null, 'user', '', null, null)$q$, ws), '%ask_history_invalid%');
  perform pg_temp.ac_expect(format($q$select public.append_ask_message(%L, '7a000000-0000-4000-8000-000000000001', 'ac-owner@example.test', null, null, 'user', 'hi', null, 'sms')$q$, ws), '%ask_history_invalid%');
  perform pg_temp.ac_expect(format($q$select public.append_ask_message(%L, '7a000000-0000-4000-8000-000000000001', 'ac-owner@example.test', null, null, 'user', repeat('x', 20001), null, null)$q$, ws), '%ask_history_invalid%');
end $$;

rollback;
\echo 'Ask Strelva conversation history checks passed.'
