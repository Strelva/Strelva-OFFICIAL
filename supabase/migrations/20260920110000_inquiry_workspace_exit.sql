-- Resolve an inquiry offering's tenant identity to the customer workspace that
-- owns the installation. Tenant stable ids are website routing identities;
-- workspace_exit_requests is authoritative for the customer workspace.

create or replace function public.read_inquiry_workspace_exit(
  p_tenant_stable_id uuid
) returns table(
  workspace_id uuid,
  installation_id uuid,
  installation_status text,
  exit_completed boolean
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select installation.business_workspace_id,
    installation.id,
    installation.status,
    public.workspace_exit_completed(installation.business_workspace_id)
  from public.offering_installations installation
  cross join lateral jsonb_array_elements(installation.native_resources) resource
  join public.inquiry_workspaces inquiry
    on inquiry.id = case
      when resource->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (resource->>'id')::uuid
      else null::uuid
    end
  where installation.definition_id = 'customer_inquiry_intake'
    and resource->>'kind' = 'inquiry_workspace'
    and inquiry.tenant_stable_id = p_tenant_stable_id
  order by case installation.status when 'active' then 0 when 'draft' then 1 else 2 end,
    installation.updated_at desc,
    installation.id;
$$;

revoke all on function public.read_inquiry_workspace_exit(uuid) from public, anon, authenticated;
grant execute on function public.read_inquiry_workspace_exit(uuid) to service_role;
