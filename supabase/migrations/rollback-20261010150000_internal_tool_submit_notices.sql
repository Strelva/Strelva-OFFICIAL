-- Disable STRELVA_INTERNAL_TOOL_NOTICES_RELEASE first. Preserve notice receipts.
-- Keep the additive flag name so immutable flag-change history remains valid.
begin;
set local lock_timeout = '3s';
drop function if exists public.claim_internal_tool_submit_notice(uuid, uuid, text, text, uuid, text);
commit;
