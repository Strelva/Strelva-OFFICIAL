-- Repo-change Requests on a website System and their receipts
-- (docs/capabilities/website/website-system-spec-2026-10-06.md behavior 9,
-- "New" item 6).
--
-- A custom-repo site that reads no content from Strelva changes only through
-- its own repo. The owner (or an admin) asks for a change; that is a
-- service_requests row with provider Strelva and context
-- {source: 'website_change', systemId, implementation}. Strelva builds it on a
-- branch and records a preview; the owner approves or declines that preview;
-- Strelva deploys and records the deploy with its commit, deployment URL and
-- read-back. Each step is one append-only receipt row here. Nothing in this
-- file deploys anything or calls a provider: it records what a person did.
--
-- Order is enforced per Request: preview -> approved|declined -> (after
-- approved) deployed. A new preview may follow a decline or a deploy (the
-- next round). A deploy whose read-back failed is recorded as such and is
-- never turned into a retry (AGENTS.md, outside writes).
--
-- Who. Previews and deploys: a Strelva operator (active super_admins row)
-- who is a member of the business. Approve and decline: an owner of the
-- business only (website-system spec section 4). Reading: any member.
--
-- Additive only. RLS on, every table privilege revoked, service-role
-- security-definer functions only.

set local lock_timeout = '3s';

create table public.website_change_receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  system_id uuid not null,
  kind text not null check (kind in ('preview', 'approved', 'declined', 'deployed')),
  preview_url text check (preview_url is null or (preview_url ~ '^https://[^\s]+$' and char_length(preview_url) <= 500)),
  commit_sha text check (commit_sha is null or commit_sha ~ '^[0-9a-f]{7,40}$'),
  deployment_url text check (deployment_url is null or (deployment_url ~ '^https://[^\s]+$' and char_length(deployment_url) <= 500)),
  read_back text check (read_back is null or read_back in ('confirmed', 'not_confirmed', 'not_checked')),
  note text check (note is null or char_length(btrim(note)) between 1 and 1000),
  recorded_by uuid not null references public.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  check ((kind = 'preview') = (preview_url is not null)),
  check ((kind = 'deployed') = (commit_sha is not null and deployment_url is not null and read_back is not null)),
  check (kind = 'deployed' or (commit_sha is null and deployment_url is null and read_back is null)),
  foreign key (request_id, workspace_id) references public.service_requests(id, business_workspace_id) on delete cascade
);
create index website_change_receipts_request_idx on public.website_change_receipts(request_id, recorded_at, id);
create index website_change_receipts_system_idx on public.website_change_receipts(workspace_id, system_id, recorded_at desc);

alter table public.website_change_receipts enable row level security;
revoke all on table public.website_change_receipts from public, anon, authenticated, service_role;

create function public.website_change_actor_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role text;
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(coalesce(p_verified_email, ''))) and verified_at is not null
    for key share;
  if not found then raise exception 'website_change_access_denied'; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and w.kind = 'customer'
    for share of wm;
  if actor_role is null then raise exception 'website_change_access_denied'; end if;
  return actor_role;
end;
$$;

-- Records one step. p_details carries previewUrl (preview), commitSha,
-- deploymentUrl and readBack (deployed), and an optional note. Returns the
-- stored receipt.
create function public.record_website_change_receipt(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_request_id uuid, p_kind text, p_details jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  actor_role text;
  request public.service_requests;
  system_text text;
  last_kind text;
  saved public.website_change_receipts;
  details jsonb := coalesce(p_details, '{}'::jsonb);
begin
  actor_role := public.website_change_actor_role(p_workspace_id, p_user_id, p_verified_email);
  if jsonb_typeof(details) <> 'object' or octet_length(details::text) > 4000
    or details - array['previewUrl', 'commitSha', 'deploymentUrl', 'readBack', 'note']::text[] <> '{}'::jsonb then
    raise exception 'website_change_invalid';
  end if;
  if p_kind in ('preview', 'deployed') then
    if not exists (select 1 from public.super_admins where user_id = p_user_id and revoked_at is null) then
      raise exception 'website_change_operator_required';
    end if;
  elsif p_kind in ('approved', 'declined') then
    if actor_role <> 'owner' then raise exception 'website_change_owner_required'; end if;
  else
    raise exception 'website_change_invalid';
  end if;
  select * into request from public.service_requests
    where id = p_request_id and business_workspace_id = p_workspace_id
    for update;
  if request.id is null or request.context->>'source' is distinct from 'website_change' then
    raise exception 'website_change_not_found';
  end if;
  if request.status <> 'requested' then raise exception 'website_change_closed'; end if;
  system_text := request.context->>'systemId';
  if system_text is null or system_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'website_change_not_found';
  end if;
  select kind into last_kind from public.website_change_receipts
    where request_id = request.id order by recorded_at desc, id desc limit 1;
  if p_kind in ('approved', 'declined') and last_kind is distinct from 'preview' then
    raise exception 'website_change_out_of_order';
  end if;
  if p_kind = 'deployed' and last_kind is distinct from 'approved' then
    raise exception 'website_change_out_of_order';
  end if;
  -- A newer preview may replace one nobody has decided on; both stay recorded.
  insert into public.website_change_receipts(workspace_id, request_id, system_id, kind, preview_url, commit_sha, deployment_url, read_back, note, recorded_by)
    values (p_workspace_id, request.id, system_text::uuid, p_kind,
      case when p_kind = 'preview' then nullif(btrim(details->>'previewUrl'), '') end,
      case when p_kind = 'deployed' then lower(nullif(btrim(details->>'commitSha'), '')) end,
      case when p_kind = 'deployed' then nullif(btrim(details->>'deploymentUrl'), '') end,
      case when p_kind = 'deployed' then nullif(btrim(details->>'readBack'), '') end,
      nullif(btrim(details->>'note'), ''), p_user_id)
    returning * into saved;
  return jsonb_build_object(
    'id', saved.id, 'requestId', saved.request_id, 'systemId', saved.system_id, 'kind', saved.kind,
    'previewUrl', saved.preview_url, 'commitSha', saved.commit_sha, 'deploymentUrl', saved.deployment_url,
    'readBack', saved.read_back, 'note', saved.note, 'recordedAt', saved.recorded_at);
exception
  when check_violation then raise exception 'website_change_invalid';
end;
$$;

-- The website-change Requests filed on one System, newest first, each with
-- its receipts in order. Any member of the business may read them.
create function public.list_website_change_requests(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.website_change_actor_role(p_workspace_id, p_user_id, p_verified_email);
  if p_system_id is null then raise exception 'website_change_invalid'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'request', r.request_text, 'status', r.status, 'accepted', r.provider_acceptance,
      'createdAt', r.created_at, 'updatedAt', r.updated_at,
      'receipts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', x.id, 'kind', x.kind, 'previewUrl', x.preview_url, 'commitSha', x.commit_sha,
          'deploymentUrl', x.deployment_url, 'readBack', x.read_back, 'note', x.note, 'recordedAt', x.recorded_at
        ) order by x.recorded_at, x.id)
        from public.website_change_receipts x where x.request_id = r.id
      ), '[]'::jsonb)
    ) order by r.created_at desc, r.id)
    from (
      select * from public.service_requests
      where business_workspace_id = p_workspace_id
        and context->>'source' = 'website_change'
        and context->>'systemId' = p_system_id::text
      order by created_at desc, id
      limit 50
    ) r
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.website_change_actor_role(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.record_website_change_receipt(uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.list_website_change_requests(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_website_change_receipt(uuid, uuid, text, uuid, text, jsonb) to service_role;
grant execute on function public.list_website_change_requests(uuid, uuid, text, uuid) to service_role;
