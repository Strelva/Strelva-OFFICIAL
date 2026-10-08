-- Atomic compensation claims and evidence-only reconciliation. No provider writes here.
-- New runner writes require this migration. The accepted forward receipt is immutable.
-- Rollback keeps these safety validators and all evidence; it disables activation writes.
begin;
set local lock_timeout='3s';
set local statement_timeout='120s';
-- Undo has its own persisted claim. It never makes the accepted forward write retryable.
create or replace function public.make_real_compensation_transition_valid(o jsonb, n jsonb, event_kind text, rolling_back boolean)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare old_c jsonb := o->'compensation'; new_c jsonb := n->'compensation';
  old_status text := old_c->>'status'; new_status text := new_c->>'status';
begin
  if old_c is not distinct from new_c then
    -- Legacy terminal rows remain readable; a new terminal transition needs
    -- the durable claim/outcome path, never a status-only assertion.
    return not (o->>'status' is distinct from 'compensated' and n->>'status'='compensated');
  end if;
  if not rolling_back or n->>'kind' <> 'effect' or n->>'effect' <> 'accepted'
    or n->>'status' not in ('completed','compensated') or new_c is null then return false; end if;
  if new_status = 'running' then
    return event_kind='rollback_compensation_claim' and o->>'status'='completed'
      and n->>'status'='completed' and (old_c is null or old_status in ('failed','unavailable'))
      and (old_c is null or new_c->>'claimId' is distinct from old_c->>'claimId');
  elsif old_status='running' then
    return event_kind='rollback_step' and new_status in ('failed','unknown','compensated')
      and new_c->>'claimId' is not distinct from old_c->>'claimId'
      and (new_status <> 'compensated' or n->>'status'='compensated');
  elsif old_status='unknown' then
    return event_kind='reconcile' and new_status in ('failed','compensated')
      and (new_status <> 'compensated' or n->>'status'='compensated');
  elsif new_status='unavailable' then
    return event_kind='rollback_step' and n->>'status'='completed'
      and (old_c is null or old_status in ('failed','unavailable'));
  end if;
  return false;
end;
$$;
revoke all on function public.make_real_compensation_transition_valid(jsonb,jsonb,text,boolean) from public,anon,authenticated,service_role;

create or replace function public.make_real_activation_shape_valid(p jsonb, p_workspace_id uuid) returns boolean
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
  for step in select value from jsonb_array_elements(p->'steps') loop
    if step ? 'compensation' and (
      step->>'kind' <> 'effect' or step->>'effect' <> 'accepted'
      or step->>'status' not in ('completed','compensated')
      or jsonb_typeof(step->'compensation') is distinct from 'object'
      or ((step->'compensation') - 'status' - 'detail' - 'at' - 'claimId') <> '{}'::jsonb
      or coalesce(step->'compensation'->>'status','') not in ('running','failed','unknown','compensated','unavailable')
      or jsonb_typeof(step->'compensation'->'detail') is distinct from 'string'
      or char_length(step->'compensation'->>'detail') > 2000
      or not public.make_real_activation_is_time(step->'compensation'->'at')
      or (step->'compensation' ? 'claimId' and (
        jsonb_typeof(step->'compensation'->'claimId') is distinct from 'string'
        or char_length(step->'compensation'->>'claimId') not between 1 and 120))
      or (step->'compensation'->>'status' in ('running','unknown') and not (step->'compensation' ? 'claimId'))
      or ((step->'compensation'->>'status'='compensated') is distinct from (step->>'status'='compensated'))
    ) then return false; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p->'steps')) <> jsonb_array_length(p->'steps') then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.save_make_real_activation(
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
  if event_kind in ('rollback_step','rollback_compensation_claim') and not (p ? 'rollbackStartedAt') then
    raise exception 'make_real_activation_invalid';
  end if;
  for i in 0..jsonb_array_length(p->'steps') - 1 loop
    prior_step := prior->'steps'->i;
    next_step := p->'steps'->i;
    if public.make_real_activation_step_frame(next_step) is distinct from public.make_real_activation_step_frame(prior_step)
      or (next_step->>'attempts')::integer < (prior_step->>'attempts')::integer then
      raise exception 'make_real_activation_invalid';
    end if;
    if public.make_real_compensation_transition_valid(prior_step,next_step,event_kind,p ? 'rollbackStartedAt') is not true then
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
      if event_kind <> 'rollback_step' and not (event_kind in ('rollback_compensation_claim','reconcile')
        and (prior_step->'compensation') is distinct from (next_step->'compensation')) then
        if next_step is distinct from prior_step then raise exception 'make_real_activation_invalid'; end if;
      elsif next_step->>'status' not in ('completed', 'restored', 'compensated')
        or (next_step - 'status' - 'reason' - 'compensation') is distinct from (prior_step - 'status' - 'reason' - 'compensation')
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
      or exists(select 1 from jsonb_array_elements(p->'steps') s where s->>'status' in ('running', 'unknown')
        or (s->>'kind' in ('activate','connect') and s->>'status'='completed')
        or (s->>'kind'='effect' and s->>'effect'='accepted' and s->>'reversibility'='compensable' and s->>'status'<>'compensated')
        or s->'compensation'->>'status' in ('running','unknown','failed')
        or (s->>'reversibility'='compensable' and s->'compensation'->>'status'='unavailable')
        or (not (s ? 'compensation') and s->>'reason' like 'Compensation failed:%'))) then
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

revoke all on function public.make_real_activation_shape_valid(jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.create_make_real_activation(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb) to service_role;
commit;
