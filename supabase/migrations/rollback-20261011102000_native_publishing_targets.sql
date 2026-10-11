begin;
-- An issued output/receipt is a commitment. Never drop it during rollback.
do $$ begin
 if exists(select 1 from public.workspace_collection_entries) or exists(select 1 from public.workspace_newsletter_issues where tenant_id is null)
   or exists(select 1 from public.outside_write_receipts where provider='strelva_content' and tenant_id is null) then raise exception 'rollback_native_publishing_has_outputs'; end if;
end; $$;
drop function public.read_native_workspace_google_binding(uuid),public.read_native_workspace_newsletter_issues(uuid,uuid),public.approve_native_workspace_newsletter_issue(jsonb),public.read_native_workspace_collection_receipts(uuid,uuid),public.publish_native_workspace_collection(jsonb),public.read_native_workspace_collection(uuid,uuid);
drop function public.native_publishing_require_system(uuid,uuid,text);
alter table public.workspace_newsletter_issues alter column tenant_id set not null;
drop table public.workspace_collection_entries;
drop function public.workspace_newsletter_sender(text,uuid,jsonb);
alter function public.workspace_newsletter_sender_legacy_target(text,uuid,jsonb) rename to workspace_newsletter_sender;
grant execute on function public.workspace_newsletter_sender(text,uuid,jsonb) to service_role;
commit;
