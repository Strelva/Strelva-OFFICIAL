-- Ask Strelva conversation history, per business workspace
-- (docs/product/specs/ask-strelva.md section 5, "New").
--
-- One conversation is one person's thread in one business workspace, started
-- on Home (system_id null) or on a System page (system_id set, fixed for the
-- life of the conversation). Each message is the person's words or Strelva's
-- reply; Strelva's reply keeps the turn's result contract (`result`: the
-- result kind and the receipt items with ids), so a reopened conversation
-- shows what was drafted, opened or filed, not only the prose.
--
-- Who sees what. Owners and admins of the business read every conversation in
-- it (a Strelva operator asking on the owner's behalf is an admin, so the
-- owner can read what was asked for them). A member reads their own. Only the
-- person who started a conversation adds to it. Nothing here approves,
-- publishes or files anything: it is a record of the conversation only.
--
-- Identity. `system_id` has no foreign key: a System may be a projection
-- (src/platform/systems/from-existing.ts) that is not stored.
--
-- Additive only. RLS on, every table privilege revoked. The app reads and
-- writes only through three service-role security-definer functions, each of
-- which re-checks the verified actor and the workspace membership.

set local lock_timeout = '3s';

create table public.ask_conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  system_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  created_by uuid not null references public.users(id) on delete restrict,
  message_count integer not null default 0 check (message_count between 0 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index ask_conversations_workspace_idx on public.ask_conversations(workspace_id, updated_at desc, id);
create index ask_conversations_system_idx on public.ask_conversations(workspace_id, system_id, updated_at desc) where system_id is not null;

create table public.ask_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  workspace_id uuid not null,
  seq integer not null check (seq between 1 and 400),
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 20000)),
  asked_on_behalf text check (asked_on_behalf is null or asked_on_behalf in ('email', 'phone')),
  actor_id uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (conversation_id, seq),
  check (role = 'assistant' or result is null),
  foreign key (conversation_id, workspace_id) references public.ask_conversations(id, workspace_id) on delete cascade
);

alter table public.ask_conversations enable row level security;
alter table public.ask_messages enable row level security;
revoke all on table public.ask_conversations, public.ask_messages from public, anon, authenticated, service_role;

-- The verified actor's role in a customer business workspace. Raises
-- ask_history_access_denied for anyone else, the same answer as a missing
-- workspace, so the error never says whether a business exists.
create function public.ask_history_actor_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role text;
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(coalesce(p_verified_email, ''))) and verified_at is not null
    for key share;
  if not found then raise exception 'ask_history_access_denied'; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and w.kind = 'customer'
    for share of wm;
  if actor_role is null then raise exception 'ask_history_access_denied'; end if;
  return actor_role;
end;
$$;

-- Adds one message. With p_conversation_id null it starts a conversation
-- (titled from the first words) on p_system_id. Returns
-- {conversationId, messageId, seq}. Refuses another business's conversation,
-- someone else's conversation, a System that differs from the conversation's,
-- and an assistant message that opens a conversation.
create function public.append_ask_message(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_conversation_id uuid, p_system_id uuid, p_role text, p_content text, p_result jsonb, p_asked_on_behalf text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  conversation public.ask_conversations;
  next_seq integer;
  message_id uuid;
begin
  perform public.ask_history_actor_role(p_workspace_id, p_user_id, p_verified_email);
  if p_role is null or p_role not in ('user', 'assistant')
    or p_content is null or char_length(p_content) not between 1 and 20000
    or (p_role = 'user' and p_result is not null)
    or (p_result is not null and (jsonb_typeof(p_result) <> 'object' or octet_length(p_result::text) > 20000))
    or (p_asked_on_behalf is not null and p_asked_on_behalf not in ('email', 'phone')) then
    raise exception 'ask_history_invalid';
  end if;
  if p_conversation_id is null then
    if p_role <> 'user' then raise exception 'ask_history_invalid'; end if;
    insert into public.ask_conversations(workspace_id, system_id, title, created_by)
      values (p_workspace_id, p_system_id, left(regexp_replace(btrim(p_content), '\s+', ' ', 'g'), 120), p_user_id)
      returning * into conversation;
  else
    select * into conversation from public.ask_conversations
      where id = p_conversation_id and workspace_id = p_workspace_id
      for update;
    if conversation.id is null or conversation.created_by <> p_user_id then
      raise exception 'ask_conversation_not_found';
    end if;
    if conversation.system_id is distinct from p_system_id then raise exception 'ask_conversation_system_mismatch'; end if;
  end if;
  next_seq := conversation.message_count + 1;
  if next_seq > 400 then raise exception 'ask_conversation_full'; end if;
  insert into public.ask_messages(conversation_id, workspace_id, seq, role, content, result, asked_on_behalf, actor_id)
    values (conversation.id, p_workspace_id, next_seq, p_role, p_content, p_result, p_asked_on_behalf, p_user_id)
    returning id into message_id;
  update public.ask_conversations set message_count = next_seq, updated_at = now() where id = conversation.id;
  return jsonb_build_object('conversationId', conversation.id, 'messageId', message_id, 'seq', next_seq);
end;
$$;

-- The conversations this actor may read, newest first. p_system_id null
-- lists every conversation; set, only that System's.
create function public.list_ask_conversations(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid, p_limit integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role text;
begin
  actor_role := public.ask_history_actor_role(p_workspace_id, p_user_id, p_verified_email);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'systemId', c.system_id, 'title', c.title, 'messageCount', c.message_count,
      'mine', c.created_by = p_user_id, 'createdAt', c.created_at, 'updatedAt', c.updated_at
    ) order by c.updated_at desc, c.id)
    from (
      select * from public.ask_conversations
      where workspace_id = p_workspace_id
        and (p_system_id is null or system_id = p_system_id)
        and (actor_role in ('owner', 'admin') or created_by = p_user_id)
      order by updated_at desc, id
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) c
  ), '[]'::jsonb);
end;
$$;

-- One conversation's messages in order, the newest p_limit of them.
create function public.read_ask_conversation(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_conversation_id uuid, p_limit integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_role text;
  conversation public.ask_conversations;
begin
  actor_role := public.ask_history_actor_role(p_workspace_id, p_user_id, p_verified_email);
  select * into conversation from public.ask_conversations where id = p_conversation_id and workspace_id = p_workspace_id;
  if conversation.id is null or (actor_role not in ('owner', 'admin') and conversation.created_by <> p_user_id) then
    raise exception 'ask_conversation_not_found';
  end if;
  return jsonb_build_object(
    'id', conversation.id, 'systemId', conversation.system_id, 'title', conversation.title,
    'mine', conversation.created_by = p_user_id, 'updatedAt', conversation.updated_at,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'seq', m.seq, 'role', m.role, 'content', m.content, 'result', m.result,
        'askedOnBehalf', m.asked_on_behalf, 'createdAt', m.created_at
      ) order by m.seq)
      from (
        select * from public.ask_messages where conversation_id = conversation.id
        order by seq desc limit greatest(1, least(coalesce(p_limit, 100), 200))
      ) m
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.ask_history_actor_role(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.append_ask_message(uuid, uuid, text, uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.list_ask_conversations(uuid, uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.read_ask_conversation(uuid, uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.append_ask_message(uuid, uuid, text, uuid, uuid, text, text, jsonb, text) to service_role;
grant execute on function public.list_ask_conversations(uuid, uuid, text, uuid, integer) to service_role;
grant execute on function public.read_ask_conversation(uuid, uuid, text, uuid, integer) to service_role;
