-- Strelva Reborn section 0: stop losing client leads.
--
-- Every `/api/v1/leads/[tenant]` submission (and every other captureLead
-- caller) is also written here. Redis `leads:{tenant}` / `lead:{tenant}:{id}`
-- keeps serving every read until cutover; it expires leads after 90 days and
-- keeps 500 per tenant. This table keeps them.
--
-- Additive only. It does not alter `tenants`, `/api/v1`, Redis or any existing
-- function. It depends only on `tenants(stable_id)` and `workspaces(id)`, which
-- production already has, so it can be applied before the unapplied October 1
-- and October 2 migrations. If `tenant_workspace_links` exists (business record
-- migration), new leads pick up the linked workspace and a new link attaches
-- the tenant's earlier leads; the business record migration creates the same
-- trigger when it runs after this one.
--
-- Identity. Rows key on the tenant's `stable_id`, so a slug rename keeps them.
-- `tenant_slug_at_capture` is the slug the visitor's site posted to.
-- `workspace_id` stays null until the tenant is converted into a business.
-- Deprovisioning a tenant (deleting its row) deletes its leads, like every
-- other tenant-scoped table.
--
-- Idempotency. `(tenant_stable_id, lead_id)` is unique, so replaying the same
-- Redis lead is a no-op. A different lead id with the same submission hash
-- within five minutes of an existing row is the same double-submit the Redis
-- guard drops (`lead-dedup:{tenant}:{hash}`, 300 seconds) and is not stored
-- twice. Concurrent submissions of one hash serialize on an advisory lock.
--
-- Access. RLS on, every table privilege revoked. The app reaches the table
-- only through two service-role security-definer functions.

create table public.tenant_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  tenant_slug_at_capture text not null check (char_length(tenant_slug_at_capture) between 1 and 120),
  workspace_id uuid references public.workspaces(id) on delete set null,
  lead_id text not null check (lead_id ~ '^lead_[A-Za-z0-9_-]{1,100}$'),
  submission_hash text not null check (submission_hash ~ '^[0-9a-z]{1,16}$'),
  name text not null check (char_length(name) <= 200),
  email text check (email is null or char_length(email) <= 320),
  message text check (message is null or char_length(message) <= 5000),
  source text check (source is null or char_length(source) <= 80),
  fields jsonb check (fields is null or (jsonb_typeof(fields) = 'object' and octet_length(fields::text) <= 1000000)),
  capability_id text check (capability_id is null or char_length(capability_id) <= 200),
  capability_version integer check (capability_version is null or capability_version >= 1),
  captured_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_via text not null check (recorded_via in ('dual_write', 'repair', 'backfill')),
  unique (tenant_stable_id, lead_id)
);
create index tenant_leads_tenant_captured_idx on public.tenant_leads(tenant_stable_id, captured_at desc, id);
create index tenant_leads_hash_idx on public.tenant_leads(tenant_stable_id, submission_hash, captured_at);
create index tenant_leads_captured_idx on public.tenant_leads(captured_at desc, id);
create index tenant_leads_workspace_idx on public.tenant_leads(workspace_id, captured_at desc) where workspace_id is not null;

alter table public.tenant_leads enable row level security;
revoke all on public.tenant_leads from public, anon, authenticated, service_role;

-- Workspace for a tenant once it is converted. Null before the business
-- record migration exists or before conversion.
create function public.tenant_lead_workspace(p_tenant_stable_id uuid) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_workspace uuid;
begin
  if to_regclass('public.tenant_workspace_links') is null then return null; end if;
  execute 'select workspace_id from public.tenant_workspace_links where tenant_stable_id = $1'
    into v_workspace using p_tenant_stable_id;
  return v_workspace;
end;
$$;

-- Record one captured lead. Returns {status, id, workspaceId} where status is
-- `recorded`, `exists` (same lead id) or `duplicate` (same submission inside the
-- double-submit window). Raises tenant_lead_unknown_tenant or
-- tenant_lead_invalid; the caller records the failure and never fails the
-- visitor's submission on it.
create function public.record_tenant_lead(p_tenant_id text, p_lead jsonb, p_via text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_lead_id text;
  v_hash text;
  v_captured timestamptz;
  v_existing public.tenant_leads%rowtype;
  v_workspace uuid;
  v_id uuid;
  v_version integer;
begin
  if p_via is null or p_via not in ('dual_write', 'repair', 'backfill') then
    raise exception 'tenant_lead_invalid';
  end if;
  if p_lead is null or jsonb_typeof(p_lead) <> 'object' or octet_length(p_lead::text) > 1100000 then
    raise exception 'tenant_lead_invalid';
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then raise exception 'tenant_lead_unknown_tenant'; end if;

  v_lead_id := p_lead->>'leadId';
  v_hash := p_lead->>'submissionHash';
  if v_lead_id is null or v_lead_id !~ '^lead_[A-Za-z0-9_-]{1,100}$'
    or v_hash is null or v_hash !~ '^[0-9a-z]{1,16}$'
    or jsonb_typeof(p_lead->'name') is distinct from 'string'
    or char_length(p_lead->>'name') > 200
    or (p_lead ? 'email' and (jsonb_typeof(p_lead->'email') <> 'string' or char_length(p_lead->>'email') > 320))
    or (p_lead ? 'message' and (jsonb_typeof(p_lead->'message') <> 'string' or char_length(p_lead->>'message') > 5000))
    or (p_lead ? 'source' and (jsonb_typeof(p_lead->'source') <> 'string' or char_length(p_lead->>'source') > 80))
    or (p_lead ? 'fields' and (jsonb_typeof(p_lead->'fields') <> 'object' or octet_length((p_lead->'fields')::text) > 1000000))
    or (p_lead ? 'capabilityId' and (jsonb_typeof(p_lead->'capabilityId') <> 'string' or char_length(p_lead->>'capabilityId') > 200))
    or (p_lead ? 'capabilityVersion' and (jsonb_typeof(p_lead->'capabilityVersion') <> 'number'
      or (p_lead->>'capabilityVersion') !~ '^[1-9][0-9]{0,8}$'))
    or jsonb_typeof(p_lead->'capturedAt') is distinct from 'string' then
    raise exception 'tenant_lead_invalid';
  end if;
  begin
    v_captured := (p_lead->>'capturedAt')::timestamptz;
  exception when others then
    raise exception 'tenant_lead_invalid';
  end;
  v_version := (p_lead->>'capabilityVersion')::integer;

  perform pg_advisory_xact_lock(hashtextextended(v_stable::text || ':' || v_hash, 9105));

  select * into v_existing from public.tenant_leads
    where tenant_stable_id = v_stable and lead_id = v_lead_id;
  if found then
    -- A replay after conversion attaches the workspace it was missing.
    if v_existing.workspace_id is null then
      v_workspace := public.tenant_lead_workspace(v_stable);
      if v_workspace is not null then
        update public.tenant_leads set workspace_id = v_workspace where id = v_existing.id;
      end if;
    end if;
    return jsonb_build_object('status', 'exists', 'id', v_existing.id,
      'workspaceId', coalesce(v_existing.workspace_id, v_workspace));
  end if;

  select * into v_existing from public.tenant_leads
    where tenant_stable_id = v_stable and submission_hash = v_hash
      and captured_at between v_captured - interval '5 minutes' and v_captured + interval '5 minutes'
    order by captured_at limit 1;
  if found then
    return jsonb_build_object('status', 'duplicate', 'id', v_existing.id, 'leadId', v_existing.lead_id,
      'workspaceId', v_existing.workspace_id);
  end if;

  v_workspace := public.tenant_lead_workspace(v_stable);
  insert into public.tenant_leads(tenant_stable_id, tenant_slug_at_capture, workspace_id, lead_id, submission_hash,
    name, email, message, source, fields, capability_id, capability_version, captured_at, recorded_via)
  values (v_stable, p_tenant_id, v_workspace, v_lead_id, v_hash,
    p_lead->>'name', p_lead->>'email', p_lead->>'message', p_lead->>'source', p_lead->'fields',
    p_lead->>'capabilityId', v_version, v_captured, p_via)
  returning id into v_id;
  return jsonb_build_object('status', 'recorded', 'id', v_id, 'workspaceId', v_workspace);
end;
$$;

-- Operator read: newest first, optionally one tenant (by current slug), with
-- the tenant's current slug and site name so renamed tenants read correctly.
create function public.read_tenant_leads(p_tenant_id text, p_limit integer, p_before timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_stable uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
begin
  if p_tenant_id is not null then
    select stable_id into v_stable from public.tenants where id = p_tenant_id;
    if v_stable is null then return '[]'::jsonb; end if;
  end if;
  return coalesce((
    select jsonb_agg(item order by item->>'capturedAt' desc, item->>'id' desc)
    from (
      select jsonb_build_object(
        'id', l.id,
        'tenantId', t.id,
        'tenantStableId', l.tenant_stable_id,
        'siteName', t.site_name,
        'tenantSlugAtCapture', l.tenant_slug_at_capture,
        'workspaceId', l.workspace_id,
        'leadId', l.lead_id,
        'name', l.name,
        'email', l.email,
        'message', l.message,
        'source', l.source,
        'fields', l.fields,
        'capabilityId', l.capability_id,
        'capabilityVersion', l.capability_version,
        'capturedAt', to_char(l.captured_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedAt', to_char(l.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'recordedVia', l.recorded_via
      ) as item
      from public.tenant_leads l
      join public.tenants t on t.stable_id = l.tenant_stable_id
      where (v_stable is null or l.tenant_stable_id = v_stable)
        and (p_before is null or l.captured_at < p_before)
      order by l.captured_at desc, l.id desc
      limit v_limit
    ) page
  ), '[]'::jsonb);
end;
$$;

-- When a tenant is converted, its earlier leads join the business workspace.
create function public.tenant_leads_attach_workspace() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.tenant_stable_id is not null then
    update public.tenant_leads set workspace_id = new.workspace_id
      where tenant_stable_id = new.tenant_stable_id and workspace_id is null;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.tenant_workspace_links') is not null
    and not exists (select 1 from pg_trigger where tgname = 'tenant_workspace_links_attach_leads'
      and tgrelid = to_regclass('public.tenant_workspace_links')) then
    create trigger tenant_workspace_links_attach_leads after insert on public.tenant_workspace_links
      for each row execute function public.tenant_leads_attach_workspace();
  end if;
end $$;

revoke all on function public.tenant_lead_workspace(uuid) from public, anon, authenticated, service_role;
revoke all on function public.tenant_leads_attach_workspace() from public, anon, authenticated;
revoke all on function public.record_tenant_lead(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.read_tenant_leads(text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.record_tenant_lead(text, jsonb, text) to service_role;
grant execute on function public.read_tenant_leads(text, integer, timestamptz) to service_role;
