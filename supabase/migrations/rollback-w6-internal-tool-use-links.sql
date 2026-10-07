-- First disable Systems release. Existing submitted records and receipts stay.
begin;
set local lock_timeout = '3s';
drop function if exists public.submit_internal_tool_use_record(uuid,text,uuid,uuid,integer,jsonb,text);
-- Restore resolve_internal_tool_links from 20261007192100_internal_tool_links.sql
-- if revoking the grant-aware link resolver as well. It does not expose a read list.
commit;
