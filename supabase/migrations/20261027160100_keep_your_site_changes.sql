-- Lane 13 keep-your-site: connected-site health, changes and Releases.
-- Held and unapplied; every path is behind the keep_your_site flag
-- (20261027160000). Nothing here emails anyone or edits a client's site.
--
-- Depends on: 20261008151000 (connected sites), 20261010113000 (website System
-- Releases), 20261014100000 (acting_provider), 20261021181000 (actor
-- snapshots), 20261024123500 (system_revision_capture_actor), and the held
-- Connections core 20261026100000 + 20261026120100, which connectSite needs.
begin;
set local lock_timeout='3s';

-- Rollback capture for every function this file replaces.
create schema keep_your_site_rollback;
revoke all on schema keep_your_site_rollback from public,anon,authenticated,service_role;
create table keep_your_site_rollback.functions(signature text primary key,before_definition text not null);
alter table keep_your_site_rollback.functions enable row level security;
revoke all on keep_your_site_rollback.functions from public,anon,authenticated,service_role;
insert into keep_your_site_rollback.functions(signature,before_definition)
 select 'public.connected_site_json(public.connected_sites,boolean)',
   pg_get_functiondef(to_regprocedure('public.connected_site_json(public.connected_sites,boolean)'));

-- ---------------------------------------------------------------------------
-- Install health: the last live re-check and what the page said it is built with.
alter table public.connected_sites
 add column last_checked_at timestamptz,
 add column last_check_result text check (last_check_result is null or last_check_result in ('present','missing','unreachable')),
 add column detected_platform text check (detected_platform is null or detected_platform in ('unknown','custom','wix','squarespace','wordpress','webflow','shopify','framer','godaddy','google-sites','square','duda','carrd','lovable','v0','bolt','chatgpt','claude','strelva')),
 add column detected_evidence text[] check (detected_evidence is null or cardinality(detected_evidence)<=5),
 add column detected_at timestamptz;

create or replace function public.connected_site_json(s public.connected_sites, p_manage boolean) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', s.id, 'workspaceId', s.business_workspace_id, 'publicKey', s.public_key, 'label', s.label,
    'siteUrl', s.site_url, 'siteHost', s.site_host, 'allowedOrigins', to_jsonb(s.allowed_origins), 'platform', s.platform,
    'captureForms', s.capture_forms, 'injectSchema', s.inject_schema, 'status', s.status,
    'verificationToken', case when p_manage and s.verified_at is null then s.verification_token end,
    'verifiedAt', s.verified_at, 'createdAt', s.created_at, 'updatedAt', s.updated_at, 'revokedAt', s.revoked_at,
    'firstEventAt', s.first_event_at, 'lastEventAt', s.last_event_at,
    'lastCheckedAt', s.last_checked_at, 'lastCheckResult', s.last_check_result,
    'detectedPlatform', s.detected_platform, 'detectedEvidence', to_jsonb(coalesce(s.detected_evidence,'{}'::text[])),
    'detectedAt', s.detected_at)
$$;
revoke all on function public.connected_site_json(public.connected_sites, boolean) from public, anon, authenticated, service_role;

create function public.record_connected_site_check(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_site_id uuid,
  p_result text, p_platform text, p_evidence text[]) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_role text; v_row public.connected_sites; v_evidence text[]:=coalesce(p_evidence,'{}'::text[]); v_item text;
begin
  v_role := public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  if p_result is null or p_result not in ('present','missing','unreachable')
    or (p_platform is not null and p_platform not in ('unknown','custom','wix','squarespace','wordpress','webflow','shopify','framer','godaddy','google-sites','square','duda','carrd','lovable','v0','bolt','chatgpt','claude','strelva'))
    or cardinality(v_evidence) > 5 then raise exception 'connected_site_invalid'; end if;
  foreach v_item in array v_evidence loop
    if v_item is null or char_length(v_item) > 120 then raise exception 'connected_site_invalid'; end if;
  end loop;
  update public.connected_sites set
    last_checked_at = clock_timestamp(), last_check_result = p_result,
    detected_platform = coalesce(nullif(p_platform,'unknown'), detected_platform),
    detected_evidence = case when nullif(p_platform,'unknown') is not null then v_evidence else detected_evidence end,
    detected_at = case when nullif(p_platform,'unknown') is not null then clock_timestamp() else detected_at end,
    updated_at = clock_timestamp()
  where id = p_site_id and business_workspace_id = p_workspace_id and status = 'active'
  returning * into v_row;
  if v_row.id is null then raise exception 'connected_site_not_found'; end if;
  return public.connected_site_json(v_row, v_role in ('owner','admin'));
end $$;
revoke all on function public.record_connected_site_check(uuid, uuid, text, uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.record_connected_site_check(uuid, uuid, text, uuid, text, text, text[]) to service_role;

-- KYS-5 and KYS-11 continue below.
commit;
