-- Disable inquiry owner-notice callers before rollback. Retain claims and
-- provider events as evidence; accepted purposes must never become sendable.
begin;
set local lock_timeout = '3s';
drop function if exists public.record_inquiry_decision_notice_event(uuid,uuid,text,text,text,timestamptz,timestamptz,text[],text);
drop function if exists public.claim_inquiry_decision_notice_v2(uuid,uuid,text,text,text);
commit;
