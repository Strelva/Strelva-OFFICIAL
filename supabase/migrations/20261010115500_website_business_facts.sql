begin;
set local lock_timeout = '3s';
-- A server-only public projection, keyed by the actual hosted publication.
-- No tenant fallback, contacts, people or owner-recipient records are exposed.
create function public.read_hosted_website_business_facts(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare ws uuid;
begin
  select p.workspace_id into ws from public.website_document_publications p
    join public.tenants t on t.id=p.tenant_id
    join public.business_records b on b.workspace_id=p.workspace_id
    where p.tenant_id=p_tenant_id and t.active and t.delivery_model='platform_template'
      and not public.workspace_exit_completed(p.workspace_id)
      and not exists(select 1 from public.tenant_workspace_links l where l.tenant_stable_id=t.stable_id and l.workspace_id<>p.workspace_id);
  if ws is null then return null; end if;
  return jsonb_build_object('revision',coalesce((select revision from public.business_records where workspace_id=ws),0),
    'facts',coalesce((select jsonb_object_agg(fact_key,value) from public.business_record_facts where workspace_id=ws
      and fact_key in ('display_name','phone','email','address','hours') and (verified or source in ('owner','operator'))),'{}'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('name',name,'description',description,'priceText',price_text) order by position,id)
      from (select * from public.business_services where workspace_id=ws and active and (verified or source in ('owner','operator')) order by position,id limit 40) s),'[]'::jsonb));
end $$;
revoke all on function public.read_hosted_website_business_facts(text) from public,anon,authenticated;
grant execute on function public.read_hosted_website_business_facts(text) to service_role;
commit;
