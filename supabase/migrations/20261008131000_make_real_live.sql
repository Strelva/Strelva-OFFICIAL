-- Make real with real effects: per-channel release flags, the due-work
-- resume for activations, and the server-side reads Needs you needs to ask an
-- owner who never signs in. Additive. It replaces exactly one function,
-- workspace_release_flag_names(), to add one `make_real_live:<channel>` key
-- per live effect channel; every existing flag keeps its name and rows.
--
-- due_make_real_activations: the existing workspace-work cron
-- (/api/cron/workspace-work) resumes every in-progress activation whose
-- starter is still a verified owner or admin of the business. A step another
-- worker started less than p_grace_seconds ago is left alone (the runner's
-- RUNNING_STEP_GRACE_MS). Activations that need attention are not resumed:
-- the operator decides (spec section 4, partial-failure contract).
--
-- read_ready_system_possibilities: Ready possibilities that are not being
-- made real, read without an actor, for the Needs you adapter that opens the
-- owner's item (the chase runs with no signed-in member).

create or replace function public.workspace_release_flag_names() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
    'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
    'make_real_live:booking_page', 'make_real_live:internal_app']::text[]
$$;

create function public.due_make_real_activations(p_limit integer, p_grace_seconds integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_limit is null or p_limit not between 1 and 100 or p_grace_seconds is null or p_grace_seconds < 0 then
    raise exception 'make_real_activation_invalid';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('workspaceId', d.workspace_id, 'activationId', d.activation_id,
      'userId', d.user_id, 'email', d.email) order by d.updated_at) from (
    select w.workspace_id, w.payload->>'id' as activation_id, u.id as user_id, lower(u.email) as email, w.updated_at
      from public.saved_product_work w
      join public.workspaces b on b.id = w.workspace_id and b.kind = 'customer'
      join public.users u on u.id = w.created_by and u.verified_at is not null
      join public.workspace_memberships m on m.workspace_id = w.workspace_id and m.user_id = u.id and m.role in ('owner','admin')
      where w.product_id = 'operations' and w.resource_kind = 'activation'
        and w.payload->>'status' = 'in_progress' and w.payload->>'rollbackStartedAt' is null
        and not exists (select 1 from jsonb_array_elements(w.payload->'steps') s
          where s->>'status' = 'running'
            and coalesce((s->>'startedAt')::timestamptz, w.updated_at) > clock_timestamp() - make_interval(secs => p_grace_seconds))
      order by w.updated_at asc limit p_limit) d), '[]'::jsonb);
end;
$$;

create function public.read_ready_system_possibilities(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(public.system_possibility_json(p, 0) order by p.created_at, p.id), '[]'::jsonb)
    from public.system_possibilities p
    where p.business_workspace_id = p_workspace_id and p.status = 'ready' and p.activation_id is null
$$;

revoke all on function public.due_make_real_activations(integer, integer) from public, anon, authenticated;
revoke all on function public.read_ready_system_possibilities(uuid) from public, anon, authenticated;
grant execute on function public.due_make_real_activations(integer, integer) to service_role;
grant execute on function public.read_ready_system_possibilities(uuid) to service_role;
