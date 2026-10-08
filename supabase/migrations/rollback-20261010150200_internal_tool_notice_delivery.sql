-- Disable notices first. Retain delivery metadata and receipts for audit.
begin;
set local lock_timeout = '3s';
drop function if exists public.read_catalog_tool_notice_failures(uuid,text);
drop function if exists public.read_catalog_tool_notices(uuid,uuid,text,timestamptz);
drop function if exists public.list_internal_tool_notice_retries();
drop function if exists public.finish_internal_tool_notice_delivery(uuid,uuid,uuid,text,text);
drop function if exists public.lease_internal_tool_notice(uuid,uuid,jsonb);
commit;
