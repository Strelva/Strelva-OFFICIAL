-- Public provenance makes evidence explicit; scraped facts never count as owner confirmation.
create function public.read_agent_business_profile(p_scope text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 with ctx as (select (public.read_tenant_booking_context(p_scope)->>'workspaceId')::uuid as id),
 d as (select site_url,verified_at from public.connected_sites where business_workspace_id=(select id from ctx) and status='active' and verified_at is not null order by verified_at desc limit 1),
 f as (select * from public.business_record_facts where workspace_id=(select id from ctx) and source='owner' and verified),
 agencies as (select a.name from public.provider_seats s join public.workspaces a on a.id=s.agency_workspace_id where s.customer_workspace_id=(select id from ctx) and s.status='active')
 select jsonb_build_object('workspaceId',ctx.id,'revision',coalesce((select revision from public.business_records where workspace_id=ctx.id),0),
 'policyFacts',public.business_confirmed_public_facts(ctx.id)->'policyFacts','facts',public.business_confirmed_public_facts(ctx.id)->'facts','services',public.business_confirmed_public_facts(ctx.id)->'services',
 'verification',jsonb_build_object('domain',jsonb_build_object('verified',exists(select 1 from d),'url',(select site_url from d),'confirmedAt',(select verified_at from d)),
 'googleBusinessProfile',jsonb_build_object('linked',exists(select 1 from public.workspace_account_bindings b join public.workspace_google_locations g on g.binding_id=b.id where b.workspace_id=ctx.id and b.status='connected'),'verified',null,'url',null),
 'ownerConfirmedFactCount',(select count(*) from f),'lastConfirmedAt',(select max(updated_at) from f),
 'operatingAgencies',coalesce((select jsonb_agg(jsonb_build_object('name',name) order by name) from agencies),'[]'::jsonb))) from ctx where id is not null
$$;
revoke all on function public.read_agent_business_profile(text) from public,anon,authenticated,service_role;
grant execute on function public.read_agent_business_profile(text) to service_role;
