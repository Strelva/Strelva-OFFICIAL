-- Rollback for 20261028100100_app_event_sources.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Drops the 13 triggers and their functions. It touches no data.
begin;
set local lock_timeout='3s';

drop trigger app_event_tenant_leads_trg on public.tenant_leads;
drop trigger app_event_booking_history_trg on public.business_booking_history;
drop trigger app_event_business_record_facts_trg on public.business_record_facts;
drop trigger app_event_business_services_trg on public.business_services;
drop trigger app_event_business_record_confirmed_trg on public.business_record_confirmed;
drop trigger app_event_system_revisions_trg on public.system_revisions;
drop trigger app_event_website_change_receipts_trg on public.website_change_receipts;
drop trigger app_event_website_code_releases_trg on public.website_code_releases;
drop trigger app_event_reviews_trg on public.reviews;
drop trigger app_event_account_bindings_trg on public.workspace_account_bindings;
drop trigger app_event_connected_sites_trg on public.connected_sites;
drop trigger app_event_connection_holders_trg on public.connection_holders;
drop trigger app_event_owner_decisions_trg on public.owner_decisions;

drop function public.app_event_from_tenant_leads();
drop function public.app_event_from_booking_history();
drop function public.app_event_from_business_record_facts();
drop function public.app_event_from_business_services();
drop function public.app_event_from_business_record_confirmed();
drop function public.app_event_from_system_revisions();
drop function public.app_event_from_website_change_receipts();
drop function public.app_event_from_website_code_releases();
drop function public.app_event_from_reviews();
drop function public.app_event_from_account_bindings();
drop function public.app_event_from_connected_sites();
drop function public.app_event_from_connection_holders();
drop function public.app_event_from_owner_decisions();

commit;
