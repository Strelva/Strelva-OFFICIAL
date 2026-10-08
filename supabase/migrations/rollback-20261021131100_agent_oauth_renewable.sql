begin;
-- Refuse to discard adopted connection/refresh state. Disconnect is not deletion.
do $$ begin if exists(select 1 from public.assistant_connections) then raise exception 'agent_oauth_renewable_rollback_requires_data_preservation'; end if; end $$;
create or replace function public.validate_agent_oauth_token(p_token_hash text,p_resource text,p_scope text,p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('userId',user_id,'verifiedEmail',verified_email,'workspaceId',workspace_id,'agencyId',agency_id)
 from public.assistant_tokens t where token_hash=p_token_hash and resource=p_resource and expires_at>clock_timestamp() and revoked_at is null
 and p_scope=any(scopes) and workspace_id=p_workspace_id and public.agent_oauth_grant_live(workspace_id,user_id,verified_email,agency_id,seat_id)
$$;
create or replace function public.revoke_agent_oauth_client_token(p_token_hash text,p_client_id text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin update public.assistant_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where token_hash=p_token_hash and client_id=p_client_id; return true; end $$;
create or replace function public.call_agent_protected_tool(p_token_hash text,p_resource text,p_tool text,p_workspace_id uuid,p_args jsonb) returns jsonb
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
drop function public.read_agent_oauth_principal(text,text,uuid);
drop function public.disconnect_agent_oauth_connection(uuid,text,uuid,uuid);
drop function public.list_agent_oauth_connections(uuid,text,uuid);
drop function public.lock_agent_oauth_token(text,text,text,uuid);
drop function public.refresh_agent_oauth_connection(text,text,text,text[],text,text);
drop function public.exchange_agent_oauth_connection_code(text,text,text,text,text,text,text);
drop function public.issue_agent_oauth_connection_code(uuid,text,uuid,uuid,text,text,text,text,text,text,text[]);
drop table public.assistant_refresh_tokens;
alter table public.assistant_tokens drop column connection_id;
alter table public.assistant_authorization_codes drop column client_name;
drop table public.assistant_connections;

commit;
