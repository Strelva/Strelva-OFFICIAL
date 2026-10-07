-- Only while the inquiry reply rollout is off; do not remove active claims.
begin;
set local lock_timeout = '3s';
drop trigger inquiry_workspace_reply_shared_purpose on public.inquiry_workspace_messages;
drop function public.guard_workspace_inquiry_reply_purpose();
drop function public.claim_engine_inquiry_reply(text,text,uuid);
drop function public.release_rejected_engine_inquiry_reply(text,text,uuid);
drop table public.inquiry_engine_reply_claims;
commit;
