-- Revert the app reader alongside this rollback before removing its RPC.
begin;
set local lock_timeout = '3s';
drop function if exists public.read_internal_tool_use_link_labels(uuid,text,uuid,uuid,integer);
commit;
