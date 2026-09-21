-- Keep workspace-scoped record coordination out of customer handoff copies.
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
declare
  h public.workspace_handoffs%rowtype;
  source_work public.saved_product_work%rowtype;
  customer_id uuid;
  copied_id uuid;
  delegated_id uuid;
  normalized_email text := lower(btrim(p_verified_email));
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
    return query select h.id, h.customer_workspace_id, h.customer_work_id,
      h.delegation_id, true;
    return;
  end if;

  if h.status = 'revoked' then raise exception 'handoff_revoked'; end if;
  if h.status <> 'pending' or h.expires_at <= now() then raise exception 'handoff_expired'; end if;

  select * into source_work from public.saved_product_work where id = h.source_work_id;
  if not found or source_work.workspace_id <> h.agency_workspace_id then
    raise exception 'handoff_source_invalid';
  end if;

  select w.id into customer_id from public.workspaces w
    where w.created_by = p_user_id and w.kind = 'customer'
    order by w.created_at asc limit 1;
  if customer_id is null then
    if (select count(*) from public.workspaces where created_by = p_user_id) >= 5 then
      raise exception 'workspace_limit_reached';
    end if;
    insert into public.workspaces (kind, name, created_by)
      values ('customer', split_part(normalized_email, '@', 1), p_user_id)
      returning id into customer_id;
    insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
      values (customer_id, p_user_id, 'owner', p_user_id);
  end if;
  -- A copied tracker belongs to a different workspace. Source assignments,
  -- related-work links, and their undo receipts cannot cross that boundary.
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
    delegation_id = delegated_id
  where id = h.id;

  return query select h.id, customer_id, copied_id, delegated_id, false;
end;
$$;

revoke all on function public.accept_workspace_handoff(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.accept_workspace_handoff(text, uuid, text, boolean) to service_role;
