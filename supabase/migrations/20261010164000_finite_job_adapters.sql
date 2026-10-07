-- One finite-job snapshot over native facets. Source commands retain their
-- checks, locks, idempotency and receipt history. No copies, triggers, new
-- permissions, client writes or sends. Both adapters are off by default.
set local lock_timeout = '3s';

-- Preserve the live function's previous keys, including sibling stream keys.
do $migration$
declare previous text[]; definition text;
begin
  previous := public.workspace_release_flag_names();
  select array_agg(distinct key order by key) into previous
    from unnest(previous || array['finite_jobs','approval_store']) key;
  definition := format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path = public, pg_temp as %L',
    format('select %L::text[]', previous::text));
  execute definition;
end;
$migration$;

create function public.read_finite_job_sources(p_user_id uuid, p_verified_email text, p_business_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Reuse both native list boundaries. In particular, a provider's grant on
  -- one delivery never becomes permission to enumerate the client's jobs.
  perform public.service_request_assert_customer(p_business_id, p_user_id, p_verified_email, false);
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, false);
  return jsonb_build_object(
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.updated_at desc, r.id)
      from public.service_requests r where r.business_workspace_id=p_business_id), '[]'::jsonb),
    'deliveries', coalesce((select jsonb_agg(to_jsonb(d) order by d.requested_at desc, d.id)
      from public.offering_provider_deliveries d where d.business_workspace_id=p_business_id), '[]'::jsonb),
    'work', coalesce((select jsonb_agg(to_jsonb(w) order by w.updated_at desc, w.id)
      from public.saved_product_work w where w.workspace_id=p_business_id
        and w.product_id='operations' and w.resource_kind='responsibility'), '[]'::jsonb),
    'budgets', coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object('business_workspace_id', p_business_id) order by b.updated_at desc, b.id)
      from public.job_economics b where b.workspace_id=p_business_id
        or (b.workspace_id is null and exists (
          select 1 from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id
          where l.workspace_id=p_business_id and t.id=b.tenant_id))), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.read_finite_job_sources(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_finite_job_sources(uuid,text,uuid) to service_role;
