-- Newsletter subscribers remain the sole sending/consent authority. Only the
-- released app-edge RPC adds contacts; the unchanged tenant store and all
-- unsubscribe writes remain untouched. No triggers on hot tenant tables.
set local lock_timeout = '3s';

create or replace function public.workspace_release_flag_names() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['owner_entry','inquiries','website_rebuild','systems',
    'make_real_live:hosted_website','make_real_live:tenant_content','make_real_live:inquiry_form',
    'make_real_live:booking_page','make_real_live:internal_app','connected_sites',
    'make_real_owner_link','publishing','publishing_record_google_policy','internal_tool_notices','catalog_reports','newsletter_contacts']::text[]
$$;
revoke all on function public.workspace_release_flag_names() from public, anon, authenticated;

-- A failed projection is repairable without replaying the subscribe (which
-- would reactivate an address that unsubscribed in the meantime).
create table public.newsletter_contact_sync (
  tenant_stable_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  contact_id uuid references public.business_contacts(id) on delete set null,
  status text not null check (status in ('linked','failed')),
  failure_code text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (tenant_stable_id, workspace_id, email),
  check ((status = 'linked' and failure_code is null) or (status = 'failed' and failure_code is not null))
);
alter table public.newsletter_contact_sync enable row level security;
revoke all on public.newsletter_contact_sync from public, anon, authenticated, service_role;

-- A caller cannot choose another business for the same tenant. Lock the tenant
-- link until commit, so conversion undo cannot race a contact into the old one.
create function public.newsletter_contact_assert_link(p_tenant_id text, p_workspace_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid;
begin
  select t.stable_id into v_stable from public.tenants t
    join public.tenant_workspace_links l on l.tenant_stable_id = t.stable_id
    join public.workspaces w on w.id = l.workspace_id
    where t.id = p_tenant_id and l.workspace_id = p_workspace_id
      and w.kind = 'customer' and not public.workspace_exit_completed(w.id)
    for share of l;
  if v_stable is null then raise exception 'newsletter_contact_link_denied'; end if;
  return v_stable;
end;
$$;

-- Private, invoked after link + release checks. Failures affect only the
-- contact subtransaction. SQLSTATE is recorded, never subscriber data/errors.
create function public.newsletter_contact_project(
  p_tenant_stable_id uuid, p_workspace_id uuid, p_email text, p_name text, p_seen_at timestamptz
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_contact uuid; v_code text; v_status text := 'linked';
begin
  begin
    insert into public.business_contacts as c (workspace_id, name, email, sources, first_seen_at, last_seen_at)
      values (p_workspace_id, nullif(left(btrim(p_name), 160), ''), lower(btrim(p_email)),
        array['newsletter'], p_seen_at, p_seen_at)
      on conflict (workspace_id, email) where email is not null do update set
        name = coalesce(c.name, excluded.name),
        sources = case when 'newsletter' = any(c.sources) then c.sources else c.sources || array['newsletter'] end,
        first_seen_at = least(c.first_seen_at, excluded.first_seen_at),
        last_seen_at = greatest(c.last_seen_at, excluded.last_seen_at), updated_at = clock_timestamp()
      returning id into v_contact;
  exception when others then
    v_status := 'failed'; v_code := sqlstate;
  end;
  insert into public.newsletter_contact_sync(tenant_stable_id, workspace_id, email, contact_id, status, failure_code)
    values (p_tenant_stable_id, p_workspace_id, p_email, v_contact, v_status, v_code)
    on conflict (tenant_stable_id, workspace_id, email) do update set
      contact_id = excluded.contact_id, status = excluded.status, failure_code = excluded.failure_code,
      updated_at = clock_timestamp();
  return v_status;
end;
$$;

-- New path, called only with DATA_SOURCE=postgres and both runtime env flags
-- on. Rows off/operators are rechecked here to refuse stale-cache public use.
-- The legacy duplicate definition includes previously unsubscribed addresses.
create function public.subscribe_newsletter_contact(
  p_tenant_id text, p_workspace_id uuid, p_email text, p_name text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_duplicate boolean; v_state text; v_sub public.newsletter_subscribers%rowtype;
begin
  v_stable := public.newsletter_contact_assert_link(p_tenant_id, p_workspace_id);
  select state into v_state from public.workspace_release_flags
    where workspace_id = p_workspace_id and flag = 'newsletter_contacts' for share;
  if v_state in ('off','operators') then
    return jsonb_build_object('enabled', false, 'duplicate', false, 'contact', 'disabled');
  end if;
  if p_email is null or p_email <> lower(btrim(p_email)) or not public.business_record_email_valid(p_email)
    or (p_name is not null and char_length(p_name) > 160) then raise exception 'newsletter_contact_invalid'; end if;
  -- Serialize on the workspace spine, also used by normal contact writes.
  perform 1 from public.business_records where workspace_id = p_workspace_id for update;
  select * into v_sub from public.newsletter_subscribers where tenant_id = p_tenant_id and email = p_email for update;
  v_duplicate := found;
  insert into public.newsletter_subscribers as s (tenant_id, email, name, subscribed_at, status)
    values (p_tenant_id, p_email, coalesce(p_name, v_sub.name), coalesce(v_sub.subscribed_at, clock_timestamp()), 'active')
    on conflict (tenant_id, email) do update set name = excluded.name, status = 'active'
    returning * into v_sub;
  return jsonb_build_object('enabled', true, 'duplicate', v_duplicate, 'contact',
    public.newsletter_contact_project(v_stable, p_workspace_id, p_email, v_sub.name, v_sub.subscribed_at));
end;
$$;

-- Bounded, resumable, read-only by default. Apply requires an active operator
-- and an explicit per-business on row, and NEVER touches subscriber status.
create function public.backfill_newsletter_contacts(
  p_operator_email text, p_tenant_id text, p_workspace_id uuid,
  p_apply boolean default false, p_after text default null, p_limit integer default 500
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; v_sub record; v_total integer := 0; v_creates integer := 0; v_merges integer := 0;
  v_invalid integer := 0; v_unsubscribed integer := 0; v_linked integer := 0; v_failed integer := 0;
  v_last text; v_state text;
begin
  perform public.workspace_release_assert_operator(p_operator_email);
  v_stable := public.newsletter_contact_assert_link(p_tenant_id, p_workspace_id);
  if p_apply is null or p_limit is null or p_limit not between 1 and 500 then raise exception 'newsletter_contact_invalid'; end if;
  if p_apply then
    select state into v_state from public.workspace_release_flags
      where workspace_id = p_workspace_id and flag = 'newsletter_contacts' for share;
    if v_state is distinct from 'on' then raise exception 'newsletter_contact_release_off'; end if;
    perform 1 from public.business_records where workspace_id = p_workspace_id for update;
  end if;
  for v_sub in select s.* from public.newsletter_subscribers s
    where s.tenant_id = p_tenant_id and (p_after is null or s.email > p_after)
    order by s.email limit p_limit loop
    v_total := v_total + 1; v_last := v_sub.email;
    if v_sub.status = 'unsubscribed' then v_unsubscribed := v_unsubscribed + 1; end if;
    if not public.business_record_email_valid(lower(btrim(v_sub.email))) then
      v_invalid := v_invalid + 1; continue;
    end if;
    if exists (select 1 from public.business_contacts c where c.workspace_id = p_workspace_id and c.email = lower(btrim(v_sub.email))) then
      v_merges := v_merges + 1;
    else v_creates := v_creates + 1; end if;
    if p_apply then
      if public.newsletter_contact_project(v_stable, p_workspace_id, v_sub.email, v_sub.name, v_sub.subscribed_at) = 'linked' then
        v_linked := v_linked + 1;
      else v_failed := v_failed + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('workspaceId', p_workspace_id, 'tenantId', p_tenant_id, 'dryRun', not p_apply,
    'examined', v_total, 'creates', v_creates, 'merges', v_merges, 'invalid', v_invalid,
    'unsubscribed', v_unsubscribed, 'linked', v_linked, 'failed', v_failed,
    'nextAfter', case when exists(select 1 from public.newsletter_subscribers where tenant_id = p_tenant_id and email > v_last) then v_last else null end);
end;
$$;

revoke all on function public.newsletter_contact_assert_link(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.newsletter_contact_project(uuid, uuid, text, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.subscribe_newsletter_contact(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.backfill_newsletter_contacts(text, text, uuid, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.subscribe_newsletter_contact(text, uuid, text, text) to service_role;
grant execute on function public.backfill_newsletter_contacts(text, text, uuid, boolean, text, integer) to service_role;
