-- #308: bounded public verification projection over canonical records. No new
-- persistence, credentials, provider calls or authority. Service-role only;
-- publication consent, active tenant linkage and non-exited business required.
begin;
set local lock_timeout = '3s';
create function public.read_public_business_verification(p_handle text, p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare ws uuid; facts jsonb; links jsonb; domains jsonb; google jsonb; agency jsonb;
  fact_count integer; last_confirmed timestamptz;
begin
  -- Exactly one trusted public locator; never accept a workspace UUID.
  if (p_handle is null) = (p_tenant_id is null) then return null; end if;
  if p_handle is not null then
    if p_handle !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' or p_handle ~ '--' then return null; end if;
    select p.workspace_id into ws from public.business_pages p where p.handle = p_handle and p.published;
  else
    select p.workspace_id into ws from public.tenants t
      join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
      join public.business_pages p on p.workspace_id = l.workspace_id and p.published
      where t.id = p_tenant_id and t.active;
  end if;
  if ws is null or not exists(select 1 from public.workspaces where id=ws and kind='customer')
    or public.workspace_exit_completed(ws) then return null; end if;
  facts := public.business_confirmed_public_facts(ws);
  links := coalesce(facts->'facts'->'links','[]'::jsonb);
  -- Publish only domains already named in the owner's public website links.
  -- A saved host proof is not a health or uptime claim. Freshness is applied
  -- at the app boundary; revoked claims/connections are excluded here.
  select coalesce(jsonb_agg(jsonb_build_object('url',url,'checkedAt',checked_at) order by url),'[]'::jsonb) into domains
  from (select url,max(checked_at) checked_at from (
    select e->>'url' url, max(s.verified_at) checked_at
    from jsonb_array_elements(links) e join public.connected_sites s on s.business_workspace_id=ws
      -- connectSite normalizes an authority-only root to a trailing slash.
      -- Admit that single equivalent spelling; keep authority/port/path exact.
      and (s.site_url=e->>'url' or (e->>'url' ~ '^https://[^/?#@]+$' and s.site_url=(e->>'url')||'/'))
      and s.status='active' and s.verified_at is not null
    where e->>'kind'='website' and e->>'url' ~ '^https://[^?#]+$' group by e->>'url'
    union
    -- updated_at is a generic row-save time, not a dedicated provider proof.
    -- A hosted status can be disclosed but cannot support a fresh verdict.
    select e->>'url', null::timestamptz
    from jsonb_array_elements(links) e
      join public.tenant_workspace_links l on l.workspace_id=ws
      join public.tenants t on t.stable_id=l.tenant_stable_id and t.active
      join public.domain_claims d on d.tenant_id=t.id and d.status='verified' and d.role<>'admin'
        and lower(substring(e->>'url' from '^https://([^/:?#]+)'))=lower(d.domain)
    where e->>'kind'='website' and e->>'url' ~ '^https://[^?#]+$' group by e->>'url'
  ) sources group by url) proofs;
  -- Existing location records prove linked, not Google-verified. In particular
  -- OAuth, scope possession, and successful edits are never verification.
  select jsonb_build_object('linked',count(*)>0,'checkedAt',max(b.last_checked_at)) into google
    from public.workspace_account_bindings b where b.workspace_id=ws and b.provider='google' and b.status='connected'
      and exists(select 1 from public.workspace_google_locations g where g.binding_id=b.id and g.workspace_id=ws);
  select count(*), max(c.confirmed_at) into fact_count,last_confirmed from public.business_record_confirmed c
    where c.workspace_id=ws and c.entity='fact' and (facts->'facts' ? c.entity_id or facts->'policyFacts' ? c.entity_id);
  -- A provider seat alone is not a current operating agency. Both current
  -- provider selection and its active seat are needed; disclose name only.
  select jsonb_build_object('name',w.name) into agency from public.workspace_providers p
    join public.workspaces w on w.id=p.provider_workspace_id and w.kind='agency'
    join public.provider_seats s on s.customer_workspace_id=p.customer_workspace_id
      and s.agency_workspace_id=p.provider_workspace_id and s.status='active'
    where p.customer_workspace_id=ws and p.status='active';
  return jsonb_build_object('workspaceId',ws,'verification',jsonb_build_object(
    'domains',domains,'googleBusinessProfile',google,'ownerConfirmedFactCount',fact_count,
    'lastConfirmedAt',last_confirmed,'operatingAgency',agency));
end $$;
revoke all on function public.read_public_business_verification(text,text) from public,anon,authenticated;
grant execute on function public.read_public_business_verification(text,text) to service_role;
commit;
