-- Batch 7A (2 of 4): agency verification, one record per agency per effect
-- (agency 1.0 #254, audit A AG-04, company ADR 0012 rule 4). Additive. Local
-- only until Jacob's yes.
--
-- Signup stays open and building stays free; an agency's OUTSIDE effects
-- unlock per effect once the platform has verified it for that effect:
--   publish   put a client's site or domain live
--   google    write to a client's Google listing
--   email     send to a client's owner or customers
--   payments  take money for a client
--
-- Mechanism only. What verification requires is open decision #233, so
-- nothing here encodes criteria: a platform operator records a status with
-- the evidence they relied on. Every agency starts unverified for every
-- effect, Strelva's own agency included, and Strelva's agency is verified
-- through this same record and function. There is no other path.
--
-- agency_verifications is append-only history; the latest row per (agency,
-- effect) is the state. agency_effect_allowed(agency, effect) is the one
-- check. Each row records whether the operator who wrote it was a member of
-- the agency, so self-verification (Strelva's operator verifying Strelva's
-- agency) is visible in the record rather than hidden.
--
-- This batch wires only the service actor (20261009153000) to the check.
-- Launch, domain, Google, email and payment gates are #255.

set local lock_timeout = '3s';

create function public.agency_effect_names() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['publish', 'google', 'email', 'payments']::text[]
$$;

create table public.agency_verifications (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  effect text not null check (effect in ('publish', 'google', 'email', 'payments')),
  status text not null check (status in ('verified', 'unverified')),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 16000),
  reason text check (reason is null or char_length(reason) between 1 and 500),
  verified_by uuid not null references public.users(id) on delete restrict,
  verifier_is_agency_member boolean not null,
  recorded_at timestamptz not null default clock_timestamp(),
  check (status <> 'verified' or evidence <> '{}'::jsonb),
  check (status <> 'unverified' or reason is not null)
);
create index agency_verifications_state_idx
  on public.agency_verifications(agency_workspace_id, effect, sequence desc);
alter table public.agency_verifications enable row level security;
revoke all on public.agency_verifications from public, anon, authenticated, service_role;

create function public.agency_verifications_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.workspaces where id = new.agency_workspace_id and kind = 'agency') then
      raise exception 'agency_verification_invalid';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.agency_workspace_id) then
    return old;
  end if;
  raise exception 'agency_verification_immutable';
end;
$$;
create trigger agency_verifications_guard before insert or update or delete on public.agency_verifications
  for each row execute function public.agency_verifications_guard();

-- The one check. True only when the latest record for this agency and effect
-- is `verified`. No record: false. An unknown effect name is an error, never
-- a silent deny or allow.
create function public.agency_effect_allowed(p_agency_workspace_id uuid, p_effect text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_effect is null or not (p_effect = any(public.agency_effect_names())) then
    raise exception 'agency_effect_unknown';
  end if;
  if p_agency_workspace_id is null then return false; end if;
  return coalesce((select v.status = 'verified' from public.agency_verifications v
    join public.workspaces w on w.id = v.agency_workspace_id and w.kind = 'agency'
    where v.agency_workspace_id = p_agency_workspace_id and v.effect = p_effect
    order by v.sequence desc limit 1), false);
end;
$$;

-- Current state per effect, every effect listed (unverified when never recorded).
create function public.agency_verification_state(p_agency_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('agencyWorkspaceId', p_agency_workspace_id, 'effects', jsonb_agg(jsonb_build_object(
      'effect', e.effect,
      'status', coalesce(v.status, 'unverified'),
      'recorded', v.id is not null,
      'recordedAt', case when v.id is not null then to_char(v.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
      'reason', v.reason,
      'verifierIsAgencyMember', v.verifier_is_agency_member)
    order by e.ordinality))
  from unnest(public.agency_effect_names()) with ordinality e(effect, ordinality)
  left join lateral (select * from public.agency_verifications x
    where x.agency_workspace_id = p_agency_workspace_id and x.effect = e.effect
    order by x.sequence desc limit 1) v on true
$$;

-- A platform operator records a verification state for one agency and one
-- effect. `verified` needs evidence (a non-empty object; its contents are the
-- open decision #233). `unverified` (revoking, or recording a refusal) needs a
-- reason. Recording the current state again appends nothing.
create function public.record_agency_verification(
  p_operator_email text, p_agency_workspace_id uuid, p_effect text, p_status text, p_evidence jsonb, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  current_status text;
  v_evidence jsonb := coalesce(p_evidence, '{}'::jsonb);
  v_reason text := nullif(btrim(p_reason), '');
begin
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  if p_effect is null or not (p_effect = any(public.agency_effect_names())) then
    raise exception 'agency_effect_unknown';
  end if;
  if p_status is null or p_status not in ('verified', 'unverified') or jsonb_typeof(v_evidence) <> 'object'
    or (p_status = 'verified' and v_evidence = '{}'::jsonb)
    or (p_status = 'unverified' and v_reason is null)
    or (v_reason is not null and char_length(v_reason) > 500) then
    raise exception 'agency_verification_invalid';
  end if;
  perform 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency' for share;
  if not found then raise exception 'agency_verification_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('agency-verification:' || p_agency_workspace_id::text, 0));
  select status into current_status from public.agency_verifications
    where agency_workspace_id = p_agency_workspace_id and effect = p_effect order by sequence desc limit 1;
  if coalesce(current_status, 'unverified') <> p_status or (current_status is null and p_status = 'unverified') then
    insert into public.agency_verifications(agency_workspace_id, effect, status, evidence, reason, verified_by,
        verifier_is_agency_member)
      values (p_agency_workspace_id, p_effect, p_status, v_evidence, v_reason, operator_id,
        exists (select 1 from public.workspace_memberships m where m.workspace_id = p_agency_workspace_id and m.user_id = operator_id));
  end if;
  return public.agency_verification_state(p_agency_workspace_id);
end;
$$;

-- What an agency's own members see: their agency's state per effect.
create function public.read_agency_verification(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_agency_workspace_id;
  if not found then raise exception 'agency_verification_access_denied'; end if;
  return public.agency_verification_state(p_agency_workspace_id);
end;
$$;

-- The operator console's read: state plus the full history for one agency.
-- VOLATILE because the operator check takes FOR KEY SHARE, which PostgREST's
-- READ ONLY transaction for a STABLE RPC refuses (20261009150000).
create function public.read_agency_verification_history(p_operator_email text, p_agency_workspace_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.tenant_conversion_assert_operator(p_operator_email);
  perform 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency';
  if not found then raise exception 'agency_verification_invalid'; end if;
  return public.agency_verification_state(p_agency_workspace_id) || jsonb_build_object('history',
    coalesce((select jsonb_agg(jsonb_build_object('effect', v.effect, 'status', v.status, 'evidence', v.evidence,
        'reason', v.reason, 'verifiedBy', v.verified_by, 'verifierIsAgencyMember', v.verifier_is_agency_member,
        'recordedAt', to_char(v.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      order by v.sequence desc)
    from public.agency_verifications v where v.agency_workspace_id = p_agency_workspace_id), '[]'::jsonb));
end;
$$;

revoke all on function public.agency_effect_names() from public, anon, authenticated;
revoke all on function public.agency_verifications_guard() from public, anon, authenticated, service_role;
revoke all on function public.agency_effect_allowed(uuid, text) from public, anon, authenticated;
revoke all on function public.agency_verification_state(uuid) from public, anon, authenticated, service_role;
revoke all on function public.record_agency_verification(text, uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.read_agency_verification(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.read_agency_verification_history(text, uuid) from public, anon, authenticated;
grant execute on function public.agency_effect_names() to service_role;
grant execute on function public.agency_effect_allowed(uuid, text) to service_role;
grant execute on function public.record_agency_verification(text, uuid, text, text, jsonb, text) to service_role;
grant execute on function public.read_agency_verification(uuid, text, uuid) to service_role;
grant execute on function public.read_agency_verification_history(text, uuid) to service_role;
