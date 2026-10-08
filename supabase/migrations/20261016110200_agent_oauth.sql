-- OAuth tokens are bound to one business and one specific current agency grant.
-- No unbounded legacy assistant_tokens are trusted or migrated.
create table public.assistant_authorization_codes (
 code_hash text primary key check(code_hash ~ '^[a-f0-9]{64}$'),client_id text not null,redirect_uri text not null,resource text not null,
 challenge text not null check(challenge ~ '^[A-Za-z0-9_-]{43}$'),scopes text[] not null,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references public.users(id) on delete cascade,
 verified_email text not null,agency_id uuid references public.workspaces(id) on delete cascade,seat_id uuid references public.provider_seats(id) on delete cascade,
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',consumed_at timestamptz,
 check((agency_id is null)=(seat_id is null))
);
create table public.assistant_tokens (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),client_id text not null,resource text not null,scopes text[] not null,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,user_id uuid not null references public.users(id) on delete cascade,
 verified_email text not null,agency_id uuid references public.workspaces(id) on delete cascade,seat_id uuid references public.provider_seats(id) on delete cascade,
 expires_at timestamptz not null default clock_timestamp()+interval '1 hour',revoked_at timestamptz,created_at timestamptz not null default clock_timestamp(),
 check((agency_id is null)=(seat_id is null))
);
alter table public.assistant_authorization_codes enable row level security;
alter table public.assistant_tokens enable row level security;
revoke all on public.assistant_authorization_codes,public.assistant_tokens from public,anon,authenticated,service_role;
create function public.agent_oauth_grant_live(p_workspace uuid,p_user uuid,p_email text,p_agency uuid,p_seat uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.users where id=p_user and lower(email)=lower(btrim(p_email)) and verified_at is not null)
 and not public.workspace_exit_completed(p_workspace)
 and case when p_agency is null and p_seat is null then
 exists(select 1 from public.workspace_memberships where workspace_id=p_workspace and user_id=p_user and role='owner')
 else exists(select 1 from public.provider_seats s
 join public.workspace_memberships am on am.workspace_id=s.agency_workspace_id and am.user_id=p_user
 join public.agency_client_staff st on st.agency_workspace_id=s.agency_workspace_id and st.customer_workspace_id=s.customer_workspace_id and st.user_id=p_user and st.status='active'
 where s.id=p_seat and s.customer_workspace_id=p_workspace and s.agency_workspace_id=p_agency and s.status='active') end
$$;
create function public.issue_agent_oauth_code(p_user_id uuid,p_verified_email text,p_workspace_id uuid,p_agency_id uuid,p_code_hash text,p_client_id text,p_redirect_uri text,p_resource text,p_challenge text,p_scopes text[]) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare seat uuid;
begin
 if p_agency_id is not null then select id into seat from public.provider_seats where customer_workspace_id=p_workspace_id and agency_workspace_id=p_agency_id and status='active' for share; end if;
 if not public.agent_oauth_grant_live(p_workspace_id,p_user_id,p_verified_email,p_agency_id,seat) then raise exception 'workspace_access_denied'; end if;
 if p_scopes is null or cardinality(p_scopes)=0 or not p_scopes<@array['business:read','inquiries:read','quotes:approve']::text[] or (p_agency_id is not null and p_scopes<>array['business:read']::text[]) then raise exception 'oauth_invalid_scope'; end if;
 insert into public.assistant_authorization_codes(code_hash,client_id,redirect_uri,resource,challenge,scopes,workspace_id,user_id,verified_email,agency_id,seat_id)
 values(p_code_hash,p_client_id,p_redirect_uri,p_resource,p_challenge,p_scopes,p_workspace_id,p_user_id,lower(btrim(p_verified_email)),p_agency_id,seat);
 return jsonb_build_object('issued',true);
end $$;
create function public.exchange_agent_oauth_code(p_code_hash text,p_client_id text,p_redirect_uri text,p_resource text,p_challenge text,p_token_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.assistant_authorization_codes;t public.assistant_tokens;
begin
 select * into c from public.assistant_authorization_codes where code_hash=p_code_hash for update;
 if p_client_id is null or p_redirect_uri is null or p_resource is null or p_challenge is null or p_token_hash is null or not found or c.consumed_at is not null or c.expires_at<=clock_timestamp() or c.client_id<>p_client_id or c.redirect_uri<>p_redirect_uri or c.resource<>p_resource or c.challenge<>p_challenge
 or not public.agent_oauth_grant_live(c.workspace_id,c.user_id,c.verified_email,c.agency_id,c.seat_id) then raise exception 'oauth_invalid_grant'; end if;
 update public.assistant_authorization_codes set consumed_at=clock_timestamp() where code_hash=p_code_hash;
 insert into public.assistant_tokens(token_hash,client_id,resource,scopes,workspace_id,user_id,verified_email,agency_id,seat_id) values(p_token_hash,c.client_id,c.resource,c.scopes,c.workspace_id,c.user_id,c.verified_email,c.agency_id,c.seat_id) returning * into t;
 return jsonb_build_object('expiresIn',3600,'scope',array_to_string(t.scopes,' '),'workspaceId',t.workspace_id);
end $$;
create function public.validate_agent_oauth_token(p_token_hash text,p_resource text,p_scope text,p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('userId',user_id,'verifiedEmail',verified_email,'workspaceId',workspace_id,'agencyId',agency_id)
 from public.assistant_tokens t where token_hash=p_token_hash and resource=p_resource and expires_at>clock_timestamp() and revoked_at is null
 and p_scope=any(scopes) and workspace_id=p_workspace_id and public.agent_oauth_grant_live(workspace_id,user_id,verified_email,agency_id,seat_id)
$$;
create function public.revoke_agent_oauth_token(p_user_id uuid,p_verified_email text,p_token_hash text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null) then raise exception 'workspace_access_denied'; end if;
 update public.assistant_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where token_hash=p_token_hash and user_id=p_user_id;
 return found;
end $$;
revoke all on function public.agent_oauth_grant_live(uuid,uuid,text,uuid,uuid),public.issue_agent_oauth_code(uuid,text,uuid,uuid,text,text,text,text,text,text[]),public.exchange_agent_oauth_code(text,text,text,text,text,text),public.validate_agent_oauth_token(text,text,text,uuid),public.revoke_agent_oauth_token(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.issue_agent_oauth_code(uuid,text,uuid,uuid,text,text,text,text,text,text[]),public.exchange_agent_oauth_code(text,text,text,text,text,text),public.validate_agent_oauth_token(text,text,text,uuid),public.revoke_agent_oauth_token(uuid,text,text) to service_role;
create function public.read_agent_oauth_choices(p_user_id uuid,p_verified_email text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('workspaceId',workspace_id,'name',name,'agencyId',agency_id,'agencyName',agency_name) order by name,agency_name),'[]'::jsonb)
 from (
  select w.id workspace_id,w.name,null::uuid agency_id,null::text agency_name from public.workspaces w
  where public.agent_oauth_grant_live(w.id,p_user_id,p_verified_email,null,null)
  union all
  select w.id,w.name,a.id,a.name from public.workspaces w
  join public.provider_seats s on s.customer_workspace_id=w.id and s.status='active'
  join public.workspaces a on a.id=s.agency_workspace_id
  where public.agent_oauth_grant_live(w.id,p_user_id,p_verified_email,a.id,s.id)
 ) choices
$$;
revoke all on function public.read_agent_oauth_choices(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_agent_oauth_choices(uuid,text) to service_role;
-- RFC7009 public-client revocation: possession of this token plus its bound
-- client_id; identical success for absent and already-revoked tokens.
create function public.revoke_agent_oauth_client_token(p_token_hash text,p_client_id text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin update public.assistant_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where token_hash=p_token_hash and client_id=p_client_id; return true; end $$;
revoke all on function public.revoke_agent_oauth_client_token(text,text) from public,anon,authenticated,service_role;
grant execute on function public.revoke_agent_oauth_client_token(text,text) to service_role;
-- Authority and use serialize against token revocation, membership removal
-- and the exact provider seat ending. A different agency grant cannot replace it.
create function public.call_agent_protected_tool(p_token_hash text,p_resource text,p_tool text,p_workspace_id uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; required_scope text;
begin
 required_scope:=case p_tool when 'read_business_context' then 'business:read' when 'read_customer_inquiries' then 'inquiries:read' when 'approve_quote' then 'quotes:approve' end;
 select * into t from public.assistant_tokens where token_hash=p_token_hash for share;
 if required_scope is null or not found or t.resource<>p_resource or t.workspace_id<>p_workspace_id or t.expires_at<=clock_timestamp() or t.revoked_at is not null or not required_scope=any(t.scopes) then raise exception 'oauth_invalid_token'; end if;
 if t.agency_id is null then perform 1 from public.workspace_memberships where workspace_id=t.workspace_id and user_id=t.user_id and role='owner' for share;
 else
 perform 1 from public.provider_seats where id=t.seat_id and agency_workspace_id=t.agency_id and customer_workspace_id=t.workspace_id and status='active' for share;
 perform 1 from public.workspace_memberships where workspace_id=t.agency_id and user_id=t.user_id for share;
 perform 1 from public.agency_client_staff where agency_workspace_id=t.agency_id and customer_workspace_id=t.workspace_id and user_id=t.user_id and status='active' for share;
 end if;
 if not public.agent_oauth_grant_live(t.workspace_id,t.user_id,t.verified_email,t.agency_id,t.seat_id) then raise exception 'oauth_invalid_token'; end if;
 if p_tool='read_business_context' then return public.read_business_record(t.workspace_id,t.user_id,t.verified_email); end if;
 if t.agency_id is not null then raise exception 'oauth_invalid_token'; end if;
 if p_tool='read_customer_inquiries' then return public.read_workspace_leads(t.workspace_id,t.user_id,t.verified_email,null,50,null); end if;
 if p_tool='approve_quote' then return public.record_agent_quote(t.workspace_id,t.user_id,t.verified_email,(p_args->>'inquiryId')::uuid,(p_args->>'requestId')::uuid,(p_args->>'amountCents')::bigint,p_args->>'currency',p_args->>'terms'); end if;
 raise exception 'oauth_invalid_token';
end $$;
revoke all on function public.call_agent_protected_tool(text,text,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.call_agent_protected_tool(text,text,text,uuid,jsonb) to service_role;
