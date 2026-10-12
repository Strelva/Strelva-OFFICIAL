-- Getting started L4 (2026-10-12): bring what you have from Google.
--
-- Found facts read from the owner's Google listing live in the one Found-fact
-- store, business_found_facts (20261024300000, source_kind 'google_listing',
-- staged by stage_owner_found_facts and decided by decide_business_found_facts).
-- This migration adds:
-- 1. An optional, separate read-only Google grant for Search Console and
--    Analytics. The business.manage binding is never widened by it.
-- 2. The agency "send the owner a connect link" read: only a staffed member of
--    an agency holding the business's active Google area. It opens the
--    existing reconnect episode for a disconnected grant and never sends.
--
-- Additive. No existing table or function changes. Depends on 20261024300000
-- (business_found_fact_member). Rollback:
-- rollback-20261024400000_google_found_facts_and_read_grant.sql.
begin;
set local lock_timeout = '3s';

-- Search Console and Analytics, read only, as its own grant.
create table public.workspace_google_read_grants (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 1 and 255),
  google_email text not null check (char_length(google_email) between 3 and 254),
  scopes text[] not null check (cardinality(scopes) between 1 and 10
    and scopes <@ array['openid','email','https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/webmasters.readonly','https://www.googleapis.com/auth/analytics.readonly']::text[]),
  refresh_token_ciphertext text check (refresh_token_ciphertext is null or refresh_token_ciphertext ~ '^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  access_token_ciphertext text check (access_token_ciphertext is null or access_token_ciphertext ~ '^enc:v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'),
  token_expires_at timestamptz,
  gsc_property text check (gsc_property is null or char_length(gsc_property) between 1 and 512),
  ga4_property text check (ga4_property is null or ga4_property ~ '^properties/[0-9]{1,20}$'),
  status text not null default 'connected' check (status in ('connected','revoked')),
  connected_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((status = 'revoked') = (refresh_token_ciphertext is null and access_token_ciphertext is null))
);
alter table public.workspace_google_read_grants enable row level security;
revoke all on public.workspace_google_read_grants from public, anon, authenticated;

create function public.google_read_grant(p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_action text, p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g public.workspace_google_read_grants%rowtype; owner_only boolean := p_action in ('save','select','revoke');
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 8192 then raise exception 'google_read_grant_invalid'; end if;
  perform public.business_found_fact_member(p_user_id, p_verified_email, p_workspace_id, owner_only);
  if p_action = 'save' then
    insert into public.workspace_google_read_grants as x (workspace_id, subject, google_email, scopes, refresh_token_ciphertext, access_token_ciphertext, token_expires_at, status, connected_by)
      values (p_workspace_id, p_input->>'subject', lower(p_input->>'googleEmail'), array(select jsonb_array_elements_text(p_input->'scopes')),
        p_input->>'refreshTokenCiphertext', p_input->>'accessTokenCiphertext', (p_input->>'tokenExpiresAt')::timestamptz, 'connected', p_user_id)
      on conflict (workspace_id) do update set subject = excluded.subject, google_email = excluded.google_email, scopes = excluded.scopes,
        refresh_token_ciphertext = excluded.refresh_token_ciphertext, access_token_ciphertext = excluded.access_token_ciphertext,
        token_expires_at = excluded.token_expires_at, status = 'connected', connected_by = p_user_id, updated_at = clock_timestamp(),
        -- A different Google account starts with no chosen properties.
        gsc_property = case when x.subject = excluded.subject then x.gsc_property end,
        ga4_property = case when x.subject = excluded.subject then x.ga4_property end;
  elsif p_action = 'select' then
    update public.workspace_google_read_grants set
      gsc_property = case when p_input ? 'gscProperty' then nullif(p_input->>'gscProperty','') else gsc_property end,
      ga4_property = case when p_input ? 'ga4Property' then nullif(p_input->>'ga4Property','') else ga4_property end,
      updated_at = clock_timestamp()
      where workspace_id = p_workspace_id and status = 'connected';
    if not found then raise exception 'google_read_grant_unknown'; end if;
  elsif p_action = 'revoke' then
    select * into g from public.workspace_google_read_grants where workspace_id = p_workspace_id for update;
    if not found then return null; end if;
    update public.workspace_google_read_grants set status = 'revoked', refresh_token_ciphertext = null, access_token_ciphertext = null,
      token_expires_at = null, updated_at = clock_timestamp() where workspace_id = p_workspace_id;
    -- The caller revokes this token at Google; it is no longer stored.
    return jsonb_build_object('status','revoked','revocationTokenCiphertext', g.refresh_token_ciphertext);
  elsif p_action = 'token' then
    if (p_input->>'accessTokenCiphertext') is null then raise exception 'google_read_grant_invalid'; end if;
    update public.workspace_google_read_grants set access_token_ciphertext = p_input->>'accessTokenCiphertext',
      token_expires_at = (p_input->>'tokenExpiresAt')::timestamptz, updated_at = clock_timestamp()
      where workspace_id = p_workspace_id and status = 'connected';
  elsif p_action not in ('read','secrets') then raise exception 'google_read_grant_invalid';
  end if;
  select * into g from public.workspace_google_read_grants where workspace_id = p_workspace_id;
  if not found then return null; end if;
  return jsonb_build_object('status', g.status, 'googleEmail', g.google_email, 'scopes', to_jsonb(g.scopes),
    'gscProperty', g.gsc_property, 'ga4Property', g.ga4_property, 'updatedAt', g.updated_at)
    || case when p_action in ('secrets','token') then jsonb_build_object('refreshTokenCiphertext', g.refresh_token_ciphertext,
      'accessTokenCiphertext', g.access_token_ciphertext, 'tokenExpiresAt', g.token_expires_at) else '{}'::jsonb end;
end;
$$;

-- What an agency holding the Google area may hand the owner. Never sends.
create function public.agency_google_connect_link(p_user_id uuid, p_verified_email text, p_business_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_agency uuid; b public.workspace_account_bindings%rowtype; target jsonb;
begin
  select g.agency_workspace_id into v_agency from public.agency_scope_grants g
    join public.workspaces a on a.id = g.agency_workspace_id and a.kind = 'agency'
    join public.provider_seats s on s.customer_workspace_id = g.customer_workspace_id and s.agency_workspace_id = g.agency_workspace_id and s.status = 'active'
    join public.workspace_memberships m on m.workspace_id = a.id and m.user_id = p_user_id and m.role in ('owner','admin','member')
    join public.users u on u.id = m.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
    where g.customer_workspace_id = p_business_id and g.scope = 'google' and g.status = 'active'
    limit 1;
  if v_agency is null then raise exception 'agency_google_link_denied'; end if;
  select * into b from public.workspace_account_bindings where workspace_id = p_business_id and provider = 'google' and origin_tenant_stable_id is null;
  if not found then return jsonb_build_object('kind','first_connect','agencyWorkspaceId', v_agency); end if;
  if b.status = 'connected' then return jsonb_build_object('kind','connected','agencyWorkspaceId', v_agency); end if;
  if b.status not in ('needs_reauth','revoked') then return jsonb_build_object('kind','first_connect','agencyWorkspaceId', v_agency); end if;
  target := public.publishing_google_reconnect('prepare', b.id);
  if target is null then return jsonb_build_object('kind','owner_unknown','agencyWorkspaceId', v_agency); end if;
  return jsonb_build_object('kind','reconnect','agencyWorkspaceId', v_agency, 'target', target);
end;
$$;

revoke all on function public.google_read_grant(uuid,text,uuid,text,jsonb), public.agency_google_connect_link(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.google_read_grant(uuid,text,uuid,text,jsonb), public.agency_google_connect_link(uuid,text,uuid) to service_role;
commit;
