-- Money and the client's data, part (c): export schema 3.
--
-- Schema 3 is additive over schema 2 (export_workspace_snapshot): it adds the
-- business record, Systems and their Connections (no secrets), every linked
-- site's data (leads from Postgres with no 90-day window, spam held for
-- review, inquiry timelines and first replies, booking hours and closures,
-- bookings, reviews and replies, content), and the billing state (no card
-- data). The manifest lists every category as included, omitted with a
-- reason, or unavailable with a reason.
--
-- Reading is paged per category (export_workspace_v3_category) so a large
-- business is built in the background into parts instead of being refused.
-- The 2,000,000-byte limit stays for the inline JSON response only.
--
-- Who. The owner, or the Strelva operator (workspace admin) acting on the
-- owner's request. A build started by the operator is delivered only to the
-- business record's owner recipient (resolve_business_owner_recipient). The
-- download is a token whose sha256 is stored here, expiring after 7 days. A
-- member cannot export.
--
-- Access. RLS on, every table privilege revoked, service-role functions only.

alter table public.workspace_export_receipts drop constraint if exists workspace_export_receipts_schema_version_check;
alter table public.workspace_export_receipts add constraint workspace_export_receipts_schema_version_check
  check (schema_version in (1, 2, 3));
alter table public.workspace_export_receipts drop constraint if exists workspace_export_receipts_byte_size_check;
alter table public.workspace_export_receipts add constraint workspace_export_receipts_byte_size_check
  check (byte_size >= 1 and (byte_size <= 2000000 or schema_version = 3));

create table public.workspace_export_builds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete restrict,
  requester_role text not null check (requester_role in ('owner','operator')),
  deliver_to text check (deliver_to is null or char_length(deliver_to) between 3 and 320),
  status text not null default 'building' check (status in ('building','ready','failed')),
  schema_version integer not null default 3 check (schema_version = 3),
  part_count integer not null default 0 check (part_count >= 0),
  byte_size bigint not null default 0 check (byte_size >= 0),
  manifest jsonb check (manifest is null or jsonb_typeof(manifest) = 'object'),
  download_token_hash text check (download_token_hash is null or download_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  failure text check (failure is null or char_length(failure) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  check (status <> 'ready' or (download_token_hash is not null and expires_at is not null and manifest is not null))
);
create index workspace_export_builds_workspace_idx on public.workspace_export_builds(workspace_id, created_at desc);

create table public.workspace_export_build_parts (
  build_id uuid not null references public.workspace_export_builds(id) on delete cascade,
  part integer not null check (part >= 0),
  body text not null check (octet_length(body) between 1 and 4000000),
  primary key (build_id, part)
);

alter table public.workspace_export_builds enable row level security;
alter table public.workspace_export_build_parts enable row level security;
revoke all on public.workspace_export_builds, public.workspace_export_build_parts from public, anon, authenticated, service_role;

-- 'owner' or 'operator' (admin), or raises workspace_export_denied.
create function public.workspace_export_v3_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  select m.role into v_role from public.users u join public.workspace_memberships m on m.user_id = u.id
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_workspace_id and m.role in ('owner','admin');
  if v_role is null then raise exception 'workspace_export_denied'; end if;
  return case v_role when 'owner' then 'owner' else 'operator' end;
end;
$$;

create function public.workspace_export_v3_categories() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['business_record','systems','linked_sites','leads','spam_held','inquiry_timelines','inquiry_first_replies',
    'booking_config','bookings','reviews','content','billing']::text[]
$$;

-- Rows of an optional legacy tenant table for the linked sites, if it exists.
create function public.workspace_export_v3_tenant_rows(
  p_table text, p_workspace_id uuid, p_order text, p_offset integer, p_limit integer
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_rows jsonb;
begin
  if to_regclass('public.' || p_table) is null then return null; end if;
  execute format($q$select coalesce(jsonb_agg(r order by ord), '[]'::jsonb) from (
      select (to_jsonb(x) - 'tenant_stable_id') || jsonb_build_object('tenantId', t.id) as r, row_number() over (order by %s) as ord
      from public.%I x join public.tenants t on t.id = x.tenant_id
      join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
      where l.workspace_id = $1 order by %s offset $2 limit $3) page$q$, p_order, p_table, p_order)
    into v_rows using p_workspace_id, p_offset, p_limit;
  return v_rows;
end;
$$;

-- One page of one category: {category, items, next}. `next` is the next
-- offset or null. Single-object categories return one item.
create function public.export_workspace_v3_category(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_category text, p_offset integer, p_limit integer
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_items jsonb;
  v_store text;
begin
  perform public.workspace_export_v3_role(p_workspace_id, p_user_id, p_verified_email);
  if p_category is null or not (p_category = any(public.workspace_export_v3_categories())) then
    raise exception 'workspace_export_invalid';
  end if;
  case p_category
  when 'business_record' then
    if v_offset > 0 then return jsonb_build_object('category', p_category, 'items', '[]'::jsonb, 'next', null); end if;
    v_items := jsonb_build_array(jsonb_build_object(
      'record', public.read_business_record(p_workspace_id, p_user_id, p_verified_email),
      'contacts', coalesce((select jsonb_agg(to_jsonb(c) - 'workspace_id' order by c.id) from public.business_contacts c
        where c.workspace_id = p_workspace_id), '[]'::jsonb),
      'revisions', coalesce((select jsonb_agg(jsonb_build_object('sequence', r.sequence, 'source', to_jsonb(r)->'source',
        'changes', to_jsonb(r)->'changes', 'createdAt', to_jsonb(r)->'created_at') order by r.sequence)
        from public.business_record_revisions r where r.workspace_id = p_workspace_id), '[]'::jsonb)));
    return jsonb_build_object('category', p_category, 'items', v_items, 'next', null);
  when 'systems' then
    if v_offset > 0 then return jsonb_build_object('category', p_category, 'items', '[]'::jsonb, 'next', null); end if;
    if to_regprocedure('public.read_business_systems(uuid,uuid,text)') is null then
      return jsonb_build_object('category', p_category, 'items', null, 'next', null);
    end if;
    execute 'select public.read_business_systems($1, $2, $3)' into v_items using p_workspace_id, p_user_id, p_verified_email;
    return jsonb_build_object('category', p_category, 'items', jsonb_build_array(v_items), 'next', null);
  when 'billing' then
    if v_offset > 0 then return jsonb_build_object('category', p_category, 'items', '[]'::jsonb, 'next', null); end if;
    if to_regprocedure('public.business_billing_json(uuid)') is null then
      return jsonb_build_object('category', p_category, 'items', null, 'next', null);
    end if;
    execute 'select public.business_billing_json($1)' into v_items using p_workspace_id;
    return jsonb_build_object('category', p_category, 'items', case when v_items is null then '[]'::jsonb else jsonb_build_array(v_items) end, 'next', null);
  when 'linked_sites' then
    select coalesce(jsonb_agg(jsonb_build_object('tenantId', t.id, 'tenantStableId', t.stable_id, 'siteName', t.site_name,
        'linkedAt', l.linked_at) order by l.linked_at, l.id), '[]'::jsonb) into v_items
      from (select * from public.tenant_workspace_links where workspace_id = p_workspace_id order by linked_at, id offset v_offset limit v_limit) l
      join public.tenants t on t.stable_id = l.tenant_stable_id;
  when 'leads' then
    if to_regclass('public.tenant_leads') is null then return jsonb_build_object('category', p_category, 'items', null, 'next', null); end if;
    execute $q$select coalesce(jsonb_agg(jsonb_build_object('leadId', x.lead_id, 'tenantId', t.id, 'name', x.name, 'email', x.email,
        'message', x.message, 'source', x.source, 'fields', x.fields, 'capturedAt', x.captured_at) order by x.captured_at, x.id), '[]'::jsonb)
      from (select l.* from public.tenant_leads l join public.tenant_workspace_links k on k.tenant_stable_id = l.tenant_stable_id
        where k.workspace_id = $1 order by l.captured_at, l.id offset $2 limit $3) x
      join public.tenants t on t.stable_id = x.tenant_stable_id$q$ into v_items using p_workspace_id, v_offset, v_limit;
  when 'spam_held', 'inquiry_timelines', 'inquiry_first_replies', 'booking_config' then
    if to_regclass('public.tenant_client_records') is null then return jsonb_build_object('category', p_category, 'items', null, 'next', null); end if;
    v_store := case p_category when 'spam_held' then 'spam_held' when 'inquiry_timelines' then 'inquiry_timeline'
      when 'inquiry_first_replies' then 'inquiry_reply' else 'booking_config' end;
    execute $q$select coalesce(jsonb_agg(jsonb_build_object('tenantId', t.id, 'recordId', x.record_id, 'payload', x.payload,
        'capturedAt', x.captured_at) order by x.captured_at, x.id), '[]'::jsonb)
      from (select r.* from public.tenant_client_records r join public.tenant_workspace_links k on k.tenant_stable_id = r.tenant_stable_id
        where k.workspace_id = $1 and r.store = $2 and r.removed_at is null order by r.captured_at, r.id offset $3 limit $4) x
      join public.tenants t on t.stable_id = x.tenant_stable_id$q$ into v_items using p_workspace_id, v_store, v_offset, v_limit;
  when 'bookings' then
    v_items := public.workspace_export_v3_tenant_rows('bookings', p_workspace_id, 'x.date, x.start_time, x.id', v_offset, v_limit);
  when 'reviews' then
    v_items := public.workspace_export_v3_tenant_rows('reviews', p_workspace_id, 'x.created_at, x.id', v_offset, v_limit);
  when 'content' then
    v_items := public.workspace_export_v3_tenant_rows('content', p_workspace_id, 'x.tenant_id, x.section', v_offset, v_limit);
  end case;
  return jsonb_build_object('category', p_category, 'items', v_items,
    'next', case when v_items is not null and jsonb_array_length(v_items) = v_limit then v_offset + v_limit end);
end;
$$;

-- Start a build. The operator's build is delivered to the owner recipient only.
create function public.start_workspace_export_build(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text; v_deliver text; v_id uuid;
begin
  v_role := public.workspace_export_v3_role(p_workspace_id, p_user_id, p_verified_email);
  if v_role = 'owner' then
    v_deliver := lower(btrim(p_verified_email));
  else
    v_deliver := public.resolve_business_owner_recipient(p_workspace_id)->>'email';
    if v_deliver is null then raise exception 'workspace_export_no_owner_recipient'; end if;
  end if;
  if exists (select 1 from public.workspace_export_builds where workspace_id = p_workspace_id and status = 'building'
      and created_at > clock_timestamp() - interval '30 minutes') then
    raise exception 'workspace_export_in_progress';
  end if;
  insert into public.workspace_export_builds(workspace_id, requested_by, requester_role, deliver_to)
    values (p_workspace_id, p_user_id, v_role, v_deliver) returning id into v_id;
  return jsonb_build_object('buildId', v_id, 'requesterRole', v_role, 'deliverTo', v_deliver, 'status', 'building');
end;
$$;

create function public.append_workspace_export_build_part(p_build_id uuid, p_part integer, p_body text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.workspace_export_builds where id = p_build_id and status = 'building' for update;
  if not found then raise exception 'workspace_export_build_not_open'; end if;
  insert into public.workspace_export_build_parts(build_id, part, body) values (p_build_id, p_part, p_body)
    on conflict (build_id, part) do update set body = excluded.body;
  update public.workspace_export_builds set part_count = (select count(*) from public.workspace_export_build_parts where build_id = p_build_id),
      byte_size = (select coalesce(sum(octet_length(body)), 0) from public.workspace_export_build_parts where build_id = p_build_id)
    where id = p_build_id;
end;
$$;

-- Finish: record the manifest, the token hash and the receipt. No partial
-- export is ever marked ready: every part from 0 to part_count-1 must exist.
create function public.complete_workspace_export_build(p_build_id uuid, p_manifest jsonb, p_token_hash text, p_category_counts jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.workspace_export_builds%rowtype; v_expires timestamptz := clock_timestamp() + interval '7 days';
begin
  select * into v from public.workspace_export_builds where id = p_build_id for update;
  if not found or v.status <> 'building' then raise exception 'workspace_export_build_not_open'; end if;
  if v.part_count = 0 or (select max(part) from public.workspace_export_build_parts where build_id = p_build_id) <> v.part_count - 1 then
    raise exception 'workspace_export_build_incomplete';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'workspace_export_invalid';
  end if;
  update public.workspace_export_builds set status = 'ready', manifest = p_manifest, download_token_hash = p_token_hash,
      expires_at = v_expires, completed_at = clock_timestamp() where id = p_build_id;
  insert into public.workspace_export_receipts(id, workspace_id, requested_by, schema_version, byte_size, category_counts)
    values (p_build_id, v.workspace_id, v.requested_by, 3, greatest(v.byte_size, 1)::integer, coalesce(p_category_counts, '{}'::jsonb));
  return jsonb_build_object('buildId', p_build_id, 'status', 'ready', 'deliverTo', v.deliver_to, 'expiresAt', v_expires,
    'byteSize', v.byte_size, 'partCount', v.part_count);
end;
$$;

create function public.fail_workspace_export_build(p_build_id uuid, p_failure text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.workspace_export_builds set status = 'failed', failure = left(coalesce(p_failure, 'failed'), 500), completed_at = clock_timestamp()
    where id = p_build_id and status = 'building';
  delete from public.workspace_export_build_parts where build_id = p_build_id;
end;
$$;

-- Download: the token is the only credential, so the recipient needs no
-- sign-in. Wrong, expired or unfinished -> workspace_export_link_invalid.
create function public.read_workspace_export_build_part(p_build_id uuid, p_token_hash text, p_part integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.workspace_export_builds%rowtype; v_body text;
begin
  select * into v from public.workspace_export_builds where id = p_build_id;
  if not found or v.status <> 'ready' or v.download_token_hash is distinct from p_token_hash or v.expires_at <= clock_timestamp() then
    raise exception 'workspace_export_link_invalid';
  end if;
  select body into v_body from public.workspace_export_build_parts where build_id = p_build_id and part = p_part;
  if v_body is null then raise exception 'workspace_export_link_invalid'; end if;
  return jsonb_build_object('body', v_body, 'part', p_part, 'partCount', v.part_count, 'workspaceId', v.workspace_id);
end;
$$;

create function public.read_workspace_export_build(p_build_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v public.workspace_export_builds%rowtype;
begin
  select * into v from public.workspace_export_builds where id = p_build_id;
  if not found then raise exception 'workspace_export_denied'; end if;
  perform public.workspace_export_v3_role(v.workspace_id, p_user_id, p_verified_email);
  return jsonb_build_object('buildId', v.id, 'workspaceId', v.workspace_id, 'status', v.status, 'requesterRole', v.requester_role,
    'deliverTo', v.deliver_to, 'byteSize', v.byte_size, 'partCount', v.part_count, 'manifest', v.manifest,
    'expiresAt', v.expires_at, 'failure', v.failure, 'createdAt', v.created_at, 'completedAt', v.completed_at);
end;
$$;

revoke all on function public.workspace_export_v3_role(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.workspace_export_v3_categories() from public, anon, authenticated;
revoke all on function public.workspace_export_v3_tenant_rows(text, uuid, text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.export_workspace_v3_category(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.start_workspace_export_build(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.append_workspace_export_build_part(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.complete_workspace_export_build(uuid, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_workspace_export_build(uuid, text) from public, anon, authenticated;
revoke all on function public.read_workspace_export_build_part(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.read_workspace_export_build(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.workspace_export_v3_role(uuid, uuid, text) to service_role;
grant execute on function public.export_workspace_v3_category(uuid, uuid, text, text, integer, integer) to service_role;
grant execute on function public.start_workspace_export_build(uuid, uuid, text) to service_role;
grant execute on function public.append_workspace_export_build_part(uuid, integer, text) to service_role;
grant execute on function public.complete_workspace_export_build(uuid, jsonb, text, jsonb) to service_role;
grant execute on function public.fail_workspace_export_build(uuid, text) to service_role;
grant execute on function public.read_workspace_export_build_part(uuid, text, integer) to service_role;
grant execute on function public.read_workspace_export_build(uuid, uuid, text) to service_role;
