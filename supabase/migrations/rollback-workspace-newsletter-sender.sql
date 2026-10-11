-- Stop/disable the sender first. Export receipts before rollback if needed.
begin;
create or replace function public.read_workspace_newsletter_issues(p_workspace_id uuid,p_tenant_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.publishing_require_tenant(p_workspace_id,p_tenant_id);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.approved_at desc) from
    (select * from public.workspace_newsletter_issues where workspace_id=p_workspace_id and tenant_id=p_tenant_id order by approved_at desc limit 100) r),'[]'::jsonb);
end; $$;

drop function if exists public.workspace_newsletter_sender(text,uuid,jsonb);
drop table if exists public.workspace_newsletter_batch_receipts;
drop table if exists public.workspace_newsletter_batches;
drop table if exists public.workspace_newsletter_deliveries;
commit;
