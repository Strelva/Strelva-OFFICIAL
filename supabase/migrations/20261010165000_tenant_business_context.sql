-- One confirmed business record for managed websites and inquiry presentation.
-- Adds a reader only. No hot table rewrite, no public API access to private facts.
begin;
set local lock_timeout = '2s';
create function public.read_tenant_business_context(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_workspace uuid; v_revision bigint;
begin
  select l.workspace_id into v_workspace from public.tenant_workspace_links l
    join public.tenants t on t.stable_id = l.tenant_stable_id where t.id = p_tenant_id;
  if v_workspace is null then return null; end if;
  select revision into v_revision from public.business_records where workspace_id = v_workspace;
  return jsonb_build_object('revision', coalesce(v_revision, 0),
    'facts', coalesce((select jsonb_object_agg(f.fact_key, f.value) from public.business_record_facts f
      where f.workspace_id = v_workspace and f.fact_key in ('display_name','legal_name','description','phone','email','address','hours','links')
        and (f.verified or f.source in ('owner','operator'))), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'priceText', s.price_text) order by s.position, s.id)
      from public.business_services s where s.workspace_id = v_workspace and s.active and (s.verified or s.source in ('owner','operator'))), '[]'::jsonb));
end $$;
revoke all on function public.read_tenant_business_context(text) from public, anon, authenticated;
grant execute on function public.read_tenant_business_context(text) to service_role;
commit;
