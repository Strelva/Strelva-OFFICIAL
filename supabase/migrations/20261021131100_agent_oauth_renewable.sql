-- Renewable business-bound public clients. Only hashes cross the database boundary.
create table public.assistant_connections (
 id uuid primary key default gen_random_uuid(),client_id text not null,client_name text not null,
 resource text not null,scopes text[] not null,workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references public.users(id) on delete cascade,verified_email text not null,
 agency_id uuid references public.workspaces(id) on delete cascade,seat_id uuid references public.provider_seats(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),last_used_at timestamptz,
 expires_at timestamptz not null default clock_timestamp()+interval '30 days',revoked_at timestamptz,
 check((agency_id is null)=(seat_id is null))
);
alter table public.assistant_authorization_codes add column client_name text not null default 'Agent client';
alter table public.assistant_tokens add column connection_id uuid references public.assistant_connections(id) on delete cascade;
create index assistant_tokens_connection on public.assistant_tokens(connection_id);
create table public.assistant_refresh_tokens (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),connection_id uuid not null references public.assistant_connections(id) on delete cascade,
 scopes text[] not null,expires_at timestamptz not null,consumed_at timestamptz,created_at timestamptz not null default clock_timestamp()
);
create index assistant_refresh_connection on public.assistant_refresh_tokens(connection_id);
alter table public.assistant_connections enable row level security;
alter table public.assistant_refresh_tokens enable row level security;
revoke all on public.assistant_connections,public.assistant_refresh_tokens from public,anon,authenticated,service_role;

create function public.issue_agent_oauth_connection_code(p_user_id uuid,p_verified_email text,p_workspace_id uuid,p_agency_id uuid,p_code_hash text,p_client_id text,p_client_name text,p_redirect_uri text,p_resource text,p_challenge text,p_scopes text[]) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare seat uuid;
begin
 if p_agency_id is not null then select id into seat from public.provider_seats where customer_workspace_id=p_workspace_id and agency_workspace_id=p_agency_id and status='active' for share; end if;
 if not public.agent_oauth_grant_live(p_workspace_id,p_user_id,p_verified_email,p_agency_id,seat) then raise exception 'workspace_access_denied'; end if;
 if p_scopes is null or cardinality(p_scopes)=0 or not p_scopes<@array['business:read','website:read','website:propose','inquiries:read','quotes:approve']::text[] or (p_agency_id is not null and p_scopes<>array['business:read']::text[]) then raise exception 'oauth_invalid_scope'; end if;
 if length(p_client_name) not between 1 and 120 or length(p_client_id)>2000 then raise exception 'oauth_invalid_client'; end if;
 insert into public.assistant_authorization_codes(code_hash,client_id,client_name,redirect_uri,resource,challenge,scopes,workspace_id,user_id,verified_email,agency_id,seat_id)
 values(p_code_hash,p_client_id,p_client_name,p_redirect_uri,p_resource,p_challenge,p_scopes,p_workspace_id,p_user_id,lower(btrim(p_verified_email)),p_agency_id,seat);
 return jsonb_build_object('issued',true);
end $$;

create function public.exchange_agent_oauth_connection_code(p_code_hash text,p_client_id text,p_redirect_uri text,p_resource text,p_challenge text,p_token_hash text,p_refresh_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.assistant_authorization_codes; f public.assistant_connections;
begin
 select * into c from public.assistant_authorization_codes where code_hash=p_code_hash for update;
 if p_client_id is null or p_redirect_uri is null or p_resource is null or p_challenge is null or p_token_hash is null or p_refresh_hash is null or not found or c.consumed_at is not null or c.expires_at<=clock_timestamp() or c.client_id<>p_client_id or c.redirect_uri<>p_redirect_uri or c.resource<>p_resource or c.challenge<>p_challenge
 or not public.agent_oauth_grant_live(c.workspace_id,c.user_id,c.verified_email,c.agency_id,c.seat_id) then raise exception 'oauth_invalid_grant'; end if;
 update public.assistant_authorization_codes set consumed_at=clock_timestamp() where code_hash=p_code_hash;
 insert into public.assistant_connections(client_id,client_name,resource,scopes,workspace_id,user_id,verified_email,agency_id,seat_id)
 values(c.client_id,c.client_name,c.resource,c.scopes,c.workspace_id,c.user_id,c.verified_email,c.agency_id,c.seat_id) returning * into f;
 insert into public.assistant_tokens(token_hash,client_id,resource,scopes,workspace_id,user_id,verified_email,agency_id,seat_id,connection_id)
 values(p_token_hash,c.client_id,c.resource,c.scopes,c.workspace_id,c.user_id,c.verified_email,c.agency_id,c.seat_id,f.id);
 insert into public.assistant_refresh_tokens(token_hash,connection_id,scopes,expires_at) values(p_refresh_hash,f.id,f.scopes,f.expires_at);
 return jsonb_build_object('expiresIn',3600,'scope',array_to_string(f.scopes,' '),'workspaceId',f.workspace_id);
end $$;

-- Every family mutation locks the connection first. Reuse returns an error value,
-- never an exception: raising would roll back the security revocation.
create function public.refresh_agent_oauth_connection(p_refresh_hash text,p_client_id text,p_resource text,p_scopes text[],p_token_hash text,p_next_refresh_hash text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.assistant_refresh_tokens; f public.assistant_connections; selected text[];
begin
 select * into r from public.assistant_refresh_tokens where token_hash=p_refresh_hash;
 if not found then return jsonb_build_object('error','invalid_grant'); end if;
 select * into f from public.assistant_connections where id=r.connection_id for update;
 if not found or p_client_id is null or p_resource is null or f.client_id<>p_client_id or f.resource<>p_resource then return jsonb_build_object('error','invalid_grant'); end if;
 select * into r from public.assistant_refresh_tokens where token_hash=p_refresh_hash for update;
 if r.consumed_at is not null then
  update public.assistant_connections set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=f.id;
  update public.assistant_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where connection_id=f.id;
  return jsonb_build_object('error','invalid_grant');
 end if;
 if f.revoked_at is not null or f.expires_at<=clock_timestamp() or r.expires_at<=clock_timestamp()
 or not public.agent_oauth_grant_live(f.workspace_id,f.user_id,f.verified_email,f.agency_id,f.seat_id) then return jsonb_build_object('error','invalid_grant'); end if;
 selected:=coalesce(p_scopes,r.scopes);
 if cardinality(selected)=0 or not selected<@r.scopes then return jsonb_build_object('error','invalid_scope'); end if;
 update public.assistant_refresh_tokens set consumed_at=clock_timestamp() where token_hash=p_refresh_hash;
 insert into public.assistant_refresh_tokens(token_hash,connection_id,scopes,expires_at) values(p_next_refresh_hash,f.id,selected,f.expires_at);
 insert into public.assistant_tokens(token_hash,client_id,resource,scopes,workspace_id,user_id,verified_email,agency_id,seat_id,connection_id,expires_at)
 values(p_token_hash,f.client_id,f.resource,selected,f.workspace_id,f.user_id,f.verified_email,f.agency_id,f.seat_id,f.id,least(clock_timestamp()+interval '1 hour',f.expires_at));
 update public.assistant_connections set last_used_at=clock_timestamp() where id=f.id;
 return jsonb_build_object('expiresIn',greatest(0,floor(extract(epoch from least(clock_timestamp()+interval '1 hour',f.expires_at)-clock_timestamp())))::integer,'scope',array_to_string(selected,' '),'workspaceId',f.workspace_id);
end $$;

create function public.lock_agent_oauth_token(p_token_hash text,p_resource text,p_scope text,p_workspace_id uuid) returns public.assistant_tokens
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; f public.assistant_connections;
begin
 select * into t from public.assistant_tokens where token_hash=p_token_hash;
 if not found then raise exception 'oauth_invalid_token'; end if;
 if t.connection_id is not null then
  select * into f from public.assistant_connections where id=t.connection_id for share;
  if not found or f.revoked_at is not null or f.expires_at<=clock_timestamp() then raise exception 'oauth_invalid_token'; end if;
 end if;
 select * into t from public.assistant_tokens where token_hash=p_token_hash for share;
 if p_scope is null or p_resource is null or p_workspace_id is null or not found or t.resource<>p_resource or t.workspace_id<>p_workspace_id or t.expires_at<=clock_timestamp() or t.revoked_at is not null or not p_scope=any(t.scopes) then raise exception 'oauth_invalid_token'; end if;
 if t.agency_id is null then perform 1 from public.workspace_memberships where workspace_id=t.workspace_id and user_id=t.user_id and role='owner' for share;
 else
  perform 1 from public.provider_seats where id=t.seat_id and agency_workspace_id=t.agency_id and customer_workspace_id=t.workspace_id and status='active' for share;
  perform 1 from public.workspace_memberships where workspace_id=t.agency_id and user_id=t.user_id for share;
  perform 1 from public.agency_client_staff where agency_workspace_id=t.agency_id and customer_workspace_id=t.workspace_id and user_id=t.user_id and status='active' for share;
 end if;
 if not public.agent_oauth_grant_live(t.workspace_id,t.user_id,t.verified_email,t.agency_id,t.seat_id) then raise exception 'oauth_invalid_token'; end if;
 return t;
end $$;

create function public.list_agent_oauth_connections(p_user_id uuid,p_verified_email text,p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.agent_oauth_grant_live(p_workspace_id,p_user_id,p_verified_email,null,null) then raise exception 'workspace_access_denied'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'clientId',client_id,'clientName',client_name,'scopes',scopes,'createdAt',created_at,'expiresAt',expires_at,'lastUsedAt',last_used_at,'revokedAt',revoked_at,'agencyId',agency_id,'status',case when revoked_at is not null then 'revoked' when expires_at<=clock_timestamp() then 'expired' when not public.agent_oauth_grant_live(workspace_id,user_id,verified_email,agency_id,seat_id) then 'authority_removed' else 'active' end) order by created_at desc) from (select * from public.assistant_connections where workspace_id=p_workspace_id order by created_at desc limit 100) c),'[]'::jsonb);
end $$;
create function public.disconnect_agent_oauth_connection(p_user_id uuid,p_verified_email text,p_workspace_id uuid,p_connection_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.assistant_connections;
begin
 if not public.agent_oauth_grant_live(p_workspace_id,p_user_id,p_verified_email,null,null) then raise exception 'workspace_access_denied'; end if;
 select * into f from public.assistant_connections where id=p_connection_id and workspace_id=p_workspace_id for update;
 if not found then raise exception 'workspace_access_denied'; end if;
 update public.assistant_connections set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=f.id;
 update public.assistant_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where connection_id=f.id;
 update public.assistant_authorization_codes set consumed_at=coalesce(consumed_at,clock_timestamp()) where workspace_id=f.workspace_id and client_id=f.client_id and user_id=f.user_id;
 return true;
end $$;

create or replace function public.validate_agent_oauth_token(p_token_hash text,p_resource text,p_scope text,p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('userId',t.user_id,'verifiedEmail',t.verified_email,'workspaceId',t.workspace_id,'agencyId',t.agency_id)
 from public.assistant_tokens t left join public.assistant_connections c on c.id=t.connection_id
 where t.token_hash=p_token_hash and t.resource=p_resource and t.expires_at>clock_timestamp() and t.revoked_at is null
 and (t.connection_id is null or (c.revoked_at is null and c.expires_at>clock_timestamp()))
 and p_scope=any(t.scopes) and t.workspace_id=p_workspace_id and public.agent_oauth_grant_live(t.workspace_id,t.user_id,t.verified_email,t.agency_id,t.seat_id)
$$;
create or replace function public.revoke_agent_oauth_client_token(p_token_hash text,p_client_id text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare connection uuid;
begin
 select connection_id into connection from public.assistant_tokens where token_hash=p_token_hash and client_id=p_client_id;
 if connection is null then select r.connection_id into connection from public.assistant_refresh_tokens r join public.assistant_connections c on c.id=r.connection_id where r.token_hash=p_token_hash and c.client_id=p_client_id; end if;
 if connection is not null then
  perform 1 from public.assistant_connections where id=connection for update;
  update public.assistant_connections set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=connection;
  update public.assistant_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where connection_id=connection;
 else update public.assistant_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where token_hash=p_token_hash and client_id=p_client_id;
 end if;
 return true;
end $$;

revoke all on function public.issue_agent_oauth_connection_code(uuid,text,uuid,uuid,text,text,text,text,text,text,text[]),public.exchange_agent_oauth_connection_code(text,text,text,text,text,text,text),public.refresh_agent_oauth_connection(text,text,text,text[],text,text),public.lock_agent_oauth_token(text,text,text,uuid),public.list_agent_oauth_connections(uuid,text,uuid),public.disconnect_agent_oauth_connection(uuid,text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.issue_agent_oauth_connection_code(uuid,text,uuid,uuid,text,text,text,text,text,text,text[]),public.exchange_agent_oauth_connection_code(text,text,text,text,text,text,text),public.refresh_agent_oauth_connection(text,text,text,text[],text,text),public.list_agent_oauth_connections(uuid,text,uuid),public.disconnect_agent_oauth_connection(uuid,text,uuid,uuid) to service_role;
-- lock_agent_oauth_token is internal: protected wrappers are the only entrypoint.

create or replace function public.call_agent_protected_tool(p_token_hash text,p_resource text,p_tool text,p_workspace_id uuid,p_args jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.assistant_tokens; required_scope text;
begin
 required_scope:=case p_tool when 'read_business_context' then 'business:read' when 'read_customer_inquiries' then 'inquiries:read' when 'approve_quote' then 'quotes:approve' end;
 t:=public.lock_agent_oauth_token(p_token_hash,p_resource,required_scope,p_workspace_id);
 if p_tool='read_business_context' then return public.read_business_record(t.workspace_id,t.user_id,t.verified_email); end if;
 if t.agency_id is not null then raise exception 'oauth_invalid_token'; end if;
 if p_tool='read_customer_inquiries' then return public.read_workspace_leads(t.workspace_id,t.user_id,t.verified_email,null,50,null); end if;
 if p_tool='approve_quote' then return public.record_agent_quote(t.workspace_id,t.user_id,t.verified_email,(p_args->>'inquiryId')::uuid,(p_args->>'requestId')::uuid,(p_args->>'amountCents')::bigint,p_args->>'currency',p_args->>'terms'); end if;
 raise exception 'oauth_invalid_token';
end $$;

create function public.read_agent_oauth_principal(p_token_hash text,p_resource text,p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select public.validate_agent_oauth_token(t.token_hash,p_resource,t.scopes[1],t.workspace_id)||jsonb_build_object('scopes',t.scopes)
 from public.assistant_tokens t where t.token_hash=p_token_hash and (p_workspace_id is null or t.workspace_id=p_workspace_id)
$$;
revoke all on function public.read_agent_oauth_principal(text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_agent_oauth_principal(text,text,uuid) to service_role;
