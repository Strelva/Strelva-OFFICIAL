-- Resource-scoped use of a released native application.
--
-- `application_states`, `application_releases`, and `application_records` are
-- the application authority. The functions in this migration only add the
-- grant and use boundary. They never read the compatibility payload and they
-- never append records themselves. A release helper owns the canonical read
-- projection and append operation.

create or replace function public.application_use_distinct_views(value text[])
returns boolean
language sql immutable strict set search_path = public, pg_temp as $$
  select count(*) = count(distinct item) from unnest(value) as item
$$;

create table public.application_use_grants (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null,
  workspace_id uuid not null,
  recipient_email text not null check (
    recipient_email = lower(btrim(recipient_email))
    and char_length(recipient_email) between 3 and 254
  ),
  views text[] not null check (
    cardinality(views) between 1 and 4
    and views <@ array['form', 'list', 'detail', 'document']::text[]
    and public.application_use_distinct_views(views)
  ),
  record_read_scope text not null default 'none' check (record_read_scope in ('none', 'own', 'all')),
  record_submit boolean not null default false,
  purpose text not null check (char_length(btrim(purpose)) between 1 and 500),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  check (not record_submit or 'form' = any(views)),
  check ((status = 'revoked') = (revoked_at is not null)),
  foreign key (work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade
);

create index application_use_grants_recipient_idx
  on public.application_use_grants (recipient_email, status, expires_at);
create index application_use_grants_work_idx
  on public.application_use_grants (work_id, status);
create unique index application_use_grants_one_active_recipient_idx
  on public.application_use_grants (work_id, recipient_email)
  where status = 'active';

-- The retry key is scoped to a grant and resource. The digest prevents a
-- caller from reusing a key for a different record.
create table public.application_use_submissions (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.application_use_grants(id) on delete restrict,
  work_id uuid not null,
  actor_id uuid not null references public.users(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 120),
  input_digest text not null check (input_digest ~ '^[a-f0-9]{32}$'),
  record_id text not null check (char_length(btrim(record_id)) between 1 and 100),
  release_version integer not null check (release_version > 0),
  created_at timestamptz not null default now(),
  foreign key (work_id) references public.saved_product_work(id) on delete cascade,
  unique (grant_id, idempotency_key)
);

create index application_use_submissions_work_idx
  on public.application_use_submissions (work_id, created_at desc);

alter table public.application_use_grants enable row level security;
alter table public.application_use_submissions enable row level security;
-- The service role reaches these tables only through the security-definer
-- functions below. Direct table writes would bypass the manager, recipient,
-- expiry, and revocation checks.
revoke all on table public.application_use_grants, public.application_use_submissions from public, anon, authenticated, service_role;

-- Reads canonical released state and records through the release-owned helper,
-- then applies the grant's view and record scope before returning anything.
create or replace function public.read_application_use(
  p_user_id uuid,
  p_verified_email text,
  p_work_id uuid
) returns table (
  work_id uuid,
  workspace_id uuid,
  title text,
  release_version integer,
  released_spec jsonb,
  records jsonb,
  id uuid,
  recipient_email text,
  views text[],
  record_read_scope text,
  record_submit boolean,
  purpose text,
  expires_at timestamptz,
  status text,
  granted_by uuid,
  created_at timestamptz,
  revoked_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.saved_product_work%rowtype;
  access public.application_use_grants%rowtype;
  state public.application_states%rowtype;
  snapshot jsonb;
  snapshot_records jsonb;
  snapshot_work_id text;
  snapshot_workspace_id text;
  snapshot_title text;
  snapshot_version text;
begin
  -- Read and submit use this order. Revoke obtains the work lock first and
  -- then updates the grant, so a revocation cannot race an accepted submit.
  select work.* into app
  from public.saved_product_work as work
  where work.id = p_work_id
    and work.product_id = 'applications'
    and work.resource_kind = 'application'
  for update;
  if not found then raise exception 'application_use_denied'; end if;

  perform 1
  from public.users as identity
  where identity.id = p_user_id
    and lower(identity.email) = lower(btrim(p_verified_email))
    and identity.verified_at is not null
  for share;
  if not found then raise exception 'verified_identity_required'; end if;

  select grant_row.* into access
  from public.application_use_grants as grant_row
  where grant_row.work_id = p_work_id
    and grant_row.recipient_email = lower(btrim(p_verified_email))
    and grant_row.status = 'active'
    and grant_row.expires_at > clock_timestamp()
  for share;
  if not found then raise exception 'application_use_denied'; end if;

  select * into state
  from public.application_states
  where application_states.work_id = p_work_id
    and application_states.workspace_id = app.workspace_id
  for update;
  if not found then raise exception 'application_use_denied'; end if;

  begin
    snapshot := public.application_runtime_snapshot(p_work_id);
  exception when others then
    raise exception 'application_use_denied';
  end;
  if snapshot is null or jsonb_typeof(snapshot) <> 'object' then
    raise exception 'application_use_denied';
  end if;
  snapshot_work_id := snapshot->>'work_id';
  snapshot_workspace_id := snapshot->>'workspace_id';
  snapshot_title := snapshot->>'title';
  snapshot_version := snapshot->>'release_version';
  if snapshot_work_id is distinct from p_work_id::text
    or snapshot_workspace_id is distinct from app.workspace_id::text
    or snapshot_title is null or btrim(snapshot_title) = ''
    or snapshot_version is null or snapshot_version !~ '^[1-9][0-9]*$'
    or jsonb_typeof(snapshot->'released_spec') <> 'object' then
    raise exception 'application_use_denied';
  end if;
  snapshot_records := coalesce(snapshot->'records', '[]'::jsonb);
  if jsonb_typeof(snapshot_records) <> 'array' then
    raise exception 'application_use_denied';
  end if;
  if (
    select count(*)
    from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
    where component.value->>'kind' = 'form'
  ) > 1 then
    raise exception 'application_use_denied';
  end if;
  if access.record_submit and (
    select count(*)
    from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
    where component.value->>'kind' = 'form'
  ) <> 1 then
    raise exception 'application_use_denied';
  end if;
  if access.record_submit and exists (
    select 1
    from jsonb_array_elements(coalesce(snapshot->'released_spec'->'fields', '[]'::jsonb)) as declared(value)
    where coalesce((declared.value->>'required')::boolean, false)
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
        cross join lateral jsonb_array_elements_text(coalesce(component.value->'fields', '[]'::jsonb)) as form_field(id)
        where component.value->>'kind' = 'form'
          and form_field.id = declared.value->>'id'
      )
  ) then
    raise exception 'application_use_form_incompatible';
  end if;

  return query select
    p_work_id,
    app.workspace_id,
    snapshot_title,
    snapshot_version::integer,
    snapshot->'released_spec',
    case when access.record_read_scope = 'none' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', item.value->>'id',
        'values', coalesce((
          select jsonb_object_agg(entry.key, entry.value)
          from jsonb_each(item.value->'values') as entry(key, value)
          where exists (
            select 1
            from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
            cross join lateral jsonb_array_elements_text(coalesce(component.value->'fields', '[]'::jsonb)) as field(id)
            where component.value->>'kind' = any(access.views)
              and field.id = entry.key
          )
        ), '{}'::jsonb),
        'createdBy', item.value->>'createdBy'
      ) order by item.ordinality)
      from jsonb_array_elements(snapshot_records) with ordinality as item(value, ordinality)
      where jsonb_typeof(item.value) = 'object'
        and jsonb_typeof(item.value->'values') = 'object'
        and (
          access.record_read_scope = 'all'
          or (
            access.record_read_scope = 'own'
            and item.value->>'createdBy' = p_user_id::text
          )
        )
    ), '[]'::jsonb) end,
    access.id,
    access.recipient_email,
    access.views,
    access.record_read_scope,
    access.record_submit,
    access.purpose,
    access.expires_at,
    access.status,
    access.granted_by,
    access.created_at,
    access.revoked_at;
end;
$$;

-- Managers can reopen the application and see only grants for that resource.
-- Recipients never call this function; their read path returns one exact grant.
create or replace function public.list_application_use_grants(
  p_user_id uuid,
  p_verified_email text,
  p_work_id uuid
) returns setof public.application_use_grants
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.saved_product_work%rowtype;
  role text;
begin
  select work.* into app
  from public.saved_product_work as work
  where work.id = p_work_id
    and work.product_id = 'applications'
    and work.resource_kind = 'application'
  for share;
  if not found then raise exception 'application_use_denied'; end if;

  perform 1
  from public.users as identity
  where identity.id = p_user_id
    and lower(identity.email) = lower(btrim(p_verified_email))
    and identity.verified_at is not null
  for share;
  if not found then raise exception 'verified_identity_required'; end if;

  select wm.role into role
  from public.workspace_memberships as wm
  where wm.workspace_id = app.workspace_id
    and wm.user_id = p_user_id
  for share;
  if role is null or role not in ('owner', 'admin') then
    raise exception 'workspace_access_denied';
  end if;

  return query
    select grant_row.*
    from public.application_use_grants as grant_row
    where grant_row.work_id = p_work_id
    order by grant_row.created_at desc;
end;
$$;

-- Owners and admins issue grants only for verified recipient identities. The
-- released snapshot check keeps links from being issued for draft or retired
-- applications.
create or replace function public.grant_application_use(
  p_user_id uuid,
  p_verified_email text,
  p_work_id uuid,
  p_recipient_email text,
  p_views text[],
  p_record_read_scope text,
  p_record_submit boolean,
  p_purpose text,
  p_expires_at timestamptz
) returns setof public.application_use_grants
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.saved_product_work%rowtype;
  state public.application_states%rowtype;
  snapshot jsonb;
  role text;
  recipient text := lower(btrim(p_recipient_email));
  created public.application_use_grants%rowtype;
begin
  if recipient is null
    or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(recipient) > 254 then
    raise exception 'application_use_invalid';
  end if;
  if p_views is null or cardinality(p_views) not between 1 and 4
    or not (p_views <@ array['form', 'list', 'detail', 'document']::text[])
    or not public.application_use_distinct_views(p_views)
    or p_record_read_scope is null
    or p_record_read_scope not in ('none', 'own', 'all')
    or p_record_submit is null
    or (p_record_submit and not ('form' = any(p_views)))
    or p_purpose is null
    or char_length(btrim(p_purpose)) not between 1 and 500
    or p_expires_at is null
    or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '90 days' then
    raise exception 'application_use_invalid';
  end if;
  select work.* into app
  from public.saved_product_work as work
  where work.id = p_work_id
    and work.product_id = 'applications'
    and work.resource_kind = 'application'
  for update;
  if not found then raise exception 'application_use_denied'; end if;

  perform 1
  from public.users as identity
  where identity.id = p_user_id
    and lower(identity.email) = lower(btrim(p_verified_email))
    and identity.verified_at is not null
  for share;
  if not found then raise exception 'verified_identity_required'; end if;

  select wm.role into role
  from public.workspace_memberships wm
  where wm.workspace_id = app.workspace_id and wm.user_id = p_user_id
  for share;
  if role is null or role not in ('owner', 'admin') then
    raise exception 'workspace_access_denied';
  end if;

  -- Do this lookup only after the caller is authorized for the workspace, so
  -- a nonmember cannot use the grant endpoint to enumerate identities.
  if not exists (
    select 1 from public.users as recipient_user
    where lower(recipient_user.email) = recipient
      and recipient_user.verified_at is not null
  ) then
    raise exception 'application_use_recipient_unverified';
  end if;

  select * into state
  from public.application_states
  where application_states.work_id = p_work_id
    and application_states.workspace_id = app.workspace_id
  for update;
  if not found then raise exception 'application_use_denied'; end if;
  begin
    snapshot := public.application_runtime_snapshot(p_work_id);
  exception when others then
    raise exception 'application_use_denied';
  end;
  if snapshot is null or snapshot->>'work_id' is distinct from p_work_id::text
    or jsonb_typeof(snapshot->'released_spec') <> 'object'
    or snapshot->>'release_version' !~ '^[1-9][0-9]*$' then
    raise exception 'application_use_denied';
  end if;
  if (
    select count(*)
    from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
    where component.value->>'kind' = 'form'
  ) > 1 then
    raise exception 'application_use_invalid';
  end if;
  if p_record_submit and (
    select count(*)
    from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
    where component.value->>'kind' = 'form'
  ) <> 1 then
    raise exception 'application_use_invalid';
  end if;
  if p_record_submit and exists (
    select 1
    from jsonb_array_elements(coalesce(snapshot->'released_spec'->'fields', '[]'::jsonb)) as declared(value)
    where coalesce((declared.value->>'required')::boolean, false)
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
        cross join lateral jsonb_array_elements_text(coalesce(component.value->'fields', '[]'::jsonb)) as form_field(id)
        where component.value->>'kind' = 'form'
          and form_field.id = declared.value->>'id'
      )
  ) then
    raise exception 'application_use_invalid';
  end if;
  -- An expired grant is closed while the resource lock is held, so a manager
  -- can issue a replacement without weakening the one-active-grant rule.
  update public.application_use_grants as expired_grant
  set status = 'revoked', revoked_by = p_user_id, revoked_at = clock_timestamp()
  where expired_grant.work_id = p_work_id
    and expired_grant.recipient_email = recipient
    and expired_grant.status = 'active'
    and expired_grant.expires_at <= clock_timestamp();
  if exists (
    select 1 from public.application_use_grants as active_grant
    where active_grant.work_id = p_work_id
      and active_grant.recipient_email = recipient
      and active_grant.status = 'active'
  ) then
    raise exception 'application_use_conflict';
  end if;

  insert into public.application_use_grants (
    work_id, workspace_id, recipient_email, views, record_read_scope,
    record_submit, purpose, expires_at, granted_by
  ) values (
    p_work_id, app.workspace_id, recipient, p_views, p_record_read_scope,
    p_record_submit, btrim(p_purpose), p_expires_at, p_user_id
  ) returning * into created;
  return next created;
end;
$$;

create or replace function public.revoke_application_use(
  p_user_id uuid,
  p_verified_email text,
  p_work_id uuid,
  p_grant_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.saved_product_work%rowtype;
  role text;
begin
  select work.* into app
  from public.saved_product_work as work
  where work.id = p_work_id
    and work.product_id = 'applications'
    and work.resource_kind = 'application'
  for update;
  if not found then raise exception 'application_use_denied'; end if;

  perform 1
  from public.users as identity
  where identity.id = p_user_id
    and lower(identity.email) = lower(btrim(p_verified_email))
    and identity.verified_at is not null
  for share;
  if not found then raise exception 'verified_identity_required'; end if;

  select wm.role into role
  from public.workspace_memberships wm
  where wm.workspace_id = app.workspace_id and wm.user_id = p_user_id
  for share;
  if role is null or role not in ('owner', 'admin') then
    raise exception 'workspace_access_denied';
  end if;

  update public.application_use_grants as grant_row
  set status = 'revoked', revoked_by = p_user_id, revoked_at = clock_timestamp()
  where grant_row.id = p_grant_id and grant_row.work_id = p_work_id and grant_row.status = 'active';
  if not found then raise exception 'grant_not_found'; end if;
end;
$$;

-- A grant submit is checked against the fields in the released form view,
-- then delegated to the native append helper. This wrapper owns receipt and
-- idempotency bookkeeping; it never writes application_records directly.
create or replace function public.submit_application_use_record(
  p_user_id uuid,
  p_verified_email text,
  p_work_id uuid,
  p_grant_id uuid,
  p_release_version integer,
  p_record jsonb,
  p_idempotency_key text
) returns table (
  work_id uuid,
  workspace_id uuid,
  title text,
  release_version integer,
  released_spec jsonb,
  records jsonb,
  id uuid,
  recipient_email text,
  views text[],
  record_read_scope text,
  record_submit boolean,
  purpose text,
  expires_at timestamptz,
  status text,
  granted_by uuid,
  created_at timestamptz,
  revoked_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.saved_product_work%rowtype;
  access public.application_use_grants%rowtype;
  state public.application_states%rowtype;
  existing public.application_use_submissions%rowtype;
  snapshot jsonb;
  spec jsonb;
  current_version integer;
  value jsonb;
  key text;
  input_digest text;
begin
  if p_release_version is null or p_release_version <= 0
    or p_idempotency_key is null
    or char_length(p_idempotency_key) not between 1 and 120
    or p_record is null
    or jsonb_typeof(p_record) <> 'object'
    or (p_record - array['id', 'values']) <> '{}'::jsonb
    or jsonb_typeof(p_record->'id') <> 'string'
    or p_record->>'id' !~ '^[^[:space:]][^[:space:]]{0,99}$'
    or jsonb_typeof(p_record->'values') <> 'object'
    or octet_length(p_record::text) > 200000 then
    raise exception 'application_use_invalid';
  end if;
  input_digest := md5(p_record::text);

  select work.* into app
  from public.saved_product_work as work
  where work.id = p_work_id
    and work.product_id = 'applications'
    and work.resource_kind = 'application'
  for update;
  if not found then raise exception 'application_use_denied'; end if;

  perform 1
  from public.users as identity
  where identity.id = p_user_id
    and lower(identity.email) = lower(btrim(p_verified_email))
    and identity.verified_at is not null
  for share;
  if not found then raise exception 'verified_identity_required'; end if;

  select grant_row.* into access
  from public.application_use_grants as grant_row
  where grant_row.id = p_grant_id
    and grant_row.work_id = p_work_id
    and grant_row.recipient_email = lower(btrim(p_verified_email))
    and grant_row.status = 'active'
    and grant_row.expires_at > clock_timestamp()
  for share;
  if not found or not access.record_submit or not ('form' = any(access.views)) then
    raise exception 'application_use_denied';
  end if;

  select * into state
  from public.application_states
  where application_states.work_id = p_work_id
    and application_states.workspace_id = app.workspace_id
  for update;
  if not found then raise exception 'application_use_denied'; end if;

  -- Check the receipt before reading the current release. A response lost
  -- during a publish or rollback can be retried with its original version and
  -- still return the current permitted snapshot.
  select receipt.* into existing
  from public.application_use_submissions as receipt
  where receipt.grant_id = access.id and receipt.idempotency_key = p_idempotency_key
  for share;
  if found then
    if existing.work_id <> p_work_id
      or existing.actor_id <> p_user_id
      or existing.input_digest <> input_digest
      or existing.release_version <> p_release_version then
      raise exception 'idempotency_conflict';
    end if;
    return query select * from public.read_application_use(p_user_id, p_verified_email, p_work_id);
    return;
  end if;

  begin
    snapshot := public.application_runtime_snapshot(p_work_id);
  exception when others then
    raise exception 'application_use_denied';
  end;
  if snapshot is null or jsonb_typeof(snapshot) <> 'object'
    or snapshot->>'work_id' is distinct from p_work_id::text
    or snapshot->>'release_version' !~ '^[1-9][0-9]*$'
    or jsonb_typeof(snapshot->'released_spec') <> 'object' then
    raise exception 'application_use_denied';
  end if;
  if (
    select count(*)
    from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
    where component.value->>'kind' = 'form'
  ) > 1 then
    raise exception 'application_use_denied';
  end if;
  if access.record_submit and (
    select count(*)
    from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
    where component.value->>'kind' = 'form'
  ) <> 1 then
    raise exception 'application_use_denied';
  end if;
  if access.record_submit and exists (
    select 1
    from jsonb_array_elements(coalesce(snapshot->'released_spec'->'fields', '[]'::jsonb)) as declared(value)
    where coalesce((declared.value->>'required')::boolean, false)
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
        cross join lateral jsonb_array_elements_text(coalesce(component.value->'fields', '[]'::jsonb)) as form_field(id)
        where component.value->>'kind' = 'form'
          and form_field.id = declared.value->>'id'
      )
  ) then
    raise exception 'application_use_form_incompatible';
  end if;
  current_version := (snapshot->>'release_version')::integer;
  if p_release_version <> current_version then
    raise exception 'release_version_conflict';
  end if;
  spec := snapshot->'released_spec';

  -- The form view is the input authority. Fields present in the released
  -- native spec but absent from that view are never accepted from this API.
  for key in select jsonb_object_keys(p_record->'values') loop
    value := (p_record->'values')->key;
    if not exists (
      select 1
      from jsonb_array_elements(coalesce(spec->'components', '[]'::jsonb)) as component(value)
      cross join lateral jsonb_array_elements_text(coalesce(component.value->'fields', '[]'::jsonb)) as field(id)
      where component.value->>'kind' = 'form' and field.id = key
    ) then
      raise exception 'application_use_denied';
    end if;
    if jsonb_typeof(value) not in ('string', 'number', 'boolean') then
      raise exception 'application_use_invalid';
    end if;
  end loop;

  -- The native helper validates the complete released record and performs the
  -- sole application_records append. It also owns records_revision.
  perform public.submit_application_record_internal(
    p_work_id,
    p_release_version,
    null,
    p_record->>'id',
    p_record->'values',
    p_user_id
  );

  insert into public.application_use_submissions (
    grant_id, work_id, actor_id, idempotency_key, input_digest, record_id,
    release_version
  ) values (
    access.id, p_work_id, p_user_id, p_idempotency_key, input_digest,
    p_record->>'id', p_release_version
  );
  return query select * from public.read_application_use(p_user_id, p_verified_email, p_work_id);
end;
$$;

revoke all on function public.application_use_distinct_views(text[]) from public, anon, authenticated;
revoke all on function public.read_application_use(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.list_application_use_grants(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.grant_application_use(uuid, text, uuid, text, text[], text, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_application_use(uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_application_use_record(uuid, text, uuid, uuid, integer, jsonb, text) from public, anon, authenticated;

grant execute on function public.read_application_use(uuid, text, uuid) to service_role;
grant execute on function public.list_application_use_grants(uuid, text, uuid) to service_role;
grant execute on function public.grant_application_use(uuid, text, uuid, text, text[], text, boolean, text, timestamptz) to service_role;
grant execute on function public.revoke_application_use(uuid, text, uuid, uuid) to service_role;
grant execute on function public.submit_application_use_record(uuid, text, uuid, uuid, integer, jsonb, text) to service_role;
