-- Make real activations on the work-execution substrate. Additive only.
--
-- One Make real attempt is one `saved_product_work` row with
-- product_id = 'operations' and resource_kind = 'activation'. Its payload is
-- the Activation document from src/platform/make-real/contracts.ts.
--
-- Why not extend update_work_responsibility (README "Decision: one execution
-- engine", plan step 1)? That function is already wrapped twice (the standing
-- execution wrapper renamed the original to
-- update_work_responsibility_unchecked and added a claim lock and trigger), and
-- live responsibilities depend on every check in it. Changing it would change
-- the rules for every live responsibility payload. These RPCs reuse the same
-- rules on their own resource kind instead and leave responsibilities alone:
--
--   * compare-and-set on `revision` (expected + 1, or
--     make_real_activation_revision_conflict);
--   * history only grows, by exactly one event, whose actor is the caller;
--   * a step's identity (id, kind, target, label, dependsOn, scope,
--     effectKind, reversibility, idempotencyKey) never changes;
--   * a completed step never changes, except that a `rollback_step` event may
--     move it to `restored` (internal step) or `compensated` (accepted
--     effect), or record why it could not be undone;
--   * restored and compensated are final;
--   * an accepted effect keeps its receipt and read-back for good;
--   * an unknown outcome is never replayed: it leaves `unknown` only through
--     a `reconcile` event, to completed or failed;
--   * once rollback starts no step starts again, and rolled_back needs no
--     step running or unknown;
--   * made_real needs every step completed and every check passed;
--   * made_real and rolled_back are closed.
--
-- Access: a verified, direct owner or admin of the customer workspace writes;
-- any direct member reads. Agencies are refused here: an activation can touch
-- every System in the business, and agency scope is per saved work. The
-- runner's AuthorityPort still checks each step's scope on top of this floor.
--
-- Only these RPCs write activation rows. A guard trigger refuses any other
-- insert or update of an activation (including save_workspace_work), and the
-- existing workspace-exit guard still applies: no new activation and no
-- step start after a completed exit, while an in-flight outcome can still be
-- recorded.

create unique index saved_product_work_make_real_activation_idx
  on public.saved_product_work (workspace_id, (payload->>'id'))
  where product_id = 'operations' and resource_kind = 'activation';

create function public.guard_make_real_activation_write() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.product_id = 'operations' and new.resource_kind = 'activation')
    or (tg_op = 'UPDATE' and old.product_id = 'operations' and old.resource_kind = 'activation') then
    if coalesce(current_setting('strelva.make_real_activation_write', true), '') <> 'on' then
      raise exception 'make_real_activation_invalid';
    end if;
    if tg_op = 'UPDATE' and (new.product_id, new.resource_kind, new.workspace_id, new.created_by)
        is distinct from (old.product_id, old.resource_kind, old.workspace_id, old.created_by) then
      raise exception 'make_real_activation_invalid';
    end if;
  end if;
  return new;
end;
$$;
create trigger saved_product_work_make_real_activation_guard_trg
before insert or update on public.saved_product_work
for each row execute function public.guard_make_real_activation_write();

-- Verified user, customer workspace, direct membership. Writers are owners
-- and admins. The membership row is share-locked for the transaction.
create function public.make_real_activation_actor(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role text;
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then
    raise exception 'make_real_activation_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'make_real_activation_access_denied'; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id and w.kind = 'customer'
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
    for share of wm;
  if actor_role is null or (p_write and actor_role not in ('owner', 'admin')) then
    raise exception 'make_real_activation_access_denied';
  end if;
end;
$$;

create function public.make_real_activation_is_time(p_value jsonb) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
begin
  if jsonb_typeof(p_value) is distinct from 'string' then return false; end if;
  perform (p_value #>> '{}')::timestamptz;
  return true;
exception when others then
  return false;
end;
$$;

create function public.make_real_activation_is_count(p_value jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(p_value) = 'number' and (p_value #>> '{}') ~ '^[0-9]{1,9}$'
$$;

-- What a step is never changes; only its state does.
create function public.make_real_activation_step_frame(p_step jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p_step->'id', 'kind', p_step->'kind', 'target', p_step->'target', 'label', p_step->'label',
    'dependsOn', p_step->'dependsOn', 'scope', p_step->'scope', 'effectKind', p_step->'effectKind',
    'reversibility', p_step->'reversibility', 'idempotencyKey', p_step->'idempotencyKey')
$$;

-- The shape the invariants below rely on. The full document is validated by
-- activationSchema in TypeScript before it is sent and after it is read.
create function public.make_real_activation_shape_valid(p jsonb, p_workspace_id uuid) returns boolean
language plpgsql stable set search_path = public, pg_temp as $$
declare step jsonb;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' or octet_length(p::text) > 1048576
    or jsonb_typeof(p->'version') is distinct from 'number' or p->>'version' <> '1'
    or jsonb_typeof(p->'id') is distinct from 'string' or char_length(p->>'id') not between 1 and 120
    or p->>'businessId' is distinct from p_workspace_id::text
    or jsonb_typeof(p->'possibilityId') is distinct from 'string' or char_length(p->>'possibilityId') not between 1 and 120
    or not public.make_real_activation_is_count(p->'candidateRevision') or (p->>'candidateRevision')::integer < 1
    or jsonb_typeof(p->'actorId') is distinct from 'string' or char_length(p->>'actorId') < 1
    or coalesce(p->>'status', '') not in ('in_progress', 'needs_attention', 'made_real', 'rolled_back')
    or not public.make_real_activation_is_count(p->'revision')
    or not public.make_real_activation_is_time(p->'createdAt')
    or not public.make_real_activation_is_time(p->'updatedAt')
    or (p ? 'rollbackStartedAt' and not public.make_real_activation_is_time(p->'rollbackStartedAt'))
    or jsonb_typeof(p->'pinned') is distinct from 'array'
    or jsonb_typeof(p->'introduced') is distinct from 'array'
    or jsonb_typeof(p->'connections') is distinct from 'array'
    or jsonb_typeof(p->'approvals') is distinct from 'array'
    or jsonb_typeof(p->'checks') is distinct from 'array'
    or jsonb_typeof(p->'history') is distinct from 'array' or jsonb_array_length(p->'history') > 2000
    or jsonb_typeof(p->'steps') is distinct from 'array' or jsonb_array_length(p->'steps') not between 1 and 120 then
    return false;
  end if;
  for step in select value from jsonb_array_elements(p->'steps') loop
    if jsonb_typeof(step) is distinct from 'object'
      or jsonb_typeof(step->'id') is distinct from 'string' or char_length(step->>'id') not between 1 and 80
      or coalesce(step->>'kind', '') not in ('stage', 'introduce', 'effect', 'activate', 'connect', 'verify')
      or coalesce(step->>'status', '') not in ('pending', 'running', 'completed', 'blocked', 'failed', 'unknown', 'compensated', 'restored')
      or coalesce(step->>'effect', '') not in ('none', 'accepted', 'unknown')
      or not public.make_real_activation_is_count(step->'attempts')
      or jsonb_typeof(step->'idempotencyKey') is distinct from 'string' or char_length(step->>'idempotencyKey') not between 1 and 240
      or jsonb_typeof(step->'dependsOn') is distinct from 'array' then
      return false;
    end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p->'steps')) <> jsonb_array_length(p->'steps') then
    return false;
  end if;
  return true;
end;
$$;

create function public.make_real_activation_set_writer(p_on boolean) returns void
language sql set search_path = public, pg_temp as $$
  select set_config('strelva.make_real_activation_write', case when p_on then 'on' else 'off' end, true)
$$;

create function public.read_make_real_activation(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_activation_id text
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.make_real_activation_actor(p_workspace_id, p_user_id, p_verified_email, false);
  return (select w.payload from public.saved_product_work w
    where w.workspace_id = p_workspace_id and w.product_id = 'operations' and w.resource_kind = 'activation'
      and w.payload->>'id' = p_activation_id);
end;
$$;

create function public.create_make_real_activation(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_activation jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare saved jsonb;
begin
  perform public.make_real_activation_actor(p_workspace_id, p_user_id, p_verified_email, true);
  if not public.make_real_activation_shape_valid(p_activation, p_workspace_id)
    or p_activation->>'revision' <> '0'
    or jsonb_array_length(p_activation->'history') <> 0
    or p_activation->>'status' <> 'in_progress'
    or p_activation->>'actorId' is distinct from p_user_id::text
    or p_activation ? 'rollbackStartedAt'
    or exists(select 1 from jsonb_array_elements(p_activation->'steps') s
      where s->>'status' <> 'pending' or s->>'effect' <> 'none' or s->>'attempts' <> '0' or s ? 'receipt' or s ? 'readBack') then
    raise exception 'make_real_activation_invalid';
  end if;
  perform public.make_real_activation_set_writer(true);
  begin
    insert into public.saved_product_work(workspace_id, product_id, resource_kind, title, payload, input, created_by)
    values (p_workspace_id, 'operations', 'activation', 'Make real', p_activation,
      jsonb_build_object('activationId', p_activation->>'id', 'possibilityId', p_activation->>'possibilityId'), p_user_id)
    returning payload into saved;
  exception when unique_violation then
    raise exception 'make_real_activation_exists';
  end;
  perform public.make_real_activation_set_writer(false);
  return saved;
end;
$$;

create function public.save_make_real_activation(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_activation_id text,
  p_expected_revision integer, p_activation jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing public.saved_product_work;
  prior jsonb; p jsonb := p_activation; event jsonb; event_kind text;
  prior_step jsonb; next_step jsonb; i integer; old_len integer; saved jsonb;
begin
  perform public.make_real_activation_actor(p_workspace_id, p_user_id, p_verified_email, true);
  select * into existing from public.saved_product_work
    where workspace_id = p_workspace_id and product_id = 'operations' and resource_kind = 'activation'
      and payload->>'id' = p_activation_id
    for update;
  if not found then raise exception 'make_real_activation_not_found'; end if;
  prior := existing.payload;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647 then
    raise exception 'make_real_activation_invalid';
  end if;
  if prior->>'revision' is distinct from p_expected_revision::text then
    raise exception 'make_real_activation_revision_conflict';
  end if;
  if prior->>'status' in ('made_real', 'rolled_back') then raise exception 'make_real_activation_invalid'; end if;
  if not public.make_real_activation_shape_valid(p, p_workspace_id)
    or p->>'id' is distinct from p_activation_id
    or p->>'revision' is distinct from (p_expected_revision + 1)::text
    or p->'version' is distinct from prior->'version'
    or p->'businessId' is distinct from prior->'businessId'
    or p->'possibilityId' is distinct from prior->'possibilityId'
    or p->'candidateRevision' is distinct from prior->'candidateRevision'
    or p->'actorId' is distinct from prior->'actorId'
    or p->'createdAt' is distinct from prior->'createdAt'
    or (prior ? 'rollbackStartedAt' and p->'rollbackStartedAt' is distinct from prior->'rollbackStartedAt') then
    raise exception 'make_real_activation_invalid';
  end if;

  -- History only grows, by one event from this caller at this revision.
  old_len := jsonb_array_length(prior->'history');
  if jsonb_array_length(p->'history') <> old_len + 1
    or (p->'history') - old_len is distinct from prior->'history' then
    raise exception 'make_real_activation_invalid';
  end if;
  event := p->'history'->old_len;
  event_kind := event->>'kind';
  if jsonb_typeof(event) is distinct from 'object'
    or coalesce(event_kind, '') !~ '^[a-z][a-z_]{0,39}$'
    or event->>'actorId' is distinct from p_user_id::text
    or jsonb_typeof(event->'revision') is distinct from 'number'
    or event->>'revision' is distinct from (p_expected_revision + 1)::text
    or not public.make_real_activation_is_time(event->'at') then
    raise exception 'make_real_activation_invalid';
  end if;

  -- Pins, introductions and connections keep their identity; what each
  -- records about the live world is written once.
  if jsonb_array_length(p->'pinned') <> jsonb_array_length(prior->'pinned')
    or jsonb_array_length(p->'introduced') <> jsonb_array_length(prior->'introduced')
    or jsonb_array_length(p->'connections') <> jsonb_array_length(prior->'connections')
    or jsonb_array_length(p->'approvals') < jsonb_array_length(prior->'approvals')
    or exists(select 1 from jsonb_array_elements(prior->'pinned') with ordinality o(v, n)
      join jsonb_array_elements(p->'pinned') with ordinality x(v, n) using (n)
      where x.v->'systemId' is distinct from o.v->'systemId'
        or x.v->'baselineRevisionId' is distinct from o.v->'baselineRevisionId'
        or (o.v ? 'stagedRevisionId' and x.v->'stagedRevisionId' is distinct from o.v->'stagedRevisionId'))
    or exists(select 1 from jsonb_array_elements(prior->'introduced') with ordinality o(v, n)
      join jsonb_array_elements(p->'introduced') with ordinality x(v, n) using (n)
      where x.v->'key' is distinct from o.v->'key'
        or (o.v ? 'systemId' and x.v->'systemId' is distinct from o.v->'systemId')
        or (o.v ? 'revisionId' and x.v->'revisionId' is distinct from o.v->'revisionId'))
    or exists(select 1 from jsonb_array_elements(prior->'connections') with ordinality o(v, n)
      join jsonb_array_elements(p->'connections') with ordinality x(v, n) using (n)
      where x.v->'id' is distinct from o.v->'id'
        or (o.v ? 'connectionId' and x.v->'connectionId' is distinct from o.v->'connectionId'))
    or exists(select 1 from jsonb_array_elements(prior->'approvals') with ordinality o(v, n)
      join jsonb_array_elements(p->'approvals') with ordinality x(v, n) using (n)
      where (x.v - 'consumedAt') is distinct from (o.v - 'consumedAt')
        or (o.v ? 'consumedAt' and x.v->'consumedAt' is distinct from o.v->'consumedAt')) then
    raise exception 'make_real_activation_invalid';
  end if;

  if jsonb_array_length(p->'steps') <> jsonb_array_length(prior->'steps') then
    raise exception 'make_real_activation_invalid';
  end if;
  if event_kind = 'rollback_step' and not (p ? 'rollbackStartedAt') then
    raise exception 'make_real_activation_invalid';
  end if;
  for i in 0..jsonb_array_length(p->'steps') - 1 loop
    prior_step := prior->'steps'->i;
    next_step := p->'steps'->i;
    if public.make_real_activation_step_frame(next_step) is distinct from public.make_real_activation_step_frame(prior_step)
      or (next_step->>'attempts')::integer < (prior_step->>'attempts')::integer then
      raise exception 'make_real_activation_invalid';
    end if;
    -- An accepted outside effect keeps its result for good.
    if prior_step->>'effect' = 'accepted' and (next_step->>'effect' <> 'accepted'
      or next_step->'receipt' is distinct from prior_step->'receipt'
      or next_step->'readBack' is distinct from prior_step->'readBack') then
      raise exception 'make_real_activation_invalid';
    end if;
    if prior_step->>'status' in ('restored', 'compensated') then
      if next_step is distinct from prior_step then raise exception 'make_real_activation_invalid'; end if;
    elsif prior_step->>'status' = 'completed' then
      if event_kind <> 'rollback_step' then
        if next_step is distinct from prior_step then raise exception 'make_real_activation_invalid'; end if;
      elsif next_step->>'status' not in ('completed', 'restored', 'compensated')
        or (next_step - 'status' - 'reason') is distinct from (prior_step - 'status' - 'reason')
        or (next_step->>'status' = 'restored' and prior_step->>'kind' = 'effect')
        or (next_step->>'status' = 'compensated' and (prior_step->>'kind' <> 'effect' or prior_step->>'effect' <> 'accepted')) then
        raise exception 'make_real_activation_invalid';
      end if;
    else
      if next_step->>'status' in ('restored', 'compensated')
        or (next_step->>'status' = 'completed' and prior_step->>'status' not in ('running', 'unknown'))
        or (next_step->>'status' = 'unknown' and prior_step->>'status' not in ('running', 'unknown'))
        or (prior_step->>'status' = 'unknown' and next_step->>'status' <> 'unknown'
          and (event_kind <> 'reconcile' or next_step->>'status' not in ('completed', 'failed')))
        or (prior ? 'rollbackStartedAt' and next_step->>'status' = 'running' and prior_step->>'status' <> 'running') then
        raise exception 'make_real_activation_invalid';
      end if;
    end if;
  end loop;

  if p->>'status' = 'made_real' and (
      exists(select 1 from jsonb_array_elements(p->'steps') s where s->>'status' <> 'completed')
      or exists(select 1 from jsonb_array_elements(p->'checks') c where c->>'status' is distinct from 'passed')) then
    raise exception 'make_real_activation_invalid';
  end if;
  if p->>'status' = 'rolled_back' and (event_kind <> 'rollback' or not (p ? 'rollbackStartedAt')
      or exists(select 1 from jsonb_array_elements(p->'steps') s where s->>'status' in ('running', 'unknown'))) then
    raise exception 'make_real_activation_invalid';
  end if;

  perform public.make_real_activation_set_writer(true);
  update public.saved_product_work set payload = p, updated_at = clock_timestamp()
    where id = existing.id
    returning payload into saved;
  perform public.make_real_activation_set_writer(false);
  return saved;
end;
$$;

revoke all on function public.guard_make_real_activation_write() from public, anon, authenticated, service_role;
revoke all on function public.make_real_activation_actor(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.make_real_activation_is_time(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.make_real_activation_is_count(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.make_real_activation_step_frame(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.make_real_activation_shape_valid(jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.make_real_activation_set_writer(boolean) from public, anon, authenticated, service_role;
revoke all on function public.read_make_real_activation(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_make_real_activation(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_make_real_activation(uuid, uuid, text, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.read_make_real_activation(uuid, uuid, text, text) to service_role;
grant execute on function public.create_make_real_activation(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.save_make_real_activation(uuid, uuid, text, text, integer, jsonb) to service_role;
