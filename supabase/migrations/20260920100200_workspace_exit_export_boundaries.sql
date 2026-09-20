-- Additive corrections for the frozen exit/export contracts.
-- Keep the original functions as the durable operation and enrich their
-- returned state at the same authorized boundary. No external service is
-- changed by this migration.

alter function public.complete_workspace_exit(uuid, uuid, text, text, text, jsonb, text, text, text)
  rename to complete_workspace_exit_base;
revoke all on function public.complete_workspace_exit_base(uuid, uuid, text, text, text, jsonb, text, text, text) from public, anon, authenticated, service_role;

create or replace function public.complete_workspace_exit(
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_future_work text,
  p_provider_participation text,
  p_maintained_resources jsonb,
  p_idempotency_key text,
  p_command_digest text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  base_result jsonb;
  exit_state jsonb;
  economics_obligations jsonb;
  retained jsonb;
  exit_id uuid;
  retained_unknown integer;
  retained_accepted integer;
begin
  base_result := public.complete_workspace_exit_base(
    p_workspace_id, p_user_id, p_verified_email, p_future_work,
    p_provider_participation, p_maintained_resources, p_idempotency_key,
    p_command_digest, p_notes
  );

  select request.id, request.state
    into exit_id, exit_state
  from public.workspace_exit_requests request
  where request.workspace_id = p_workspace_id;
  if exit_id is null then return base_result; end if;

  -- Accepted or reserved budget authorizations without an accepted/unknown
  -- execution remain obligations even when no execution row exists yet.
  select coalesce(jsonb_agg(jsonb_build_object(
    'workId', pending.work_id,
    'title', pending.title,
    'status', 'needs_attention',
    'effect', 'none'
  ) order by pending.title, pending.work_id), '[]'::jsonb)
    into economics_obligations
  from (
    select work.id as work_id, coalesce(work.title, 'Budgeted work') as title
    from public.job_economics job
    join public.saved_product_work work
      on work.id = job.work_id and work.workspace_id = p_workspace_id
    where job.workspace_id = p_workspace_id
      and job.status in ('accepted', 'reserved')
      and not exists (
        select 1
        from public.job_economics_executions execution
        where execution.job_id = job.id
          and execution.effect in ('accepted', 'unknown')
      )
    group by work.id, work.title
  ) pending;

  select coalesce(jsonb_agg(item order by item->>'title', item->>'workId'), '[]'::jsonb)
    into retained
  from (
    select item
    from jsonb_array_elements(coalesce(exit_state->'retainedObligations', '[]'::jsonb)) item
    union all
    select item
    from jsonb_array_elements(economics_obligations) item
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(exit_state->'retainedObligations', '[]'::jsonb)) prior
      where prior->>'workId' = item->>'workId'
    )
  ) merged;

  select count(*) filter (where item->>'status' = 'unknown'),
         count(*) filter (where item->>'status' <> 'unknown')
    into retained_unknown, retained_accepted
  from jsonb_array_elements(retained) item;

  exit_state := jsonb_set(exit_state, '{retainedObligations}', retained, true);
  exit_state := jsonb_set(exit_state, '{summary,retainedUnknown}', to_jsonb(retained_unknown), true);
  exit_state := jsonb_set(exit_state, '{summary,retainedAccepted}', to_jsonb(retained_accepted), true);
  update public.workspace_exit_requests
  set state = exit_state
  where id = exit_id;

  return jsonb_build_object(
    'state', exit_state,
    'replayed', coalesce((base_result->>'replayed')::boolean, false)
  );
end;
$$;

revoke all on function public.complete_workspace_exit(uuid, uuid, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_workspace_exit(uuid, uuid, text, text, text, jsonb, text, text, text) to service_role;

alter function public.export_workspace_snapshot(uuid, uuid, text)
  rename to export_workspace_snapshot_base;
revoke all on function public.export_workspace_snapshot_base(uuid, uuid, text) from public, anon, authenticated, service_role;

create or replace function public.export_workspace_snapshot(
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  result_size integer;
  receipt_id uuid;
begin
  result := public.export_workspace_snapshot_base(p_workspace_id, p_user_id, p_verified_email);
  receipt_id := (result->>'exportId')::uuid;
  result := jsonb_set(
    result,
    '{manifest,unavailable}',
    (result#>'{manifest,unavailable}') || jsonb_build_array(
      jsonb_build_object(
        'category', 'custom_application_artifacts_and_releases',
        'reason', 'Custom application source and built artifacts require a separate authorized transfer.'
      ),
      jsonb_build_object(
        'category', 'calendar_connections_and_event_receipts',
        'reason', 'Calendar credentials and provider event receipts are excluded from portability.'
      ),
      jsonb_build_object(
        'category', 'inquiry_records_and_followups',
        'reason', 'Inquiry routing and follow-up records use a separate tenant-authorized export.'
      ),
      jsonb_build_object(
        'category', 'offering_installations_and_provider_delivery',
        'reason', 'Offering and provider-delivery records are outside this workspace snapshot.'
      )
    ),
    true
  );
  result_size := octet_length(result::text);
  if result_size > 2000000 then
    delete from public.workspace_export_receipts where id = receipt_id;
    raise exception 'workspace_export_too_large';
  end if;
  update public.workspace_export_receipts
  set byte_size = result_size
  where id = receipt_id;
  return result;
end;
$$;

revoke all on function public.export_workspace_snapshot(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.export_workspace_snapshot(uuid, uuid, text) to service_role;

-- Keep the saved-work guard at the execution boundary. After an exit, a
-- calendar row that was already in flight may finish, reconcile, or be
-- explicitly cancelled. A new reservation, a reschedule, or a provider claim
-- for a previously local reservation must still fail. The original guard
-- rejected every payload that contained any `writing` reservation, which made
-- reconciling one item impossible when another item was already in flight.
create or replace function public.guard_workspace_exit_saved_work()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_steps jsonb := coalesce(case when tg_op = 'UPDATE' and jsonb_typeof(old.payload->'steps') = 'array' then old.payload->'steps' else '[]'::jsonb end, '[]'::jsonb);
  new_steps jsonb := coalesce(case when jsonb_typeof(new.payload->'steps') = 'array' then new.payload->'steps' else '[]'::jsonb end, '[]'::jsonb);
begin
  if tg_op = 'INSERT' then
    if public.workspace_exit_completed(new.workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
    return new;
  end if;
  if not public.workspace_exit_completed(new.workspace_id) then return new; end if;
  if new.product_id = 'investigations'
    and old.payload->>'status' is distinct from new.payload->>'status'
    and new.payload->>'status' = 'active' then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if new.product_id = 'operations' then
    if old.payload->>'status' is distinct from new.payload->>'status'
      and new.payload->>'status' in ('ready', 'waiting', 'running') then
      raise exception 'workspace_exit_future_work_blocked';
    end if;
    if exists(
      select 1
      from jsonb_array_elements(old_steps) with ordinality previous(step, ordinal)
      join jsonb_array_elements(new_steps) with ordinality next(step, ordinal) using (ordinal)
      where previous.step->>'status' in ('pending', 'waiting')
        and next.step->>'status' = 'running'
    ) then
      raise exception 'workspace_exit_future_work_blocked';
    end if;
  end if;
  if new.product_id = 'scheduling' then
    -- Preserve every non-cancelled reservation. Cancellation is represented by
    -- a durable status so an omitted row cannot silently discard an obligation.
    if exists(
      select 1
      from jsonb_array_elements(coalesce(old.payload->'reservations', '[]'::jsonb)) previous_reservation
      where coalesce(previous_reservation->>'status', '') <> 'cancelled'
        and not exists(
          select 1
          from jsonb_array_elements(coalesce(new.payload->'reservations', '[]'::jsonb)) next_reservation
          where next_reservation->>'requestId' = previous_reservation->>'requestId'
        )
    ) then
      raise exception 'workspace_exit_future_work_blocked';
    end if;

    -- A request identifier that did not exist before exit cannot be introduced,
    -- even if it is already marked cancelled.
    if exists(
      select 1
      from jsonb_array_elements(coalesce(new.payload->'reservations', '[]'::jsonb)) next_reservation
      where not exists(
        select 1
        from jsonb_array_elements(coalesce(old.payload->'reservations', '[]'::jsonb)) previous_reservation
        where previous_reservation->>'requestId' = next_reservation->>'requestId'
      )
    ) then
      raise exception 'workspace_exit_future_work_blocked';
    end if;

    if exists(
      select 1
      from jsonb_array_elements(coalesce(new.payload->'reservations', '[]'::jsonb)) next_reservation
      join jsonb_array_elements(coalesce(old.payload->'reservations', '[]'::jsonb)) previous_reservation
        on previous_reservation->>'requestId' = next_reservation->>'requestId'
      where
        -- A provider claim cannot start after exit. An accepted reservation may
        -- enter writing only for the existing cancellation operation.
        (coalesce(next_reservation->>'status', '') = 'writing'
          and not (
            (coalesce(previous_reservation->>'status', '') = 'writing'
              and next_reservation->>'syncOperation' is not distinct from previous_reservation->>'syncOperation'
              and next_reservation->>'provider' is not distinct from previous_reservation->>'provider'
              and next_reservation->>'title' is not distinct from previous_reservation->>'title'
              and next_reservation->>'start' is not distinct from previous_reservation->>'start'
              and next_reservation->>'end' is not distinct from previous_reservation->>'end')
            or (coalesce(previous_reservation->>'status', '') = 'accepted' and next_reservation->>'syncOperation' = 'delete')
          ))
        -- Readback may reconcile an in-flight item to an accepted or reserved
        -- state, but a local reservation cannot become an external effect.
        or (coalesce(next_reservation->>'status', '') = 'accepted'
          and coalesce(previous_reservation->>'status', '') not in ('writing', 'unknown', 'accepted'))
        or (coalesce(next_reservation->>'status', '') = 'unknown'
          and coalesce(previous_reservation->>'status', '') not in ('writing', 'unknown', 'accepted'))
        or (coalesce(next_reservation->>'status', '') = 'reserved'
          and (
            coalesce(previous_reservation->>'status', '') not in ('writing', 'unknown', 'reserved')
            or (coalesce(previous_reservation->>'status', '') = 'reserved' and (
              next_reservation->>'title' is distinct from previous_reservation->>'title'
              or next_reservation->>'start' is distinct from previous_reservation->>'start'
              or next_reservation->>'end' is distinct from previous_reservation->>'end'
            ))
          ))
        -- A cancelled reservation cannot be resurrected after exit.
        or (coalesce(previous_reservation->>'status', '') = 'cancelled' and coalesce(next_reservation->>'status', '') <> 'cancelled')
    ) then
      raise exception 'workspace_exit_future_work_blocked';
    end if;
  end if;
  return new;
end;
$$;

-- A successor is named for later review. That record does not keep recipient
-- submissions or publication open. Explicit retirement remains available as a
-- cleanup action after exit.
create or replace function public.guard_workspace_exit_application_resource()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare workspace_id uuid := (to_jsonb(new)->>'workspace_id')::uuid;
begin
  if not public.workspace_exit_completed(workspace_id) then return new; end if;
  if tg_op = 'UPDATE' and tg_table_name in ('application_states', 'custom_application_states')
    and to_jsonb(new)->>'lifecycle_status' = 'retired' then
    return new;
  end if;
  raise exception 'workspace_exit_resource_stopped';
end;
$$;

-- Releases and reviews are mutable SQL rows even though the application API
-- treats them as immutable versions. Guard direct service-role updates too.
drop trigger if exists application_releases_workspace_exit_guard_trg on public.application_releases;
create trigger application_releases_workspace_exit_guard_trg
before insert or update on public.application_releases
for each row execute function public.guard_workspace_exit_application_resource();
drop trigger if exists custom_application_reviews_workspace_exit_guard_trg on public.custom_application_reviews;
create trigger custom_application_reviews_workspace_exit_guard_trg
before insert or update on public.custom_application_reviews
for each row execute function public.guard_workspace_exit_application_resource();
drop trigger if exists custom_application_releases_workspace_exit_guard_trg on public.custom_application_releases;
create trigger custom_application_releases_workspace_exit_guard_trg
before insert or update on public.custom_application_releases
for each row execute function public.guard_workspace_exit_application_resource();
