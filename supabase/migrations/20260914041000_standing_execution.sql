-- A standing admission creates an ordinary finite Responsibility.  The
-- admission record remains the execution authority for any later claim.
--
-- The public update wrapper validates identity and membership, reads the
-- immutable job link without locking, then takes the same policy advisory
-- lock as standing admission before the legacy function locks the finite work
-- row.  Its UPDATE trigger reacquires that transaction lock before locking
-- the accepted job and current policy.  The effective order is:
--   standing policy advisory lock -> saved_product_work -> accepted job
--   -> current policy share lock
-- A policy update takes the policy row lock, and therefore either commits
-- before this check (and is observed) or waits for this claim to finish.  A
-- job cancel is serialized by the job row lock.  A running action is never
-- reclassified as a new claim here, so a provider effect already in flight
-- can still record its outcome.

-- Keep the existing CAS/member/owner/payload implementation intact.  The
-- wrapper below adds the standing claim lock before that implementation's
-- finite-work lock, while the trigger remains a durable guard for any other
-- trusted writer that updates the canonical table directly.
alter function public.update_work_responsibility(uuid, uuid, uuid, text, integer, jsonb)
  rename to update_work_responsibility_unchecked;

create or replace function public.update_work_responsibility(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_revision integer, p_payload jsonb
) returns setof public.saved_product_work
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare standing_id uuid;
begin
  if not exists(
    select 1 from public.users
    where id = p_user_id
      and lower(email) = lower(p_verified_email)
      and verified_at is not null
  ) then
    raise exception 'workspace_access_denied';
  end if;
  perform 1 from public.workspace_memberships
    where workspace_id = p_workspace_id and user_id = p_user_id
    for share;
  if not found then raise exception 'workspace_access_denied'; end if;

  -- The job's standing id is immutable under the 400 migration.  This read
  -- only chooses the advisory key; the trigger takes the job row lock after
  -- the key, so a concurrent cancellation cannot race the policy decision.
  select job.standing_responsibility_id into standing_id
  from public.standing_responsibility_jobs job
  where job.finite_work_id = p_work_id
    and job.workspace_id = p_workspace_id;
  if standing_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'standing-responsibility:' || standing_id::text, 13));
  end if;

  return query select * from public.update_work_responsibility_unchecked(
    p_work_id, p_workspace_id, p_user_id, p_verified_email,
    p_expected_revision, p_payload
  );
end;
$$;

create or replace function public.guard_standing_responsibility_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job public.standing_responsibility_jobs%rowtype;
  policy public.standing_responsibilities%rowtype;
  standing_id uuid;
  prior_step jsonb;
  next_step jsonb;
  step_index integer;
  has_new_claim boolean := false;
begin
  -- Only the finite responsibility payload has a claim transition.  Other
  -- saved work and ordinary responsibility updates keep their existing path.
  if tg_op <> 'UPDATE'
    or old.product_id is distinct from 'operations'
    or old.resource_kind is distinct from 'responsibility'
    or jsonb_typeof(old.payload->'steps') is distinct from 'array'
    or jsonb_typeof(new.payload->'steps') is distinct from 'array'
    or jsonb_array_length(old.payload->'steps') is distinct from jsonb_array_length(new.payload->'steps') then
    return new;
  end if;

  if jsonb_array_length(old.payload->'steps') > 0 then
    for step_index in 0..jsonb_array_length(old.payload->'steps') - 1 loop
      prior_step := old.payload->'steps'->step_index;
      next_step := new.payload->'steps'->step_index;
      if coalesce(prior_step->>'status', '') in ('pending', 'waiting')
        and next_step->>'status' = 'running' then
        has_new_claim := true;
        exit;
      end if;
    end loop;
  end if;

  if not has_new_claim then return new; end if;

  -- The public wrapper already holds this key before its work-row lock.  A
  -- direct trusted table update reaches here after its work-row lock, but it
  -- still uses the same key as admission before touching job or policy rows.
  select standing_responsibility_id into standing_id
  from public.standing_responsibility_jobs
  where finite_work_id = old.id and workspace_id = old.workspace_id;
  if not found then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'standing-responsibility:' || standing_id::text, 13));

  select * into job
  from public.standing_responsibility_jobs
  where finite_work_id = old.id
  for update;

  if job.status is distinct from 'accepted'
    or old.workspace_id is distinct from job.workspace_id
    or new.workspace_id is distinct from job.workspace_id then
    raise exception 'standing_execution_blocked';
  end if;

  -- A share lock makes the active/version/approval decision part of the same
  -- transaction as the payload claim.  A policy update committed first is
  -- therefore visible here; a concurrent update waits for this decision.
  select * into policy
  from public.standing_responsibilities
  where id = job.standing_responsibility_id
    and workspace_id = job.workspace_id
  for share;

  if not found
    or policy.status is distinct from 'active'
    or policy.version is distinct from job.policy_version
    or policy.workspace_id is distinct from job.workspace_id
    or policy.owner_id is distinct from old.created_by
    or new.payload->>'ownerId' is distinct from policy.owner_id::text
    or policy.payload->>'approvedBy' is distinct from policy.owner_id::text
    or policy.payload->>'approvedAt' is null then
    raise exception 'standing_execution_blocked';
  end if;

  begin
    perform (policy.payload->>'approvedAt')::timestamptz;
  exception when others then
    raise exception 'standing_execution_blocked';
  end;

  return new;
end;
$$;

drop trigger if exists standing_responsibility_claim_guard_trg on public.saved_product_work;
create trigger standing_responsibility_claim_guard_trg
  before update of payload on public.saved_product_work
  for each row execute function public.guard_standing_responsibility_claim();

revoke all on function public.guard_standing_responsibility_claim() from public, anon, authenticated, service_role;
revoke all on function public.update_work_responsibility_unchecked(uuid, uuid, uuid, text, integer, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.update_work_responsibility(uuid, uuid, uuid, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.update_work_responsibility(uuid, uuid, uuid, text, integer, jsonb)
  to service_role;
