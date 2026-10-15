-- Inverse of 20261026180000_money_agency_pay_links.sql. Refuses once any link or
-- numbered document exists, because documents are immutable money evidence.
begin;
set local lock_timeout='3s';
do $$ begin
 if exists(select 1 from public.agency_pay_links) or exists(select 1 from public.money_documents) then raise exception 'agency_pay_links_rollback_populated'; end if;
end $$;
drop function public.backfill_legacy_agency_pay_link(jsonb,text,uuid);
drop function public.read_money_document(text,uuid);
drop function public.issue_agency_pay_link_receipt(uuid);
drop function public.read_agency_pay_link_open_checkouts(uuid);
drop function public.advance_agency_pay_link_checkout(uuid,integer);
drop function public.assert_agency_pay_link_checkout_open(uuid,uuid);
drop function public.begin_agency_pay_link_checkout(text,bigint);
drop function public.list_agency_pay_links_for_support();
drop function public.read_public_agency_pay_link(text);
drop function public.read_agency_pay_links(uuid,uuid,text);
drop function public.agency_pay_link_command(jsonb,uuid,text);
drop function public.money_document_next(uuid,text);
drop function public.agency_pay_link_projection(public.agency_pay_links);
drop function public.agency_pay_link_paid(uuid);
drop trigger money_documents_immutable on public.money_documents;
drop function public.money_document_immutable_guard();
drop table public.money_documents;
drop table public.money_document_counters;
drop table public.agency_pay_link_commands;
drop table public.agency_pay_links;
notify pgrst,'reload schema';
commit;
