-- Dental intake: installs, immutable numbered Releases, submissions, encrypted sensitive values, RPCs.
-- Depends on 20261005090000 (tenant_leads), 20261008151000 (connected_sites), 20261010124000 (connected_site_id on leads),
-- 20261011120000 (business record facts) and 20261028100600 (insurance_accepted).
-- Every function is security definer and executable by service_role only; the actor checks are inside.
begin;
set local lock_timeout='3s';

create table public.app_intake_installs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  app_id text not null check (app_id in ('dental_intake')),
  status text not null default 'draft' check (status in ('draft','live','paused')),
  draft_config jsonb not null default '{}'::jsonb check (jsonb_typeof(draft_config) = 'object' and octet_length(draft_config::text) <= 8000),
  draft_revision integer not null default 1 check (draft_revision >= 1),
  live_release integer check (live_release is null or live_release >= 1),
  live_requested_at timestamptz,
  live_requested_by uuid references public.users(id),
  last_live_check jsonb check (last_live_check is null or jsonb_typeof(last_live_check) = 'object'),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, app_id)
);

create table public.app_intake_releases (
  install_id uuid not null references public.app_intake_installs(id) on delete cascade,
  number integer not null check (number >= 1),
  definition_version integer not null,
  config jsonb not null,
  draft_revision integer not null,
  owner_decision_id uuid not null unique,
  made_live_by uuid not null references public.users(id),
  made_live_at timestamptz not null default clock_timestamp(),
  primary key (install_id, number)
);

create function public.app_intake_release_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'app_intake_release_immutable'; end $$;
create trigger app_intake_releases_immutable_trg before update on public.app_intake_releases
  for each row execute function public.app_intake_release_immutable();

create table public.app_intake_submissions (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null references public.app_intake_installs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_row_id uuid not null unique references public.tenant_leads(id) on delete cascade,
  release_number integer not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 12000),
  triage text check (triage in ('routine','urgent')),
  state text not null default 'new' check (state in ('new','visit_booked','not_booked')),
  booking_id uuid,
  decision_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index app_intake_submissions_workspace_idx on public.app_intake_submissions(workspace_id, state, created_at desc);

-- Ciphertext only (enc:v1:). Purged 30 days after it is recorded.
create table public.app_intake_sensitive (
  submission_id uuid not null references public.app_intake_submissions(id) on delete cascade,
  field_id text not null check (field_id ~ '^[a-z][a-z0-9_]{0,63}$'),
  ciphertext text not null check (ciphertext like 'enc:v1:%' and char_length(ciphertext) <= 2000),
  purge_after timestamptz not null,
  primary key (submission_id, field_id)
);
create index app_intake_sensitive_purge_idx on public.app_intake_sensitive(purge_after);

create table public.app_intake_sensitive_reads (
  id bigint generated always as identity primary key,
  submission_id uuid not null,
  workspace_id uuid not null,
  user_id uuid not null,
  field_ids text[] not null,
  read_at timestamptz not null default clock_timestamp()
);

alter table public.app_intake_installs enable row level security;
alter table public.app_intake_releases enable row level security;
alter table public.app_intake_submissions enable row level security;
alter table public.app_intake_sensitive enable row level security;
alter table public.app_intake_sensitive_reads enable row level security;
revoke all on public.app_intake_installs, public.app_intake_releases, public.app_intake_submissions,
  public.app_intake_sensitive, public.app_intake_sensitive_reads from public, anon, authenticated, service_role;

-- ---- helpers (no grants) ----
create function public.app_intake_json(i public.app_intake_installs) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', i.id, 'workspaceId', i.workspace_id, 'appId', i.app_id, 'status', i.status,
    'draftConfig', i.draft_config, 'draftRevision', i.draft_revision, 'liveRelease', i.live_release,
    'liveRequestedAt', to_char(i.live_requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'lastLiveCheck', i.last_live_check,
    'updatedAt', to_char(i.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) $$;

create function public.app_intake_assert_writer(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_access text;
begin
  v_access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  if v_access not in ('owner','admin','agency') then raise exception 'workspace_access_denied'; end if;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  return v_access;
end $$;

-- An actual customer membership. A provider seat that projects admin does not count.
create function public.app_intake_assert_customer_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_roles text[]) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  select wm.role into v_role from public.workspace_memberships wm join public.users u on u.id = wm.user_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and u.verified_at is not null
      and lower(u.email) = lower(btrim(coalesce(p_verified_email, ''))) and wm.role = any(p_roles)
    for share of wm, u;
  if v_role is null then raise exception 'workspace_access_denied'; end if;
  return v_role;
end $$;

create function public.app_intake_config_valid(p_config jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_config is not null and jsonb_typeof(p_config) = 'object'
    and not exists (select 1 from jsonb_object_keys(p_config) k where k not in ('bookingServiceId','collectMemberId','pageUrl','formLabel'))
    and (not p_config ? 'bookingServiceId' or jsonb_typeof(p_config->'bookingServiceId') in ('string','null'))
    and (not p_config ? 'collectMemberId' or jsonb_typeof(p_config->'collectMemberId') = 'boolean')
    and (not p_config ? 'pageUrl' or jsonb_typeof(p_config->'pageUrl') in ('string','null'))
    and (not p_config ? 'formLabel' or jsonb_typeof(p_config->'formLabel') = 'string') $$;

revoke all on function public.app_intake_release_immutable(), public.app_intake_json(public.app_intake_installs),
  public.app_intake_assert_writer(uuid, uuid, text), public.app_intake_assert_customer_role(uuid, uuid, text, text[]),
  public.app_intake_config_valid(jsonb) from public, anon, authenticated, service_role;

-- ---- member RPCs ----
create function public.read_app_intake(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_app_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_access text; v_install public.app_intake_installs;
begin
  v_access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  select * into v_install from public.app_intake_installs where workspace_id = p_workspace_id and app_id = p_app_id;
  return jsonb_build_object('access', v_access,
    'install', case when v_install.id is null then null else public.app_intake_json(v_install) end,
    'releases', coalesce((select jsonb_agg(jsonb_build_object('number', r.number, 'definitionVersion', r.definition_version, 'config', r.config,
        'madeLiveAt', to_char(r.made_live_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'madeLiveBy', r.made_live_by) order by r.number desc)
      from public.app_intake_releases r where r.install_id = v_install.id), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(item order by item->>'createdAt' desc, item->>'id' desc) from (
        select jsonb_build_object('id', s.id, 'leadRowId', s.lead_row_id, 'name', l.name, 'email', l.email, 'phone', l.fields->>'phone',
          'answers', s.answers, 'triage', s.triage, 'state', s.state, 'bookingId', s.booking_id,
          'createdAt', to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'hasSensitive', exists (select 1 from public.app_intake_sensitive x where x.submission_id = s.id)) as item
        from public.app_intake_submissions s join public.tenant_leads l on l.id = s.lead_row_id
        where s.install_id = v_install.id order by s.created_at desc, s.id desc limit 20) page), '[]'::jsonb));
end $$;

create function public.save_app_intake_draft(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_app_id text, p_config jsonb, p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_install public.app_intake_installs;
begin
  perform public.app_intake_assert_writer(p_workspace_id, p_user_id, p_verified_email);
  if p_app_id is distinct from 'dental_intake' or not public.app_intake_config_valid(p_config) or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'app_intake_invalid';
  end if;
  select * into v_install from public.app_intake_installs where workspace_id = p_workspace_id and app_id = p_app_id for update;
  if v_install.id is null then
    if p_expected_revision <> 0 then raise exception 'app_intake_conflict'; end if;
    insert into public.app_intake_installs(workspace_id, app_id, draft_config, created_by)
      values (p_workspace_id, p_app_id, p_config, p_user_id) returning * into v_install;
    return public.app_intake_json(v_install);
  end if;
  if v_install.draft_revision <> p_expected_revision then raise exception 'app_intake_conflict'; end if;
  update public.app_intake_installs set draft_config = p_config, draft_revision = draft_revision + 1,
    live_requested_at = null, live_requested_by = null, updated_at = clock_timestamp()
    where id = v_install.id returning * into v_install;
  return public.app_intake_json(v_install);
end $$;

create function public.request_app_intake_live(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_app_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_install public.app_intake_installs;
begin
  perform public.app_intake_assert_writer(p_workspace_id, p_user_id, p_verified_email);
  update public.app_intake_installs set live_requested_at = clock_timestamp(), live_requested_by = p_user_id, updated_at = clock_timestamp()
    where workspace_id = p_workspace_id and app_id = p_app_id returning * into v_install;
  if v_install.id is null then raise exception 'app_intake_not_found'; end if;
  return public.app_intake_json(v_install);
end $$;

create function public.pause_app_intake(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_app_id text, p_paused boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_install public.app_intake_installs;
begin
  perform public.app_intake_assert_writer(p_workspace_id, p_user_id, p_verified_email);
  select * into v_install from public.app_intake_installs where workspace_id = p_workspace_id and app_id = p_app_id for update;
  if v_install.id is null then raise exception 'app_intake_not_found'; end if;
  if p_paused then
    update public.app_intake_installs set status = 'paused', updated_at = clock_timestamp() where id = v_install.id returning * into v_install;
  else
    if v_install.live_release is null then raise exception 'app_intake_never_live'; end if;
    update public.app_intake_installs set status = 'live', updated_at = clock_timestamp() where id = v_install.id returning * into v_install;
  end if;
  return public.app_intake_json(v_install);
end $$;

create function public.read_app_intake_sensitive(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_submission_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb; v_fields text[];
begin
  perform public.app_intake_assert_customer_role(p_workspace_id, p_user_id, p_verified_email, array['owner','admin']);
  perform 1 from public.app_intake_submissions where id = p_submission_id and workspace_id = p_workspace_id;
  if not found then raise exception 'app_intake_not_found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('fieldId', x.field_id, 'ciphertext', x.ciphertext) order by x.field_id), '[]'::jsonb),
    coalesce(array_agg(x.field_id order by x.field_id), array[]::text[])
    into v_result, v_fields from public.app_intake_sensitive x where x.submission_id = p_submission_id and x.purge_after > clock_timestamp();
  insert into public.app_intake_sensitive_reads(submission_id, workspace_id, user_id, field_ids) values (p_submission_id, p_workspace_id, p_user_id, v_fields);
  return v_result;
end $$;

-- ---- service RPCs (the caller has already decided who may; see the Needs you adapter) ----
create function public.make_app_intake_live(p_workspace_id uuid, p_install_id uuid, p_draft_revision integer, p_owner_decision_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_install public.app_intake_installs; v_release public.app_intake_releases; v_number integer;
begin
  perform public.app_intake_assert_customer_role(p_workspace_id, p_user_id, p_verified_email, array['owner']);
  select * into v_install from public.app_intake_installs where id = p_install_id and workspace_id = p_workspace_id for update;
  if v_install.id is null then raise exception 'app_intake_not_found'; end if;
  select * into v_release from public.app_intake_releases where owner_decision_id = p_owner_decision_id;
  if found then
    if v_release.install_id <> v_install.id then raise exception 'app_intake_conflict'; end if;
    return jsonb_build_object('install', public.app_intake_json(v_install), 'release', v_release.number);
  end if;
  if v_install.live_requested_at is null or v_install.draft_revision <> p_draft_revision then raise exception 'app_intake_conflict'; end if;
  select coalesce(max(number), 0) + 1 into v_number from public.app_intake_releases where install_id = v_install.id;
  insert into public.app_intake_releases(install_id, number, definition_version, config, draft_revision, owner_decision_id, made_live_by)
    values (v_install.id, v_number, 1, v_install.draft_config, v_install.draft_revision, p_owner_decision_id, p_user_id);
  update public.app_intake_installs set status = 'live', live_release = v_number, live_requested_at = null, updated_at = clock_timestamp()
    where id = v_install.id returning * into v_install;
  return jsonb_build_object('install', public.app_intake_json(v_install), 'release', v_number);
end $$;

create function public.withdraw_app_intake_live_request(p_workspace_id uuid, p_install_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.app_intake_installs set live_requested_at = null, live_requested_by = null, updated_at = clock_timestamp()
    where id = p_install_id and workspace_id = p_workspace_id and live_requested_at is not null;
end $$;

create function public.list_app_intake_live_requests(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object(
    'facts', coalesce(public.business_confirmed_public_facts(p_workspace_id)->'facts', '{}'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('installId', i.id, 'appId', i.app_id, 'draftRevision', i.draft_revision,
        'draftConfig', i.draft_config, 'liveRelease', i.live_release,
        'requestedAt', to_char(i.live_requested_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by i.live_requested_at)
      from public.app_intake_installs i where i.workspace_id = p_workspace_id and i.live_requested_at is not null), '[]'::jsonb));
end $$;

create function public.record_app_intake_live_check(p_install_id uuid, p_check jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_check is null or jsonb_typeof(p_check) <> 'object' or octet_length(p_check::text) > 2000 then raise exception 'app_intake_invalid'; end if;
  update public.app_intake_installs set last_live_check = p_check, updated_at = clock_timestamp() where id = p_install_id;
end $$;

create function public.resolve_public_app_intake(p_public_key text, p_app_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites; v_install public.app_intake_installs; v_release public.app_intake_releases;
begin
  select * into v_site from public.connected_sites where public_key = p_public_key and status = 'active' and verified_at is not null;
  if v_site.id is null then return null; end if;
  select * into v_install from public.app_intake_installs where workspace_id = v_site.business_workspace_id and app_id = p_app_id and status = 'live';
  if v_install.id is null then return null; end if;
  select * into v_release from public.app_intake_releases where install_id = v_install.id and number = v_install.live_release;
  if v_release.install_id is null then return null; end if;
  return jsonb_build_object('installId', v_install.id, 'workspaceId', v_install.workspace_id, 'release', v_release.number,
    'config', v_release.config, 'definitionVersion', v_release.definition_version);
end $$;

create function public.record_app_intake_submission(p_public_key text, p_origin text, p_app_id text, p_lead_row_id uuid, p_answers jsonb, p_triage text, p_sensitive jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites; v_install public.app_intake_installs; v_release public.app_intake_releases; v_id uuid; v_item jsonb;
begin
  v_site := public.connected_site_for_write(p_public_key, p_origin);
  select * into v_install from public.app_intake_installs where workspace_id = v_site.business_workspace_id and app_id = p_app_id and status = 'live';
  if v_install.id is null then raise exception 'app_intake_unavailable'; end if;
  select * into v_release from public.app_intake_releases where install_id = v_install.id and number = v_install.live_release;
  if v_release.install_id is null then raise exception 'app_intake_unavailable'; end if;
  perform 1 from public.tenant_leads where id = p_lead_row_id and connected_site_id = v_site.id;
  if not found then raise exception 'connected_site_invalid'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 12000
    or p_triage not in ('routine','urgent')
    or p_sensitive is null or jsonb_typeof(p_sensitive) <> 'array' or jsonb_array_length(p_sensitive) > 3 then
    raise exception 'connected_site_invalid';
  end if;
  if jsonb_array_length(p_sensitive) > 0 and coalesce(v_release.config->>'collectMemberId', 'false') <> 'true' then
    raise exception 'app_intake_unavailable';
  end if;
  select id into v_id from public.app_intake_submissions where lead_row_id = p_lead_row_id;
  if v_id is not null then return jsonb_build_object('status', 'exists', 'id', v_id); end if;
  insert into public.app_intake_submissions(install_id, workspace_id, lead_row_id, release_number, answers, triage)
    values (v_install.id, v_install.workspace_id, p_lead_row_id, v_release.number, p_answers, p_triage) returning id into v_id;
  for v_item in select value from jsonb_array_elements(p_sensitive) loop
    insert into public.app_intake_sensitive(submission_id, field_id, ciphertext, purge_after)
      values (v_id, v_item->>'fieldId', v_item->>'ciphertext', clock_timestamp() + interval '30 days');
  end loop;
  return jsonb_build_object('status', 'recorded', 'id', v_id, 'workspaceId', v_install.workspace_id, 'installId', v_install.id, 'release', v_release.number);
exception when check_violation or not_null_violation then
  raise exception 'connected_site_invalid';
end $$;

create function public.app_intake_visit_json(s public.app_intake_submissions, l public.tenant_leads, r public.app_intake_releases) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('submissionId', s.id, 'name', l.name, 'email', l.email, 'phone', l.fields->>'phone', 'answers', s.answers,
    'triage', s.triage, 'state', s.state, 'bookingId', s.booking_id,
    'createdAt', to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'bookingServiceId', r.config->>'bookingServiceId') $$;

create function public.list_open_app_intake_visits(p_workspace_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object(
    'facts', coalesce(public.business_confirmed_public_facts(p_workspace_id)->'facts', '{}'::jsonb),
    'visits', coalesce((select jsonb_agg(public.app_intake_visit_json(s, l, r) order by s.created_at, s.id) from (
        select x.* from public.app_intake_submissions x join public.app_intake_installs i on i.id = x.install_id
          where x.workspace_id = p_workspace_id and x.state = 'new' and i.status = 'live' order by x.created_at, x.id limit 50) s
      join public.tenant_leads l on l.id = s.lead_row_id
      join public.app_intake_releases r on r.install_id = s.install_id and r.number = s.release_number), '[]'::jsonb));
end $$;

create function public.read_app_intake_visit(p_workspace_id uuid, p_submission_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.app_intake_submissions; v_l public.tenant_leads; v_r public.app_intake_releases;
begin
  select * into v_s from public.app_intake_submissions where id = p_submission_id and workspace_id = p_workspace_id;
  if v_s.id is null then return null; end if;
  select * into v_l from public.tenant_leads where id = v_s.lead_row_id;
  select * into v_r from public.app_intake_releases where install_id = v_s.install_id and number = v_s.release_number;
  return public.app_intake_visit_json(v_s, v_l, v_r)
    || jsonb_build_object('facts', coalesce(public.business_confirmed_public_facts(p_workspace_id)->'facts', '{}'::jsonb));
end $$;

create function public.decide_app_intake_visit(p_workspace_id uuid, p_submission_id uuid, p_state text, p_booking_id uuid, p_decision_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.app_intake_submissions;
begin
  if p_state not in ('visit_booked','not_booked') then raise exception 'app_intake_invalid'; end if;
  select * into v_s from public.app_intake_submissions where id = p_submission_id and workspace_id = p_workspace_id for update;
  if v_s.id is null then raise exception 'app_intake_not_found'; end if;
  if v_s.state = p_state and v_s.decision_id is not distinct from p_decision_id then
    return jsonb_build_object('submissionId', v_s.id, 'state', v_s.state, 'bookingId', v_s.booking_id);
  end if;
  if v_s.state <> 'new' then raise exception 'app_intake_conflict'; end if;
  update public.app_intake_submissions set state = p_state, booking_id = case when p_state = 'visit_booked' then p_booking_id else null end,
    decision_id = p_decision_id, updated_at = clock_timestamp() where id = v_s.id returning * into v_s;
  return jsonb_build_object('submissionId', v_s.id, 'state', v_s.state, 'bookingId', v_s.booking_id);
end $$;

create function public.purge_app_intake_sensitive(p_limit integer) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  with doomed as (
    select submission_id, field_id from public.app_intake_sensitive where purge_after <= clock_timestamp()
    order by purge_after limit least(greatest(coalesce(p_limit, 1), 1), 5000) for update skip locked)
  delete from public.app_intake_sensitive x using doomed d where x.submission_id = d.submission_id and x.field_id = d.field_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.app_intake_visit_json(public.app_intake_submissions, public.tenant_leads, public.app_intake_releases) from public, anon, authenticated, service_role;
revoke all on function
  public.read_app_intake(uuid, uuid, text, text), public.save_app_intake_draft(uuid, uuid, text, text, jsonb, integer),
  public.request_app_intake_live(uuid, uuid, text, text), public.pause_app_intake(uuid, uuid, text, text, boolean),
  public.read_app_intake_sensitive(uuid, uuid, text, uuid), public.make_app_intake_live(uuid, uuid, integer, uuid, uuid, text),
  public.withdraw_app_intake_live_request(uuid, uuid), public.list_app_intake_live_requests(uuid),
  public.record_app_intake_live_check(uuid, jsonb), public.resolve_public_app_intake(text, text),
  public.record_app_intake_submission(text, text, text, uuid, jsonb, text, jsonb), public.list_open_app_intake_visits(uuid),
  public.read_app_intake_visit(uuid, uuid), public.decide_app_intake_visit(uuid, uuid, text, uuid, uuid),
  public.purge_app_intake_sensitive(integer) from public, anon, authenticated, service_role;
grant execute on function
  public.read_app_intake(uuid, uuid, text, text), public.save_app_intake_draft(uuid, uuid, text, text, jsonb, integer),
  public.request_app_intake_live(uuid, uuid, text, text), public.pause_app_intake(uuid, uuid, text, text, boolean),
  public.read_app_intake_sensitive(uuid, uuid, text, uuid), public.make_app_intake_live(uuid, uuid, integer, uuid, uuid, text),
  public.withdraw_app_intake_live_request(uuid, uuid), public.list_app_intake_live_requests(uuid),
  public.record_app_intake_live_check(uuid, jsonb), public.resolve_public_app_intake(text, text),
  public.record_app_intake_submission(text, text, text, uuid, jsonb, text, jsonb), public.list_open_app_intake_visits(uuid),
  public.read_app_intake_visit(uuid, uuid), public.decide_app_intake_visit(uuid, uuid, text, uuid, uuid),
  public.purge_app_intake_sensitive(integer) to service_role;

commit;
