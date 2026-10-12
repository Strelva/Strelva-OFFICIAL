-- Stop repair availability; never restore the old silent operator writer or
-- remove accepted contacts, sync receipts or immutable operator audit history.
-- Reapply 20261020090038 to restore the audited session-only entry.
begin;
set local lock_timeout = '3s';
revoke all on function public.backfill_newsletter_contacts(text, uuid, boolean, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.read_operator_inquiry_review_audited(uuid,text,text,integer,timestamptz,uuid)
  from public,anon,authenticated,service_role;
commit;
