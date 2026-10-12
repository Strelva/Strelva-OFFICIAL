-- Roll back only after disabling Systems for all consumers of the new RPC.
begin;
set local lock_timeout = '3s';
drop function if exists public.submit_internal_tool_member_record(uuid,uuid,uuid,text,integer,integer,text,jsonb,jsonb);
commit;
