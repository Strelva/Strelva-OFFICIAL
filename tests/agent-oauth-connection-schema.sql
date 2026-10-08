\set ON_ERROR_STOP on
begin;
create function pg_temp.connection_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'connection assertion: %', message; end if; end $$;
insert into public.users(id,email,verified_at) values
 ('ac171200-0000-4000-8000-000000000001','connection-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('ac171200-0000-4000-8000-000000000010','customer','Unpublished connection fixture','ac171200-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('ac171200-0000-4000-8000-000000000010','ac171200-0000-4000-8000-000000000001','owner','ac171200-0000-4000-8000-000000000001');
select public.issue_agent_oauth_code(
 'ac171200-0000-4000-8000-000000000001','connection-owner@example.test','ac171200-0000-4000-8000-000000000010',null,
 repeat('a',64),'https://assistant.example.test/client.json','https://assistant.example.test/callback',
 'https://app.strelva.com/api/mcp/public',repeat('x',43),array['business:read']);
select public.exchange_agent_oauth_code(repeat('a',64),'https://assistant.example.test/client.json','https://assistant.example.test/callback',
 'https://app.strelva.com/api/mcp/public',repeat('x',43),repeat('b',64));
select pg_temp.connection_assert(
 public.read_agent_oauth_connection(repeat('b',64),'https://app.strelva.com/api/mcp/public')->>'workspaceId'='ac171200-0000-4000-8000-000000000010',
 'unpublished business resolves only from its live grant');
select pg_temp.connection_assert(public.read_agent_oauth_connection(repeat('b',64),'https://other.example.test/mcp') is null,'wrong resource refused');
select pg_temp.connection_assert(public.read_agent_oauth_connection(repeat('c',64),'https://app.strelva.com/api/mcp/public') is null,'unknown token refused');
update public.assistant_tokens set scopes=array['inquiries:read'] where token_hash=repeat('b',64);
select pg_temp.connection_assert(public.read_agent_oauth_connection(repeat('b',64),'https://app.strelva.com/api/mcp/public') is null,'basic read scope required');
update public.assistant_tokens set scopes=array['business:read'],expires_at=clock_timestamp()-interval '1 second' where token_hash=repeat('b',64);
select pg_temp.connection_assert(public.read_agent_oauth_connection(repeat('b',64),'https://app.strelva.com/api/mcp/public') is null,'expired token refused');
update public.assistant_tokens set expires_at=clock_timestamp()+interval '1 hour',revoked_at=clock_timestamp() where token_hash=repeat('b',64);
select pg_temp.connection_assert(public.read_agent_oauth_connection(repeat('b',64),'https://app.strelva.com/api/mcp/public') is null,'revoked token refused');
update public.assistant_tokens set revoked_at=null where token_hash=repeat('b',64);
delete from public.workspace_memberships where workspace_id='ac171200-0000-4000-8000-000000000010';
select pg_temp.connection_assert(public.read_agent_oauth_connection(repeat('b',64),'https://app.strelva.com/api/mcp/public') is null,'removed owner refused');
select pg_temp.connection_assert(
 not has_function_privilege('anon','public.read_agent_oauth_connection(text,text)','execute')
 and not has_function_privilege('authenticated','public.read_agent_oauth_connection(text,text)','execute')
 and has_function_privilege('service_role','public.read_agent_oauth_connection(text,text)','execute'),
 'resolver is service-role only');
rollback;
-- No-data additive migration: verify actual rollback and reapply, not just syntax.
\ir ../supabase/migrations/rollback-20261017120000_agent_oauth_connection_context.sql
do $$ begin
 if to_regprocedure('public.read_agent_oauth_connection(text,text)') is not null then raise exception 'resolver rollback failed'; end if;
end $$;
\ir ../supabase/migrations/20261017120000_agent_oauth_connection_context.sql
do $$ begin
 if not has_function_privilege('service_role','public.read_agent_oauth_connection(text,text)','execute')
 or has_function_privilege('anon','public.read_agent_oauth_connection(text,text)','execute')
 then raise exception 'resolver reapply privileges failed'; end if;
end $$;
