\set ON_ERROR_STOP on
-- Execute the actual empty rollback and restore all routines before testing adoption.
\ir ../supabase/migrations/rollback-20261020090032_agent_oauth_renewable.sql
do $$ begin if to_regclass('public.assistant_connections') is not null then raise exception 'renewable rollback left table'; end if; end $$;
\ir ../supabase/migrations/20261020090032_agent_oauth_renewable.sql
insert into public.users(id,email,verified_at) values('ac181299-0000-4000-8000-000000000001','renew-rollback@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('ac181299-0000-4000-8000-000000000010','customer','Renew rollback','ac181299-0000-4000-8000-000000000001');
insert into public.assistant_connections(client_id,client_name,resource,scopes,workspace_id,user_id,verified_email)
values('https://assistant.example.test/client.json','Fixture','https://app.strelva.com/api/mcp/public',array['business:read'],'ac181299-0000-4000-8000-000000000010','ac181299-0000-4000-8000-000000000001','renew-rollback@example.test');
-- The rollback transaction aborts at the adoption guard. No drop can follow it.
\set ON_ERROR_STOP off
\ir ../supabase/migrations/rollback-20261020090032_agent_oauth_renewable.sql
\set ON_ERROR_STOP on
do $$ begin
 if not exists(select 1 from public.assistant_connections where workspace_id='ac181299-0000-4000-8000-000000000010')
 or not has_function_privilege('service_role','public.refresh_agent_oauth_connection(text,text,text,text[],text,text)','execute') then raise exception 'renewable rollback discarded adoption'; end if;
end $$;
delete from public.assistant_connections where workspace_id='ac181299-0000-4000-8000-000000000010';
delete from public.workspaces where id='ac181299-0000-4000-8000-000000000010';
delete from public.users where id='ac181299-0000-4000-8000-000000000001';
\ir ../supabase/migrations/rollback-20261020090032_agent_oauth_renewable.sql
\ir ../supabase/migrations/20261020090032_agent_oauth_renewable.sql
do $$ begin
 if has_function_privilege('anon','public.refresh_agent_oauth_connection(text,text,text,text[],text,text)','execute')
 or not has_function_privilege('service_role','public.refresh_agent_oauth_connection(text,text,text,text[],text,text)','execute') then raise exception 'renewable reapply privileges wrong'; end if;
end $$;
