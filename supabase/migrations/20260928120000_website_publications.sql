-- Strelva-hosted website publication.
--
-- An approved self-service website becomes publicly reachable at
-- <address>.<STRELVA_SITES_DOMAIN>, served by the control plane. The saved
-- website work row stays the lifecycle authority; this table is the
-- authority for what is publicly live. It holds an immutable copy of the
-- rendered pages of the exact approved revision, so later revisions, renderer
-- changes or a failed regeneration never change a live site until the owner
-- publishes again.

create table public.website_publications (
  work_id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  address text not null unique check (address ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
  status text not null check (status in ('live', 'offline')),
  candidate_revision integer not null check (candidate_revision > 0),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  artifact_digest text not null check (artifact_digest ~ '^[a-f0-9]{64}$'),
  connect_origin text check (connect_origin is null or connect_origin ~ '^https?://[a-z0-9.-]+(:[0-9]+)?$'),
  pages jsonb not null check (jsonb_typeof(pages) = 'object' and pages ? '/' and octet_length(pages::text) <= 2000000),
  published_by uuid not null references public.users(id) on delete restrict,
  published_at timestamptz not null,
  changed_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  foreign key (work_id, workspace_id) references public.saved_product_work(id, workspace_id) on delete cascade
);

create index website_publications_workspace_idx on public.website_publications (workspace_id);

alter table public.website_publications enable row level security;
revoke all on table public.website_publications from public, anon, authenticated, service_role;
grant select on table public.website_publications to service_role;

-- Shared actor checks for both commands: verified identity, the workspace-wide
-- lock used by website mutations and exit, direct membership, and the exact
-- website work row.
create or replace function public.website_publication_actor(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text
) returns public.saved_product_work
language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work;
begin
  if not exists(select 1 from public.users where id = p_user_id and lower(email) = lower(p_verified_email) and verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_access_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id = p_workspace_id and user_id = p_user_id for share;
  if not found then raise exception 'workspace_access_denied'; end if;
  select * into work from public.saved_product_work
   where id = p_work_id and workspace_id = p_workspace_id and product_id = 'websites' and resource_kind = 'website'
   for update;
  if not found then raise exception 'workspace_access_denied'; end if;
  return work;
end $$;
revoke all on function public.website_publication_actor(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;

-- Publish or republish the exact approved candidate. A website keeps its first
-- address across republication; p_address is only used for the first publish.
create or replace function public.publish_website(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_address text, p_candidate_revision integer, p_content_hash text,
  p_artifact_digest text, p_connect_origin text, p_pages jsonb
) returns setof public.website_publications
language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work;
begin
  work := public.website_publication_actor(p_work_id, p_workspace_id, p_user_id, p_verified_email);
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if work.payload->>'approvedCandidateRevision' is distinct from p_candidate_revision::text
    or work.payload->'candidate'->>'revision' is distinct from p_candidate_revision::text
    or work.payload->'candidate'->>'contentHash' is distinct from p_content_hash
    or work.payload->'candidate'->>'artifactDigest' is distinct from p_artifact_digest then
    raise exception 'website_publication_not_approved';
  end if;
  begin
    return query
      insert into public.website_publications as publication (
        work_id, workspace_id, address, status, candidate_revision, content_hash,
        artifact_digest, connect_origin, pages, published_by, published_at, changed_by, updated_at
      ) values (
        p_work_id, p_workspace_id, p_address, 'live', p_candidate_revision, p_content_hash,
        p_artifact_digest, p_connect_origin, p_pages, p_user_id, clock_timestamp(), p_user_id, clock_timestamp()
      )
      on conflict (work_id) do update set
        status = 'live',
        candidate_revision = excluded.candidate_revision,
        content_hash = excluded.content_hash,
        artifact_digest = excluded.artifact_digest,
        connect_origin = excluded.connect_origin,
        pages = excluded.pages,
        published_by = excluded.published_by,
        published_at = excluded.published_at,
        changed_by = excluded.changed_by,
        updated_at = excluded.updated_at
      returning publication.*;
  exception when unique_violation then
    raise exception 'website_address_taken';
  end;
end $$;
revoke all on function public.publish_website(uuid, uuid, uuid, text, text, integer, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_website(uuid, uuid, uuid, text, text, integer, text, text, text, jsonb) to service_role;

-- Taking a site offline is always allowed for a member, including after a
-- workspace exit, so an exit never strands a public site.
create or replace function public.take_website_offline(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text
) returns setof public.website_publications
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.website_publication_actor(p_work_id, p_workspace_id, p_user_id, p_verified_email);
  return query
    update public.website_publications
       set status = 'offline', changed_by = p_user_id, updated_at = clock_timestamp()
     where work_id = p_work_id and workspace_id = p_workspace_id
    returning *;
  if not found then raise exception 'website_publication_missing'; end if;
end $$;
revoke all on function public.take_website_offline(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.take_website_offline(uuid, uuid, uuid, text) to service_role;

-- Public serving. Only live sites of workspaces that have not exited resolve.
create or replace function public.read_live_website(p_address text)
returns table (address text, content_hash text, connect_origin text, pages jsonb)
language sql stable security definer set search_path = public, pg_temp as $$
  select publication.address, publication.content_hash, publication.connect_origin, publication.pages
    from public.website_publications publication
   where publication.address = lower(p_address)
     and publication.status = 'live'
     and not public.workspace_exit_completed(publication.workspace_id);
$$;
revoke all on function public.read_live_website(text) from public, anon, authenticated;
grant execute on function public.read_live_website(text) to service_role;
