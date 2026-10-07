-- Roll back only after disabling the inquiry owner-notice callers.
begin;
set local lock_timeout = '3s';
drop function if exists public.authorize_inquiry_owner_link_decision(text,text,text,text);
drop function if exists public.finish_inquiry_decision_notice(uuid,uuid,text,text,timestamptz,text);
drop function if exists public.claim_inquiry_decision_notice(uuid,uuid,text,text);
drop table if exists public.inquiry_decision_notice_claims;
commit;
