-- Sites by code: a coding agent picks up the website Requests an agency accepted,
-- reports a preview and a deploy, and the receipts say who recorded them.
--
-- Before: only a super-admin typed preview and deploy receipts in by hand.
-- After: an agency principal holding the 'website:code' OAuth scope can list the
-- Requests its own agency accepted and record preview and deployed receipts for
-- them. Every step still passes the same order rule and the same
-- acting_provider gates as the web path (previews: the business's acting
-- provider; deploys: acting_provider_assert publish/website). Approve and
-- decline stay with an owner, never an agent.
--
-- Bodies copied from the newest definitions:
--   record_website_change_receipt  20261014112000_acting_provider_gates.sql
--   list_website_change_requests   20261008111000_website_change_receipts.sql
--   issue_agent_oauth_connection_code 20261021131100_agent_oauth_renewable.sql
begin;
set local lock_timeout='3s';

create schema sites_by_code_rollback;
revoke all on schema sites_by_code_rollback from public,anon,authenticated,service_role;
create table sites_by_code_rollback.functions(signature text primary key,before_definition text,after_fingerprint text);
alter table sites_by_code_rollback.functions enable row level security;
revoke all on sites_by_code_rollback.functions from public,anon,authenticated,service_role;
insert into sites_by_code_rollback.functions(signature,before_definition)
select signature,pg_get_functiondef(signature::regprocedure) from unnest(array[
 'public.record_website_change_receipt(uuid,uuid,text,uuid,text,jsonb)',
 'public.list_website_change_requests(uuid,uuid,text,uuid)',
 'public.issue_agent_oauth_connection_code(uuid,text,uuid,uuid,text,text,text,text,text,text,text[])']) signature;

-- (a) Provenance. Preview-only fields stay null on every other kind.
alter table public.website_change_receipts
  add column source_commit_sha text check (source_commit_sha is null or source_commit_sha ~ '^[0-9a-f]{7,40}$'),
  add column branch text check (branch is null or (char_length(branch) between 1 and 200 and branch ~ '^[A-Za-z0-9._/-]+$')),
  add column summary text check (summary is null or char_length(btrim(summary)) between 1 and 500),
  add column owner_facing boolean,
  add column reported_by_connection uuid references public.assistant_connections(id) on delete set null,
  add constraint website_change_receipts_preview_fields check (kind = 'preview' or (source_commit_sha is null and branch is null and owner_facing is null));

-- Receipts as the pages and the agent read them.
create function public.website_change_receipts_json(p_request_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'kind', x.kind, 'previewUrl', x.preview_url, 'commitSha', x.commit_sha,
    'deploymentUrl', x.deployment_url, 'readBack', x.read_back, 'note', x.note, 'recordedAt', x.recorded_at,
    'sourceCommitSha', x.source_commit_sha, 'branch', x.branch, 'summary', x.summary, 'ownerFacing', x.owner_facing,
    'reportedBy', case when x.reported_by_connection is not null then 'coding_agent' else 'person' end
  ) order by x.recorded_at, x.id), '[]'::jsonb)
  from public.website_change_receipts x where x.request_id = p_request_id
$$;
revoke all on function public.website_change_receipts_json(uuid) from public, anon, authenticated, service_role;

-- (b) One step. p_connection_id is the coding-agent connection that reported it, or null for a person.
create function public.website_change_record_step(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_request_id uuid, p_kind text, p_details jsonb, p_connection_id uuid
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
    or details - array['previewUrl', 'commitSha', 'deploymentUrl', 'readBack', 'note', 'sourceCommitSha', 'branch', 'summary', 'ownerFacing']::text[] <> '{}'::jsonb then
    raise exception 'website_change_invalid';
  end if;
  if details ? 'ownerFacing' and jsonb_typeof(details->'ownerFacing') <> 'boolean' then
    raise exception 'website_change_invalid';
  end if;
  if p_kind in ('preview', 'deployed') then
    if public.acting_provider(p_workspace_id, p_user_id, null, null, null) is null then
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
  -- A coding agent works only the Requests its own agency accepted.
  if p_connection_id is not null and (
    request.provider_kind is distinct from 'agency' or request.provider_acceptance is distinct from 'accepted'
    or request.provider_agency_workspace_id is distinct from public.acting_provider(p_workspace_id, p_user_id, null, null, null)
  ) then
    raise exception 'website_change_not_accepted';
  end if;
  if request.status <> 'requested' then raise exception 'website_change_closed'; end if;
  system_text := request.context->>'systemId';
  if system_text is null or system_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'website_change_not_found';
  end if;
  if p_kind = 'deployed' then
    perform public.acting_provider_assert(p_workspace_id, p_user_id, 'publish', 'website', system_text);
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
  insert into public.website_change_receipts(workspace_id, request_id, system_id, kind, preview_url, commit_sha, deployment_url, read_back, note, recorded_by,
      source_commit_sha, branch, summary, owner_facing, reported_by_connection)
    values (p_workspace_id, request.id, system_text::uuid, p_kind,
      case when p_kind = 'preview' then nullif(btrim(details->>'previewUrl'), '') end,
      case when p_kind = 'deployed' then lower(nullif(btrim(details->>'commitSha'), '')) end,
      case when p_kind = 'deployed' then nullif(btrim(details->>'deploymentUrl'), '') end,
      case when p_kind = 'deployed' then nullif(btrim(details->>'readBack'), '') end,
      nullif(btrim(details->>'note'), ''), p_user_id,
      case when p_kind = 'preview' then lower(nullif(btrim(details->>'sourceCommitSha'), '')) end,
      case when p_kind = 'preview' then nullif(btrim(details->>'branch'), '') end,
      case when p_kind in ('preview', 'deployed') then nullif(btrim(details->>'summary'), '') end,
      case when p_kind = 'preview' then coalesce((details->>'ownerFacing')::boolean, true) end,
      p_connection_id)
    returning * into saved;
  return jsonb_build_object(
    'id', saved.id, 'requestId', saved.request_id, 'systemId', saved.system_id, 'kind', saved.kind,
    'previewUrl', saved.preview_url, 'commitSha', saved.commit_sha, 'deploymentUrl', saved.deployment_url,
    'readBack', saved.read_back, 'note', saved.note, 'recordedAt', saved.recorded_at,
    'sourceCommitSha', saved.source_commit_sha, 'branch', saved.branch, 'summary', saved.summary, 'ownerFacing', saved.owner_facing,
    'reportedBy', case when saved.reported_by_connection is not null then 'coding_agent' else 'person' end);
exception
  when check_violation then raise exception 'website_change_invalid';
end;
$$;
revoke all on function public.website_change_record_step(uuid, uuid, text, uuid, text, jsonb, uuid) from public, anon, authenticated, service_role;

-- (c) The web path is the same step with no connection.
create or replace function public.record_website_change_receipt(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_request_id uuid, p_kind text, p_details jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.website_change_record_step(p_workspace_id, p_user_id, p_verified_email, p_request_id, p_kind, p_details, null);
end;
$$;

-- (d) Same contract as 20261008111000, with provenance and the page.
create or replace function public.list_website_change_requests(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.website_change_actor_role(p_workspace_id, p_user_id, p_verified_email);
  if p_system_id is null then raise exception 'website_change_invalid'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'request', r.request_text, 'status', r.status, 'accepted', r.provider_acceptance,
      'page', r.context->>'page',
      'createdAt', r.created_at, 'updatedAt', r.updated_at,
      'receipts', public.website_change_receipts_json(r.id)
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

-- (e) Needs you: Requests whose newest receipt is a preview wait for the owner's Make it live.
-- Volatile: website_change_actor_role takes row locks.
create function public.list_website_change_reviews(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role text;
begin
  actor_role := public.website_change_actor_role(p_workspace_id, p_user_id, p_verified_email);
  if actor_role is distinct from 'owner' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'requestId', q.id, 'systemId', q.system_id, 'request', q.request_text, 'page', q.page,
      'siteName', q.site_name, 'previewReceiptId', q.receipt_id, 'previewUrl', q.preview_url,
      'summary', q.summary, 'ownerFacing', q.owner_facing, 'reportedBy', q.reported_by, 'recordedAt', q.recorded_at
    ) order by q.recorded_at desc, q.id)
    from (
      select r.id, r.context->>'systemId' as system_id, r.request_text, r.context->>'page' as page,
        coalesce(t.site_name, t.id) as site_name, p.id as receipt_id, p.preview_url, p.summary, p.owner_facing,
        case when p.reported_by_connection is not null then 'coding_agent' else 'person' end as reported_by, p.recorded_at
      from public.service_requests r
      join lateral (
        select * from public.website_change_receipts x where x.request_id = r.id order by x.recorded_at desc, x.id desc limit 1
      ) p on p.kind = 'preview'
      left join public.tenants t on t.stable_id = case when r.context->>'tenantStableId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r.context->>'tenantStableId')::uuid end
      where r.business_workspace_id = p_workspace_id and r.context->>'source' = 'website_change' and r.status = 'requested'
      order by p.recorded_at desc, r.id
      limit 50
    ) q
  ), '[]'::jsonb);
end;
$$;

-- (f) What a coding agent may do. Both lock the token first, so a revoked connection stops here.
create function public.website_change_may_deploy(p_workspace_id uuid, p_user_id uuid, p_system_text text) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  return public.acting_provider(p_workspace_id, p_user_id, 'publish', 'website', p_system_text) is not null;
exception when others then
  return false;
end;
$$;
revoke all on function public.website_change_may_deploy(uuid, uuid, text) from public, anon, authenticated, service_role;

create function public.agent_list_website_change_requests(p_token_hash text, p_resource text, p_workspace_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t public.assistant_tokens;
begin
  t := public.lock_agent_oauth_token(p_token_hash, p_resource, 'website:code', p_workspace_id);
  perform public.website_change_actor_role(t.workspace_id, t.user_id, t.verified_email);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'request', r.request_text, 'outcome', r.outcome, 'page', r.context->>'page', 'systemId', r.context->>'systemId',
      'tenantId', s.id, 'siteName', coalesce(s.site_name, s.id), 'repoUrl', s.custom_repo->>'repoUrl', 'repoName', s.custom_repo->>'repoName',
      'productionDomain', s.production_domain, 'accepted', r.provider_acceptance, 'createdAt', r.created_at,
      'receipts', public.website_change_receipts_json(r.id),
      'mayDeploy', t.agency_id is not null and public.website_change_may_deploy(t.workspace_id, t.user_id, r.context->>'systemId')
    ) order by r.created_at desc, r.id)
    from (
      select * from public.service_requests
      where business_workspace_id = t.workspace_id and context->>'source' = 'website_change' and status = 'requested'
        and (t.agency_id is null or provider_agency_workspace_id = t.agency_id)
      order by created_at desc, id
      limit 50
    ) r
    left join public.tenants s on s.stable_id = case when r.context->>'tenantStableId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r.context->>'tenantStableId')::uuid end
  ), '[]'::jsonb);
end;
$$;

create function public.agent_record_website_change(p_token_hash text, p_resource text, p_workspace_id uuid, p_request_id uuid, p_kind text, p_details jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare t public.assistant_tokens;
begin
  t := public.lock_agent_oauth_token(p_token_hash, p_resource, 'website:code', p_workspace_id);
  if t.agency_id is null then raise exception 'website_change_operator_required'; end if;
  if p_kind not in ('preview', 'deployed') then raise exception 'website_change_invalid'; end if;
  return public.website_change_record_step(t.workspace_id, t.user_id, t.verified_email, p_request_id, p_kind, p_details, t.connection_id);
end;
$$;

-- (g) website:code joins the grantable scopes. An agency principal may hold business:read and website:code, nothing else.
create or replace function public.issue_agent_oauth_connection_code(p_user_id uuid,p_verified_email text,p_workspace_id uuid,p_agency_id uuid,p_code_hash text,p_client_id text,p_client_name text,p_redirect_uri text,p_resource text,p_challenge text,p_scopes text[]) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare seat uuid;
begin
 if p_agency_id is not null then select id into seat from public.provider_seats where customer_workspace_id=p_workspace_id and agency_workspace_id=p_agency_id and status='active' for share; end if;
 if not public.agent_oauth_grant_live(p_workspace_id,p_user_id,p_verified_email,p_agency_id,seat) then raise exception 'workspace_access_denied'; end if;
 if p_scopes is null or cardinality(p_scopes)=0 or not p_scopes<@array['business:read','website:read','website:propose','website:code','inquiries:read','quotes:approve']::text[] or (p_agency_id is not null and not p_scopes<@array['business:read','website:code']::text[]) then raise exception 'oauth_invalid_scope'; end if;
 if length(p_client_name) not between 1 and 120 or length(p_client_id)>2000 then raise exception 'oauth_invalid_client'; end if;
 insert into public.assistant_authorization_codes(code_hash,client_id,client_name,redirect_uri,resource,challenge,scopes,workspace_id,user_id,verified_email,agency_id,seat_id)
 values(p_code_hash,p_client_id,p_client_name,p_redirect_uri,p_resource,p_challenge,p_scopes,p_workspace_id,p_user_id,lower(btrim(p_verified_email)),p_agency_id,seat);
 return jsonb_build_object('issued',true);
end $$;

-- Grants. The web path, Needs you and the agent tools are service-role only.
revoke all on function public.record_website_change_receipt(uuid, uuid, text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.list_website_change_requests(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.list_website_change_reviews(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.agent_list_website_change_requests(text, text, uuid) from public, anon, authenticated;
revoke all on function public.agent_record_website_change(text, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.issue_agent_oauth_connection_code(uuid,text,uuid,uuid,text,text,text,text,text,text,text[]) from public, anon, authenticated;
grant execute on function public.record_website_change_receipt(uuid, uuid, text, uuid, text, jsonb) to service_role;
grant execute on function public.list_website_change_requests(uuid, uuid, text, uuid) to service_role;
grant execute on function public.list_website_change_reviews(uuid, uuid, text) to service_role;
grant execute on function public.agent_list_website_change_requests(text, text, uuid) to service_role;
grant execute on function public.agent_record_website_change(text, text, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.issue_agent_oauth_connection_code(uuid,text,uuid,uuid,text,text,text,text,text,text,text[]) to service_role;

update sites_by_code_rollback.functions s set after_fingerprint=md5(pg_get_functiondef(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,''))
from pg_proc p where p.oid=to_regprocedure(s.signature);
notify pgrst,'reload schema';
commit;
