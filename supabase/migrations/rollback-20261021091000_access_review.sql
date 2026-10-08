begin;
set local lock_timeout = '5s';
-- Audit receipts must be preserved, never silently erased by rollback.
do $$begin if exists(select 1 from public.customer_mapping_audit where record_type not in ('relationship','resource','assignment')) then raise exception 'access_review_rollback_requires_audit_preservation'; end if; end;$$;
drop function public.revoke_access_review_entry(uuid,uuid,uuid,text,boolean,text,uuid);
drop function public.read_access_review(uuid,uuid,text,boolean);
drop function public.access_review_token_live(uuid);
drop function public.access_review_units(uuid,uuid,boolean);
drop function public.access_review_require(uuid,uuid,text);
drop function public.access_review_reader(uuid,uuid,text);
alter table public.customer_mapping_audit drop constraint customer_mapping_audit_record_type_check;
alter table public.customer_mapping_audit add constraint customer_mapping_audit_record_type_check check (record_type in ('relationship','resource','assignment'));
notify pgrst, 'reload schema';
commit;
