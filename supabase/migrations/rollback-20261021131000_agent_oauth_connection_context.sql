-- Roll back the bootstrap resolver with code that requires explicit selectors.
-- No records or grants are created by this migration.
begin;
drop function public.read_agent_oauth_connection(text, text);
commit;
