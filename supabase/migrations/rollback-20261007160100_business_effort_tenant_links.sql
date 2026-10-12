-- Rollback for 20261007160100_business_effort_tenant_links.sql
-- Forward SHA-256: ce4114ca74e25d638d7a2eb59a47339b150e8755dab68ed4ba826f79a7d087a0
-- Batch 3: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_effort_businesses(uuid,text)')))) is distinct from 'f5b61895979c5a82c13fdf4417c606d7' then raise exception 'rollback_wrong_order_or_function_drift: read_effort_businesses'; end if;
end;
$rollback_guard$;
CREATE OR REPLACE FUNCTION public.read_effort_businesses(p_user_id uuid, p_verified_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.business_effort_assert_operator(p_user_id, p_verified_email);
  return coalesce((
    select jsonb_agg(item order by lower(item->>'name'), item->>'id')
    from (
      select jsonb_build_object(
        'id', w.id, 'name', w.name,
        'tenantIds', coalesce((
          select jsonb_agg(t.id order by t.id)
          from public.offering_website_bindings b
          join public.tenants t on t.stable_id = b.tenant_stable_id
          where b.business_workspace_id = w.id and b.status = 'active'), '[]'::jsonb),
        'firstEffortOn', (
          select min(e.occurred_on) from public.business_effort_entries e
          where e.business_workspace_id = w.id
            and not exists (select 1 from public.business_effort_voids v where v.entry_id = e.id))
      ) as item
      from public.workspaces w
      where w.kind = 'customer'
      order by lower(w.name), w.id
      limit 500
    ) businesses
  ), '[]'::jsonb);
end;
$function$
;
revoke all on function public.read_effort_businesses(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.read_effort_businesses(uuid,text) to "service_role";
commit;
