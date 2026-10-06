-- Human minutes per business resolve managed sites through the conversion
-- link (tenant_workspace_links) first. PR #205 read only
-- offering_website_bindings, so a client converted by the Reborn conversion
-- read "not attached". Bindings still count, so nothing that resolved before
-- stops resolving. Same signature, same authority check, same row shape.
create or replace function public.read_effort_businesses(p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.business_effort_assert_operator(p_user_id, p_verified_email);
  return coalesce((
    select jsonb_agg(item order by lower(item->>'name'), item->>'id')
    from (
      select jsonb_build_object(
        'id', w.id, 'name', w.name,
        'tenantIds', coalesce((
          select jsonb_agg(sites.id order by sites.id)
          from (
            select t.id
            from public.tenant_workspace_links l
            join public.tenants t on t.stable_id = l.tenant_stable_id
            where l.workspace_id = w.id
            union
            select t.id
            from public.offering_website_bindings b
            join public.tenants t on t.stable_id = b.tenant_stable_id
            where b.business_workspace_id = w.id and b.status = 'active'
          ) sites), '[]'::jsonb),
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
$$;
revoke all on function public.read_effort_businesses(uuid,text) from public, anon, authenticated;
grant execute on function public.read_effort_businesses(uuid,text) to service_role;
