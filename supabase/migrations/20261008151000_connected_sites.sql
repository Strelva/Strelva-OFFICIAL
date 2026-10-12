-- Connected sites: a new business's website comes in where it already is
-- (website System spec 2026-10-06, decision 3 working default, behavior 18).
--
-- Re-implemented from feat/connected-sites (Oct 2), whose migration reused
-- the 20261002120000 version of the business record. Additive. Local only
-- until Jacob's yes.
--
-- What changed from the branch:
--   * Facts: no second fact store. The public context is read from the
--     business record (business_record_facts, business_services), serving
--     only facts a person confirmed (verified, or stated by the owner or a
--     Strelva operator). business_contexts / business_context_facts are gone.
--   * Inquiries: no second inquiry store. A connected site's inquiries go
--     into tenant_leads, the same store as every tenant lead, with
--     connected_site_id instead of a tenant; held spam goes into the same
--     spam pit (tenant_client_records, store spam_held).
--   * Identity: a connected site is a website System with origin
--     connected_site:<connected_sites.id> (system_origin_kinds gains it).
--   * Domain-ownership proof: a site takes no writes until its owner proves
--     control of the host (a meta token or the site's own script tag on the
--     live page, read by Strelva). Writes need an Origin header from the
--     verified host; requests without one are refused. One business per
--     verified host.
--   * Retention: visit and click events 400 days; held spam 30 days;
--     inquiries stay with the business (as tenant leads attached to a
--     business do) and go when the business is deleted.
--   * Access: RLS on, every table privilege revoked, service-role
--     security-definer functions only (the branch granted table DML).
-- Not carried over (still on the branch): assistant tokens and OAuth, MCP,
-- the /b/{handle} context page, response checks.

create table public.connected_sites (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  public_key text not null unique check (public_key ~ '^sk_pub_[a-z0-9]{24}$'),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  site_url text not null check (char_length(site_url) <= 500 and site_url ~ '^https?://[^[:space:]/]+(/[^[:space:]]*)?$'),
  site_host text not null check (site_host ~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$'),
  allowed_origins text[] not null check (cardinality(allowed_origins) between 1 and 2),
  platform text not null default 'unknown' check (platform in ('unknown','custom','wix','squarespace','wordpress','webflow','shopify','framer','godaddy','google-sites','square','duda','carrd','lovable','v0','bolt','chatgpt','claude','strelva')),
  capture_forms boolean not null default true,
  inject_schema boolean not null default true,
  verification_token text not null unique check (verification_token ~ '^[a-z0-9]{32}$'),
  verified_at timestamptz,
  verified_by uuid references public.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','revoked')),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  first_event_at timestamptz,
  last_event_at timestamptz,
  check ((status = 'revoked') = (revoked_at is not null)),
  unique (id, business_workspace_id)
);
create index connected_sites_workspace_idx on public.connected_sites(business_workspace_id, status, created_at desc);
-- A host belongs to one business at a time once its control is proven.
create unique index connected_sites_verified_host_idx on public.connected_sites(site_host) where verified_at is not null and status = 'active';

create table public.connected_site_events (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null,
  site_id uuid not null,
  kind text not null check (kind in ('visit','call_click','email_click','booking_click','directions_click','form_submit')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  session_id text check (session_id is null or session_id ~ '^[a-zA-Z0-9_-]{8,64}$'),
  page_path text check (page_path is null or char_length(page_path) <= 500),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 255),
  target text check (target is null or char_length(target) <= 500),
  dedupe_key text not null check (char_length(dedupe_key) between 8 and 128),
  unique (site_id, dedupe_key),
  foreign key (site_id, business_workspace_id) references public.connected_sites(id, business_workspace_id) on delete cascade
);
create index connected_site_events_site_idx on public.connected_site_events(site_id, occurred_at desc);
create index connected_site_events_received_idx on public.connected_site_events(received_at);

alter table public.connected_sites enable row level security;
alter table public.connected_site_events enable row level security;
revoke all on public.connected_sites, public.connected_site_events from public, anon, authenticated, service_role;

create function public.connected_site_event_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Retention purges delete; nothing rewrites an event.
  if tg_op = 'DELETE' and current_setting('strelva.connected_site_purge', true) = 'on' then return old; end if;
  if tg_op = 'DELETE' and not exists(select 1 from public.connected_sites where id = old.site_id) then return old; end if;
  raise exception 'connected_site_event_immutable';
end $$;
create trigger connected_site_events_immutable before update or delete on public.connected_site_events
  for each row execute function public.connected_site_event_immutable();
revoke all on function public.connected_site_event_immutable() from public, anon, authenticated, service_role;

-- One inquiry store: tenant leads, now also from a connected site.
alter table public.tenant_leads alter column tenant_stable_id drop not null;
alter table public.tenant_leads add column connected_site_id uuid references public.connected_sites(id) on delete cascade;
alter table public.tenant_leads add constraint tenant_leads_one_origin check (num_nonnulls(tenant_stable_id, connected_site_id) = 1);
alter table public.tenant_leads drop constraint tenant_leads_recorded_via_check;
alter table public.tenant_leads add constraint tenant_leads_recorded_via_check check (recorded_via in ('dual_write','repair','backfill','connected_site'));
create unique index tenant_leads_connected_lead_idx on public.tenant_leads(connected_site_id, lead_id) where connected_site_id is not null;
create index tenant_leads_connected_hash_idx on public.tenant_leads(connected_site_id, submission_hash, captured_at) where connected_site_id is not null;

-- One spam pit: held spam from a connected site sits beside a tenant's.
alter table public.tenant_client_records alter column tenant_stable_id drop not null;
alter table public.tenant_client_records add column connected_site_id uuid references public.connected_sites(id) on delete cascade;
alter table public.tenant_client_records add constraint tenant_client_records_one_origin check (num_nonnulls(tenant_stable_id, connected_site_id) = 1);
alter table public.tenant_client_records add constraint tenant_client_records_connected_spam_only check (connected_site_id is null or store = 'spam_held');
alter table public.tenant_client_records drop constraint tenant_client_records_recorded_via_check;
alter table public.tenant_client_records add constraint tenant_client_records_recorded_via_check check (recorded_via in ('dual_write','repair','backfill','connected_site'));
create unique index tenant_client_records_connected_idx on public.tenant_client_records(connected_site_id, store, record_id) where connected_site_id is not null;

-- A connected site is a website System with its own origin.
create or replace function public.system_origin_kinds() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['saved_work','tenant','inquiry_workspace','google_location','tenant_newsletter','connected_site']::text[]
$$;

create function public.connected_site_assert_actor(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_manage boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  if not exists(select 1 from public.users where id = p_user_id and lower(email) = lower(p_verified_email) and verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  select m.role into v_role from public.workspaces w join public.workspace_memberships m on m.workspace_id = w.id
    where w.id = p_workspace_id and w.kind = 'customer' and m.user_id = p_user_id for share of w, m;
  if v_role is null then raise exception 'workspace_access_denied'; end if;
  if p_manage and v_role not in ('owner','admin') then raise exception 'workspace_access_denied'; end if;
  if p_manage and public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  return v_role;
end $$;
revoke all on function public.connected_site_assert_actor(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;

create function public.connected_site_json(s public.connected_sites, p_manage boolean) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', s.id, 'workspaceId', s.business_workspace_id, 'publicKey', s.public_key, 'label', s.label,
    'siteUrl', s.site_url, 'siteHost', s.site_host, 'allowedOrigins', to_jsonb(s.allowed_origins), 'platform', s.platform,
    'captureForms', s.capture_forms, 'injectSchema', s.inject_schema, 'status', s.status,
    'verificationToken', case when p_manage and s.verified_at is null then s.verification_token end,
    'verifiedAt', s.verified_at, 'createdAt', s.created_at, 'updatedAt', s.updated_at, 'revokedAt', s.revoked_at,
    'firstEventAt', s.first_event_at, 'lastEventAt', s.last_event_at)
$$;
revoke all on function public.connected_site_json(public.connected_sites, boolean) from public, anon, authenticated, service_role;

create function public.create_connected_site(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.connected_sites;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  if p_input is null or jsonb_typeof(p_input) <> 'object' or jsonb_typeof(p_input->'allowedOrigins') is distinct from 'array' then raise exception 'connected_site_invalid'; end if;
  begin
    insert into public.connected_sites(business_workspace_id, public_key, label, site_url, site_host, allowed_origins, platform, verification_token, created_by)
    values (p_workspace_id, p_input->>'publicKey', p_input->>'label', p_input->>'siteUrl', p_input->>'siteHost',
      array(select jsonb_array_elements_text(p_input->'allowedOrigins')), coalesce(p_input->>'platform','unknown'), p_input->>'verificationToken', p_user_id)
    returning * into v_row;
  exception when check_violation or not_null_violation then raise exception 'connected_site_invalid';
  end;
  return public.connected_site_json(v_row, true);
end $$;

create function public.list_connected_sites(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  v_role := public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  return coalesce((select jsonb_agg(public.connected_site_json(s, v_role in ('owner','admin')) order by s.created_at desc, s.id)
    from public.connected_sites s where s.business_workspace_id = p_workspace_id), '[]'::jsonb);
end $$;

create function public.update_connected_site(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_site_id uuid, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.connected_sites;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or (p_patch - array['label','platform','captureForms','injectSchema']::text[]) <> '{}'::jsonb then raise exception 'connected_site_invalid'; end if;
  begin
    update public.connected_sites set
      label = coalesce(p_patch->>'label', label),
      platform = coalesce(p_patch->>'platform', platform),
      capture_forms = coalesce((p_patch->>'captureForms')::boolean, capture_forms),
      inject_schema = coalesce((p_patch->>'injectSchema')::boolean, inject_schema),
      updated_at = clock_timestamp()
    where id = p_site_id and business_workspace_id = p_workspace_id and status = 'active'
    returning * into v_row;
  exception when check_violation or invalid_text_representation then raise exception 'connected_site_invalid';
  end;
  if v_row.id is null then raise exception 'connected_site_not_found'; end if;
  return public.connected_site_json(v_row, true);
end $$;

create function public.revoke_connected_site(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_site_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.connected_sites;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  update public.connected_sites set status = 'revoked', revoked_at = coalesce(revoked_at, clock_timestamp()), updated_at = clock_timestamp()
    where id = p_site_id and business_workspace_id = p_workspace_id returning * into v_row;
  if v_row.id is null then raise exception 'connected_site_not_found'; end if;
  return public.connected_site_json(v_row, true);
end $$;

-- The server read the live page at site_url and passes what it found there
-- (a strelva-site-verification meta token, or this site's own key on the
-- connect script). Only a match proves control of the host.
create function public.confirm_connected_site_verification(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_site_id uuid, p_observed text[]) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_row public.connected_sites;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  select * into v_row from public.connected_sites where id = p_site_id and business_workspace_id = p_workspace_id and status = 'active' for update;
  if v_row.id is null then raise exception 'connected_site_not_found'; end if;
  if v_row.verified_at is not null then return public.connected_site_json(v_row, true); end if;
  if p_observed is null or not (v_row.verification_token = any(p_observed) or v_row.public_key = any(p_observed)) then raise exception 'connected_site_proof_missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended('connected-site-host:' || v_row.site_host, 7417));
  if exists(select 1 from public.connected_sites where site_host = v_row.site_host and verified_at is not null and status = 'active' and id <> v_row.id) then
    raise exception 'connected_site_host_claimed';
  end if;
  update public.connected_sites set verified_at = clock_timestamp(), verified_by = p_user_id, updated_at = clock_timestamp() where id = v_row.id returning * into v_row;
  return public.connected_site_json(v_row, true);
end $$;

-- Public reads and writes by site key (the connect script). No workspace id
-- or token leaves here.
create function public.resolve_connected_site(p_public_key text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'workspaceId', s.business_workspace_id, 'siteUrl', s.site_url, 'siteHost', s.site_host,
    'allowedOrigins', to_jsonb(s.allowed_origins), 'captureForms', s.capture_forms, 'injectSchema', s.inject_schema,
    'verified', s.verified_at is not null)
  from public.connected_sites s where s.public_key = p_public_key and s.status = 'active'
$$;

-- Confirmed facts only: verified, or stated by the owner or a Strelva operator.
-- owner_recipient never leaves.
create function public.read_connected_site_context(p_public_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites; v_revision bigint;
begin
  select * into v_site from public.connected_sites where public_key = p_public_key and status = 'active';
  if v_site.id is null then return null; end if;
  select revision into v_revision from public.business_records where workspace_id = v_site.business_workspace_id;
  return jsonb_build_object(
    'revision', coalesce(v_revision, 0),
    'facts', coalesce((select jsonb_object_agg(f.fact_key, f.value) from public.business_record_facts f
      where f.workspace_id = v_site.business_workspace_id and f.fact_key <> 'owner_recipient' and (f.verified or f.source in ('owner','operator'))), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'description', s.description, 'priceText', s.price_text) order by s.position, s.id)
      from public.business_services s where s.workspace_id = v_site.business_workspace_id and s.active and (s.verified or s.source in ('owner','operator'))), '[]'::jsonb),
    'site', jsonb_build_object('captureForms', v_site.capture_forms, 'injectSchema', v_site.inject_schema));
end $$;

create function public.connected_site_for_write(p_public_key text, p_origin text) returns public.connected_sites
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites;
begin
  select * into v_site from public.connected_sites where public_key = p_public_key and status = 'active';
  if v_site.id is null then raise exception 'connected_site_unknown'; end if;
  if v_site.verified_at is null then raise exception 'connected_site_not_verified'; end if;
  if p_origin is null or not (lower(p_origin) = any(v_site.allowed_origins)) then raise exception 'connected_site_origin_denied'; end if;
  return v_site;
end $$;
revoke all on function public.connected_site_for_write(text, text) from public, anon, authenticated, service_role;

create function public.record_connected_site_events(p_public_key text, p_origin text, p_events jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites; v_count integer := 0; v_inserted integer; v_event jsonb;
begin
  v_site := public.connected_site_for_write(p_public_key, p_origin);
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) not between 1 and 20 then raise exception 'connected_site_invalid'; end if;
  for v_event in select value from jsonb_array_elements(p_events) loop
    begin
      insert into public.connected_site_events(business_workspace_id, site_id, kind, occurred_at, session_id, page_path, referrer_host, target, dedupe_key)
      values (v_site.business_workspace_id, v_site.id, v_event->>'kind', (v_event->>'occurredAt')::timestamptz, v_event->>'sessionId',
        v_event->>'pagePath', v_event->>'referrerHost', v_event->>'target', v_event->>'dedupeKey')
      on conflict (site_id, dedupe_key) do nothing;
      get diagnostics v_inserted = row_count;
    exception when check_violation or not_null_violation or invalid_datetime_format or datetime_field_overflow or invalid_text_representation then raise exception 'connected_site_invalid';
    end;
    v_count := v_count + v_inserted;
  end loop;
  update public.connected_sites set first_event_at = coalesce(first_event_at, clock_timestamp()), last_event_at = clock_timestamp() where id = v_site.id;
  return v_count;
end $$;

-- Record one inquiry into the one lead store. Same validation and
-- double-submit window as record_tenant_lead. Returns {status, id, workspaceId}.
create function public.record_connected_site_inquiry(p_public_key text, p_origin text, p_lead jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites; v_lead_id text; v_hash text; v_captured timestamptz; v_existing public.tenant_leads%rowtype; v_id uuid;
begin
  v_site := public.connected_site_for_write(p_public_key, p_origin);
  if p_lead is null or jsonb_typeof(p_lead) <> 'object' or octet_length(p_lead::text) > 64000 then raise exception 'connected_site_invalid'; end if;
  v_lead_id := p_lead->>'leadId'; v_hash := p_lead->>'submissionHash';
  if v_lead_id is null or v_lead_id !~ '^lead_[A-Za-z0-9_-]{1,100}$' or v_hash is null or v_hash !~ '^[0-9a-z]{1,16}$'
    or jsonb_typeof(p_lead->'name') is distinct from 'string' or char_length(p_lead->>'name') > 200
    or (p_lead ? 'email' and (jsonb_typeof(p_lead->'email') <> 'string' or char_length(p_lead->>'email') > 320))
    or (p_lead ? 'message' and (jsonb_typeof(p_lead->'message') <> 'string' or char_length(p_lead->>'message') > 5000))
    or (p_lead ? 'source' and (jsonb_typeof(p_lead->'source') <> 'string' or char_length(p_lead->>'source') > 80))
    or (p_lead ? 'fields' and (jsonb_typeof(p_lead->'fields') <> 'object' or octet_length((p_lead->'fields')::text) > 40000))
    or jsonb_typeof(p_lead->'capturedAt') is distinct from 'string' then
    raise exception 'connected_site_invalid';
  end if;
  begin v_captured := (p_lead->>'capturedAt')::timestamptz; exception when others then raise exception 'connected_site_invalid'; end;
  perform pg_advisory_xact_lock(hashtextextended(v_site.id::text || ':' || v_hash, 9105));
  select * into v_existing from public.tenant_leads where connected_site_id = v_site.id and lead_id = v_lead_id;
  if found then return jsonb_build_object('status', 'exists', 'id', v_existing.id, 'workspaceId', v_existing.workspace_id); end if;
  select * into v_existing from public.tenant_leads where connected_site_id = v_site.id and submission_hash = v_hash
    and captured_at between v_captured - interval '5 minutes' and v_captured + interval '5 minutes' order by captured_at limit 1;
  if found then return jsonb_build_object('status', 'duplicate', 'id', v_existing.id, 'leadId', v_existing.lead_id, 'workspaceId', v_existing.workspace_id); end if;
  insert into public.tenant_leads(tenant_stable_id, connected_site_id, tenant_slug_at_capture, workspace_id, lead_id, submission_hash,
    name, email, message, source, fields, captured_at, recorded_via)
  values (null, v_site.id, v_site.site_host, v_site.business_workspace_id, v_lead_id, v_hash,
    p_lead->>'name', p_lead->>'email', p_lead->>'message', p_lead->>'source', p_lead->'fields', v_captured, 'connected_site')
  returning id into v_id;
  update public.connected_sites set first_event_at = coalesce(first_event_at, clock_timestamp()), last_event_at = clock_timestamp() where id = v_site.id;
  return jsonb_build_object('status', 'recorded', 'id', v_id, 'workspaceId', v_site.business_workspace_id);
end $$;

-- Hold a submission scored as spam in the one spam pit, for review.
create function public.record_connected_site_spam(p_public_key text, p_origin text, p_record_id text, p_payload jsonb, p_payload_hash text, p_captured_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites; v_id uuid;
begin
  v_site := public.connected_site_for_write(p_public_key, p_origin);
  if p_record_id is null or char_length(p_record_id) not between 1 and 300 or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or octet_length(p_payload::text) > 64000 or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' or p_captured_at is null then
    raise exception 'connected_site_invalid';
  end if;
  insert into public.tenant_client_records(tenant_stable_id, connected_site_id, workspace_id, store, record_id, payload, payload_hash, captured_at, recorded_via)
  values (null, v_site.id, v_site.business_workspace_id, 'spam_held', p_record_id, p_payload, p_payload_hash, p_captured_at, 'connected_site')
  on conflict (connected_site_id, store, record_id) where connected_site_id is not null do nothing
  returning id into v_id;
  return jsonb_build_object('status', case when v_id is null then 'exists' else 'recorded' end, 'id', v_id);
end $$;

create function public.read_connected_site_inquiries(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  return coalesce((select jsonb_agg(item order by item->>'capturedAt' desc, item->>'id' desc) from (
    select jsonb_build_object('id', l.id, 'siteId', l.connected_site_id, 'siteHost', l.tenant_slug_at_capture, 'leadId', l.lead_id,
      'name', l.name, 'email', l.email, 'message', l.message, 'source', l.source, 'fields', l.fields,
      'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as item
    from public.tenant_leads l join public.connected_sites s on s.id = l.connected_site_id
    where s.business_workspace_id = p_workspace_id and l.workspace_id = p_workspace_id
    order by l.captured_at desc, l.id desc limit v_limit) page), '[]'::jsonb);
end $$;

-- Visit and click counts for the last N days, per kind (the "reporting" mark and the owner's view).
create function public.read_connected_site_activity(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_days integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_days integer := least(greatest(coalesce(p_days, 30), 1), 400);
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  return coalesce((select jsonb_object_agg(site_id::text, counts) from (
    select e.site_id, jsonb_object_agg(e.kind, e.n) as counts from (
      select site_id, kind, count(*) as n from public.connected_site_events
      where business_workspace_id = p_workspace_id and occurred_at >= clock_timestamp() - make_interval(days => v_days)
      group by site_id, kind) e group by e.site_id) per_site), '{}'::jsonb);
end $$;

-- Retention: events 400 days, held spam 30 days. Inquiries stay with the business.
create function public.purge_connected_site_records(p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 5000), 1), 50000); v_events bigint; v_spam bigint;
begin
  perform set_config('strelva.connected_site_purge', 'on', true);
  with doomed as (select id from public.connected_site_events where received_at < clock_timestamp() - interval '400 days' order by received_at limit v_limit for update skip locked)
  delete from public.connected_site_events e using doomed d where e.id = d.id;
  get diagnostics v_events = row_count;
  with doomed as (select id from public.tenant_client_records where connected_site_id is not null and store = 'spam_held' and captured_at < clock_timestamp() - interval '30 days' order by captured_at limit v_limit for update skip locked)
  delete from public.tenant_client_records r using doomed d where r.id = d.id;
  get diagnostics v_spam = row_count;
  perform set_config('strelva.connected_site_purge', 'off', true);
  return jsonb_build_object('events', v_events, 'spam', v_spam);
end $$;

revoke all on function public.create_connected_site(uuid, uuid, text, jsonb), public.list_connected_sites(uuid, uuid, text),
  public.update_connected_site(uuid, uuid, text, uuid, jsonb), public.revoke_connected_site(uuid, uuid, text, uuid),
  public.confirm_connected_site_verification(uuid, uuid, text, uuid, text[]), public.resolve_connected_site(text),
  public.read_connected_site_context(text), public.record_connected_site_events(text, text, jsonb),
  public.record_connected_site_inquiry(text, text, jsonb), public.record_connected_site_spam(text, text, text, jsonb, text, timestamptz),
  public.read_connected_site_inquiries(uuid, uuid, text, integer), public.read_connected_site_activity(uuid, uuid, text, integer),
  public.purge_connected_site_records(integer)
  from public, anon, authenticated;
grant execute on function public.create_connected_site(uuid, uuid, text, jsonb), public.list_connected_sites(uuid, uuid, text),
  public.update_connected_site(uuid, uuid, text, uuid, jsonb), public.revoke_connected_site(uuid, uuid, text, uuid),
  public.confirm_connected_site_verification(uuid, uuid, text, uuid, text[]), public.resolve_connected_site(text),
  public.read_connected_site_context(text), public.record_connected_site_events(text, text, jsonb),
  public.record_connected_site_inquiry(text, text, jsonb), public.record_connected_site_spam(text, text, text, jsonb, text, timestamptz),
  public.read_connected_site_inquiries(uuid, uuid, text, integer), public.read_connected_site_activity(uuid, uuid, text, integer),
  public.purge_connected_site_records(integer)
  to service_role;
