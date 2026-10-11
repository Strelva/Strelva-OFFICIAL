-- Disable Systems release first. Saved records, contacts and edit receipts stay.
begin;
set local lock_timeout = '3s';
drop function if exists public.edit_internal_tool_use_record(uuid,text,uuid,uuid,integer,integer,jsonb,text);
commit;
