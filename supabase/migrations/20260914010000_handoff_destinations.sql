-- Require every handoff acceptance to name the customer business that owns
-- the copied work. Existing customer workspaces use the existing workspace
-- and membership tables; a new business is created in those same tables.

alter table public.workspace_handoffs
  add column if not exists accepted_destination_kind text,
  add column if not exists accepted_destination_name text;

-- Existing accepted rows predate explicit destination input. Their resolved
-- workspace is an existing destination, so backfill that durable projection.
update public.workspace_handoffs
set accepted_destination_kind = 'existing'
where status = 'accepted'
  and accepted_destination_kind is null
  and customer_workspace_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspace_handoffs_destination_shape_check'
      and conrelid = 'public.workspace_handoffs'::regclass
  ) then
    alter table public.workspace_handoffs
      add constraint workspace_handoffs_destination_shape_check check (
        (status <> 'accepted' and accepted_destination_kind is null and accepted_destination_name is null)
        or (
          status = 'accepted'
          and (
            (accepted_destination_kind = 'existing' and accepted_destination_name is null)
            or (
              accepted_destination_kind = 'new'
              and accepted_destination_name is not null
              and char_length(accepted_destination_name) between 1 and 120
            )
          )
        )
      );
  end if;
end;
$$;

create or replace function public.accept_workspace_handoff(
  p_token_hash text,
  p_user_id uuid,
  p_verified_email text,
  p_customer_workspace_id uuid,
  p_customer_workspace_name text,
  p_allow_agency_access boolean
) returns table (
  handoff_id uuid,
  customer_workspace_id uuid,
  customer_work_id uuid,
  delegation_id uuid,
  already_accepted boolean
) language plpgsql security definer set search_path = public, pg_temp as $$
declare
  h public.workspace_handoffs%rowtype;
  source_work public.saved_product_work%rowtype;
  customer_id uuid;
  copied_id uuid;
  delegated_id uuid;
  normalized_email text := lower(btrim(p_verified_email));
  customer_name text := btrim(coalesce(p_customer_workspace_name, ''));
begin
  select * into h from public.workspace_handoffs
    where token_hash = p_token_hash for update;
  if not found then raise exception 'handoff_not_found'; end if;

  -- Identity invariants precede the idempotent accepted return. Possessing an
  -- accepted token never lets an unverified or different identity replay it.
  if h.recipient_email <> normalized_email then raise exception 'handoff_recipient_mismatch'; end if;
  perform 1 from public.users u where u.id = p_user_id
    and lower(u.email) = normalized_email and u.verified_at is not null for update;
  if not found then raise exception 'verified_identity_required'; end if;

  if h.status = 'accepted' then
    if h.accepted_by <> p_user_id then raise exception 'handoff_already_claimed'; end if;
    -- Replays are actor-bound and destination-bound. A retry may return the
    -- original copy, but it cannot select or create another business. A lost
    -- response can safely retry the same named-new-business request.
    if h.accepted_destination_kind = 'new' then
      if p_customer_workspace_id is not null
        or p_customer_workspace_name is null
        or btrim(p_customer_workspace_name) <> h.accepted_destination_name then
        raise exception 'handoff_destination_changed';
      end if;
    elsif h.accepted_destination_kind = 'existing' then
      if p_customer_workspace_id is null
        or p_customer_workspace_id <> h.customer_workspace_id
        or p_customer_workspace_name is not null then
        raise exception 'handoff_destination_changed';
      end if;
    elsif p_customer_workspace_id is null
      or p_customer_workspace_id <> h.customer_workspace_id
      or p_customer_workspace_name is not null then
      -- Defensive path for a pre-migration row that could not be backfilled.
      raise exception 'handoff_destination_changed';
    end if;
    perform 1 from public.workspaces w
      join public.workspace_memberships m on m.workspace_id = w.id
      where w.id = h.customer_workspace_id
        and w.kind = 'customer' and m.user_id = p_user_id
      for update;
    if not found then raise exception 'handoff_destination_membership_required'; end if;
    return query select h.id, h.customer_workspace_id, h.customer_work_id,
      h.delegation_id, true;
    return;
  end if;

  if h.status = 'revoked' then raise exception 'handoff_revoked'; end if;
  if h.status <> 'pending' or h.expires_at <= now() then raise exception 'handoff_expired'; end if;

  if p_customer_workspace_id is null and p_customer_workspace_name is null then
    raise exception 'handoff_destination_required';
  end if;
  if p_customer_workspace_id is not null and p_customer_workspace_name is not null then
    raise exception 'handoff_destination_invalid';
  end if;

  select * into source_work from public.saved_product_work where id = h.source_work_id;
  if not found or source_work.workspace_id <> h.agency_workspace_id then
    raise exception 'handoff_source_invalid';
  end if;
  -- Native applications have separate definition, release, record and grant
  -- lifecycles. The generic handoff copier cannot install those safely, so an
  -- old pending token must fail before it creates a destination or copy.
  if source_work.product_id = 'applications' or source_work.resource_kind = 'application' then
    raise exception 'handoff_product_unsupported';
  end if;

  if p_customer_workspace_id is not null then
    -- A destination ID is valid only when this actor is still a member of an
    -- existing customer workspace. This check runs inside the acceptance
    -- transaction so a stale preview cannot redirect the copy elsewhere.
    select w.id into customer_id from public.workspaces w
      join public.workspace_memberships m on m.workspace_id = w.id
      where w.id = p_customer_workspace_id
        and w.kind = 'customer' and m.user_id = p_user_id
      for update;
    if customer_id is null then raise exception 'handoff_destination_membership_required'; end if;
    -- Keep the requested destination kind with the accepted handoff so the
    -- same request can be replayed if its response is lost.
  else
    if char_length(customer_name) not between 1 and 120 then
      raise exception 'handoff_destination_invalid';
    end if;
    if (select count(*) from public.workspaces where created_by = p_user_id) >= 5 then
      raise exception 'workspace_limit_reached';
    end if;
    insert into public.workspaces (kind, name, created_by)
      values ('customer', customer_name, p_user_id)
      returning id into customer_id;
    insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
      values (customer_id, p_user_id, 'owner', p_user_id);
  end if;

  -- A copied tracker belongs to a different workspace. Source assignments,
  -- related work links, and their undo receipts cannot cross that boundary.
  -- Change only this local copy; keep the source and ordinary cell history.
  if source_work.product_id = 'tracker' and source_work.resource_kind = 'tracker' then
    if jsonb_typeof(source_work.payload->'tracker'->'rows') is distinct from 'array'
      or jsonb_typeof(source_work.payload->'tracker'->'history') is distinct from 'array' then
      raise exception 'handoff_source_invalid';
    end if;
    source_work.payload := jsonb_set(source_work.payload, '{tracker,rows}', (
      select coalesce(jsonb_agg(record.value - 'coordination' order by record.ordinality), '[]'::jsonb)
      from jsonb_array_elements(source_work.payload->'tracker'->'rows') with ordinality as record(value, ordinality)
    ));
    source_work.payload := jsonb_set(source_work.payload, '{tracker,history}', (
      select coalesce(jsonb_agg(receipt.value order by receipt.ordinality), '[]'::jsonb)
      from jsonb_array_elements(source_work.payload->'tracker'->'history') with ordinality as receipt(value, ordinality)
      where not (receipt.value ? 'coordinationChanges')
    ));
  end if;
  insert into public.saved_product_work (
    workspace_id, product_id, resource_kind, title, payload, input,
    source_work_id, created_by
  ) values (
    customer_id, source_work.product_id, source_work.resource_kind,
    source_work.title, source_work.payload, source_work.input,
    source_work.id, p_user_id
  ) returning id into copied_id;

  if p_allow_agency_access then
    insert into public.workspace_delegations (
      customer_workspace_id, customer_work_id, agency_workspace_id, scope, granted_by, accepted_by
    ) values (
      customer_id, copied_id, h.agency_workspace_id, array['work:read']::text[], p_user_id, p_user_id
    ) returning id into delegated_id;
  end if;

  update public.workspace_handoffs set
    status = 'accepted', accepted_by = p_user_id, accepted_at = now(),
    customer_workspace_id = customer_id, customer_work_id = copied_id,
    delegation_id = delegated_id,
    accepted_destination_kind = case when p_customer_workspace_id is null then 'new' else 'existing' end,
    accepted_destination_name = case when p_customer_workspace_id is null then customer_name else null end
  where id = h.id;

  return query select h.id, customer_id, copied_id, delegated_id, false;
end;
$$;

-- Keep the old service-only signature available for migration diagnostics,
-- but make stale callers fail closed instead of inferring a destination.
create or replace function public.accept_workspace_handoff(
  p_token_hash text,
  p_user_id uuid,
  p_verified_email text,
  p_allow_agency_access boolean
) returns table (
  handoff_id uuid,
  customer_workspace_id uuid,
  customer_work_id uuid,
  delegation_id uuid,
  already_accepted boolean
) language plpgsql security definer set search_path = public, pg_temp as $$
begin
  raise exception 'handoff_destination_required';
end;
$$;

revoke all on function public.accept_workspace_handoff(text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.accept_workspace_handoff(text, uuid, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.accept_workspace_handoff(text, uuid, text, boolean) to service_role;
grant execute on function public.accept_workspace_handoff(text, uuid, text, uuid, text, boolean) to service_role;
