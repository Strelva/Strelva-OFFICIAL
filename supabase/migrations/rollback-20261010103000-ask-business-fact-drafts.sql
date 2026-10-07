-- Disable STRELVA_ASK_RELEASE before rollback. Retain/export any pending drafts first.
begin;
set local lock_timeout = '3s';
drop function if exists public.resolve_ask_business_draft(uuid,uuid,text,uuid,text);
drop function if exists public.list_ask_business_drafts(uuid,uuid,text);
drop function if exists public.save_ask_business_draft(uuid,uuid,text,uuid,bigint,jsonb,text,text,text);
drop function if exists public.ask_business_draft_json(public.ask_business_record_drafts);
drop table if exists public.ask_business_record_drafts;
commit;
