\set ON_ERROR_STOP on
begin;
\if :engine
do $$ begin
  if not public.claim_engine_inquiry_reply('ir-race-site','lead_reply','d2000000-0000-4000-8000-0000000000f8')
    then raise exception 'reply_purpose_already_claimed'; end if;
end $$;
\else
select public.claim_workspace_inquiry_reply(
  (select workspace_id from public.tenant_workspace_links where tenant_stable_id='d2000000-0000-4000-8000-0000000000b1'),
  'd2000000-0000-4000-8000-0000000000e2','ir-owner@example.test',
  (select id from public.tenant_leads where tenant_stable_id='d2000000-0000-4000-8000-0000000000b1' and lead_id='lead_reply'),
  'd2000000-0000-4000-8000-0000000000f1',repeat('a',64),'Re: Party','Thanks Dana.');
\endif
-- Keep the winning transaction open long enough for the other connection to
-- reach the shared lock. An accepted/unknown provider call cannot reopen it.
select pg_sleep(0.3);
commit;
