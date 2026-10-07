-- Public business pages: /biz/{handle} and /biz/{handle}/llms.txt (#309),
-- and the static JSON-LD block an agency pastes into any site (#502).
-- Additive. Local only until Jacob's yes.
--
-- Why. connect.js adds schema.org JSON-LD with JavaScript, and AI crawlers
-- don't run JavaScript (strategy #423). A business needs a server-rendered
-- copy of its confirmed facts: a page Strelva serves, and a block its agency
-- pastes into the site it already has.
--
-- Ported from feat/connected-sites (Oct 2), whose page read
-- business_contexts.handle / page_published. That store was not carried into
-- 20261008151000_connected_sites; facts come from the business record. This
-- adds only what the record lacks: the page's handle and publish state.
--
-- Confirmed means a person confirmed it: a fact or service marked verified
-- (only owner or operator sources can be), or stated by the owner. An
-- operator, agency, import or model value nobody confirmed is never served.
-- This is stricter than read_connected_site_context, which also serves
-- unverified operator facts; that function is left as it is.
--
-- Access. The table is revoked; service-role security-definer functions only.
-- Members of the customer business read the settings and the paste block;
-- owners and admins set the handle and publish (connected_site_assert_actor).
-- The public read returns a page only while it is published.
--
-- The member readers are VOLATILE: their actor check takes FOR SHARE locks,
-- which PostgREST's READ ONLY transaction for STABLE functions refuses
-- (20261009150000_reader_rpc_volatility).
--
-- Rollback: drop the five functions below and public.business_pages.

set local lock_timeout = '3s';

create table public.business_pages (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' and handle !~ '--'),
  published boolean not null default false,
  published_at timestamptz,
  updated_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (not published or published_at is not null)
);
alter table public.business_pages enable row level security;
revoke all on table public.business_pages from public, anon, authenticated, service_role;

-- The confirmed public facts of one business, the one read every server-side
-- surface uses. Internal: callers check access first.
create function public.business_confirmed_public_facts(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with facts as (
    select f.fact_key, f.value, f.updated_at from public.business_record_facts f
    where f.workspace_id = p_workspace_id and f.fact_key <> 'owner_recipient' and (f.verified or f.source = 'owner')
  ), services as (
    select s.name, s.description, s.price_text, s.position, s.id, s.updated_at from public.business_services s
    where s.workspace_id = p_workspace_id and s.active and (s.verified or s.source = 'owner')
  )
  select jsonb_build_object(
    'revision', coalesce((select r.revision from public.business_records r where r.workspace_id = p_workspace_id), 0),
    'facts', coalesce((select jsonb_object_agg(fact_key, value) from facts), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'description', description, 'priceText', price_text) order by position, id) from services), '[]'::jsonb),
    'confirmedAt', (select max(updated_at) from (select updated_at from facts union all select updated_at from services) t))
$$;
revoke all on function public.business_confirmed_public_facts(uuid) from public, anon, authenticated, service_role;

create function public.business_page_json(p public.business_pages) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select case when p.workspace_id is null then null else jsonb_build_object(
    'handle', p.handle, 'published', p.published, 'publishedAt', p.published_at, 'updatedAt', p.updated_at) end
$$;
revoke all on function public.business_page_json(public.business_pages) from public, anon, authenticated, service_role;

-- Any member: the page settings (null until a handle is chosen).
create function public.read_business_page(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_page public.business_pages;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  select * into v_page from public.business_pages where workspace_id = p_workspace_id;
  return public.business_page_json(v_page);
end $$;

-- Owners and admins: choose the handle and publish or unpublish. A handle
-- another business holds is refused; renaming frees the old one.
create function public.set_business_page(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_handle text, p_published boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_page public.business_pages;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  if p_handle is null or p_published is null then raise exception 'business_page_invalid'; end if;
  begin
    insert into public.business_pages(workspace_id, handle, published, published_at, updated_by)
    values (p_workspace_id, lower(p_handle), p_published, case when p_published then clock_timestamp() end, p_user_id)
    on conflict (workspace_id) do update set
      handle = excluded.handle,
      published = excluded.published,
      published_at = case when excluded.published and not business_pages.published then clock_timestamp() else business_pages.published_at end,
      updated_by = excluded.updated_by,
      updated_at = clock_timestamp()
    returning * into v_page;
  exception
    when unique_violation then raise exception 'business_page_handle_taken';
    when check_violation then raise exception 'business_page_invalid';
  end;
  return public.business_page_json(v_page);
end $$;

-- Any member: the confirmed facts, for the paste block and its check.
create function public.read_business_public_facts(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  return public.business_confirmed_public_facts(p_workspace_id);
end $$;

-- Public: a published page by handle, or null. No user or contact data
-- beyond the business's own confirmed public facts.
create function public.read_published_business_page(p_handle text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_page public.business_pages;
begin
  if p_handle is null or p_handle !~ '^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$' then return null; end if;
  select p.* into v_page from public.business_pages p join public.workspaces w on w.id = p.workspace_id
    where p.handle = p_handle and p.published and w.kind = 'customer' and not public.workspace_exit_completed(p.workspace_id);
  if v_page.workspace_id is null then return null; end if;
  return jsonb_build_object('workspaceId', v_page.workspace_id, 'handle', v_page.handle) || public.business_confirmed_public_facts(v_page.workspace_id);
end $$;

revoke all on function public.read_business_page(uuid, uuid, text), public.set_business_page(uuid, uuid, text, text, boolean),
  public.read_business_public_facts(uuid, uuid, text), public.read_published_business_page(text)
  from public, anon, authenticated;
grant execute on function public.read_business_page(uuid, uuid, text), public.set_business_page(uuid, uuid, text, text, boolean),
  public.read_business_public_facts(uuid, uuid, text), public.read_published_business_page(text)
  to service_role;
