-- Explicit public booking grants and durable visitor reservation receipts.
--
-- A grant is the only way a generated client site can expose a native
-- schedule.  The public API never guesses from tenants.booking_url or picks
-- the first schedule in a workspace.  Provider credentials and provider event
-- ids stay in the existing calendar tables; this migration only stores the
-- opaque public receipt and the exact native work it is bound to.

create table public.public_website_booking_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  capability_id text not null check (capability_id ~ '^[a-z][a-z0-9_-]{0,79}$'),
  capability_version bigint not null check (capability_version > 0),
  inquiry_capability_id text not null check (inquiry_capability_id ~ '^[a-z][a-z0-9_-]{0,79}$'),
  inquiry_version bigint not null check (inquiry_version > 0),
  provider text not null check (provider in ('outlook', 'google')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  time_zone text not null check (char_length(btrim(time_zone)) between 1 and 128),
  status text not null default 'published' check (status in ('published', 'revoked')),
  revision bigint not null default 1 check (revision > 0),
  published_by uuid not null references public.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or char_length(btrim(revocation_reason)) between 1 and 500),
  unique (tenant_stable_id, capability_id),
  unique (id, business_workspace_id),
  foreign key (work_id, business_workspace_id)
    references public.saved_product_work(id, workspace_id) on delete restrict,
  check ((status = 'revoked') = (revoked_by is not null and revoked_at is not null and revocation_reason is not null))
);

create index public_website_booking_grants_tenant_idx
  on public.public_website_booking_grants (tenant_stable_id, status, updated_at desc);
create index public_website_booking_grants_work_idx
  on public.public_website_booking_grants (business_workspace_id, work_id, status);

-- Public clients never receive direct table access.  The service role is used
-- by the versioned route after it has resolved the published grant.
alter table public.public_website_booking_grants enable row level security;
revoke all on table public.public_website_booking_grants from public, anon, authenticated, service_role;
grant select, insert, update on table public.public_website_booking_grants to service_role;

create or replace function public.assert_public_website_booking_grant() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
      from public.tenants tenant
     where tenant.stable_id = new.tenant_stable_id
       and tenant.active is true
  ) then
    raise exception 'public_booking_tenant_unavailable';
  end if;
  -- A completed workspace exit closes future public capability publication.
  -- Revoke remains an allowed cleanup transition for an already published
  -- grant, so an exit does not strand its administrative tombstone.
  if public.workspace_exit_completed(new.business_workspace_id)
    and (tg_op = 'INSERT' or new.status <> 'revoked') then
    raise exception 'public_booking_workspace_exit_blocked';
  end if;
  if not exists (
    select 1
      from public.offering_website_bindings binding
     where binding.tenant_stable_id = new.tenant_stable_id
       and binding.business_workspace_id = new.business_workspace_id
       and binding.status = 'active'
  ) then
    raise exception 'public_booking_website_binding_required';
  end if;
  if not exists (
    select 1
      from public.saved_product_work work
     where work.id = new.work_id
       and work.workspace_id = new.business_workspace_id
       and work.product_id = 'scheduling'
       and work.resource_kind = 'schedule'
  ) then
    raise exception 'public_booking_schedule_required';
  end if;
  if not exists (
    select 1
      from public.users publisher
      join public.workspace_memberships membership
        on membership.user_id = publisher.id
       and membership.workspace_id = new.business_workspace_id
     where publisher.id = new.published_by
       and publisher.verified_at is not null
       and membership.role in ('owner', 'admin')
  ) then
    raise exception 'public_booking_publisher_required';
  end if;
  return new;
end;
$$;

create trigger public_website_booking_grant_validate_trg
  before insert or update on public.public_website_booking_grants
  for each row execute function public.assert_public_website_booking_grant();

-- The public route cannot publish a schedule. This action is the governed
-- customer-facing binding seam: the caller must manage the business workspace
-- and also own the tenant being attached. A workspace owner by itself cannot
-- grant another tenant access.
create or replace function public.publish_public_website_booking_grant(
  p_business_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_tenant_id text,
  p_work_id uuid,
  p_capability_id text,
  p_capability_version bigint,
  p_inquiry_capability_id text,
  p_inquiry_version bigint,
  p_provider text,
  p_display_name text,
  p_time_zone text
) returns setof public.public_website_booking_grants
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  tenant_row public.tenants%rowtype;
  created public.public_website_booking_grants%rowtype;
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, true);
  select * into tenant_row from public.tenants tenant
   where tenant.id = p_tenant_id and tenant.active is true for share;
  if not found then raise exception 'public_booking_tenant_unavailable'; end if;
  if not exists (
    select 1 from public.memberships membership
     where membership.user_id = p_user_id
       and membership.tenant_stable_id = tenant_row.stable_id
       and membership.role = 'owner'
  ) then raise exception 'public_booking_tenant_owner_required'; end if;
  if p_capability_id is null or p_capability_id !~ '^[a-z][a-z0-9_-]{0,79}$'
    or p_inquiry_capability_id is null or p_inquiry_capability_id !~ '^[a-z][a-z0-9_-]{0,79}$'
    or p_capability_version is null or p_capability_version <= 0
    or p_inquiry_version is null or p_inquiry_version <= 0
    or p_provider not in ('outlook', 'google')
    or p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 160
    or p_time_zone is null or char_length(btrim(p_time_zone)) not between 1 and 128 then
    raise exception 'public_booking_grant_invalid';
  end if;
  if not exists (
    select 1 from public.offering_website_bindings binding
     where binding.tenant_stable_id = tenant_row.stable_id
       and binding.business_workspace_id = p_business_id
       and binding.status = 'active'
  ) then raise exception 'public_booking_website_binding_required'; end if;
  insert into public.public_website_booking_grants(
    tenant_stable_id, business_workspace_id, work_id, capability_id,
    capability_version, inquiry_capability_id, inquiry_version, provider,
    display_name, time_zone, published_by
  ) values (
    tenant_row.stable_id, p_business_id, p_work_id, btrim(p_capability_id),
    p_capability_version, btrim(p_inquiry_capability_id), p_inquiry_version,
    p_provider, btrim(p_display_name), btrim(p_time_zone), p_user_id
  ) returning * into created;
  return next created;
end;
$$;

create or replace function public.revoke_public_website_booking_grant(
  p_business_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_grant_id uuid,
  p_reason text
) returns setof public.public_website_booking_grants
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  current_row public.public_website_booking_grants%rowtype;
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, true);
  select * into current_row from public.public_website_booking_grants
   where id = p_grant_id and business_workspace_id = p_business_id for update;
  if not found then raise exception 'public_booking_grant_not_found'; end if;
  if not exists (
    select 1 from public.memberships membership
     where membership.user_id = p_user_id
       and membership.tenant_stable_id = current_row.tenant_stable_id
       and membership.role = 'owner'
  ) then raise exception 'public_booking_tenant_owner_required'; end if;
  if current_row.status <> 'published' then return next current_row; return; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then raise exception 'public_booking_reason_invalid'; end if;
  update public.public_website_booking_grants set
    status = 'revoked', revision = revision + 1, revoked_by = p_user_id,
    revoked_at = clock_timestamp(), revocation_reason = btrim(p_reason), updated_at = clock_timestamp()
   where id = current_row.id returning * into current_row;
  return next current_row;
end;
$$;

create or replace function public.read_public_website_booking_grants(
  p_business_id uuid,
  p_user_id uuid,
  p_verified_email text
) returns setof public.public_website_booking_grants
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.offering_assert_actor(p_business_id, p_user_id, p_verified_email, false);
  return query
    select grant_row.*
      from public.public_website_booking_grants grant_row
     where grant_row.business_workspace_id = p_business_id
     order by grant_row.updated_at desc, grant_row.id;
end;
$$;

revoke all on function public.publish_public_website_booking_grant(uuid,uuid,text,text,uuid,text,bigint,text,bigint,text,text,text) from public, anon, authenticated;
revoke all on function public.revoke_public_website_booking_grant(uuid,uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function public.read_public_website_booking_grants(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.publish_public_website_booking_grant(uuid,uuid,text,text,uuid,text,bigint,text,bigint,text,text,text) to service_role;
grant execute on function public.revoke_public_website_booking_grant(uuid,uuid,text,uuid,text) to service_role;
grant execute on function public.read_public_website_booking_grants(uuid,uuid,text) to service_role;

-- Workspace portability includes the durable public receipt and its published
-- binding, while omitting management tokens, token ciphertext, calendar
-- request keys, provider event ids, and credentials.
create or replace function public.export_public_website_bookings(
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform 1 from public.users user_row
   where user_row.id = p_user_id
     and lower(user_row.email) = lower(btrim(p_verified_email))
     and user_row.verified_at is not null for share;
  if not found then raise exception 'workspace_export_denied'; end if;
  perform 1 from public.workspace_memberships membership
   where membership.workspace_id = p_workspace_id
     and membership.user_id = p_user_id
     and membership.role = 'owner' for share;
  if not found then raise exception 'workspace_export_denied'; end if;
  return jsonb_build_object(
    'grants', coalesce((select jsonb_agg(jsonb_build_object(
      'id', grant_row.id,
      'tenantStableId', grant_row.tenant_stable_id,
      'businessWorkspaceId', grant_row.business_workspace_id,
      'workId', grant_row.work_id,
      'capabilityId', grant_row.capability_id,
      'capabilityVersion', grant_row.capability_version,
      'inquiryCapabilityId', grant_row.inquiry_capability_id,
      'inquiryVersion', grant_row.inquiry_version,
      'provider', grant_row.provider,
      'displayName', grant_row.display_name,
      'timeZone', grant_row.time_zone,
      'status', grant_row.status,
      'revision', grant_row.revision,
      'publishedAt', grant_row.published_at,
      'createdAt', grant_row.created_at,
      'updatedAt', grant_row.updated_at,
      'revokedAt', grant_row.revoked_at,
      'revocationReason', grant_row.revocation_reason
    ) order by grant_row.updated_at, grant_row.id)
      from public.public_website_booking_grants grant_row
     where grant_row.business_workspace_id = p_workspace_id), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(jsonb_build_object(
      'reservationId', booking.id,
      'grantId', booking.grant_id,
      'tenantId', booking.tenant_id_at_reservation,
      'capabilityId', booking.capability_id,
      'version', booking.capability_version,
      'provider', booking.provider,
      'inquiryId', booking.inquiry_id,
      'title', booking.title,
      'start', booking.start_at,
      'end', booking.end_at,
      'timeZone', booking.time_zone,
      'status', booking.status,
      'createdAt', booking.created_at,
      'updatedAt', booking.updated_at
    ) order by booking.created_at, booking.id)
      from public.public_website_bookings booking
     where booking.business_workspace_id = p_workspace_id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.export_public_website_bookings(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.export_public_website_bookings(uuid,uuid,text) to service_role;

create table public.public_website_bookings (
  id uuid primary key,
  grant_id uuid not null references public.public_website_booking_grants(id) on delete restrict,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete restrict,
  tenant_id_at_reservation text not null check (tenant_id_at_reservation ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  work_id uuid not null,
  capability_id text not null check (capability_id ~ '^[a-z][a-z0-9_-]{0,79}$'),
  capability_version bigint not null check (capability_version > 0),
  provider text not null check (provider in ('outlook', 'google')),
  inquiry_id text not null check (char_length(btrim(inquiry_id)) between 1 and 200),
  request_id_hash text not null check (request_id_hash ~ '^[a-f0-9]{64}$'),
  calendar_request_id text not null check (char_length(btrim(calendar_request_id)) between 8 and 160),
  management_token_hash text not null check (management_token_hash ~ '^[a-f0-9]{64}$'),
  management_token_ciphertext text not null check (char_length(management_token_ciphertext) between 8 and 4096),
  expected_revision bigint not null check (expected_revision >= 0),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  start_at timestamptz not null,
  end_at timestamptz not null,
  time_zone text not null check (char_length(btrim(time_zone)) between 1 and 128),
  status text not null check (status in ('pending', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_stable_id, request_id_hash),
  unique (tenant_stable_id, management_token_hash),
  foreign key (grant_id, business_workspace_id)
    references public.public_website_booking_grants(id, business_workspace_id) on delete restrict,
  foreign key (work_id, business_workspace_id)
    references public.saved_product_work(id, workspace_id) on delete restrict,
  check (end_at > start_at)
);

create index public_website_bookings_tenant_created_idx
  on public.public_website_bookings (tenant_stable_id, created_at desc);
create index public_website_bookings_work_idx
  on public.public_website_bookings (business_workspace_id, work_id, updated_at desc);

alter table public.public_website_bookings enable row level security;
revoke all on table public.public_website_bookings from public, anon, authenticated, service_role;
grant select, insert, update on table public.public_website_bookings to service_role;

create or replace function public.assert_public_website_booking_receipt() returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  grant_row public.public_website_booking_grants%rowtype;
begin
  select * into grant_row
    from public.public_website_booking_grants
   where id = new.grant_id
     and business_workspace_id = new.business_workspace_id
   for share;
  if not found then raise exception 'public_booking_grant_required'; end if;
  if tg_op = 'INSERT' and grant_row.status <> 'published' then
    raise exception 'public_booking_grant_revoked';
  end if;
  if new.tenant_stable_id is distinct from grant_row.tenant_stable_id
     or new.work_id is distinct from grant_row.work_id
     or new.capability_id is distinct from grant_row.capability_id
     or new.capability_version is distinct from grant_row.capability_version
     or new.provider is distinct from grant_row.provider then
    raise exception 'public_booking_receipt_binding_mismatch';
  end if;
  if tg_op = 'INSERT' then
    if public.workspace_exit_completed(new.business_workspace_id) then
      raise exception 'public_booking_workspace_exit_blocked';
    end if;
    if not exists (
      select 1
        from public.offering_website_bindings binding
       where binding.tenant_stable_id = new.tenant_stable_id
         and binding.business_workspace_id = new.business_workspace_id
         and binding.status = 'active'
    ) then
      raise exception 'public_booking_website_binding_required';
    end if;
  elsif public.workspace_exit_completed(new.business_workspace_id) then
    -- An existing receipt is retained as a recovery record after exit, but
    -- its slot and native linkage are immutable. Cancellation is the only
    -- public cleanup transition still allowed.
    if new.status <> 'cancelled'
      or (new.id, new.grant_id, new.tenant_stable_id, new.tenant_id_at_reservation,
          new.business_workspace_id, new.work_id, new.capability_id,
          new.capability_version, new.provider, new.inquiry_id,
          new.request_id_hash, new.calendar_request_id, new.management_token_hash,
          new.management_token_ciphertext, new.expected_revision, new.title,
          new.start_at, new.end_at, new.time_zone, new.created_at)
         is distinct from
         (old.id, old.grant_id, old.tenant_stable_id, old.tenant_id_at_reservation,
          old.business_workspace_id, old.work_id, old.capability_id,
          old.capability_version, old.provider, old.inquiry_id,
          old.request_id_hash, old.calendar_request_id, old.management_token_hash,
          old.management_token_ciphertext, old.expected_revision, old.title,
          old.start_at, old.end_at, old.time_zone, old.created_at) then
      raise exception 'public_booking_workspace_exit_blocked';
    end if;
  end if;
  return new;
end;
$$;

create trigger public_website_booking_receipt_validate_trg
  before insert or update on public.public_website_bookings
  for each row execute function public.assert_public_website_booking_receipt();
