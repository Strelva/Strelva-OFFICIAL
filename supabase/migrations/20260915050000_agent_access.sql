-- Personal integration tokens for bounded external AI access. Tokens act only
-- through an existing verified user's current membership and one native agent
-- participation grant. They do not create identities or execution authority.
create table public.workspace_agent_access_tokens (
  id uuid primary key,
  work_id uuid not null references public.saved_product_work(id) on delete cascade,
  grant_id uuid not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_prefix text not null check (char_length(token_prefix) between 8 and 16),
  issuer_user_id uuid not null references public.users(id) on delete restrict,
  issuer_email text not null check (issuer_email=lower(btrim(issuer_email))),
  agent_label text not null check (char_length(agent_label) between 1 and 120),
  scopes text[] not null check (scopes <@ array['read','propose']::text[] and cardinality(scopes) between 1 and 2),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete restrict
);
create index workspace_agent_access_issuer_work_idx on public.workspace_agent_access_tokens(work_id,issuer_user_id,created_at desc);
create index workspace_agent_access_work_idx on public.workspace_agent_access_tokens(work_id,created_at desc);

create table public.workspace_agent_access_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  token_id uuid not null references public.workspace_agent_access_tokens(id) on delete cascade,
  issuer_user_id uuid not null references public.users(id) on delete restrict,
  work_id uuid not null references public.saved_product_work(id) on delete cascade,
  grant_id uuid not null,
  action text not null check (action in ('issued','read','propose','revoked')),
  contribution_id uuid,
  idempotency_key text,
  occurred_at timestamptz not null default now()
);
create index workspace_agent_access_events_token_idx on public.workspace_agent_access_events(token_id,occurred_at desc);

alter table public.workspace_agent_access_tokens enable row level security;
alter table public.workspace_agent_access_events enable row level security;
revoke all on public.workspace_agent_access_tokens, public.workspace_agent_access_events from public, anon, authenticated;
grant all on public.workspace_agent_access_tokens, public.workspace_agent_access_events to service_role;

create function public.issue_agent_access_token(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_expected_revision integer,
  p_payload jsonb, p_expected_work_revision text, p_token_id uuid, p_grant_id uuid,
  p_token_hash text, p_token_prefix text, p_agent_label text, p_scopes text[], p_expires_at timestamptz
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare grant_item jsonb;
begin
  select value into grant_item from jsonb_array_elements(coalesce(p_payload->'grants','[]'::jsonb)) where value->>'id'=p_grant_id::text;
  if grant_item is null or grant_item->>'participantKind'<>'agent'
    or grant_item->>'participantEmail' is distinct from lower(btrim(p_verified_email))
    or grant_item->>'status'<>'active' or (grant_item->>'expiresAt')::timestamptz<p_expires_at
    or not (to_jsonb(p_scopes) <@ (grant_item->'scope')) or p_expires_at<=clock_timestamp()
    or exists(select 1 from public.workspace_agent_access_tokens where work_id=p_work_id and issuer_user_id=p_user_id and revoked_at is null and expires_at>clock_timestamp())
  then raise exception 'agent_access_denied'; end if;
  perform public.commit_work_auxiliary(p_user_id,lower(btrim(p_verified_email)),p_work_id,'participation',p_expected_revision,p_payload,'manage',p_expected_work_revision);
  insert into public.workspace_agent_access_tokens(id,work_id,grant_id,token_hash,token_prefix,issuer_user_id,issuer_email,agent_label,scopes,expires_at)
  values(p_token_id,p_work_id,p_grant_id,p_token_hash,p_token_prefix,p_user_id,lower(btrim(p_verified_email)),p_agent_label,p_scopes,p_expires_at);
  insert into public.workspace_agent_access_events(event_key,token_id,issuer_user_id,work_id,grant_id,action)
  values('issued:'||p_token_id,p_token_id,p_user_id,p_work_id,p_grant_id,'issued');
end $$;
revoke all on function public.issue_agent_access_token(uuid,text,uuid,integer,jsonb,text,uuid,uuid,text,text,text,text[],timestamptz) from public,anon,authenticated;
grant execute on function public.issue_agent_access_token(uuid,text,uuid,integer,jsonb,text,uuid,uuid,text,text,text,text[],timestamptz) to service_role;

create function public.revoke_agent_access_token(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_expected_revision integer,
  p_payload jsonb, p_expected_work_revision text, p_token_id uuid, p_revoked_at timestamptz
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare token_item public.workspace_agent_access_tokens; grant_item jsonb;
begin
  select * into token_item from public.workspace_agent_access_tokens where id=p_token_id and work_id=p_work_id and issuer_user_id=p_user_id and revoked_at is null for update;
  if not found then raise exception 'agent_access_denied'; end if;
  select value into grant_item from jsonb_array_elements(coalesce(p_payload->'grants','[]'::jsonb)) where value->>'id'=token_item.grant_id::text;
  if grant_item is null or grant_item->>'status'<>'revoked' then raise exception 'agent_access_denied'; end if;
  perform public.commit_work_auxiliary(p_user_id,lower(btrim(p_verified_email)),p_work_id,'participation',p_expected_revision,p_payload,'manage',p_expected_work_revision);
  update public.workspace_agent_access_tokens set revoked_at=p_revoked_at,revoked_by=p_user_id where id=p_token_id;
  insert into public.workspace_agent_access_events(event_key,token_id,issuer_user_id,work_id,grant_id,action,occurred_at)
  values('revoked:'||p_token_id,p_token_id,p_user_id,p_work_id,token_item.grant_id,'revoked',p_revoked_at);
end $$;
revoke all on function public.revoke_agent_access_token(uuid,text,uuid,integer,jsonb,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.revoke_agent_access_token(uuid,text,uuid,integer,jsonb,text,uuid,timestamptz) to service_role;
