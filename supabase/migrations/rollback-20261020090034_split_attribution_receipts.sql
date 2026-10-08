begin;
set local lock_timeout='3s';
lock table public.invoice_split_attributions in access exclusive mode;
do $$ begin
 if exists(select 1 from public.invoice_split_attributions) then raise exception 'split_attribution_receipts_require_preservation';end if;
 if (select count(*) from public.split_attribution_rollback_state)<>6 or exists(
  select 1 from public.split_attribution_rollback_state s left join pg_proc p on p.oid=to_regprocedure(s.signature)
  where md5(pg_get_functiondef(p.oid)) is distinct from s.definition_hash or
  md5(coalesce((select jsonb_agg(to_jsonb(a) order by a.grantor,a.grantee,a.privilege_type)::text
   from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]')) is distinct from s.acl_hash
 ) then raise exception 'split_attribution_rollback_wrong_order';end if;
end $$;
drop function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer);
alter function public.export_workspace_v3_category_before_split_attribution(uuid,uuid,text,text,integer,integer) rename to export_workspace_v3_category;
grant execute on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) to service_role;
drop function public.accrue_invoice_splits(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid);
alter function public.accrue_invoice_splits_before_attribution(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid) rename to accrue_invoice_splits;
grant execute on function public.accrue_invoice_splits(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid) to service_role;
drop function public.accrue_invoice_splits_before_loss(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid);
alter function public.accrue_invoice_splits_provider_v1(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid) rename to accrue_invoice_splits_before_loss;
drop table public.invoice_split_attributions,public.split_attribution_rollback_state;
notify pgrst,'reload schema';
commit;
