-- Strelva (system): a narrow, audited service actor for work that must run
-- when nobody is signed in (product model rule 6, "Nobody has to sign in").
-- Additive. Local only until Jacob's yes.
--
-- Why. The workspace Needs you sources (website documents, provider delivery,
-- Running, finite work, agency grants, app releases, work plans, money,
-- Versions, Make real) are read through member RPCs that recheck a verified
-- member. The hourly needs-you cron has no member, so it could open only
-- tenant-event items; an owner who never signs in never got the rest by
-- email. Make real's durable runner had the same gap: the workspace-work cron
-- resumed an activation only while its starter was still an owner or admin.
--
-- What this adds:
--   1. strelva_service_actions: an append-only log. Every time Strelva reads
--      a business as "Strelva (system)" (a session), opens a Needs you item
--      under that session, or resumes a Make real activation, one row says so.
--   2. strelva_service_reader(workspace, purpose): starts a session for ONE
--      business and returns the member identity the existing RPCs recheck
--      (the oldest verified owner, else the oldest verified admin, which is
--      the Strelva operator on a converted business). Only for a business
--      Strelva runs: a converted business (tenant_workspace_links) or one
--      whose active provider of record is Strelva's agency workspace. No
--      session for any other business; nothing is logged then.
--   3. open_owner_decision_as_service: opens an item under a live
--      needs_you_sync session of the same business, marks it opened by
--      "Strelva (system)" and logs it. It never claims, decides, finishes or
--      withdraws: deciding still needs the owner's signed link or session
--      (claim_owner_decision is unchanged).
--   4. record_strelva_service_action: the audit row for a Make real resume,
--      run, reconcile or (operator) rollback under a live make_real_resume
--      session of the same business. The owner stays approver of record:
--      the activation's approval record is untouched and rechecked before
--      every step.
--   5. due_make_real_activations_for_service: in-progress activations of
--      every customer business, with the starter only when still a verified
--      owner or admin (the caller then falls back to the service session).
--   6. workspace_release_flag_names(): gains `connected_sites` so connected
--      sites get their own per-workspace row. Every earlier key is kept.
--
-- Sessions last 30 minutes. A session id from another business, another
-- purpose or an expired session is refused with strelva_service_access_denied.
-- RLS on, every table privilege revoked, service-role functions only.

set local lock_timeout = '3s';

create table public.strelva_service_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purpose text not null check (purpose in ('needs_you_sync', 'make_real_resume')),
  action text not null check (action in ('session', 'open', 'resume', 'run', 'reconcile', 'rollback')),
  actor_label text not null default 'Strelva (system)' check (actor_label = 'Strelva (system)'),
  session_id uuid references public.strelva_service_actions(id) on delete cascade,
  on_behalf_user_id uuid references public.users(id) on delete set null,
  on_behalf_role text check (on_behalf_role is null or on_behalf_role in ('owner', 'admin')),
  subject text check (subject is null or char_length(subject) between 1 and 300),
  detail text check (detail is null or char_length(detail) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  check ((action = 'session') = (session_id is null)),
  check (action <> 'session' or (on_behalf_user_id is not null and on_behalf_role is not null))
);
create index strelva_service_actions_workspace_idx on public.strelva_service_actions(workspace_id, created_at desc);
alter table public.strelva_service_actions enable row level security;
revoke all on public.strelva_service_actions from public, anon, authenticated, service_role;

create function public.strelva_service_actions_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'strelva_service_actions_immutable';
end;
$$;
create trigger strelva_service_actions_immutable before update or delete on public.strelva_service_actions
  for each row when (pg_trigger_depth() = 0) execute function public.strelva_service_actions_immutable();

-- Who opened an item. Null: a member's own sync or the tenant-event path, as
-- before. 'strelva_system': opened by the service actor; set once, never changed.
alter table public.owner_decisions add column opened_by text
  check (opened_by is null or opened_by = 'strelva_system');

create function public.owner_decision_opened_by_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if old.opened_by is not null and new.opened_by is distinct from old.opened_by then
    raise exception 'owner_decision_identity_immutable';
  end if;
  return new;
end;
$$;
create trigger owner_decisions_opened_by_guard before update on public.owner_decisions
  for each row execute function public.owner_decision_opened_by_guard();

-- Same shape as 20261007120000, plus openedBy.
create or replace function public.owner_decision_json(d public.owner_decisions) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', d.id, 'workspaceId', d.workspace_id, 'systemId', d.system_id,
    'kind', d.change_kind, 'route', d.route, 'title', d.title, 'detail', d.detail,
    'approveEffect', d.approve_effect, 'notYetEffect', d.not_yet_effect,
    'sourceLifecycle', d.source_lifecycle, 'sourceId', d.source_id, 'revisionHash', d.revision_hash,
    'urgent', d.urgent, 'signInRequired', d.sign_in_required, 'adminMayDecide', d.admin_may_decide,
    'openHref', d.open_href, 'state', d.state, 'outcome', d.outcome, 'outcomeReason', d.outcome_reason,
    'receiptRef', d.receipt_ref, 'decidedByKind', d.decided_by_kind, 'decidedAt', d.decided_at,
    'deliveryState', d.delivery_state, 'operatorNote', d.operator_note, 'openedAt', d.opened_at,
    'expiresAt', d.expires_at, 'reminded1At', d.reminded_1_at, 'reminded2At', d.reminded_2_at,
    'openedBy', case when d.opened_by = 'strelva_system' then 'Strelva (system)' end,
    'deliveries', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'status', x.status,
        'providerMessageId', x.provider_message_id, 'reason', x.reason, 'at', x.created_at) order by x.created_at, x.id)
      from public.owner_decision_deliveries x where x.decision_id = d.id), '[]'::jsonb))
$$;

-- A business Strelva runs: converted from a tenant, or provided by Strelva's agency.
create function public.strelva_runs_business(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.kind = 'customer')
    and (exists (select 1 from public.tenant_workspace_links l where l.workspace_id = p_workspace_id)
      or exists (select 1 from public.workspace_providers p
        join public.strelva_agency_workspace a on a.workspace_id = p.provider_workspace_id
        where p.customer_workspace_id = p_workspace_id and p.status = 'active'))
$$;

create function public.strelva_service_reader(p_workspace_id uuid, p_purpose text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  reader record;
  session_id uuid;
begin
  if p_workspace_id is null or p_purpose is null or p_purpose not in ('needs_you_sync', 'make_real_resume') then
    raise exception 'strelva_service_invalid';
  end if;
  if not public.strelva_runs_business(p_workspace_id) then return null; end if;
  select u.id as user_id, lower(u.email) as email, wm.role into reader
    from public.workspace_memberships wm
    join public.users u on u.id = wm.user_id and u.verified_at is not null
    where wm.workspace_id = p_workspace_id and wm.role in ('owner', 'admin')
    order by case wm.role when 'owner' then 0 else 1 end, wm.created_at, wm.user_id
    limit 1;
  if not found then return null; end if;
  insert into public.strelva_service_actions(workspace_id, purpose, action, on_behalf_user_id, on_behalf_role)
    values (p_workspace_id, p_purpose, 'session', reader.user_id, reader.role)
    returning id into session_id;
  return jsonb_build_object('sessionId', session_id, 'workspaceId', p_workspace_id, 'purpose', p_purpose,
    'label', 'Strelva (system)', 'role', reader.role, 'userId', reader.user_id, 'verifiedEmail', reader.email);
end;
$$;

-- A live session of this business for this purpose, or access denied.
create function public.strelva_service_session(p_workspace_id uuid, p_session_id uuid, p_purpose text)
returns public.strelva_service_actions
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare row_value public.strelva_service_actions;
begin
  select * into row_value from public.strelva_service_actions
    where id = p_session_id and workspace_id = p_workspace_id and purpose = p_purpose and action = 'session'
      and created_at > clock_timestamp() - interval '30 minutes';
  if not found then raise exception 'strelva_service_access_denied'; end if;
  return row_value;
end;
$$;

create function public.open_owner_decision_as_service(p_workspace_id uuid, p_session_id uuid, p_item jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existed boolean;
  opened jsonb;
  row_value public.owner_decisions;
begin
  perform public.strelva_service_session(p_workspace_id, p_session_id, 'needs_you_sync');
  if p_item is null or jsonb_typeof(p_item) <> 'object' then raise exception 'owner_decision_invalid'; end if;
  select exists (select 1 from public.owner_decisions
    where workspace_id = p_workspace_id and source_lifecycle = p_item->>'sourceLifecycle'
      and source_id = p_item->>'sourceId' and revision_hash = p_item->>'revisionHash') into existed;
  opened := public.open_owner_decision(p_workspace_id, p_item);
  if existed then return opened; end if;
  update public.owner_decisions set opened_by = 'strelva_system'
    where id = (opened->>'id')::uuid and workspace_id = p_workspace_id and opened_by is null
    returning * into row_value;
  if not found then return opened; end if;
  insert into public.strelva_service_actions(workspace_id, purpose, action, session_id, subject)
    values (p_workspace_id, 'needs_you_sync', 'open', p_session_id, 'owner_decision:' || row_value.id::text);
  return public.owner_decision_json(row_value);
end;
$$;

create function public.record_strelva_service_action(
  p_workspace_id uuid, p_session_id uuid, p_action text, p_subject text, p_detail text
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare created uuid;
begin
  if p_action is null or p_action not in ('resume', 'run', 'reconcile', 'rollback')
    or p_subject is null or char_length(p_subject) not between 1 and 300 then
    raise exception 'strelva_service_invalid';
  end if;
  perform public.strelva_service_session(p_workspace_id, p_session_id, 'make_real_resume');
  insert into public.strelva_service_actions(workspace_id, purpose, action, session_id, subject, detail)
    values (p_workspace_id, 'make_real_resume', p_action, p_session_id, p_subject, left(p_detail, 500))
    returning id into created;
  return created;
end;
$$;

-- Every in-progress activation that may continue, whoever started it. The
-- starter comes back only while still a verified owner or admin; otherwise the
-- caller asks strelva_service_reader for the business (and skips the
-- activation when Strelva doesn't run it). Same grace rule as
-- due_make_real_activations.
create function public.due_make_real_activations_for_service(p_limit integer, p_grace_seconds integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_limit is null or p_limit not between 1 and 100 or p_grace_seconds is null or p_grace_seconds < 0 then
    raise exception 'make_real_activation_invalid';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('workspaceId', d.workspace_id, 'activationId', d.activation_id,
      'starterUserId', d.user_id, 'starterEmail', d.email) order by d.updated_at) from (
    select w.workspace_id, w.payload->>'id' as activation_id, u.id as user_id, lower(u.email) as email, w.updated_at
      from public.saved_product_work w
      join public.workspaces b on b.id = w.workspace_id and b.kind = 'customer'
      left join public.workspace_memberships m on m.workspace_id = w.workspace_id and m.user_id = w.created_by and m.role in ('owner','admin')
      left join public.users u on u.id = m.user_id and u.verified_at is not null
      where w.product_id = 'operations' and w.resource_kind = 'activation'
        and w.payload->>'status' = 'in_progress' and w.payload->>'rollbackStartedAt' is null
        and not exists (select 1 from jsonb_array_elements(w.payload->'steps') s
          where s->>'status' = 'running'
            and coalesce((s->>'startedAt')::timestamptz, w.updated_at) > clock_timestamp() - make_interval(secs => p_grace_seconds))
      order by w.updated_at asc limit p_limit) d), '[]'::jsonb);
end;
$$;

-- Connected sites get their own per-workspace row. The full list from
-- 20261008131000 is kept; only `connected_sites` is new.
create or replace function public.workspace_release_flag_names() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['owner_entry', 'inquiries', 'website_rebuild', 'systems',
    'make_real_live:hosted_website', 'make_real_live:tenant_content', 'make_real_live:inquiry_form',
    'make_real_live:booking_page', 'make_real_live:internal_app', 'connected_sites']::text[]
$$;

revoke all on function public.strelva_service_actions_immutable() from public, anon, authenticated;
revoke all on function public.owner_decision_opened_by_guard() from public, anon, authenticated;
revoke all on function public.owner_decision_json(public.owner_decisions) from public, anon, authenticated, service_role;
revoke all on function public.strelva_runs_business(uuid) from public, anon, authenticated, service_role;
revoke all on function public.strelva_service_session(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.strelva_service_reader(uuid, text) from public, anon, authenticated;
revoke all on function public.open_owner_decision_as_service(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.record_strelva_service_action(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.due_make_real_activations_for_service(integer, integer) from public, anon, authenticated;
grant execute on function public.strelva_service_reader(uuid, text) to service_role;
grant execute on function public.open_owner_decision_as_service(uuid, uuid, jsonb) to service_role;
grant execute on function public.record_strelva_service_action(uuid, uuid, text, text, text) to service_role;
grant execute on function public.due_make_real_activations_for_service(integer, integer) to service_role;
