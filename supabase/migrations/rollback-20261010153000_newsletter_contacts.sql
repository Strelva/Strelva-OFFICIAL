-- Disable STRELVA_NEWSLETTER_CONTACTS_RELEASE and deploy first. Keep existing
-- subscriber rows, business contacts and sync receipts: dropping a projection
-- must never destroy consent or records written while it was enabled.
begin;
set local lock_timeout = '3s';
drop function if exists public.subscribe_newsletter_contact(text, uuid, text, text);
drop function if exists public.backfill_newsletter_contacts(text, text, uuid, boolean, text, integer);
drop function if exists public.newsletter_contact_project(uuid, uuid, text, text, timestamptz);
drop function if exists public.newsletter_contact_assert_link(text, uuid);
-- Keep the additive flag allowlist + receipt table so existing rows and their
-- immutable flag history survive rollback. Neither can activate behavior alone.
commit;
