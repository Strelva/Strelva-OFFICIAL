-- Local-only agency work read authority. An accepted assignment grants access
-- to the exact requested resource for its finite lifetime. It does not grant
-- customer-workspace membership or access to any sibling work.

create or replace function public.agency_can_read_assigned_work(
  p_user_id uuid,
  p_verified_email text,
  p_workspace_id uuid,
  p_work_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment public.operational_assignments%rowtype;
  delivery public.offering_provider_deliveries%rowtype;
  installation public.offering_installations%rowtype;
  saved_payload jsonb;
begin
  if p_user_id is null or p_verified_email is null or p_workspace_id is null or p_work_id is null then
    return false;
  end if;

  perform 1
    from public.users
    where id = p_user_id
      and lower(email) = lower(btrim(p_verified_email))
      and verified_at is not null;
  if not found then return false; end if;

  select item.* into assignment
    from public.operational_assignments item
    join public.saved_product_work work
      on work.id = item.work_id and work.workspace_id = p_workspace_id
    join public.workspaces customer on customer.id = work.workspace_id and customer.kind = 'customer'
    join public.workspaces agency on agency.id = item.assignee_workspace_id and agency.kind = 'agency'
    join public.workspace_memberships agency_member
      on agency_member.workspace_id = item.assignee_workspace_id
      and agency_member.user_id = p_user_id
    join public.workspace_memberships sponsor_membership
      on sponsor_membership.workspace_id = p_workspace_id
      and sponsor_membership.user_id = item.sponsor_id
      and sponsor_membership.role = 'owner'
    where item.workspace_id = p_workspace_id
      and item.assignee_user_id = p_user_id
      and item.assignee_kind = 'agency'
      and item.status = 'accepted'
      and item.expires_at > clock_timestamp()
      and (
        item.work_id = p_work_id
        or exists (
          select 1
          from jsonb_array_elements(case when jsonb_typeof(work.payload->'steps') = 'array' then work.payload->'steps' else '[]'::jsonb end) step
          where step->>'workId' = p_work_id::text
        )
      )
      and work.payload->>'ownerId' = item.sponsor_id::text
      and work.payload->>'approvedBy' = item.sponsor_id::text
      and jsonb_typeof(work.payload->'approvedAt') = 'string'
    order by item.accepted_at desc nulls last, item.id
    limit 1;
  if not found then return false; end if;
  select work.payload into saved_payload
    from public.saved_product_work work
    where work.id = assignment.work_id and work.workspace_id = p_workspace_id;
  if saved_payload is null then return false; end if;

  select item.* into delivery
    from public.offering_provider_deliveries item
    where item.assignment_id = assignment.id
      and item.business_workspace_id = p_workspace_id
      and item.status = 'accepted'
    order by item.accepted_at desc nulls last, item.id
    limit 1;
  if not found then return false; end if;

  select item.* into installation
    from public.offering_installations item
    where item.id = delivery.installation_id
      and item.business_workspace_id = p_workspace_id
      and item.status = 'active'
      and item.responsibility->>'kind' = 'provider_requested'
      and item.responsibility->>'providerKind' = 'agency'
      and item.responsibility->>'agencyWorkspaceId' = assignment.assignee_workspace_id::text
      and exists (
        select 1
        from jsonb_array_elements(case when jsonb_typeof(item.native_resources) = 'array' then item.native_resources else '[]'::jsonb end) resource
        where resource->>'id' = p_work_id::text
          or (
            p_work_id = assignment.work_id
            and exists (
              select 1
              from jsonb_array_elements(case when jsonb_typeof(saved_payload->'steps') = 'array' then saved_payload->'steps' else '[]'::jsonb end) step
              where step->>'workId' = resource->>'id'
            )
          )
      );
  return found;
end;
$$;

revoke all on function public.agency_can_read_assigned_work(uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.agency_can_read_assigned_work(uuid,text,uuid,uuid) to service_role;
