-- Rollback for 20261010102100_website_owner_link_launch.sql (w6 owner-ask).
-- Disable STRELVA_OWNER_DECISION_LINKS_RELEASE and deploy that env change
-- first. Removes the website owner-link entry points only; reservations,
-- receipts and the decision trail remain. Run before
-- rollback-20261010102000_owner_decision_links.sql.
begin;
set local lock_timeout = '3s';
drop function if exists public.reserve_website_by_owner_link(uuid,uuid,uuid,text,integer,text,text,uuid,uuid,text,text);
drop function if exists public.publish_website_by_owner_link(uuid,uuid,uuid,text,integer,text,text,jsonb,uuid,uuid,text,text);
drop function if exists public.assert_website_owner_link(uuid,uuid,uuid,text,integer,text,uuid,uuid,text,text);
commit;
