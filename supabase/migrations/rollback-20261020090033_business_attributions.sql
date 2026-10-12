-- Empty-only rollback. Original bringer and ending receipts are never erased.
begin;
set local lock_timeout='3s';
-- Fence writers before observing emptiness; a pre-lock empty read can miss an
-- uncommitted receipt and subsequently erase it when DROP waits for its writer.
lock table public.business_attributions,public.business_attribution_endings,public.business_attribution_change_permissions in access exclusive mode;
do $$begin
 if exists(select 1 from public.business_attributions) or exists(select 1 from public.business_attribution_endings) or exists(select 1 from public.business_attribution_change_permissions) then raise exception 'business_attribution_receipts_require_preservation';end if;
 if (select md5(prosrc) from pg_proc where oid='public.complete_provider_change(uuid,uuid,text)'::regprocedure) is distinct from '48e09a9db77d635d8d9ff4b11feeeb3e' then raise exception 'business_attribution_rollback_wrong_order';end if;
end $$;
drop trigger business_attribution_provider_change on public.workspace_providers;
drop function public.complete_provider_change(uuid,uuid,text);
alter function public.complete_provider_change_before_attribution(uuid,uuid,text) rename to complete_provider_change;
revoke all on function public.complete_provider_change(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_provider_change(uuid,uuid,text) to service_role;
drop function public.record_business_attribution(uuid,uuid,text,uuid,text,jsonb,uuid,uuid),public.read_business_attributions(uuid,uuid,text),public.business_attribution_require_provider_change(),public.business_attribution_receipt(public.business_attributions);
drop table public.business_attribution_change_permissions,public.business_attribution_endings,public.business_attributions;
notify pgrst,'reload schema';
commit;
