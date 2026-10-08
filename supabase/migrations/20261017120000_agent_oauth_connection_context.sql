-- Bootstrap an assistant's selected business without asking the model to read
-- custom token-response metadata or enumerate the public business directory.
-- This resolves identity only. call_agent_protected_tool still locks and
-- rechecks the current grant before any record is returned.
create function public.read_agent_oauth_connection(p_token_hash text, p_resource text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public.validate_agent_oauth_token(t.token_hash, p_resource, 'business:read', t.workspace_id)
  from public.assistant_tokens t
  where t.token_hash = p_token_hash and t.resource = p_resource
$$;
revoke all on function public.read_agent_oauth_connection(text, text) from public, anon, authenticated, service_role;
grant execute on function public.read_agent_oauth_connection(text, text) to service_role;
