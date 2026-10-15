-- Care plan reports: an agency's monthly proof-of-work report for each client.
-- Every number is read from records Strelva holds (numbered Releases and their
-- read-backs, accepted Requests, inquiries and bookings, hosted-site health,
-- assistant runs, minutes the agency recorded). Nothing here sends email or
-- calls a provider; callers are flag-gated (care_reports). Published Releases
-- of a report are append-only. Agency time is recorded here because
-- business_effort is super-admin only (ADR 0009).
begin;
set local lock_timeout='3s';

-- A. Flag name: append this stream's key to the current list.
do $migration$
declare previous text[];
begin
  previous := public.workspace_release_flag_names();
  select array_agg(distinct key order by key) into previous from unnest(previous || array['care_reports']) key;
  execute format('create or replace function public.workspace_release_flag_names() returns text[] language sql immutable set search_path = public, pg_temp as %L',
    format('select %L::text[]', previous::text));
end;
$migration$;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;

-- B. Tables.
create table public.care_reports (
  id uuid primary key default gen_random_uuid(),
  agency_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date and month >= date '2026-01-01'),
  draft jsonb not null check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 200000),
  agency_note text check (agency_note is null or char_length(btrim(agency_note)) between 1 and 2000),
  revision integer not null default 1 check (revision > 0),
  generated_by uuid not null references public.users(id) on delete restrict,
  generated_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  unique (agency_workspace_id, business_workspace_id, month),
  check (agency_workspace_id <> business_workspace_id)
);
create index care_reports_business_idx on public.care_reports(business_workspace_id, month desc);

create table public.care_report_releases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.care_reports(id) on delete cascade,
  number integer not null check (number > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 210000),
  published_by uuid not null references public.users(id) on delete restrict,
  published_at timestamptz not null default clock_timestamp(),
  unique (report_id, number)
);

create table public.care_report_share_links (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.care_reports(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index care_report_share_links_one_open on public.care_report_share_links(report_id) where revoked_at is null;

create table public.care_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.care_report_releases(id) on delete cascade,
  channel text not null check (channel = 'email'),
  status text not null check (status in ('reserved','accepted','suppressed','unknown')),
  reason text check (reason is null or reason ~ '^[a-z_]{1,80}$'),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) between 1 and 200),
  token uuid,
  recorded_by uuid not null references public.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  settled_at timestamptz,
  check ((status = 'reserved') = (settled_at is null))
);
-- A shared Release is emailed at most once; held (suppressed) attempts may repeat.
create unique index care_report_deliveries_once on public.care_report_deliveries(release_id) where status in ('reserved','accepted','unknown');

create table public.agency_client_time_entries (
  id uuid primary key,
  agency_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  minutes integer not null check (minutes between 1 and 1440),
  category text not null check (category in ('delivery','change','review','support','recovery','sales','other')),
  occurred_on date not null check (occurred_on >= date '2020-01-01'),
  note text check (note is null or char_length(btrim(note)) between 1 and 280),
  recorded_by uuid not null references public.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp()
);
create index agency_client_time_entries_idx on public.agency_client_time_entries(agency_workspace_id, business_workspace_id, occurred_on desc);

create table public.agency_client_time_voids (
  entry_id uuid primary key references public.agency_client_time_entries(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 280),
  voided_by uuid not null references public.users(id) on delete restrict,
  voided_at timestamptz not null default clock_timestamp()
);

do $$ declare t text; begin
  foreach t in array array['care_reports','care_report_releases','care_report_share_links','care_report_deliveries','agency_client_time_entries','agency_client_time_voids'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
  end loop;
end $$;

-- Rows never change. Direct deletes are refused; deleting the business workspace
-- still cascades (the cascade runs inside the foreign-key trigger).
create function public.care_report_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' or pg_trigger_depth() <= 1 then
    raise exception 'care_report_append_only';
  end if;
  return old;
end;
$$;
create trigger care_report_releases_append_only before update or delete on public.care_report_releases
  for each row execute function public.care_report_append_only();
create trigger agency_client_time_entries_append_only before update or delete on public.agency_client_time_entries
  for each row execute function public.care_report_append_only();
create trigger agency_client_time_voids_append_only before update or delete on public.agency_client_time_voids
  for each row execute function public.care_report_append_only();

-- C. Internal helpers: no caller but the RPCs below.
create function public.care_report_ts(p text) returns timestamptz
language plpgsql volatile set search_path = public, pg_temp as $$
begin return p::timestamptz; exception when others then return null; end;
$$;

create function public.care_report_agency_role(p_agency uuid, p_user uuid, p_email text) returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare member_role text;
begin
  select m.role into member_role from public.users u
    join public.workspace_memberships m on m.user_id = u.id and m.workspace_id = p_agency
    join public.workspaces a on a.id = m.workspace_id and a.kind = 'agency'
    where u.id = p_user and lower(u.email) = lower(btrim(coalesce(p_email, ''))) and u.verified_at is not null;
  if member_role is null then raise exception 'workspace_access_denied'; end if;
  return member_role;
end;
$$;

create function public.care_report_clients(p_agency uuid, p_user uuid, p_email text)
returns table(workspace_id uuid, name text, can_write boolean, tenant_ids text[])
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare member_role text;
begin
  member_role := public.care_report_agency_role(p_agency, p_user, p_email);
  return query
    select w.id, w.name, member_role in ('owner','admin'),
      coalesce((select array_agg(t.id order by t.id) from public.tenant_workspace_links l
        join public.tenants t on t.stable_id = l.tenant_stable_id where l.workspace_id = w.id), array[]::text[])
    from public.provider_seats s
    join public.workspaces w on w.id = s.customer_workspace_id and w.kind = 'customer'
    where s.agency_workspace_id = p_agency and s.status = 'active'
      and not public.workspace_exit_completed(w.id)
      and (member_role in ('owner','admin') or exists (
        select 1 from public.agency_client_staff st
        where st.agency_workspace_id = p_agency and st.customer_workspace_id = w.id
          and st.user_id = p_user and st.status = 'active'))
    order by w.name, w.id;
end;
$$;

create function public.care_report_facts(p_agency uuid, p_workspace uuid, p_month date, p_site_checks jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_from timestamptz := p_month::timestamp at time zone 'UTC';
  v_to timestamptz := (p_month + interval '1 month')::timestamp at time zone 'UTC';
  v_through timestamptz;
  v_checks jsonb := coalesce(p_site_checks, '[]'::jsonb);
  v_item jsonb;
  v_keys text[];
  c_items jsonb; c_total integer; c_confirmed integer; c_notconf integer; c_notchk integer;
  r_done jsonb; r_done_count integer; r_open integer; r_asked integer;
  v_actor record; v_outcome jsonb; v_month_outcome jsonb;
  s_hosted jsonb; s_readbacks jsonb;
  u_usage jsonb; t_time jsonb;
  v_business text; v_agency text;
begin
  v_through := least(v_to, clock_timestamp());
  if jsonb_typeof(v_checks) = 'null' then v_checks := '[]'::jsonb; end if;

  -- Site checks the caller read from its stored domain snapshot.
  if jsonb_typeof(v_checks) <> 'array' or jsonb_array_length(v_checks) > 10 then raise exception 'care_report_invalid'; end if;
  for v_item in select value from jsonb_array_elements(v_checks) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'care_report_invalid'; end if;
    select array_agg(k order by k) into v_keys from jsonb_object_keys(v_item) k;
    if v_keys is distinct from array['checkedAt','host','state']
      or jsonb_typeof(v_item->'host') <> 'string' or char_length(v_item->>'host') not between 1 and 253
      or jsonb_typeof(v_item->'state') <> 'string' or (v_item->>'state') not in ('up','down','parked','unreachable','unknown')
      or jsonb_typeof(v_item->'checkedAt') <> 'string' or public.care_report_ts(v_item->>'checkedAt') is null then
      raise exception 'care_report_invalid';
    end if;
  end loop;

  select w.name into v_business from public.workspaces w where w.id = p_workspace;
  select w.name into v_agency from public.workspaces w where w.id = p_agency;

  -- Changes: numbered Releases on this business's Systems this month.
  with base as (
    select r.system_id, s.name as system_name, s.kind as system_kind, r.number, r.summary, r.created_at,
      r.implementation->>'kind' as impl_kind, coalesce(r.implementation->>'ref', '') as ref
    from public.system_revisions r
    join public.systems s on s.id = r.system_id and s.business_workspace_id = p_workspace
    where r.business_workspace_id = p_workspace and r.created_at >= v_from and r.created_at < v_through
      and coalesce(r.implementation->>'ref', '') not like '%@initial'
      and coalesce(r.summary, '') not in ('Adopted website implementation.', 'Recorded the website implementation kind.', 'Adopted at conversion.')
  ), checked as (
    select b.*,
      case
        when b.ref like 'deploy:%' then coalesce((
          select case w.read_back when 'confirmed' then 'confirmed' when 'not_confirmed' then 'not_confirmed' else 'not_checked' end
          from public.website_change_receipts w
          where w.workspace_id = p_workspace and w.kind = 'deployed' and w.id::text = split_part(substr(b.ref, 8), '@', 1)), 'not_checked')
        when b.ref like 'code:%' then coalesce((
          select case c.read_back when 'confirmed' then 'confirmed' when 'not_confirmed' then 'not_confirmed' else 'not_checked' end
          from public.website_code_releases c
          where c.workspace_id = p_workspace and c.id::text = split_part(substr(b.ref, 6), '@', 1)), 'not_checked')
        when b.impl_kind = 'website_document' and split_part(b.ref, '@', 2) ~ '^[0-9]{1,9}$' then
          case
            when exists (select 1 from public.website_document_health h
              where h.workspace_id = p_workspace and h.website_work_id::text = split_part(b.ref, '@', 1)
                and h.revision::text = split_part(b.ref, '@', 2) and h.checked_at >= b.created_at and h.status = 'healthy') then 'confirmed'
            when exists (select 1 from public.website_document_health h
              where h.workspace_id = p_workspace and h.website_work_id::text = split_part(b.ref, '@', 1)
                and h.revision::text = split_part(b.ref, '@', 2) and h.checked_at >= b.created_at) then 'not_confirmed'
            else 'not_checked'
          end
        else 'not_checked'
      end as chk,
      case
        when b.ref like 'deploy:%' then 'website_deploy'
        when b.ref like 'cutover-undo:%' then 'website_restore'
        when b.ref like 'code:%' then 'website_code'
        when b.impl_kind = 'website_document' then 'website_document'
        when b.system_kind = 'website' then 'website_content'
        else 'system'
      end as src
    from base b
  ), ranked as (
    select c.*, row_number() over (order by c.created_at, c.number, c.system_id) as rn from checked c
  )
  select coalesce(jsonb_agg(jsonb_build_object('systemId', q.system_id, 'systemName', q.system_name, 'systemKind', q.system_kind,
      'release', q.number, 'summary', q.summary, 'at', q.created_at, 'check', q.chk, 'source', q.src) order by q.rn) filter (where q.rn <= 100), '[]'::jsonb),
    count(*), count(*) filter (where q.chk = 'confirmed'), count(*) filter (where q.chk = 'not_confirmed'), count(*) filter (where q.chk = 'not_checked')
  into c_items, c_total, c_confirmed, c_notconf, c_notchk
  from ranked q;

  -- Requests this agency delivered for this business.
  with q as (
    select sr.id, sr.request_text, sr.delivery_commitment, sr.context
    from public.service_requests sr
    where sr.business_workspace_id = p_workspace and sr.provider_kind = 'agency'
      and sr.provider_agency_workspace_id = p_agency and sr.status <> 'draft'
  ), accepted as (
    select q.id, q.request_text, public.care_report_ts(q.delivery_commitment->>'customerAcceptedAt') as done_at, 'delivery'::text as kind
    from q where q.delivery_commitment->>'status' = 'accepted'
  ), deployed as (
    select q.id, q.request_text, max(w.recorded_at) as done_at, 'website_change'::text as kind
    from q join public.website_change_receipts w on w.request_id = q.id and w.workspace_id = p_workspace
      and w.kind = 'deployed' and w.read_back = 'confirmed' and w.recorded_at >= v_from and w.recorded_at < v_through
    where q.context->>'source' = 'website_change'
    group by q.id, q.request_text
  ), finished as (
    select distinct on (d.id) d.id, d.request_text, d.done_at, d.kind
    from (select * from accepted union all select * from deployed) d
    where d.done_at >= v_from and d.done_at < v_through
    order by d.id, d.kind
  ), ranked as (
    select d.*, row_number() over (order by d.done_at, d.id) as rn from finished d
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'request', left(x.request_text, 200), 'doneAt', x.done_at, 'kind', x.kind) order by x.rn) filter (where x.rn <= 50), '[]'::jsonb),
    count(*)
  into r_done, r_done_count
  from ranked x;

  select count(*) into r_open from public.service_requests sr
    where sr.business_workspace_id = p_workspace and sr.provider_kind = 'agency'
      and sr.provider_agency_workspace_id = p_agency and sr.status = 'requested'
      and sr.provider_acceptance <> 'declined'
      and coalesce(sr.delivery_commitment->>'status', '') not in ('accepted', 'cancelled')
      and not exists (select 1 from public.website_change_receipts w
        where w.request_id = sr.id and w.workspace_id = p_workspace and w.kind = 'deployed' and w.read_back = 'confirmed');
  select count(*) into r_asked from public.service_requests sr
    where sr.business_workspace_id = p_workspace and sr.provider_kind = 'agency'
      and sr.provider_agency_workspace_id = p_agency and sr.status <> 'draft'
      and sr.created_at >= v_from and sr.created_at < v_through;

  -- Outcomes: the same month the business sees, read as its first verified member.
  select u.id, u.email into v_actor from public.workspace_memberships m join public.users u on u.id = m.user_id
    where m.workspace_id = p_workspace and u.verified_at is not null order by m.created_at, u.id limit 1;
  if not found then
    v_outcome := jsonb_build_object('available', false, 'reason', 'no_member');
  else
    begin
      v_month_outcome := public.business_outcome_month(p_workspace, v_actor.id, v_actor.email, p_month);
      v_outcome := jsonb_build_object('available', true, 'month', v_month_outcome);
    exception when others then
      v_outcome := jsonb_build_object('available', false, 'reason', 'read_failed');
    end;
  end if;

  -- Site checks: recorded evidence only.
  select jsonb_build_object('checks', count(*), 'healthy', count(*) filter (where h.status = 'healthy'), 'lastCheckedAt', max(h.checked_at))
    into s_hosted from public.website_document_health h
    where h.workspace_id = p_workspace and h.checked_at >= v_from and h.checked_at < v_through;
  select jsonb_build_object('confirmed', count(*) filter (where w.read_back = 'confirmed'),
      'notConfirmed', count(*) filter (where w.read_back = 'not_confirmed'),
      'notChecked', count(*) filter (where w.read_back = 'not_checked'))
    into s_readbacks from public.website_change_receipts w
    where w.workspace_id = p_workspace and w.kind = 'deployed' and w.recorded_at >= v_from and w.recorded_at < v_through;

  -- Assistant runs: a count, never a cost.
  select jsonb_build_object('calls', coalesce(sum(n), 0)::integer,
      'byPurpose', coalesce(jsonb_object_agg(purpose, n), '{}'::jsonb))
    into u_usage from (
      select m.purpose, count(*)::integer as n from public.model_call_log m
      where m.workspace_id = p_workspace and m.called_at >= v_from and m.called_at < v_through group by m.purpose) p;

  -- Minutes the agency recorded, voided entries excluded.
  select jsonb_build_object('minutes', coalesce(sum(n), 0)::integer, 'entries', coalesce(sum(e), 0)::integer,
      'byCategory', coalesce(jsonb_object_agg(category, n), '{}'::jsonb))
    into t_time from (
      select t.category, sum(t.minutes)::integer as n, count(*)::integer as e from public.agency_client_time_entries t
      where t.agency_workspace_id = p_agency and t.business_workspace_id = p_workspace
        and t.occurred_on >= p_month and t.occurred_on < (p_month + interval '1 month')::date
        and not exists (select 1 from public.agency_client_time_voids v where v.entry_id = t.id)
      group by t.category) p;

  return jsonb_build_object(
    'version', 1, 'month', to_char(p_month, 'YYYY-MM'), 'from', v_from, 'through', v_through, 'generatedAt', clock_timestamp(),
    'business', jsonb_build_object('workspaceId', p_workspace, 'name', v_business),
    'agency', jsonb_build_object('workspaceId', p_agency, 'name', v_agency),
    'changes', jsonb_build_object('total', c_total, 'confirmed', c_confirmed, 'notConfirmed', c_notconf, 'notChecked', c_notchk, 'items', c_items),
    'requests', jsonb_build_object('doneCount', r_done_count, 'openCount', r_open, 'askedCount', r_asked, 'done', r_done),
    'outcomes', v_outcome,
    'siteChecks', jsonb_build_object('hosted', s_hosted, 'readBacks', s_readbacks, 'latest', v_checks),
    'usage', u_usage,
    'time', t_time);
end;
$$;

-- D. Service RPCs.
create function public.generate_care_reports(p_agency uuid, p_user uuid, p_email text, p_month date, p_workspace_ids uuid[], p_site_checks jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare ws uuid; facts jsonb; rep record; reports jsonb := '[]'::jsonb; skipped jsonb := '[]'::jsonb;
begin
  if p_month is null or p_month <> date_trunc('month', p_month)::date or p_month < date '2026-01-01'
    or p_month > date_trunc('month', now())::date
    or p_workspace_ids is null or cardinality(p_workspace_ids) not between 1 and 200
    or (p_site_checks is not null and jsonb_typeof(p_site_checks) <> 'object') then
    raise exception 'care_report_invalid';
  end if;
  perform public.care_report_agency_role(p_agency, p_user, p_email);
  for ws in select distinct x from unnest(p_workspace_ids) x loop
    begin
      perform public.agency_ai_controls_scope(p_agency, ws, p_user, p_email, true);
    exception when others then
      skipped := skipped || jsonb_build_array(jsonb_build_object('workspaceId', ws, 'reason', 'not_allowed'));
      continue;
    end;
    begin
      facts := public.care_report_facts(p_agency, ws, p_month, case when p_site_checks is null then null else p_site_checks->(ws::text) end);
      insert into public.care_reports(agency_workspace_id, business_workspace_id, month, draft, generated_by, updated_by)
        values (p_agency, ws, p_month, facts, p_user, p_user)
        on conflict (agency_workspace_id, business_workspace_id, month) do update set
          draft = excluded.draft, revision = public.care_reports.revision + 1, generated_by = excluded.generated_by,
          generated_at = clock_timestamp(), updated_by = excluded.updated_by, updated_at = clock_timestamp()
        returning id, revision into rep;
      reports := reports || jsonb_build_array(jsonb_build_object('reportId', rep.id, 'workspaceId', ws, 'revision', rep.revision));
    exception when others then
      skipped := skipped || jsonb_build_array(jsonb_build_object('workspaceId', ws, 'reason', 'failed'));
    end;
  end loop;
  return jsonb_build_object('reports', reports, 'skipped', skipped);
end;
$$;

create function public.list_care_reports(p_agency uuid, p_user uuid, p_email text, p_month date)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_role text; v_from timestamptz; v_to timestamptz; v_through timestamptz; c record; rep record; rel record; del record;
  v_report jsonb; v_released integer; v_verified integer; clients jsonb := '[]'::jsonb;
begin
  if p_month is null or p_month <> date_trunc('month', p_month)::date or p_month < date '2026-01-01'
    or p_month > date_trunc('month', now())::date then
    raise exception 'care_report_invalid';
  end if;
  v_role := public.care_report_agency_role(p_agency, p_user, p_email);
  v_from := p_month::timestamp at time zone 'UTC';
  v_to := (p_month + interval '1 month')::timestamp at time zone 'UTC';
  v_through := least(v_to, clock_timestamp());
  for c in select * from public.care_report_clients(p_agency, p_user, p_email) loop
    v_report := null;
    select r.id, r.revision, r.generated_at into rep from public.care_reports r
      where r.agency_workspace_id = p_agency and r.business_workspace_id = c.workspace_id and r.month = p_month;
    if found then
      select l.number, l.published_at, l.id into rel from public.care_report_releases l where l.report_id = rep.id order by l.number desc limit 1;
      select d.status, d.reason, d.recorded_at into del from public.care_report_deliveries d
        join public.care_report_releases l on l.id = d.release_id where l.report_id = rep.id order by d.recorded_at desc, d.id limit 1;
      v_report := jsonb_build_object('id', rep.id, 'revision', rep.revision, 'generatedAt', rep.generated_at,
        'latestRelease', case when rel.number is null then null else jsonb_build_object('number', rel.number, 'publishedAt', rel.published_at) end,
        'lastDelivery', case when del.status is null then null else jsonb_build_object('status', del.status, 'reason', del.reason, 'recordedAt', del.recorded_at) end);
    end if;
    select count(*) into v_released from public.system_revisions r
      where r.business_workspace_id = c.workspace_id and r.created_at >= v_from and r.created_at < v_through
        and coalesce(r.implementation->>'ref', '') not like '%@initial'
        and coalesce(r.summary, '') not in ('Adopted website implementation.', 'Recorded the website implementation kind.', 'Adopted at conversion.');
    select
      (select count(*) from public.website_change_receipts w where w.workspace_id = c.workspace_id and w.kind = 'deployed'
        and w.read_back = 'confirmed' and w.recorded_at >= v_from and w.recorded_at < v_through)
      + (select count(*) from public.website_code_releases k where k.workspace_id = c.workspace_id
        and k.read_back = 'confirmed' and k.recorded_at >= v_from and k.recorded_at < v_through)
      + (select count(*) from (select distinct h.website_work_id, h.revision from public.website_document_health h
        where h.workspace_id = c.workspace_id and h.status = 'healthy' and h.checked_at >= v_from and h.checked_at < v_through) d)
      into v_verified;
    clients := clients || jsonb_build_array(jsonb_build_object('workspaceId', c.workspace_id, 'name', c.name, 'canWrite', c.can_write,
      'tenantIds', to_jsonb(c.tenant_ids), 'report', v_report,
      'soFar', jsonb_build_object('releasesRecorded', v_released, 'changesVerified', v_verified)));
  end loop;
  return jsonb_build_object('agencyWorkspaceId', p_agency, 'month', to_char(p_month, 'YYYY-MM'),
    'canGenerate', v_role in ('owner','admin'), 'clients', clients);
end;
$$;

create function public.read_care_report(p_report_id uuid, p_user uuid, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare rep record; v_agency boolean := true; v_can_write boolean; v_business_name text; v_releases jsonb; v_deliveries jsonb; v_link jsonb;
begin
  select r.* into rep from public.care_reports r where r.id = p_report_id;
  if not found then raise exception 'care_report_not_found'; end if;
  select w.name into v_business_name from public.workspaces w where w.id = rep.business_workspace_id;
  begin
    perform public.agency_ai_controls_scope(rep.agency_workspace_id, rep.business_workspace_id, p_user, p_email, false);
  exception when others then
    v_agency := false;
  end;
  if v_agency then
    v_can_write := public.care_report_agency_role(rep.agency_workspace_id, p_user, p_email) in ('owner','admin');
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'publishedAt', x.published_at, 'snapshot', x.snapshot) order by x.number desc), '[]'::jsonb)
      into v_releases from (select * from public.care_report_releases l where l.report_id = rep.id order by l.number desc limit 24) x;
    select coalesce(jsonb_agg(jsonb_build_object('releaseNumber', x.number, 'status', x.status, 'reason', x.reason, 'recordedAt', x.recorded_at) order by x.recorded_at desc, x.id), '[]'::jsonb)
      into v_deliveries from (select d.id, l.number, d.status, d.reason, d.recorded_at from public.care_report_deliveries d
        join public.care_report_releases l on l.id = d.release_id where l.report_id = rep.id order by d.recorded_at desc, d.id limit 24) x;
    select jsonb_build_object('createdAt', s.created_at) into v_link from public.care_report_share_links s where s.report_id = rep.id and s.revoked_at is null;
    return jsonb_build_object('audience', 'agency', 'canWrite', v_can_write,
      'report', jsonb_build_object('id', rep.id, 'agencyWorkspaceId', rep.agency_workspace_id, 'businessWorkspaceId', rep.business_workspace_id,
        'businessName', v_business_name, 'month', to_char(rep.month, 'YYYY-MM'), 'revision', rep.revision, 'draft', rep.draft,
        'agencyNote', rep.agency_note, 'generatedAt', rep.generated_at, 'updatedAt', rep.updated_at),
      'releases', v_releases, 'deliveries', v_deliveries, 'shareLink', v_link);
  end if;
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    where u.id = p_user and lower(u.email) = lower(btrim(coalesce(p_email, ''))) and u.verified_at is not null
      and m.workspace_id = rep.business_workspace_id;
  if not found or public.workspace_exit_completed(rep.business_workspace_id) then raise exception 'workspace_access_denied'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'number', x.number, 'publishedAt', x.published_at, 'snapshot', x.snapshot) order by x.number desc), '[]'::jsonb)
    into v_releases from (select * from public.care_report_releases l where l.report_id = rep.id order by l.number desc limit 24) x;
  if jsonb_array_length(v_releases) = 0 then raise exception 'care_report_not_found'; end if;
  return jsonb_build_object('audience', 'owner',
    'report', jsonb_build_object('id', rep.id, 'agencyWorkspaceId', rep.agency_workspace_id, 'businessWorkspaceId', rep.business_workspace_id,
      'businessName', v_business_name, 'month', to_char(rep.month, 'YYYY-MM')),
    'releases', v_releases);
end;
$$;

create function public.save_care_report_note(p_report_id uuid, p_user uuid, p_email text, p_note text, p_expected_revision integer)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare rep record; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select r.agency_workspace_id, r.business_workspace_id into rep from public.care_reports r where r.id = p_report_id;
  if not found then raise exception 'care_report_not_found'; end if;
  perform public.agency_ai_controls_scope(rep.agency_workspace_id, rep.business_workspace_id, p_user, p_email, true);
  if v_note is not null and char_length(v_note) > 2000 then raise exception 'care_report_invalid'; end if;
  perform 1 from public.care_reports r where r.id = p_report_id and r.revision = p_expected_revision for update;
  if not found then raise exception 'care_report_revision_conflict'; end if;
  update public.care_reports r set agency_note = v_note, revision = r.revision + 1, updated_by = p_user, updated_at = clock_timestamp() where r.id = p_report_id;
  return public.read_care_report(p_report_id, p_user, p_email);
end;
$$;

create function public.publish_care_report(p_report_id uuid, p_user uuid, p_email text, p_expected_revision integer)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare rep record; n integer; rid uuid;
begin
  select r.agency_workspace_id, r.business_workspace_id into rep from public.care_reports r where r.id = p_report_id;
  if not found then raise exception 'care_report_not_found'; end if;
  perform public.agency_ai_controls_scope(rep.agency_workspace_id, rep.business_workspace_id, p_user, p_email, true);
  select r.* into rep from public.care_reports r where r.id = p_report_id and r.revision = p_expected_revision for update;
  if not found then raise exception 'care_report_revision_conflict'; end if;
  select coalesce(max(l.number), 0) + 1 into n from public.care_report_releases l where l.report_id = p_report_id;
  insert into public.care_report_releases(report_id, number, snapshot, published_by)
    values (p_report_id, n, rep.draft || jsonb_build_object('agencyNote', rep.agency_note, 'release', n, 'publishedAt', clock_timestamp()), p_user)
    returning id into rid;
  update public.care_reports set revision = revision + 1, updated_by = p_user, updated_at = clock_timestamp() where id = p_report_id;
  return jsonb_build_object('releaseId', rid, 'number', n);
end;
$$;

create function public.issue_care_report_share_link(p_report_id uuid, p_user uuid, p_email text, p_token_hash text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare rep record; v_at timestamptz;
begin
  select r.agency_workspace_id, r.business_workspace_id into rep from public.care_reports r where r.id = p_report_id;
  if not found then raise exception 'care_report_not_found'; end if;
  perform public.agency_ai_controls_scope(rep.agency_workspace_id, rep.business_workspace_id, p_user, p_email, true);
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'care_report_invalid'; end if;
  perform 1 from public.care_reports r where r.id = p_report_id for update;
  if not exists (select 1 from public.care_report_releases l where l.report_id = p_report_id) then raise exception 'care_report_not_published'; end if;
  update public.care_report_share_links s set revoked_by = p_user, revoked_at = clock_timestamp() where s.report_id = p_report_id and s.revoked_at is null;
  insert into public.care_report_share_links(report_id, token_hash, created_by) values (p_report_id, p_token_hash, p_user) returning created_at into v_at;
  return jsonb_build_object('createdAt', v_at);
end;
$$;

create function public.revoke_care_report_share_link(p_report_id uuid, p_user uuid, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare rep record; v_count integer;
begin
  select r.agency_workspace_id, r.business_workspace_id into rep from public.care_reports r where r.id = p_report_id;
  if not found then raise exception 'care_report_not_found'; end if;
  perform public.agency_ai_controls_scope(rep.agency_workspace_id, rep.business_workspace_id, p_user, p_email, true);
  update public.care_report_share_links s set revoked_by = p_user, revoked_at = clock_timestamp() where s.report_id = p_report_id and s.revoked_at is null;
  get diagnostics v_count = row_count;
  return jsonb_build_object('revoked', v_count > 0);
end;
$$;

-- No row locks: PostgREST runs a STABLE function in a read-only transaction.
create function public.read_shared_care_report(p_token_hash text, p_number integer)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare rep record; v_business text; v_agency_name text; v_releases jsonb; rel record;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  select r.id, r.agency_workspace_id, r.business_workspace_id, r.month into rep
    from public.care_report_share_links s join public.care_reports r on r.id = s.report_id
    where s.token_hash = p_token_hash and s.revoked_at is null;
  if not found then return null; end if;
  if public.workspace_exit_completed(rep.business_workspace_id) then return null; end if;
  if not exists (select 1 from public.provider_seats ps where ps.customer_workspace_id = rep.business_workspace_id
    and ps.agency_workspace_id = rep.agency_workspace_id and ps.status = 'active') then return null; end if;
  select w.name into v_business from public.workspaces w where w.id = rep.business_workspace_id;
  select coalesce(jsonb_agg(jsonb_build_object('number', l.number, 'publishedAt', l.published_at) order by l.number desc), '[]'::jsonb)
    into v_releases from public.care_report_releases l where l.report_id = rep.id;
  if p_number is null then
    select l.number, l.published_at, l.snapshot into rel from public.care_report_releases l where l.report_id = rep.id order by l.number desc limit 1;
  else
    select l.number, l.published_at, l.snapshot into rel from public.care_report_releases l where l.report_id = rep.id and l.number = p_number;
  end if;
  if not found then return null; end if;
  return jsonb_build_object('agencyWorkspaceId', rep.agency_workspace_id, 'businessName', v_business, 'month', to_char(rep.month, 'YYYY-MM'),
    'releases', v_releases,
    'release', jsonb_build_object('number', rel.number, 'publishedAt', rel.published_at, 'snapshot', rel.snapshot));
end;
$$;

create function public.reserve_care_report_delivery(p_release_id uuid, p_user uuid, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare rep record; v_id uuid; v_token uuid := gen_random_uuid();
begin
  select r.agency_workspace_id, r.business_workspace_id into rep from public.care_report_releases l
    join public.care_reports r on r.id = l.report_id where l.id = p_release_id;
  if not found then raise exception 'care_report_not_found'; end if;
  perform public.agency_ai_controls_scope(rep.agency_workspace_id, rep.business_workspace_id, p_user, p_email, true);
  begin
    insert into public.care_report_deliveries(release_id, channel, status, token, recorded_by)
      values (p_release_id, 'email', 'reserved', v_token, p_user) returning id into v_id;
  exception when unique_violation then
    raise exception 'care_report_delivery_exists';
  end;
  return jsonb_build_object('deliveryId', v_id, 'token', v_token);
end;
$$;

create function public.record_care_report_delivery(p_release_id uuid, p_user uuid, p_email text, p_delivery_id uuid, p_token uuid, p_status text, p_reason text, p_provider_message_id text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare rep record; v_count integer;
begin
  select r.agency_workspace_id, r.business_workspace_id into rep from public.care_report_releases l
    join public.care_reports r on r.id = l.report_id where l.id = p_release_id;
  if not found then raise exception 'care_report_not_found'; end if;
  perform public.agency_ai_controls_scope(rep.agency_workspace_id, rep.business_workspace_id, p_user, p_email, true);
  if p_delivery_id is null then
    if p_status is distinct from 'suppressed' then raise exception 'care_report_invalid'; end if;
    insert into public.care_report_deliveries(release_id, channel, status, reason, recorded_by, settled_at)
      values (p_release_id, 'email', 'suppressed', p_reason, p_user, clock_timestamp());
    return jsonb_build_object('status', 'suppressed');
  end if;
  if p_status is null or p_status not in ('accepted','suppressed','unknown') then raise exception 'care_report_invalid'; end if;
  update public.care_report_deliveries d set status = p_status, reason = p_reason, provider_message_id = p_provider_message_id, settled_at = clock_timestamp()
    where d.id = p_delivery_id and d.release_id = p_release_id and d.token = p_token and d.status = 'reserved';
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'care_report_delivery_unknown'; end if;
  return jsonb_build_object('status', p_status);
end;
$$;

create function public.list_owner_care_reports(p_workspace_id uuid, p_user uuid, p_email text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_rows jsonb;
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    where u.id = p_user and lower(u.email) = lower(btrim(coalesce(p_email, ''))) and u.verified_at is not null
      and m.workspace_id = p_workspace_id;
  if not found or public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_access_denied'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('reportId', x.id, 'agencyWorkspaceId', x.agency_workspace_id, 'agencyName', x.agency_name,
      'month', to_char(x.month, 'YYYY-MM'), 'latestRelease', jsonb_build_object('number', x.number, 'publishedAt', x.published_at))
      order by x.month desc, x.id), '[]'::jsonb) into v_rows
  from (
    select r.id, r.agency_workspace_id, a.name as agency_name, r.month, l.number, l.published_at
    from public.care_reports r
    join public.workspaces a on a.id = r.agency_workspace_id
    join lateral (select l2.number, l2.published_at from public.care_report_releases l2 where l2.report_id = r.id order by l2.number desc limit 1) l on true
    where r.business_workspace_id = p_workspace_id
    order by r.month desc, r.id limit 24) x;
  return v_rows;
end;
$$;

create function public.record_agency_client_time(p_agency uuid, p_workspace uuid, p_user uuid, p_email text, p_entry jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_keys text[]; v_id uuid; v_minutes integer; v_category text; v_on date; v_note text; row_ record; v_inserted boolean;
begin
  perform public.agency_ai_controls_scope(p_agency, p_workspace, p_user, p_email, false);
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then raise exception 'care_time_invalid'; end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_entry) k;
  if not (v_keys <@ array['category','id','minutes','note','occurredOn'] and v_keys @> array['category','id','minutes','occurredOn']) then
    raise exception 'care_time_invalid';
  end if;
  begin
    if jsonb_typeof(p_entry->'id') <> 'string' or jsonb_typeof(p_entry->'minutes') <> 'number'
      or jsonb_typeof(p_entry->'category') <> 'string' or jsonb_typeof(p_entry->'occurredOn') <> 'string' then
      raise exception 'care_time_invalid';
    end if;
    v_id := (p_entry->>'id')::uuid; v_minutes := (p_entry->>'minutes')::integer;
    v_category := p_entry->>'category'; v_on := (p_entry->>'occurredOn')::date;
    v_note := case when p_entry ? 'note' and jsonb_typeof(p_entry->'note') = 'string' then nullif(btrim(p_entry->>'note'), '') else null end;
    if p_entry ? 'note' and jsonb_typeof(p_entry->'note') not in ('string','null') then raise exception 'care_time_invalid'; end if;
    if v_on > current_date then raise exception 'care_time_invalid'; end if;
    insert into public.agency_client_time_entries(id, agency_workspace_id, business_workspace_id, minutes, category, occurred_on, note, recorded_by)
      values (v_id, p_agency, p_workspace, v_minutes, v_category, v_on, v_note, p_user)
      on conflict (id) do nothing;
    v_inserted := found;
  exception when others then
    if sqlerrm = 'care_time_invalid' or sqlstate in ('22P02','22007','22008','23514','22003','22023') then raise exception 'care_time_invalid'; end if;
    raise;
  end;
  select t.* into row_ from public.agency_client_time_entries t where t.id = v_id;
  if not v_inserted and (row_.agency_workspace_id <> p_agency or row_.business_workspace_id <> p_workspace
    or row_.minutes <> v_minutes or row_.category <> v_category or row_.occurred_on <> v_on or row_.note is distinct from v_note) then
    raise exception 'care_time_conflict';
  end if;
  return jsonb_build_object('id', row_.id, 'minutes', row_.minutes, 'category', row_.category, 'occurredOn', row_.occurred_on,
    'note', row_.note, 'recordedAt', row_.recorded_at);
end;
$$;

create function public.void_agency_client_time(p_agency uuid, p_user uuid, p_email text, p_entry_id uuid, p_reason text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_role text; entry record;
begin
  v_role := public.care_report_agency_role(p_agency, p_user, p_email);
  select t.id, t.recorded_by into entry from public.agency_client_time_entries t where t.id = p_entry_id and t.agency_workspace_id = p_agency;
  if not found then raise exception 'workspace_access_denied'; end if;
  if entry.recorded_by <> p_user and v_role not in ('owner','admin') then raise exception 'workspace_access_denied'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 280 then raise exception 'care_time_invalid'; end if;
  insert into public.agency_client_time_voids(entry_id, reason, voided_by) values (p_entry_id, btrim(p_reason), p_user) on conflict do nothing;
  return jsonb_build_object('voided', true);
end;
$$;

create function public.list_agency_client_time(p_agency uuid, p_workspace uuid, p_user uuid, p_email text, p_month date)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_rows jsonb;
begin
  perform public.agency_ai_controls_scope(p_agency, p_workspace, p_user, p_email, false);
  if p_month is null or p_month <> date_trunc('month', p_month)::date then raise exception 'care_time_invalid'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'minutes', x.minutes, 'category', x.category, 'occurredOn', x.occurred_on,
      'note', x.note, 'recordedBy', x.email, 'recordedAt', x.recorded_at, 'voided', x.voided)
      order by x.occurred_on desc, x.recorded_at desc, x.id), '[]'::jsonb) into v_rows
  from (
    select t.id, t.minutes, t.category, t.occurred_on, t.note, u.email, t.recorded_at,
      exists (select 1 from public.agency_client_time_voids v where v.entry_id = t.id) as voided
    from public.agency_client_time_entries t join public.users u on u.id = t.recorded_by
    where t.agency_workspace_id = p_agency and t.business_workspace_id = p_workspace
      and t.occurred_on >= p_month and t.occurred_on < (p_month + interval '1 month')::date
    order by t.occurred_on desc, t.recorded_at desc, t.id limit 200) x;
  return v_rows;
end;
$$;

-- ACLs: helpers have no caller; RPCs are service_role only.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(array[
    'care_report_ts','care_report_agency_role','care_report_clients','care_report_facts','care_report_append_only']) loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any(array[
    'generate_care_reports','list_care_reports','read_care_report','save_care_report_note','publish_care_report',
    'issue_care_report_share_link','revoke_care_report_share_link','read_shared_care_report','reserve_care_report_delivery',
    'record_care_report_delivery','list_owner_care_reports','record_agency_client_time','void_agency_client_time',
    'list_agency_client_time']) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;
