-- Operator queue: Google listing writes whose read-back failed.
--
-- Review replies approved on a tenant linked to a business now post through
-- the Google listing System and record their one receipt in
-- google_listing_receipts (not outside_write_receipts). /admin/queue reads
-- those receipts here for its `readback_failed` items, so an accepted write
-- that Google didn't show back still reaches an operator. Read only: nothing
-- here changes a receipt or re-sends a write.
--
-- Additive. Depends on 20261007170000_workspace_account_bindings.sql
-- (google_listing_receipts) and 20261007160000_operator_queue.sql
-- (operator_queue_assert_operator). Service role only; the operator is
-- rechecked against an active super_admins row on every call.

create function public.read_google_listing_readback_failures(p_user_id uuid, p_verified_email text, p_limit integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 200);
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
      limit v_limit) failures), '[]'::jsonb);
end;
$$;

revoke all on function public.read_google_listing_readback_failures(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.read_google_listing_readback_failures(uuid, text, integer) to service_role;
