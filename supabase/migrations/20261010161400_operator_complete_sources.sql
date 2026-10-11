-- Flag-on queue has complete workspace/receipt sources; old RPCs stay unchanged.
set lock_timeout = '3s';
create function public.read_operator_queue_context_v2(p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.operator_queue_assert_operator(p_user_id, p_verified_email);
  return jsonb_build_object(
    'links', coalesce((select jsonb_agg(jsonb_build_object(
        'tenantId', t.id, 'tenantStableId', l.tenant_stable_id, 'workspaceId', l.workspace_id, 'workspaceName', w.name,
        'systemId', (select s.id from public.systems s where s.business_workspace_id = l.workspace_id
          and s.origin_kind = 'tenant' and s.origin_ref = l.tenant_stable_id::text))
        order by t.id)
      from public.tenant_workspace_links l
      join public.tenants t on t.stable_id = l.tenant_stable_id
      join public.workspaces w on w.id = l.workspace_id), '[]'::jsonb),
    'businesses', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by lower(w.name), w.id)
      from (select * from public.workspaces where kind = 'customer' order by lower(name), id) w), '[]'::jsonb),
    'delegations', coalesce((select jsonb_agg(distinct jsonb_build_object('agencyWorkspaceId', d.agency_workspace_id, 'customerWorkspaceId', d.customer_workspace_id))
      from public.workspace_delegations d where d.status = 'active'), '[]'::jsonb),
    'documentHealth', coalesce((select jsonb_agg(jsonb_build_object(
        'workspaceId', h.workspace_id, 'workId', h.website_work_id, 'revision', h.revision,
        'status', h.status, 'checkedAt', h.checked_at,
        'tenantId', (select p.tenant_id from public.website_document_publications p
          where p.workspace_id = h.workspace_id and p.website_work_id = h.website_work_id and p.revision = h.revision limit 1)))
      from (select distinct on (website_work_id) * from public.website_document_health
            order by website_work_id, checked_at desc) h), '[]'::jsonb),
    'operators', coalesce((select jsonb_agg(jsonb_build_object('userId', u.id, 'email', u.email) order by lower(u.email))
      from public.super_admins s join public.users u on u.id = s.user_id
      where s.revoked_at is null and u.verified_at is not null), '[]'::jsonb),
    'marks', coalesce((select jsonb_agg(public.operator_queue_mark_row(m.source, m.source_ref))
      from public.operator_queue_marks m), '[]'::jsonb),
    'readbackFailures', coalesce((select jsonb_agg(public.outside_write_receipt_row(r.id) order by r.created_at desc)
      from (select id, created_at from public.outside_write_receipts
            where acceptance = 'accepted' and readback in ('failed','differs','pending','not_possible')
            order by created_at desc) r), '[]'::jsonb)
  );
end;
$$;

create function public.read_google_listing_readback_failures_v2(p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.operator_queue_assert_operator(p_user_id, p_verified_email);
  return coalesce((select jsonb_agg(row_json order by created_at desc, id) from (
      select r.id, r.created_at, jsonb_build_object(
        'id', r.id, 'workspaceId', r.workspace_id, 'workspaceName', w.name,
        -- The tenant whose grant made the write, else the business's only linked tenant.
        'tenantId', coalesce(
          (select t.id from public.workspace_account_bindings b join public.tenants t on t.stable_id = b.origin_tenant_stable_id
            where b.id = r.binding_id),
          (select min(t.id) from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
            where l.workspace_id = r.workspace_id
            having count(*) = 1)),
        'action', r.action, 'targetRef', r.target_ref, 'status', r.status, 'readback', r.readback,
        'error', r.error, 'createdAt', r.created_at, 'completedAt', r.completed_at) as row_json
      from public.google_listing_receipts r
      join public.workspaces w on w.id = r.workspace_id
      where r.status = 'posted_unverified' and r.readback in ('failed', 'differs')
      order by r.created_at desc, r.id
) failures), '[]'::jsonb);
end;
$$;


revoke all on function public.read_operator_queue_context_v2(uuid,text) from public,anon,authenticated;
revoke all on function public.read_google_listing_readback_failures_v2(uuid,text) from public,anon,authenticated;
grant execute on function public.read_operator_queue_context_v2(uuid,text) to service_role;
grant execute on function public.read_google_listing_readback_failures_v2(uuid,text) to service_role;
