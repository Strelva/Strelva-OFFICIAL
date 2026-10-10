-- Only while the inquiry reply rollout is off; do not remove active claims.
begin;
set local lock_timeout = '3s';
-- Keep shared exclusion and all claims: an ambiguous send must never become
-- sendable again when callers are restored. Disable the worker entry points.
revoke execute on function public.claim_engine_inquiry_reply(text,text,uuid),
  public.release_rejected_engine_inquiry_reply(text,text,uuid) from service_role;
commit;
