-- Refuse after accepted cleanup or exit-ending effects; preserve all original histories.
begin;
set local lock_timeout='3s';
-- Actual writers take the provider relation before permissions/cleanup/endings.
-- Hold their tables through validation and removal so no receipt can appear after
-- the emptiness guard, and inverse-first cannot form a provider/table lock cycle.
lock table public.workspace_providers in access exclusive mode;
lock table public.provider_exit_completion_permissions,public.provider_completion_cleanup_receipts,public.business_attribution_endings,public.provider_completion_rollback_state in access exclusive mode;
set local search_path=public,pg_temp;
do $$begin
 if exists(select 1 from public.provider_completion_cleanup_receipts) or exists(select 1 from public.provider_exit_completion_permissions) or exists(select 1 from public.business_attribution_endings where workspace_exit_request_id is not null) then raise exception 'provider_completion_receipts_require_preservation';end if;
 if (select count(*) from public.provider_completion_rollback_state)<>21 or exists(
  select 1 from public.provider_completion_rollback_state s left join pg_proc p on p.oid=to_regprocedure(s.signature)
  where p.oid is null or pg_get_functiondef(p.oid) is distinct from s.definition
   or pg_get_userbyid(p.proowner) is distinct from s.owner_name
   or coalesce((select jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantor,a.grantee,a.privilege_type,a.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]'::jsonb) is distinct from s.normalized_acl
 ) then raise exception 'provider_completion_rollback_wrong_order';end if;
end $$;
drop trigger provider_completion_end_authority on public.workspace_providers;
drop function public.provider_completion_end_authority();
drop trigger business_attribution_provider_change on public.workspace_providers;
drop function public.business_attribution_require_provider_change();
alter function public.business_attribution_require_provider_change_before_exit() rename to business_attribution_require_provider_change;
create trigger business_attribution_provider_change before update on public.workspace_providers for each row when(old.status='active' and new.status='ended') execute function public.business_attribution_require_provider_change();
drop function public.request_provider_change(uuid,uuid,text,uuid,text,uuid);
alter function public.request_provider_change_before_completion_cleanup(uuid,uuid,text,uuid,text,uuid) rename to request_provider_change;
revoke all on function public.request_provider_change(uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.request_provider_change(uuid,uuid,text,uuid,text,uuid) to service_role;
drop function public.choose_business_provider(uuid,text,uuid,uuid);
alter function public.choose_business_provider_before_completion_cleanup(uuid,text,uuid,uuid) rename to choose_business_provider;
revoke all on function public.choose_business_provider(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.choose_business_provider(uuid,text,uuid,uuid) to service_role;
drop function public.end_business_provider(uuid,text,uuid,text);
alter function public.end_business_provider_before_completion_cleanup(uuid,text,uuid,text) rename to end_business_provider;
revoke all on function public.end_business_provider(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.end_business_provider(uuid,text,uuid,text) to service_role;
drop function public.acknowledge_provider_change_notice(uuid,uuid,text);
alter function public.acknowledge_provider_change_notice_before_completion_cleanup(uuid,uuid,text) rename to acknowledge_provider_change_notice;
revoke all on function public.acknowledge_provider_change_notice(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.acknowledge_provider_change_notice(uuid,uuid,text) to service_role;
drop function public.complete_provider_change(uuid,uuid,text);
alter function public.complete_provider_change_before_completion_cleanup(uuid,uuid,text) rename to complete_provider_change;
revoke all on function public.complete_provider_change(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_provider_change(uuid,uuid,text) to service_role;
drop function public.cancel_provider_change(uuid,uuid,text);
alter function public.cancel_provider_change_before_completion_cleanup(uuid,uuid,text) rename to cancel_provider_change;
revoke all on function public.cancel_provider_change(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_provider_change(uuid,uuid,text) to service_role;
drop function public.grant_agency_application_draft_edit(uuid,text,uuid,uuid);
alter function public.grant_agency_application_draft_edit_before_completion_cleanup(uuid,text,uuid,uuid) rename to grant_agency_application_draft_edit;
revoke all on function public.grant_agency_application_draft_edit(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.grant_agency_application_draft_edit(uuid,text,uuid,uuid) to service_role;
drop function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz);
alter function public.grant_system_package_install_before_completion_cleanup(uuid,uuid,text,uuid,uuid,uuid,timestamptz) rename to grant_system_package_install;
revoke all on function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.grant_system_package_install(uuid,uuid,text,uuid,uuid,uuid,timestamptz) to service_role;
drop function public.complete_workspace_exit(uuid,uuid,text,text,text,jsonb,text,text,text);
alter function public.complete_workspace_exit_before_completion_cleanup(uuid,uuid,text,text,text,jsonb,text,text,text) rename to complete_workspace_exit;
revoke all on function public.complete_workspace_exit(uuid,uuid,text,text,text,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_workspace_exit(uuid,uuid,text,text,text,jsonb,text,text,text) to service_role;
alter table public.business_attribution_endings drop constraint business_attribution_one_ending_origin;
alter table public.business_attribution_endings alter column provider_change_request_id set not null;
alter table public.business_attribution_endings drop column workspace_exit_request_id;
drop table public.provider_exit_completion_permissions,public.provider_completion_cleanup_receipts,public.provider_completion_rollback_state;
notify pgrst,'reload schema';
commit;
