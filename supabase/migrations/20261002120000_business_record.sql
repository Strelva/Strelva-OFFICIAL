-- Strelva Reborn item 1: one business record per customer workspace, and
-- item 3: an atomic tenant -> workspace conversion. Additive only. It does not
-- alter `tenants`, Redis, `/api/v1`, memberships of any tenant, or send email.
--
-- Record shape
--   business_records          1:1 with a customer workspace; revision counters.
--   business_record_facts     typed facts (closed key set, per-key validator)
--                             with provenance: source + verified.
--   business_services         services the business offers.
--   business_people           staff, optionally linked to a Strelva user.
--   business_contacts         people outside the business (customers, leads),
--                             deduplicated on normalized email and phone.
--   business_record_revisions immutable history. Every change records actor,
--                             source capability and before/after entity state,
--                             and any revision can be undone while the entities
--                             it touched still hold its "after" state.
--   tenant_workspace_links    one managed tenant <-> one business workspace,
--                             carrying the conversion receipt.
--   tenant_workspace_unlinks  immutable receipts of conversions reversed by
--                             unlink_tenant_from_business.
--
-- Revisions. `business_records.revision` counts profile changes (facts,
-- services, people) and is the optimistic-concurrency token for patches.
-- `last_sequence` numbers every history row, including contact intake, so
-- inquiry intake never makes an owner's open edit stale.
--
-- Access. Reads: any member of the customer workspace, or an agency member
-- holding an accepted, unexpired agency assignment with an accepted provider
-- delivery for that business (the same delivery authority used by
-- 20260918010000/20260920030000). That agency reads the profile (facts,
-- services, people) and the history of it; contacts, the contact count and
-- any revision that touched a contact stay with direct members. Systems and
-- other work-shaped reads narrow an agency further, to the exact work it was
-- delegated or assigned (business_record_agency_work_ids). Writes: workspace
-- owner/admin, or that agency. Source `operator` requires an active super admin who is a member;
-- `tenant_import` is reserved to the conversion RPC. Facts may be marked
-- verified only by owner or operator sources. Writes take the shared workspace
-- lock (hashtextextended(workspace,7415)) and stop after workspace exit.
--
-- Conversion operator decision. Production has no tenant memberships and
-- client owners do not sign in, so conversion never needs a client user and
-- never invites anyone. The conversion is run by a named Strelva operator: a
-- verified user with an active `super_admins` row. That operator becomes
-- `workspaces.created_by` and an `admin` member of the new customer workspace,
-- matching how a Strelva provider acts inside a customer business elsewhere
-- (accept_provider_delivery requires super admin + membership). The operator
-- is deliberately not `owner`: owner carries payer, exit, launch and
-- publication authority that belongs to the client when they are invited
-- (Reborn item 6). The per-user five-workspace cap of self-serve creation does
-- not apply to this operator path; it is bounded by one workspace per tenant.

create function public.business_record_sources() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['owner','operator','agency','tenant_import','website_rebuild','bookings','inquiries','agent']::text[]
$$;

create function public.business_contact_sources() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['inquiry','booking','tenant_import','owner','operator','agency','website','agent']::text[]
$$;

create function public.business_record_email_valid(p_email text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_email is not null and char_length(p_email) between 3 and 254
    and p_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
$$;

-- Digits only; a ten digit number is treated as North American (+1). Returns
-- null when fewer than 7 or more than 15 digits remain.
create function public.business_contact_phone_key(p_phone text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_phone is null then null
    when char_length(regexp_replace(p_phone, '[^0-9]', '', 'g')) = 10 then '1' || regexp_replace(p_phone, '[^0-9]', '', 'g')
    when char_length(regexp_replace(p_phone, '[^0-9]', '', 'g')) between 7 and 15 then regexp_replace(p_phone, '[^0-9]', '', 'g')
    else null end
$$;

create function public.business_record_text_valid(p_value jsonb, p_min integer, p_max integer) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(p_value) = 'string' and char_length(btrim(p_value #>> '{}')) between p_min and p_max
    and (p_value #>> '{}') = btrim(p_value #>> '{}')
$$;

create function public.business_record_time_valid(p_value jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(p_value) = 'string' and (p_value #>> '{}') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$'
$$;

-- One validator per fact key. The zod contract in
-- src/platform/business-record/contracts.ts mirrors these rules exactly.
create function public.business_record_fact_valid(p_key text, p_value jsonb) returns boolean
language plpgsql immutable set search_path = public, pg_temp as $$
declare item jsonb;
begin
  if p_value is null or octet_length(p_value::text) > 64000 then return false; end if;
  case p_key
    when 'legal_name', 'display_name' then
      return public.business_record_text_valid(p_value, 1, 160);
    when 'phone' then
      return public.business_record_text_valid(p_value, 3, 40)
        and public.business_contact_phone_key(p_value #>> '{}') is not null;
    when 'email' then
      return jsonb_typeof(p_value) = 'string'
        and public.business_record_email_valid(p_value #>> '{}')
        and (p_value #>> '{}') = lower(btrim(p_value #>> '{}'));
    when 'description' then
      return public.business_record_text_valid(p_value, 1, 2000);
    when 'owner_recipient' then
      -- Who Strelva notifies on the business's behalf. Recorded, never sent here.
      return jsonb_typeof(p_value) = 'object'
        and (p_value - array['email','name']::text[]) = '{}'::jsonb
        and jsonb_typeof(p_value->'email') = 'string'
        and public.business_record_email_valid(p_value->>'email')
        and (p_value->>'email') = lower(btrim(p_value->>'email'))
        and (not (p_value ? 'name') or public.business_record_text_valid(p_value->'name', 1, 160));
    when 'address' then
      if jsonb_typeof(p_value) <> 'object'
        or (p_value - array['formatted','line1','line2','city','region','postalCode','country']::text[]) <> '{}'::jsonb
        or (p_value->'formatted' is null and p_value->'line1' is null) then return false; end if;
      for item in select value from jsonb_each(p_value) loop
        if not public.business_record_text_valid(item, 1, 200) then return false; end if;
      end loop;
      return true;
    when 'service_area' then
      if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) not between 1 and 100 then return false; end if;
      for item in select value from jsonb_array_elements(p_value) loop
        if not public.business_record_text_valid(item, 1, 120) then return false; end if;
      end loop;
      return true;
    when 'links' then
      if jsonb_typeof(p_value) <> 'array' or jsonb_array_length(p_value) not between 1 and 30 then return false; end if;
      for item in select value from jsonb_array_elements(p_value) loop
        if jsonb_typeof(item) <> 'object'
          or (item - array['kind','url','label']::text[]) <> '{}'::jsonb
          or item->>'kind' is null
          or item->>'kind' not in ('website','booking','google_maps','google_business','instagram','facebook','linkedin','yelp','tiktok','x','youtube','other')
          or jsonb_typeof(item->'url') is distinct from 'string'
          or char_length(item->>'url') not between 8 and 2048
          or item->>'url' !~ '^https?://[^[:space:]]+$'
          or (item ? 'label' and not public.business_record_text_valid(item->'label', 1, 80)) then
          return false;
        end if;
      end loop;
      return true;
    when 'hours' then
      if jsonb_typeof(p_value) <> 'object'
        or (p_value - array['timezone','weekly','overrides']::text[]) <> '{}'::jsonb
        or not public.business_record_text_valid(p_value->'timezone', 1, 64)
        or jsonb_typeof(p_value->'weekly') is distinct from 'array'
        or jsonb_array_length(p_value->'weekly') > 70
        or (p_value ? 'overrides' and (jsonb_typeof(p_value->'overrides') <> 'array' or jsonb_array_length(p_value->'overrides') > 366)) then
        return false;
      end if;
      for item in select value from jsonb_array_elements(p_value->'weekly') loop
        if jsonb_typeof(item) <> 'object'
          or (item - array['day','opens','closes']::text[]) <> '{}'::jsonb
          or jsonb_typeof(item->'day') is distinct from 'number'
          or (item->>'day') !~ '^[0-6]$'
          or not public.business_record_time_valid(item->'opens')
          or not public.business_record_time_valid(item->'closes')
          or item->>'opens' >= item->>'closes' then
          return false;
        end if;
      end loop;
      for item in select value from jsonb_array_elements(coalesce(p_value->'overrides', '[]'::jsonb)) loop
        if jsonb_typeof(item) <> 'object'
          or (item - array['date','closed','opens','closes','label']::text[]) <> '{}'::jsonb
          or jsonb_typeof(item->'date') is distinct from 'string'
          or (item->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
          or jsonb_typeof(item->'closed') is distinct from 'boolean'
          or ((item->>'closed')::boolean and (item ? 'opens' or item ? 'closes'))
          or (not (item->>'closed')::boolean and (
               not public.business_record_time_valid(item->'opens')
               or not public.business_record_time_valid(item->'closes')
               or item->>'opens' >= item->>'closes'))
          or (item ? 'label' and not public.business_record_text_valid(item->'label', 1, 120)) then
          return false;
        end if;
        begin
          if to_char((item->>'date')::date, 'YYYY-MM-DD') <> item->>'date' then return false; end if;
        exception when others then return false;
        end;
      end loop;
      return true;
    else
      return false;
  end case;
end;
$$;

create table public.business_records (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp()
);

create table public.business_record_facts (
  workspace_id uuid not null references public.business_records(workspace_id) on delete cascade,
  fact_key text not null check (fact_key in ('legal_name','display_name','phone','email','address','service_area','hours','links','description','owner_recipient')),
  value jsonb not null,
  source text not null check (source in ('owner','operator','agency','tenant_import','website_rebuild','bookings','inquiries','agent')),
  verified boolean not null default false,
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, fact_key),
  check (public.business_record_fact_valid(fact_key, value)),
  check (not verified or source in ('owner','operator'))
);

create table public.business_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_records(workspace_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160 and name = btrim(name)),
  description text check (description is null or char_length(description) between 1 and 2000),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  price_text text check (price_text is null or char_length(price_text) between 1 and 80),
  active boolean not null default true,
  position integer not null default 0 check (position between 0 and 10000),
  external_ref text check (external_ref is null or char_length(external_ref) between 1 and 200),
  source text not null check (source in ('owner','operator','agency','tenant_import','website_rebuild','bookings','inquiries','agent')),
  verified boolean not null default false,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  check (not verified or source in ('owner','operator'))
);
create index business_services_workspace_idx on public.business_services(workspace_id, position, id);

create table public.business_people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_records(workspace_id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160 and name = btrim(name)),
  role_title text check (role_title is null or char_length(role_title) between 1 and 120),
  email text check (email is null or (public.business_record_email_valid(email) and email = lower(btrim(email)))),
  phone text check (phone is null or (char_length(phone) between 3 and 40 and public.business_contact_phone_key(phone) is not null)),
  user_id uuid references public.users(id) on delete set null,
  active boolean not null default true,
  source text not null check (source in ('owner','operator','agency','tenant_import','website_rebuild','bookings','inquiries','agent')),
  verified boolean not null default false,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  check (not verified or source in ('owner','operator'))
);
create index business_people_workspace_idx on public.business_people(workspace_id, id);
create unique index business_people_one_user_idx on public.business_people(workspace_id, user_id) where user_id is not null;

create table public.business_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.business_records(workspace_id) on delete cascade,
  name text check (name is null or char_length(name) between 1 and 160),
  email text check (email is null or (public.business_record_email_valid(email) and email = lower(btrim(email)))),
  phone text check (phone is null or (char_length(phone) between 3 and 40 and public.business_contact_phone_key(phone) is not null)),
  phone_key text generated always as (public.business_contact_phone_key(phone)) stored,
  sources text[] not null check (
    cardinality(sources) between 1 and 8
    and sources <@ array['inquiry','booking','tenant_import','owner','operator','agency','website','agent']::text[]
  ),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (email is not null or phone is not null),
  check (first_seen_at <= last_seen_at)
);
create unique index business_contacts_email_idx on public.business_contacts(workspace_id, email) where email is not null;
create unique index business_contacts_phone_idx on public.business_contacts(workspace_id, phone_key) where phone_key is not null;
create index business_contacts_recent_idx on public.business_contacts(workspace_id, last_seen_at desc, id);

create table public.business_record_revisions (
  workspace_id uuid not null references public.business_records(workspace_id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  record_revision bigint not null check (record_revision >= 0),
  actor_id uuid not null references public.users(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('member','agency','operator')),
  source text not null check (source in ('owner','operator','agency','tenant_import','website_rebuild','bookings','inquiries','agent')),
  command_id uuid not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  undo_of_sequence bigint,
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and octet_length(changes::text) <= 4000000),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, sequence),
  unique (workspace_id, command_id),
  unique (workspace_id, undo_of_sequence),
  foreign key (workspace_id, undo_of_sequence) references public.business_record_revisions(workspace_id, sequence),
  check (undo_of_sequence is null or undo_of_sequence < sequence)
);

create table public.tenant_workspace_links (
  id uuid primary key default gen_random_uuid(),
  -- Stable identity survives slug renames. A deprovisioned tenant clears the
  -- reference and keeps the receipt; the tenants table itself is not altered.
  tenant_stable_id uuid unique references public.tenants(stable_id) on delete set null,
  tenant_slug_at_link text not null check (char_length(tenant_slug_at_link) between 1 and 120),
  -- One business may run several managed sites (a multi-site account), so a
  -- workspace may hold many links; each tenant links to at most one workspace.
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  linked_by uuid not null references public.users(id) on delete restrict,
  linked_at timestamptz not null default clock_timestamp(),
  command_id uuid not null unique,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object' and octet_length(receipt::text) <= 64000)
);
create index tenant_workspace_links_workspace_idx on public.tenant_workspace_links(workspace_id, linked_at, id);

-- One row per reversed conversion. No foreign keys to the tenant or the
-- workspace: the unlink may delete the workspace, and the receipt must outlive
-- a later deprovision or rename. The receipt carries the original conversion
-- receipt, so the history of a site's conversions reads from here alone.
create table public.tenant_workspace_unlinks (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null unique,
  tenant_stable_id uuid not null,
  tenant_slug_at_unlink text not null check (char_length(tenant_slug_at_unlink) between 1 and 120),
  workspace_id uuid not null,
  link_command_id uuid not null,
  unlinked_by uuid not null references public.users(id) on delete restrict,
  unlinked_at timestamptz not null default clock_timestamp(),
  command_id uuid not null unique,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object' and octet_length(receipt::text) <= 256000)
);
create index tenant_workspace_unlinks_tenant_idx on public.tenant_workspace_unlinks(tenant_stable_id, unlinked_at desc, id);

alter table public.business_records enable row level security;
alter table public.business_record_facts enable row level security;
alter table public.business_services enable row level security;
alter table public.business_people enable row level security;
alter table public.business_contacts enable row level security;
alter table public.business_record_revisions enable row level security;
alter table public.tenant_workspace_links enable row level security;
alter table public.tenant_workspace_unlinks enable row level security;
revoke all on public.business_records, public.business_record_facts, public.business_services,
  public.business_people, public.business_contacts, public.business_record_revisions,
  public.tenant_workspace_links, public.tenant_workspace_unlinks from public, anon, authenticated, service_role;

-- History rows and conversion receipts never change. Deletion is allowed only
-- as part of removing the parent record (workspace deletion cascade).
create function public.business_record_history_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and tg_table_name = 'business_record_revisions'
    and not exists (select 1 from public.business_records where workspace_id = old.workspace_id) then
    return old;
  end if;
  raise exception 'business_record_history_immutable';
end;
$$;
create trigger business_record_revisions_immutable before update or delete on public.business_record_revisions
  for each row execute function public.business_record_history_immutable();
create function public.tenant_workspace_link_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  -- Only the tenant FK's own `on delete set null` may touch a link.
  if tg_op = 'UPDATE' and new.tenant_stable_id is null and old.tenant_stable_id is not null
    and (to_jsonb(new) - 'tenant_stable_id') = (to_jsonb(old) - 'tenant_stable_id') then
    return new;
  end if;
  -- unlink_tenant_from_business removes exactly the link it names, in the
  -- same transaction that records the unlink receipt.
  if tg_op = 'DELETE' and current_setting('strelva.tenant_unlink_link', true) = old.id::text then
    return old;
  end if;
  raise exception 'tenant_workspace_link_immutable';
end;
$$;
create trigger tenant_workspace_links_immutable before update or delete on public.tenant_workspace_links
  for each row execute function public.tenant_workspace_link_guard();
create function public.tenant_workspace_unlink_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'tenant_workspace_unlink_immutable';
end;
$$;
create trigger tenant_workspace_unlinks_immutable before update or delete on public.tenant_workspace_unlinks
  for each row execute function public.tenant_workspace_unlink_immutable();

-- Returns the access kind: owner | admin | member | agency.
create function public.business_record_assert_actor(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role text;
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then
    raise exception 'business_record_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'business_record_access_denied'; end if;
  if p_write then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
    perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer' for update;
    if not found then raise exception 'business_record_access_denied'; end if;
  end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and w.kind = 'customer'
    for share of wm;
  if actor_role is null and exists (
    select 1
      from public.operational_assignments a
      join public.offering_provider_deliveries d
        on d.assignment_id = a.id and d.business_workspace_id = a.workspace_id
      join public.workspaces agency on agency.id = a.assignee_workspace_id and agency.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = agency.id and am.user_id = p_user_id
      join public.workspaces customer on customer.id = a.workspace_id and customer.kind = 'customer'
      where a.workspace_id = p_workspace_id
        and a.assignee_kind = 'agency'
        and a.assignee_user_id = p_user_id
        and a.status = 'accepted' and a.expires_at > clock_timestamp()
        and d.status = 'accepted' and d.expires_at > clock_timestamp()
  ) then
    actor_role := 'agency';
  end if;
  if actor_role is null or (p_write and actor_role not in ('owner','admin','agency')) then
    raise exception 'business_record_access_denied';
  end if;
  if p_write and public.workspace_exit_completed(p_workspace_id) then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  return actor_role;
end;
$$;

-- The exact saved work a user who is NOT a direct member of this customer
-- business may reach, by the same two grants listWork/getWork honour in
-- src/platform/workspaces/repository.ts:
--   * an active workspace_delegations row held by an agency workspace the
--     user belongs to. Its scope is work:read, so it never counts for writes;
--   * an accepted, unexpired agency assignment whose provider delivery is
--     accepted on an active installation, checked per work id by
--     agency_can_read_assigned_work (the assignment's work and its steps).
-- The agency role from business_record_assert_actor says the agency serves
-- this business; it does not say which of the business's things it serves.
-- Every agency-facing read of work-shaped data filters by this list. Direct
-- members never need it. Returns an empty array, never null.
create function public.business_record_agency_work_ids(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean
) returns uuid[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare ids uuid[];
begin
  if p_workspace_id is null or p_user_id is null or p_verified_email is null then return '{}'; end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then return '{}'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer';
  if not found then return '{}'; end if;
  select coalesce(array_agg(distinct g.work_id), '{}') into ids from (
    select d.customer_work_id as work_id
      from public.workspace_delegations d
      join public.workspaces agency on agency.id = d.agency_workspace_id and agency.kind = 'agency'
      join public.workspace_memberships am on am.workspace_id = d.agency_workspace_id and am.user_id = p_user_id
      where not p_write and d.customer_workspace_id = p_workspace_id and d.status = 'active'
    union
    select w.id
      from public.saved_product_work w
      where w.workspace_id = p_workspace_id
        and w.id in (
          select a.work_id from public.operational_assignments a
            where a.workspace_id = p_workspace_id and a.assignee_user_id = p_user_id and a.assignee_kind = 'agency'
              and a.status = 'accepted' and a.expires_at > clock_timestamp()
          union
          select (step->>'workId')::uuid
            from public.operational_assignments a
            join public.saved_product_work aw on aw.id = a.work_id and aw.workspace_id = p_workspace_id
            cross join lateral jsonb_array_elements(case when jsonb_typeof(aw.payload->'steps') = 'array'
              then aw.payload->'steps' else '[]'::jsonb end) step
            where a.workspace_id = p_workspace_id and a.assignee_user_id = p_user_id and a.assignee_kind = 'agency'
              and a.status = 'accepted' and a.expires_at > clock_timestamp()
              and step->>'workId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        and public.agency_can_read_assigned_work(p_user_id, p_verified_email, p_workspace_id, w.id)
  ) g;
  return ids;
end;
$$;

-- True when a history row's changes include a contact. Agency reads of
-- history and agency undo both use this one rule.
create function public.business_record_revision_touches_contacts(p_changes jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_changes) = 'array' then p_changes else '[]'::jsonb end) c
    where c->>'entity' = 'contact')
$$;

-- Entity state is what history compares and restores. Timestamps use one
-- explicit UTC format so a comparison never depends on session time zone.
create function public.business_record_entity_state(p_workspace_id uuid, p_entity text, p_id text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare state jsonb;
begin
  case p_entity
    when 'fact' then
      select jsonb_build_object('value', f.value, 'source', f.source, 'verified', f.verified) into state
        from public.business_record_facts f where f.workspace_id = p_workspace_id and f.fact_key = p_id;
    when 'service' then
      select jsonb_build_object('name', s.name, 'description', s.description, 'durationMinutes', s.duration_minutes,
          'priceText', s.price_text, 'active', s.active, 'position', s.position, 'externalRef', s.external_ref,
          'source', s.source, 'verified', s.verified) into state
        from public.business_services s where s.workspace_id = p_workspace_id and s.id::text = p_id;
    when 'person' then
      select jsonb_build_object('name', p.name, 'roleTitle', p.role_title, 'email', p.email, 'phone', p.phone,
          'userId', p.user_id, 'active', p.active, 'source', p.source, 'verified', p.verified) into state
        from public.business_people p where p.workspace_id = p_workspace_id and p.id::text = p_id;
    when 'contact' then
      select jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'sources', to_jsonb(c.sources),
          'firstSeenAt', to_char(c.first_seen_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
          'lastSeenAt', to_char(c.last_seen_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) into state
        from public.business_contacts c where c.workspace_id = p_workspace_id and c.id::text = p_id;
    else
      raise exception 'business_record_patch_invalid';
  end case;
  return state;
end;
$$;

create function public.business_record_entity_write(
  p_workspace_id uuid, p_entity text, p_id text, p_state jsonb, p_actor_id uuid
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare touched integer;
begin
  if p_state is null then
    case p_entity
      when 'fact' then delete from public.business_record_facts where workspace_id = p_workspace_id and fact_key = p_id;
      when 'service' then delete from public.business_services where workspace_id = p_workspace_id and id::text = p_id;
      when 'person' then delete from public.business_people where workspace_id = p_workspace_id and id::text = p_id;
      when 'contact' then delete from public.business_contacts where workspace_id = p_workspace_id and id::text = p_id;
      else raise exception 'business_record_patch_invalid';
    end case;
    get diagnostics touched = row_count;
    if touched <> 1 then raise exception 'business_record_entity_not_found'; end if;
    return;
  end if;
  case p_entity
    when 'fact' then
      insert into public.business_record_facts(workspace_id, fact_key, value, source, verified, updated_by)
        values (p_workspace_id, p_id, p_state->'value', p_state->>'source', (p_state->>'verified')::boolean, p_actor_id)
        on conflict (workspace_id, fact_key) do update set value = excluded.value, source = excluded.source,
          verified = excluded.verified, updated_by = excluded.updated_by, updated_at = clock_timestamp();
    when 'service' then
      insert into public.business_services(id, workspace_id, name, description, duration_minutes, price_text, active,
          position, external_ref, source, verified, created_by, updated_by)
        values (p_id::uuid, p_workspace_id, p_state->>'name', p_state->>'description', (p_state->>'durationMinutes')::integer,
          p_state->>'priceText', (p_state->>'active')::boolean, (p_state->>'position')::integer, p_state->>'externalRef',
          p_state->>'source', (p_state->>'verified')::boolean, p_actor_id, p_actor_id)
        on conflict (id) do update set name = excluded.name, description = excluded.description,
          duration_minutes = excluded.duration_minutes, price_text = excluded.price_text, active = excluded.active,
          position = excluded.position, external_ref = excluded.external_ref, source = excluded.source,
          verified = excluded.verified, updated_by = excluded.updated_by, updated_at = clock_timestamp()
        where business_services.workspace_id = excluded.workspace_id;
    when 'person' then
      insert into public.business_people(id, workspace_id, name, role_title, email, phone, user_id, active, source,
          verified, created_by, updated_by)
        values (p_id::uuid, p_workspace_id, p_state->>'name', p_state->>'roleTitle', p_state->>'email', p_state->>'phone',
          (p_state->>'userId')::uuid, (p_state->>'active')::boolean, p_state->>'source', (p_state->>'verified')::boolean,
          p_actor_id, p_actor_id)
        on conflict (id) do update set name = excluded.name, role_title = excluded.role_title, email = excluded.email,
          phone = excluded.phone, user_id = excluded.user_id, active = excluded.active, source = excluded.source,
          verified = excluded.verified, updated_by = excluded.updated_by, updated_at = clock_timestamp()
        where business_people.workspace_id = excluded.workspace_id;
    when 'contact' then
      insert into public.business_contacts(id, workspace_id, name, email, phone, sources, first_seen_at, last_seen_at)
        values (p_id::uuid, p_workspace_id, p_state->>'name', p_state->>'email', p_state->>'phone',
          array(select jsonb_array_elements_text(p_state->'sources')),
          (p_state->>'firstSeenAt')::timestamptz, (p_state->>'lastSeenAt')::timestamptz)
        on conflict (id) do update set name = excluded.name, email = excluded.email, phone = excluded.phone,
          sources = excluded.sources, first_seen_at = excluded.first_seen_at, last_seen_at = excluded.last_seen_at,
          updated_at = clock_timestamp()
        where business_contacts.workspace_id = excluded.workspace_id;
    else
      raise exception 'business_record_patch_invalid';
  end case;
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'business_record_entity_not_found'; end if;
end;
$$;

-- Applies one command atomically and writes exactly one history row. Callers
-- have already checked the actor, idempotency and expected revision.
create function public.business_record_apply(
  p_workspace_id uuid, p_actor_id uuid, p_actor_kind text, p_source text,
  p_patch jsonb, p_contacts jsonb, p_undo_of bigint,
  p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  rec public.business_records%rowtype;
  changes jsonb := '[]'::jsonb;
  change jsonb;
  item jsonb;
  key text;
  entity_id text;
  before_state jsonb;
  after_state jsonb;
  target public.business_record_revisions%rowtype;
  existing public.business_contacts%rowtype;
  contact_email text;
  contact_phone text;
  contact_key text;
  contact_seen timestamptz;
  contact_source text;
  created_count integer := 0;
  merged_count integer := 0;
  unchanged_count integer := 0;
  profile_changed boolean := false;
  result jsonb;
begin
  insert into public.business_records(workspace_id, created_by, updated_by)
    values (p_workspace_id, p_actor_id, p_actor_id) on conflict (workspace_id) do nothing;
  select * into rec from public.business_records where workspace_id = p_workspace_id for update;

  begin
    if p_undo_of is not null then
      select * into target from public.business_record_revisions
        where workspace_id = p_workspace_id and sequence = p_undo_of;
      if not found then raise exception 'business_record_revision_not_found'; end if;
      if exists (select 1 from public.business_record_revisions where workspace_id = p_workspace_id and undo_of_sequence = p_undo_of) then
        raise exception 'business_record_undo_already_applied';
      end if;
      for change in select value from jsonb_array_elements(target.changes) with ordinality t(value, n) order by n desc loop
        before_state := public.business_record_entity_state(p_workspace_id, change->>'entity', change->>'id');
        if before_state is distinct from (case when jsonb_typeof(change->'after') = 'null' then null else change->'after' end) then
          raise exception 'business_record_undo_conflict';
        end if;
        after_state := case when jsonb_typeof(change->'before') = 'null' then null else change->'before' end;
        perform public.business_record_entity_write(p_workspace_id, change->>'entity', change->>'id', after_state, p_actor_id);
        after_state := public.business_record_entity_state(p_workspace_id, change->>'entity', change->>'id');
        changes := changes || jsonb_build_array(jsonb_build_object('entity', change->>'entity', 'id', change->>'id',
          'before', coalesce(before_state, 'null'::jsonb), 'after', coalesce(after_state, 'null'::jsonb)));
      end loop;
    end if;

    if p_patch is not null then
      if jsonb_typeof(p_patch) <> 'object' or (p_patch - array['facts','services','people']::text[]) <> '{}'::jsonb
        or (p_patch ? 'facts' and jsonb_typeof(p_patch->'facts') <> 'object')
        or (p_patch ? 'services' and (jsonb_typeof(p_patch->'services') <> 'array' or jsonb_array_length(p_patch->'services') > 200))
        or (p_patch ? 'people' and (jsonb_typeof(p_patch->'people') <> 'array' or jsonb_array_length(p_patch->'people') > 200)) then
        raise exception 'business_record_patch_invalid';
      end if;
      for key, item in select k, v from jsonb_each(coalesce(p_patch->'facts', '{}'::jsonb)) e(k, v) loop
        before_state := public.business_record_entity_state(p_workspace_id, 'fact', key);
        if jsonb_typeof(item) = 'null' then
          if before_state is null then continue; end if;
          after_state := null;
        else
          if jsonb_typeof(item) <> 'object' or (item - array['value','verified']::text[]) <> '{}'::jsonb
            or item->'value' is null
            or (item ? 'verified' and jsonb_typeof(item->'verified') <> 'boolean')
            or not public.business_record_fact_valid(key, item->'value') then
            raise exception 'business_record_patch_invalid';
          end if;
          after_state := jsonb_build_object('value', item->'value', 'source', p_source,
            'verified', coalesce((item->>'verified')::boolean, false));
        end if;
        if before_state is distinct from after_state then
          perform public.business_record_entity_write(p_workspace_id, 'fact', key, after_state, p_actor_id);
          after_state := public.business_record_entity_state(p_workspace_id, 'fact', key);
          changes := changes || jsonb_build_array(jsonb_build_object('entity', 'fact', 'id', key,
            'before', coalesce(before_state, 'null'::jsonb), 'after', coalesce(after_state, 'null'::jsonb)));
        end if;
      end loop;

      for item in select value from jsonb_array_elements(coalesce(p_patch->'services', '[]'::jsonb)) loop
        if jsonb_typeof(item) <> 'object' or item->>'op' not in ('upsert','remove') then raise exception 'business_record_patch_invalid'; end if;
        entity_id := coalesce(item->>'id', case when item->>'op' = 'upsert' then gen_random_uuid()::text end);
        if entity_id is null or entity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'business_record_patch_invalid';
        end if;
        before_state := public.business_record_entity_state(p_workspace_id, 'service', entity_id);
        if item ? 'id' and before_state is null then raise exception 'business_record_entity_not_found'; end if;
        if item->>'op' = 'remove' then
          if (item - array['op','id']::text[]) <> '{}'::jsonb then raise exception 'business_record_patch_invalid'; end if;
          after_state := null;
        else
          if (item - array['op','id','name','description','durationMinutes','priceText','active','position','externalRef','verified']::text[]) <> '{}'::jsonb
            or jsonb_typeof(item->'name') is distinct from 'string'
            or (item ? 'description' and jsonb_typeof(item->'description') not in ('string','null'))
            or (item ? 'durationMinutes' and jsonb_typeof(item->'durationMinutes') not in ('number','null'))
            or (item ? 'priceText' and jsonb_typeof(item->'priceText') not in ('string','null'))
            or (item ? 'active' and jsonb_typeof(item->'active') <> 'boolean')
            or (item ? 'position' and jsonb_typeof(item->'position') <> 'number')
            or (item ? 'externalRef' and jsonb_typeof(item->'externalRef') not in ('string','null'))
            or (item ? 'verified' and jsonb_typeof(item->'verified') <> 'boolean') then
            raise exception 'business_record_patch_invalid';
          end if;
          after_state := jsonb_build_object('name', item->>'name', 'description', item->>'description',
            'durationMinutes', item->'durationMinutes', 'priceText', item->>'priceText',
            'active', coalesce((item->>'active')::boolean, true), 'position', coalesce((item->>'position')::integer, 0),
            'externalRef', item->>'externalRef', 'source', p_source, 'verified', coalesce((item->>'verified')::boolean, false));
          after_state := jsonb_set(after_state, '{durationMinutes}', coalesce(after_state->'durationMinutes', 'null'::jsonb));
        end if;
        if before_state is distinct from after_state then
          perform public.business_record_entity_write(p_workspace_id, 'service', entity_id, after_state, p_actor_id);
          after_state := public.business_record_entity_state(p_workspace_id, 'service', entity_id);
          changes := changes || jsonb_build_array(jsonb_build_object('entity', 'service', 'id', entity_id,
            'before', coalesce(before_state, 'null'::jsonb), 'after', coalesce(after_state, 'null'::jsonb)));
        end if;
      end loop;

      for item in select value from jsonb_array_elements(coalesce(p_patch->'people', '[]'::jsonb)) loop
        if jsonb_typeof(item) <> 'object' or item->>'op' not in ('upsert','remove') then raise exception 'business_record_patch_invalid'; end if;
        entity_id := coalesce(item->>'id', case when item->>'op' = 'upsert' then gen_random_uuid()::text end);
        if entity_id is null or entity_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception 'business_record_patch_invalid';
        end if;
        before_state := public.business_record_entity_state(p_workspace_id, 'person', entity_id);
        if item ? 'id' and before_state is null then raise exception 'business_record_entity_not_found'; end if;
        if item->>'op' = 'remove' then
          if (item - array['op','id']::text[]) <> '{}'::jsonb then raise exception 'business_record_patch_invalid'; end if;
          after_state := null;
        else
          if (item - array['op','id','name','roleTitle','email','phone','userId','active','verified']::text[]) <> '{}'::jsonb
            or jsonb_typeof(item->'name') is distinct from 'string'
            or (item ? 'roleTitle' and jsonb_typeof(item->'roleTitle') not in ('string','null'))
            or (item ? 'email' and jsonb_typeof(item->'email') not in ('string','null'))
            or (item ? 'phone' and jsonb_typeof(item->'phone') not in ('string','null'))
            or (item ? 'userId' and jsonb_typeof(item->'userId') not in ('string','null'))
            or (item ? 'active' and jsonb_typeof(item->'active') <> 'boolean')
            or (item ? 'verified' and jsonb_typeof(item->'verified') <> 'boolean') then
            raise exception 'business_record_patch_invalid';
          end if;
          -- A staff link names a current member of this business, never an outsider.
          if item->>'userId' is not null and not exists (select 1 from public.workspace_memberships
              where workspace_id = p_workspace_id and user_id::text = item->>'userId') then
            raise exception 'business_record_patch_invalid';
          end if;
          after_state := jsonb_build_object('name', item->>'name', 'roleTitle', item->>'roleTitle', 'email', item->>'email',
            'phone', item->>'phone', 'userId', item->>'userId', 'active', coalesce((item->>'active')::boolean, true),
            'source', p_source, 'verified', coalesce((item->>'verified')::boolean, false));
        end if;
        if before_state is distinct from after_state then
          perform public.business_record_entity_write(p_workspace_id, 'person', entity_id, after_state, p_actor_id);
          after_state := public.business_record_entity_state(p_workspace_id, 'person', entity_id);
          changes := changes || jsonb_build_array(jsonb_build_object('entity', 'person', 'id', entity_id,
            'before', coalesce(before_state, 'null'::jsonb), 'after', coalesce(after_state, 'null'::jsonb)));
        end if;
      end loop;
      if (select count(*) from public.business_services where workspace_id = p_workspace_id) > 200
        or (select count(*) from public.business_people where workspace_id = p_workspace_id) > 200 then
        raise exception 'business_record_limit_reached';
      end if;
    end if;

    if p_contacts is not null then
      if jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) not between 1 and 1000 then
        raise exception 'business_record_patch_invalid';
      end if;
      for item in select value from jsonb_array_elements(p_contacts) loop
        if jsonb_typeof(item) <> 'object' or (item - array['name','email','phone','source','seenAt']::text[]) <> '{}'::jsonb
          or (item ? 'name' and jsonb_typeof(item->'name') not in ('string','null'))
          or (item ? 'email' and jsonb_typeof(item->'email') not in ('string','null'))
          or (item ? 'phone' and jsonb_typeof(item->'phone') not in ('string','null'))
          or (item ? 'seenAt' and jsonb_typeof(item->'seenAt') not in ('string','null'))
          or not (item->>'source' = any(public.business_contact_sources())) then
          raise exception 'business_record_patch_invalid';
        end if;
        contact_email := nullif(lower(btrim(coalesce(item->>'email', ''))), '');
        contact_phone := nullif(btrim(coalesce(item->>'phone', '')), '');
        contact_key := public.business_contact_phone_key(contact_phone);
        contact_source := item->>'source';
        contact_seen := coalesce((item->>'seenAt')::timestamptz, clock_timestamp());
        if (contact_email is not null and not public.business_record_email_valid(contact_email))
          or (contact_phone is not null and contact_key is null)
          or (contact_email is null and contact_phone is null) then
          raise exception 'business_record_patch_invalid';
        end if;
        existing := null;
        if contact_email is not null then
          select * into existing from public.business_contacts where workspace_id = p_workspace_id and email = contact_email for update;
        end if;
        if existing.id is null and contact_key is not null then
          select * into existing from public.business_contacts where workspace_id = p_workspace_id and phone_key = contact_key for update;
        end if;
        if existing.id is null then
          entity_id := gen_random_uuid()::text;
          before_state := null;
          after_state := jsonb_build_object('name', nullif(btrim(coalesce(item->>'name', '')), ''), 'email', contact_email,
            'phone', contact_phone, 'sources', jsonb_build_array(contact_source),
            'firstSeenAt', contact_seen, 'lastSeenAt', contact_seen);
          created_count := created_count + 1;
        else
          entity_id := existing.id::text;
          before_state := public.business_record_entity_state(p_workspace_id, 'contact', entity_id);
          -- Fill only what is missing; never steal an identifier another
          -- contact already holds, and never overwrite a name already known.
          after_state := jsonb_build_object(
            'name', coalesce(existing.name, nullif(btrim(coalesce(item->>'name', '')), '')),
            'email', coalesce(existing.email, case when contact_email is not null and not exists (
                select 1 from public.business_contacts where workspace_id = p_workspace_id and email = contact_email) then contact_email end),
            'phone', coalesce(existing.phone, case when contact_key is not null and not exists (
                select 1 from public.business_contacts where workspace_id = p_workspace_id and phone_key = contact_key) then contact_phone end),
            'sources', to_jsonb(array(select distinct s from unnest(existing.sources || contact_source) s order by s)),
            'firstSeenAt', least(existing.first_seen_at, contact_seen),
            'lastSeenAt', greatest(existing.last_seen_at, contact_seen));
        end if;
        perform public.business_record_entity_write(p_workspace_id, 'contact', entity_id, after_state, p_actor_id);
        after_state := public.business_record_entity_state(p_workspace_id, 'contact', entity_id);
        if before_state is distinct from after_state then
          if before_state is not null then merged_count := merged_count + 1; end if;
          changes := changes || jsonb_build_array(jsonb_build_object('entity', 'contact', 'id', entity_id,
            'before', coalesce(before_state, 'null'::jsonb), 'after', after_state));
        elsif before_state is not null then
          unchanged_count := unchanged_count + 1;
        end if;
      end loop;
      if (select count(*) from public.business_contacts where workspace_id = p_workspace_id) > 100000 then
        raise exception 'business_record_limit_reached';
      end if;
    end if;
  exception
    when check_violation or not_null_violation or invalid_text_representation or invalid_datetime_format
      or datetime_field_overflow or numeric_value_out_of_range or invalid_parameter_value then
      raise exception 'business_record_patch_invalid';
    when foreign_key_violation then
      raise exception 'business_record_patch_invalid';
    when unique_violation then
      raise exception 'business_record_conflict';
  end;

  profile_changed := exists (select 1 from jsonb_array_elements(changes) c where c->>'entity' in ('fact','service','person'));
  result := jsonb_build_object(
    'workspaceId', p_workspace_id,
    'sequence', rec.last_sequence + 1,
    'revision', rec.revision + case when profile_changed then 1 else 0 end,
    'changeCount', jsonb_array_length(changes),
    'undoOf', p_undo_of,
    'contacts', jsonb_build_object('created', created_count, 'merged', merged_count, 'unchanged', unchanged_count),
    'replayed', false
  );
  insert into public.business_record_revisions(workspace_id, sequence, record_revision, actor_id, actor_kind, source,
      command_id, command_digest, undo_of_sequence, changes, result)
    values (p_workspace_id, rec.last_sequence + 1, (result->>'revision')::bigint, p_actor_id, p_actor_kind, p_source,
      p_command_id, p_command_digest, p_undo_of, changes, result);
  update public.business_records set revision = (result->>'revision')::bigint, last_sequence = rec.last_sequence + 1,
    updated_by = p_actor_id, updated_at = clock_timestamp() where workspace_id = p_workspace_id;
  return result;
end;
$$;

-- Shared front half of every write RPC: actor, source and command checks, then
-- a replay of the exact command when it already committed.
create function public.business_record_begin_write(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_source text,
  p_command_id uuid, p_command_digest text, out access text, out actor_kind text, out replay jsonb
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare prior public.business_record_revisions%rowtype;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'business_record_command_invalid';
  end if;
  access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  if p_source is null or not (p_source = any(public.business_record_sources())) or p_source = 'tenant_import'
    or (access = 'agency' and p_source <> 'agency')
    or (access <> 'agency' and p_source = 'agency') then
    raise exception 'business_record_source_invalid';
  end if;
  actor_kind := case when access = 'agency' then 'agency' else 'member' end;
  if p_source = 'operator' then
    if not exists (select 1 from public.super_admins where user_id = p_user_id and revoked_at is null) then
      raise exception 'business_record_source_invalid';
    end if;
    actor_kind := 'operator';
  end if;
  select * into prior from public.business_record_revisions
    where workspace_id = p_workspace_id and command_id = p_command_id;
  if found then
    if prior.command_digest <> p_command_digest or prior.actor_id <> p_user_id then
      raise exception 'business_record_idempotency_conflict';
    end if;
    replay := prior.result || jsonb_build_object('replayed', true);
  end if;
end;
$$;

create function public.read_business_record(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare access text; rec public.business_records%rowtype;
begin
  access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  select * into rec from public.business_records where workspace_id = p_workspace_id;
  return jsonb_build_object(
    'workspaceId', p_workspace_id,
    'access', access,
    'revision', coalesce(rec.revision, 0),
    'lastSequence', coalesce(rec.last_sequence, 0),
    'updatedAt', rec.updated_at,
    'facts', coalesce((select jsonb_object_agg(f.fact_key, jsonb_build_object('value', f.value, 'source', f.source,
        'verified', f.verified, 'updatedAt', f.updated_at, 'updatedBy', f.updated_by))
      from public.business_record_facts f where f.workspace_id = p_workspace_id), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
        'durationMinutes', s.duration_minutes, 'priceText', s.price_text, 'active', s.active, 'position', s.position,
        'externalRef', s.external_ref, 'source', s.source, 'verified', s.verified, 'updatedAt', s.updated_at)
        order by s.position, s.name, s.id)
      from public.business_services s where s.workspace_id = p_workspace_id), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'roleTitle', p.role_title,
        'email', p.email, 'phone', p.phone, 'userId', p.user_id, 'active', p.active, 'source', p.source,
        'verified', p.verified, 'updatedAt', p.updated_at) order by p.name, p.id)
      from public.business_people p where p.workspace_id = p_workspace_id), '[]'::jsonb),
    -- Contacts are the business's customers, not part of any agency's work:
    -- an agency reads the profile it helps keep, never the contact book.
    'contactCount', case when access = 'agency' then null
      else (select count(*) from public.business_contacts c where c.workspace_id = p_workspace_id) end
  );
end;
$$;

create function public.patch_business_record(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_source text,
  p_expected_revision bigint, p_patch jsonb, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w record; current_revision bigint;
begin
  select * into w from public.business_record_begin_write(p_workspace_id, p_user_id, p_verified_email, p_source, p_command_id, p_command_digest);
  if w.replay is not null then return w.replay; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'business_record_patch_invalid';
  end if;
  if w.access = 'agency' and (
    exists (select 1 from jsonb_each(coalesce(p_patch->'facts', '{}'::jsonb)) e where e.value->>'verified' = 'true')
    or exists (select 1 from jsonb_array_elements(coalesce(p_patch->'services', '[]'::jsonb)) e where e->>'verified' = 'true')
    or exists (select 1 from jsonb_array_elements(coalesce(p_patch->'people', '[]'::jsonb)) e where e->>'verified' = 'true')) then
    raise exception 'business_record_source_invalid';
  end if;
  select revision into current_revision from public.business_records where workspace_id = p_workspace_id for update;
  if p_expected_revision is null or coalesce(current_revision, 0) <> p_expected_revision then
    raise exception 'business_record_revision_conflict';
  end if;
  return public.business_record_apply(p_workspace_id, p_user_id, w.actor_kind, p_source, p_patch, null, null,
    p_command_id, p_command_digest);
end;
$$;

create function public.undo_business_record_revision(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_source text,
  p_sequence bigint, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w record;
begin
  select * into w from public.business_record_begin_write(p_workspace_id, p_user_id, p_verified_email, p_source, p_command_id, p_command_digest);
  if w.replay is not null then return w.replay; end if;
  if p_sequence is null or p_sequence < 1 then raise exception 'business_record_revision_not_found'; end if;
  -- An agency never sees a revision that touched contacts, so it cannot undo one.
  if w.access = 'agency' and exists (select 1 from public.business_record_revisions r
      where r.workspace_id = p_workspace_id and r.sequence = p_sequence
        and public.business_record_revision_touches_contacts(r.changes)) then
    raise exception 'business_record_revision_not_found';
  end if;
  return public.business_record_apply(p_workspace_id, p_user_id, w.actor_kind, p_source, null, null, p_sequence,
    p_command_id, p_command_digest);
end;
$$;

create function public.upsert_business_contacts(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_source text,
  p_contacts jsonb, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare w record;
begin
  select * into w from public.business_record_begin_write(p_workspace_id, p_user_id, p_verified_email, p_source, p_command_id, p_command_digest);
  if w.replay is not null then return w.replay; end if;
  return public.business_record_apply(p_workspace_id, p_user_id, w.actor_kind, p_source, null, p_contacts, null,
    p_command_id, p_command_digest);
end;
$$;

create function public.read_business_contacts(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_limit integer default 100
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Direct members only. Contacts carry no work or delivery an agency could
  -- be scoped to, so an agency is refused rather than shown a filtered list.
  if public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false) = 'agency' then
    raise exception 'business_record_access_denied';
  end if;
  if p_limit is null or p_limit not between 1 and 500 then raise exception 'business_record_patch_invalid'; end if;
  return coalesce((select jsonb_agg(item order by (item->>'lastSeenAt') desc, item->>'id') from (
    select jsonb_build_object('id', c.id, 'name', c.name, 'email', c.email, 'phone', c.phone, 'sources', to_jsonb(c.sources),
      'firstSeenAt', c.first_seen_at, 'lastSeenAt', c.last_seen_at) item
    from public.business_contacts c where c.workspace_id = p_workspace_id
    order by c.last_seen_at desc, c.id limit p_limit) page), '[]'::jsonb);
end;
$$;

create function public.read_business_record_history(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_limit integer default 50
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare access text;
begin
  access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  if p_limit is null or p_limit not between 1 and 200 then raise exception 'business_record_patch_invalid'; end if;
  -- An agency sees the profile history it can act on (facts, services,
  -- people). Revisions that touched contacts carry customer details in their
  -- before/after states and stay with direct members.
  return coalesce((select jsonb_agg(item order by (item->>'sequence')::bigint desc) from (
    select jsonb_build_object('sequence', r.sequence, 'revision', r.record_revision, 'actorId', r.actor_id,
      'actorKind', r.actor_kind, 'source', r.source, 'undoOf', r.undo_of_sequence,
      'undoneBy', (select u.sequence from public.business_record_revisions u where u.workspace_id = r.workspace_id and u.undo_of_sequence = r.sequence),
      'changes', r.changes, 'createdAt', r.created_at) item
    from public.business_record_revisions r where r.workspace_id = p_workspace_id
      and (access <> 'agency' or not public.business_record_revision_touches_contacts(r.changes))
    order by r.sequence desc limit p_limit) page), '[]'::jsonb);
end;
$$;

create function public.tenant_conversion_assert_operator(p_operator_email text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid;
begin
  select u.id into operator_id from public.users u
    join public.super_admins sa on sa.user_id = u.id and sa.revoked_at is null
    where lower(u.email) = lower(btrim(p_operator_email)) and u.verified_at is not null
    for key share of u;
  if operator_id is null then raise exception 'tenant_conversion_operator_required'; end if;
  return operator_id;
end;
$$;

create function public.read_tenant_workspace_link(p_operator_email text, p_tenant_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare tenant_row record; link public.tenant_workspace_links%rowtype;
begin
  perform public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id, t.site_name into tenant_row from public.tenants t where t.id = p_tenant_id;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  return jsonb_build_object('tenantId', tenant_row.id, 'tenantStableId', tenant_row.stable_id,
    'siteName', tenant_row.site_name,
    'link', case when link.id is null then null else jsonb_build_object('workspaceId', link.workspace_id,
      'linkedBy', link.linked_by, 'linkedAt', link.linked_at, 'receipt', link.receipt) end);
end;
$$;

-- One atomic conversion. p_import is the plan built by
-- src/platform/business-record/tenant-import.ts:
--   { tenantId, tenantStableId, workspaceName, targetWorkspaceId?, billing?, account?,
--     patch: {facts,services,people}, contacts: [...] }
-- A repeated command replays its receipt; a tenant that is already linked
-- returns the existing receipt and writes nothing. With targetWorkspaceId the
-- tenant joins a business that already holds a linked site (one account, many
-- sites): only facts the record lacks are filled, services and people only when
-- the record has none, and contacts merge. Billing and account are recorded in
-- the receipt for review; nothing here reads or changes Stripe or allowances.
create function public.convert_tenant_to_business(
  p_operator_email text, p_tenant_id text, p_import jsonb, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  tenant_row record;
  link public.tenant_workspace_links%rowtype;
  business_id uuid;
  joined boolean := false;
  patch jsonb;
  applied jsonb;
  receipt jsonb;
  workspace_name text;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
    or p_import is null or jsonb_typeof(p_import) <> 'object'
    or (p_import - array['tenantId','tenantStableId','workspaceName','targetWorkspaceId','billing','account','patch','contacts']::text[]) <> '{}'::jsonb
    or (p_import ? 'billing' and jsonb_typeof(p_import->'billing') not in ('object','null'))
    or (p_import ? 'account' and jsonb_typeof(p_import->'account') not in ('object','null'))
    or octet_length(coalesce(p_import->'billing', 'null')::text) + octet_length(coalesce(p_import->'account', 'null')::text) > 16000 then
    raise exception 'tenant_conversion_invalid';
  end if;
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id, t.site_name, t.active into tenant_row from public.tenants t where t.id = p_tenant_id for share;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  if p_import->>'tenantId' is distinct from tenant_row.id
    or p_import->>'tenantStableId' is distinct from tenant_row.stable_id::text then
    raise exception 'tenant_conversion_identity_mismatch';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tenant-conversion:' || tenant_row.stable_id::text, 0));

  select * into link from public.tenant_workspace_links where command_id = p_command_id;
  if found then
    if link.command_digest <> p_command_digest then raise exception 'tenant_conversion_idempotency_conflict'; end if;
    return link.receipt || jsonb_build_object('replayed', true, 'alreadyConverted', true);
  end if;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if found then
    return link.receipt || jsonb_build_object('replayed', true, 'alreadyConverted', true);
  end if;

  patch := coalesce(p_import->'patch', '{}'::jsonb);
  if jsonb_typeof(patch) <> 'object' then raise exception 'tenant_conversion_invalid'; end if;
  if p_import->>'targetWorkspaceId' is not null then
    begin business_id := (p_import->>'targetWorkspaceId')::uuid;
    exception when invalid_text_representation then raise exception 'tenant_conversion_invalid'; end;
    -- Joining requires a customer business that already holds a converted
    -- site and that this operator already operates.
    perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
    perform 1 from public.workspaces w
      join public.workspace_memberships m on m.workspace_id = w.id and m.user_id = operator_id and m.role in ('owner','admin')
      where w.id = business_id and w.kind = 'customer' for update of w;
    if not found or not exists (select 1 from public.tenant_workspace_links where workspace_id = business_id) then
      raise exception 'tenant_conversion_target_invalid';
    end if;
    if public.workspace_exit_completed(business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
    select name into workspace_name from public.workspaces where id = business_id;
    joined := true;
    patch := jsonb_strip_nulls(jsonb_build_object(
      'facts', (select jsonb_object_agg(e.key, e.value) from jsonb_each(coalesce(patch->'facts', '{}'::jsonb)) e
        where not exists (select 1 from public.business_record_facts f where f.workspace_id = business_id and f.fact_key = e.key)),
      'services', case when exists (select 1 from public.business_services where workspace_id = business_id) then null else patch->'services' end,
      'people', case when exists (select 1 from public.business_people where workspace_id = business_id) then null else patch->'people' end));
  else
    workspace_name := left(btrim(coalesce(p_import->>'workspaceName', tenant_row.site_name)), 120);
    if char_length(workspace_name) < 1 then raise exception 'tenant_conversion_invalid'; end if;
    insert into public.workspaces(kind, name, created_by) values ('customer', workspace_name, operator_id)
      returning id into business_id;
    insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
      values (business_id, operator_id, 'admin', operator_id);
    perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
  end if;

  -- Conversion idempotency lives on the link. When this site was converted
  -- into this same business before and then unlinked, the record's history
  -- already holds the command id, so the new import revision gets its own.
  applied := public.business_record_apply(business_id, operator_id, 'operator', 'tenant_import', patch,
    case when jsonb_array_length(coalesce(p_import->'contacts', '[]'::jsonb)) = 0 then null else p_import->'contacts' end,
    null,
    case when exists (select 1 from public.business_record_revisions where workspace_id = business_id and command_id = p_command_id)
      then gen_random_uuid() else p_command_id end,
    p_command_digest);

  receipt := jsonb_build_object(
    'kind', 'tenant_conversion',
    'version', 1,
    'tenantId', tenant_row.id,
    'tenantStableId', tenant_row.stable_id,
    'tenantActive', tenant_row.active,
    'workspaceId', business_id,
    'workspaceName', workspace_name,
    'joinedExistingWorkspace', joined,
    'operatorId', operator_id,
    'operatorRole', 'admin',
    'billing', coalesce(p_import->'billing', 'null'::jsonb),
    'account', coalesce(p_import->'account', 'null'::jsonb),
    'sequence', applied->'sequence',
    'revision', applied->'revision',
    'changeCount', applied->'changeCount',
    'counts', jsonb_build_object(
      'facts', (select count(*) from public.business_record_facts where workspace_id = business_id),
      'services', (select count(*) from public.business_services where workspace_id = business_id),
      'people', (select count(*) from public.business_people where workspace_id = business_id),
      'contacts', (select count(*) from public.business_contacts where workspace_id = business_id),
      'contactsCreated', applied#>'{contacts,created}',
      'contactsMerged', applied#>'{contacts,merged}',
      'contactsUnchanged', applied#>'{contacts,unchanged}'),
    'convertedAt', clock_timestamp(),
    'replayed', false,
    'alreadyConverted', false
  );
  insert into public.tenant_workspace_links(tenant_stable_id, tenant_slug_at_link, workspace_id, linked_by,
      command_id, command_digest, receipt)
    values (tenant_row.stable_id, tenant_row.id, business_id, operator_id, p_command_id, p_command_digest, receipt);
  return receipt;
end;
$$;

-- Unlink: the full reverse of one conversion.
--
-- The rule. Unlinking removes what the conversion created and nobody has
-- touched since, and nothing else:
--   * the tenant_workspace_links row (its receipt moves into
--     tenant_workspace_unlinks, so reconverting starts clean);
--   * each fact, service, person and contact the import revision created,
--     only while it still holds exactly the state the import wrote;
--   * each contact the import merged into an existing contact is restored to
--     its pre-conversion state, again only while it still holds the merge;
--   * the tenant's leads stop pointing at the business (`tenant_leads` rows
--     are kept; only `workspace_id` is cleared, for this business only);
--   * the business workspace itself, with the operator's admin membership and
--     the record's history, only when the conversion created it and nothing
--     else lives there: no other linked site, no other member, no history
--     besides the import (and an undo of it), no record entity left after
--     the removals above, and no row in any other table that references the
--     workspace.
-- Anything changed or added after the conversion is kept, and so is the
-- workspace holding it; the receipt counts every kept entity, names the first
-- 200, and lists every reason the workspace was kept. Data that existed before the conversion (a joined
-- business) is never deleted. The `tenants` row is never touched.
--
-- tenant_unlink_plan is the read-only half; the unlink executes exactly it
-- under the tenant and workspace locks.
create function public.tenant_unlink_plan(p_link_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  link public.tenant_workspace_links%rowtype;
  import_rev public.business_record_revisions%rowtype;
  ws public.workspaces%rowtype;
  change jsonb;
  current_state jsonb;
  before_state jsonb;
  after_state jsonb;
  action text;
  actions jsonb := '[]'::jsonb;
  kept jsonb := '[]'::jsonb;
  removing integer := 0;
  restoring integer := 0;
  keeping integer := 0;
  reverted integer := 0;
  remaining bigint;
  reasons text[] := '{}';
  fk record;
  in_use boolean;
  leads bigint := 0;
  adopted bigint := 0;
begin
  select * into link from public.tenant_workspace_links where id = p_link_id;
  if not found then raise exception 'tenant_unlink_not_linked'; end if;
  select * into ws from public.workspaces where id = link.workspace_id;
  select * into import_rev from public.business_record_revisions
    where workspace_id = link.workspace_id and sequence = (link.receipt->>'sequence')::bigint and source = 'tenant_import';
  if not found then raise exception 'tenant_unlink_import_missing'; end if;

  -- One revision may touch an entity more than once (a contact created and
  -- then merged by a later lead), so compare against its net effect: the
  -- first "before" and the last "after".
  for change in
    select jsonb_build_object('entity', x.entity, 'id', x.id,
        'before', (array_agg(t.value->'before' order by t.n))[1],
        'after', (array_agg(t.value->'after' order by t.n desc))[1])
      from jsonb_array_elements(import_rev.changes) with ordinality t(value, n)
      cross join lateral (select t.value->>'entity' as entity, t.value->>'id' as id) x
      group by x.entity, x.id
      order by min(t.n) desc
  loop
    current_state := public.business_record_entity_state(link.workspace_id, change->>'entity', change->>'id');
    before_state := nullif(change->'before', 'null'::jsonb);
    after_state := nullif(change->'after', 'null'::jsonb);
    if before_state is not distinct from after_state then continue; end if;
    action := case
      when current_state is not distinct from before_state then 'already_reverted'
      when current_state is not distinct from after_state then case when before_state is null then 'remove' else 'restore' end
      else 'keep' end;
    case action
      when 'remove' then removing := removing + 1;
      when 'restore' then restoring := restoring + 1;
      when 'keep' then
        keeping := keeping + 1;
        if jsonb_array_length(kept) < 200 then
          kept := kept || jsonb_build_array(jsonb_build_object('entity', change->>'entity', 'id', change->>'id',
            'reason', case when current_state is null then 'deleted_after_import' else 'changed_after_import' end));
        end if;
      else reverted := reverted + 1;
    end case;
    if action in ('remove','restore') then
      actions := actions || jsonb_build_array(jsonb_build_object('entity', change->>'entity', 'id', change->>'id',
        'action', action, 'restoreTo', coalesce(before_state, 'null'::jsonb)));
    end if;
  end loop;

  if coalesce((link.receipt->>'joinedExistingWorkspace')::boolean, true) then
    reasons := array_append(reasons, 'joined_existing_workspace');
  end if;
  if ws.created_by is distinct from link.linked_by then reasons := array_append(reasons, 'workspace_not_created_by_conversion'); end if;
  if exists (select 1 from public.tenant_workspace_links where workspace_id = link.workspace_id and id <> link.id) then
    reasons := array_append(reasons, 'other_sites_linked');
  end if;
  if exists (select 1 from public.workspace_memberships where workspace_id = link.workspace_id
      and not (user_id = link.linked_by and role = 'admin')) then
    reasons := array_append(reasons, 'other_members');
  end if;
  remaining := (select count(*) from public.business_record_facts where workspace_id = link.workspace_id)
    + (select count(*) from public.business_services where workspace_id = link.workspace_id)
    + (select count(*) from public.business_people where workspace_id = link.workspace_id)
    + (select count(*) from public.business_contacts where workspace_id = link.workspace_id)
    - removing;
  if remaining > 0 then reasons := array_append(reasons, 'record_has_other_data'); end if;
  if exists (select 1 from public.business_record_revisions where workspace_id = link.workspace_id
      and sequence <> import_rev.sequence and undo_of_sequence is distinct from import_rev.sequence) then
    reasons := array_append(reasons, 'record_history_after_import');
  end if;
  -- Every other table that points at the workspace counts as use. New tables
  -- are covered without changing this function.
  for fk in
    select c.conrelid::regclass as rel, a.attname as col
      from pg_constraint c
      cross join lateral unnest(c.conkey, c.confkey) as k(local_col, ref_col)
      join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = k.ref_col and ra.attname = 'id'
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.local_col
      where c.contype = 'f' and c.confrelid = 'public.workspaces'::regclass
        and c.conrelid not in ('public.workspace_memberships'::regclass, 'public.business_records'::regclass,
          'public.tenant_workspace_links'::regclass)
        and c.conrelid is distinct from to_regclass('public.tenant_leads')
      order by 1, 2
  loop
    execute format('select exists (select 1 from %s where %I = $1)', fk.rel, fk.col) into in_use using link.workspace_id;
    if in_use then reasons := array_append(reasons, ('workspace_in_use:' || fk.rel::text)); end if;
  end loop;

  if link.tenant_stable_id is not null and to_regclass('public.tenant_leads') is not null then
    execute 'select count(*) from public.tenant_leads where tenant_stable_id = $1 and workspace_id = $2'
      into leads using link.tenant_stable_id, link.workspace_id;
  end if;
  if link.tenant_stable_id is not null and to_regclass('public.systems') is not null then
    execute $q$select count(*) from public.systems where business_workspace_id = $1 and origin_kind = 'tenant' and origin_ref = $2$q$
      into adopted using link.workspace_id, link.tenant_stable_id::text;
  end if;

  return jsonb_build_object(
    'linkId', link.id,
    'tenantStableId', link.tenant_stable_id,
    'workspaceId', link.workspace_id,
    'workspaceName', ws.name,
    'linkedAt', link.linked_at,
    'importSequence', import_rev.sequence,
    'deleteWorkspace', cardinality(reasons) = 0,
    'workspaceKeptBecause', to_jsonb(reasons),
    'entities', jsonb_build_object('removed', removing, 'restored', restoring, 'kept', keeping, 'alreadyReverted', reverted),
    'kept', kept,
    'leadsDetached', leads,
    'systemsAdoptedFromTenant', adopted,
    'actions', actions);
end;
$$;

-- Operator preview of an unlink. Writes nothing.
create function public.preview_tenant_unlink(p_operator_email text, p_tenant_id text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid; tenant_row record; link public.tenant_workspace_links%rowtype; last_unlink jsonb;
begin
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id into tenant_row from public.tenants t where t.id = p_tenant_id;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  select u.receipt into last_unlink from public.tenant_workspace_unlinks u
    where u.tenant_stable_id = tenant_row.stable_id order by u.unlinked_at desc, u.id desc limit 1;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if not found then
    return jsonb_build_object('tenantId', tenant_row.id, 'tenantStableId', tenant_row.stable_id, 'plan', null, 'lastUnlink', last_unlink);
  end if;
  if not exists (select 1 from public.workspace_memberships where workspace_id = link.workspace_id
      and user_id = operator_id and role in ('owner','admin')) then
    raise exception 'tenant_unlink_access_denied';
  end if;
  return jsonb_build_object('tenantId', tenant_row.id, 'tenantStableId', tenant_row.stable_id,
    'plan', public.tenant_unlink_plan(link.id) - 'actions', 'lastUnlink', last_unlink);
end;
$$;

-- Reverse one conversion by the rule above. p_workspace_id is the business the
-- operator previewed; a link to any other business is refused. A repeated
-- command replays its receipt; a tenant that is no longer linked returns its
-- latest unlink receipt for that business and writes nothing.
create function public.unlink_tenant_from_business(
  p_operator_email text, p_tenant_id text, p_workspace_id uuid, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  operator_id uuid;
  tenant_row record;
  link public.tenant_workspace_links%rowtype;
  prior public.tenant_workspace_unlinks%rowtype;
  rec public.business_records%rowtype;
  plan jsonb;
  item jsonb;
  before_state jsonb;
  after_state jsonb;
  changes jsonb := '[]'::jsonb;
  leads bigint := 0;
  deleted boolean;
  profile_changed boolean;
  new_sequence bigint;
  new_revision bigint;
  receipt jsonb;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' or p_workspace_id is null then
    raise exception 'tenant_unlink_invalid';
  end if;
  operator_id := public.tenant_conversion_assert_operator(p_operator_email);
  select t.id, t.stable_id into tenant_row from public.tenants t where t.id = p_tenant_id for share;
  if not found then raise exception 'tenant_conversion_tenant_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('tenant-conversion:' || tenant_row.stable_id::text, 0));

  select * into prior from public.tenant_workspace_unlinks where command_id = p_command_id;
  if found then
    if prior.command_digest <> p_command_digest or prior.tenant_stable_id <> tenant_row.stable_id then
      raise exception 'tenant_unlink_idempotency_conflict';
    end if;
    return prior.receipt || jsonb_build_object('replayed', true, 'alreadyUnlinked', true);
  end if;
  select * into link from public.tenant_workspace_links where tenant_stable_id = tenant_row.stable_id;
  if not found then
    select * into prior from public.tenant_workspace_unlinks
      where tenant_stable_id = tenant_row.stable_id and workspace_id = p_workspace_id
      order by unlinked_at desc, id desc limit 1;
    if found then return prior.receipt || jsonb_build_object('replayed', true, 'alreadyUnlinked', true); end if;
    raise exception 'tenant_unlink_not_linked';
  end if;
  if link.workspace_id <> p_workspace_id then raise exception 'tenant_unlink_workspace_mismatch'; end if;

  perform pg_advisory_xact_lock(hashtextextended(link.workspace_id::text, 7415));
  perform 1 from public.workspaces where id = link.workspace_id for update;
  if not exists (select 1 from public.workspace_memberships where workspace_id = link.workspace_id
      and user_id = operator_id and role in ('owner','admin')) then
    raise exception 'tenant_unlink_access_denied';
  end if;
  select * into link from public.tenant_workspace_links where id = link.id for update;

  plan := public.tenant_unlink_plan(link.id);
  deleted := (plan->>'deleteWorkspace')::boolean;
  begin
    for item in select value from jsonb_array_elements(plan->'actions') loop
      before_state := public.business_record_entity_state(link.workspace_id, item->>'entity', item->>'id');
      after_state := nullif(item->'restoreTo', 'null'::jsonb);
      perform public.business_record_entity_write(link.workspace_id, item->>'entity', item->>'id', after_state, operator_id);
      after_state := public.business_record_entity_state(link.workspace_id, item->>'entity', item->>'id');
      changes := changes || jsonb_build_array(jsonb_build_object('entity', item->>'entity', 'id', item->>'id',
        'before', coalesce(before_state, 'null'::jsonb), 'after', coalesce(after_state, 'null'::jsonb)));
    end loop;
  exception when unique_violation or check_violation or foreign_key_violation then
    raise exception 'tenant_unlink_conflict';
  end;

  if link.tenant_stable_id is not null and to_regclass('public.tenant_leads') is not null then
    execute 'update public.tenant_leads set workspace_id = null where tenant_stable_id = $1 and workspace_id = $2'
      using link.tenant_stable_id, link.workspace_id;
    get diagnostics leads = row_count;
  end if;

  perform set_config('strelva.tenant_unlink_link', link.id::text, true);
  delete from public.tenant_workspace_links where id = link.id;
  perform set_config('strelva.tenant_unlink_link', '', true);

  if deleted then
    delete from public.workspaces where id = link.workspace_id;
  elsif jsonb_array_length(changes) > 0 then
    -- The kept business records the unlink as one history row.
    select * into rec from public.business_records where workspace_id = link.workspace_id for update;
    profile_changed := exists (select 1 from jsonb_array_elements(changes) c where c->>'entity' in ('fact','service','person'));
    new_sequence := rec.last_sequence + 1;
    new_revision := rec.revision + case when profile_changed then 1 else 0 end;
    insert into public.business_record_revisions(workspace_id, sequence, record_revision, actor_id, actor_kind, source,
        command_id, command_digest, undo_of_sequence, changes, result)
      values (link.workspace_id, new_sequence, new_revision, operator_id, 'operator', 'tenant_import',
        p_command_id, p_command_digest, null, changes,
        jsonb_build_object('workspaceId', link.workspace_id, 'sequence', new_sequence, 'revision', new_revision,
          'changeCount', jsonb_array_length(changes), 'undoOf', null,
          'contacts', jsonb_build_object('created', 0, 'merged', 0, 'unchanged', 0), 'replayed', false,
          'unlinkOf', jsonb_build_object('linkId', link.id, 'importSequence', (plan->>'importSequence')::bigint)));
    update public.business_records set revision = new_revision, last_sequence = new_sequence,
      updated_by = operator_id, updated_at = clock_timestamp() where workspace_id = link.workspace_id;
  end if;

  receipt := jsonb_build_object(
    'kind', 'tenant_unlink',
    'version', 1,
    'tenantId', tenant_row.id,
    'tenantStableId', tenant_row.stable_id,
    'workspaceId', link.workspace_id,
    'workspaceName', plan->'workspaceName',
    'linkId', link.id,
    'linkedAt', link.linked_at,
    'importSequence', plan->'importSequence',
    'operatorId', operator_id,
    'workspaceDeleted', deleted,
    'workspaceKeptBecause', plan->'workspaceKeptBecause',
    'entities', plan->'entities',
    'kept', plan->'kept',
    'leadsDetached', leads,
    'systemsAdoptedFromTenant', plan->'systemsAdoptedFromTenant',
    'sequence', new_sequence,
    'revision', new_revision,
    'conversionReceipt', link.receipt,
    'unlinkedAt', clock_timestamp(),
    'replayed', false,
    'alreadyUnlinked', false);
  insert into public.tenant_workspace_unlinks(link_id, tenant_stable_id, tenant_slug_at_unlink, workspace_id, link_command_id,
      unlinked_by, command_id, command_digest, receipt)
    values (link.id, tenant_row.stable_id, tenant_row.id, link.workspace_id, link.command_id,
      operator_id, p_command_id, p_command_digest, receipt);
  return receipt;
end;
$$;

-- Server-side resolver for "who do we notify for this business". The caller
-- has already established its own authority (a cron, an intake handler); this
-- returns an address and sends nothing. The record's owner_recipient fact wins;
-- otherwise the earliest linked tenant's owner_email is the fallback.
create function public.resolve_business_owner_recipient(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare fact jsonb; fallback record;
begin
  select jsonb_build_object('email', f.value->>'email', 'name', f.value->>'name', 'from', 'record',
      'source', f.source, 'verified', f.verified, 'tenantId', null)
    into fact from public.business_record_facts f
    where f.workspace_id = p_workspace_id and f.fact_key = 'owner_recipient';
  if fact is not null then return fact; end if;
  select t.id, t.owner_email into fallback
    from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
    where l.workspace_id = p_workspace_id and nullif(btrim(t.owner_email), '') is not null
    order by l.linked_at, l.id limit 1;
  if fallback.id is null then return null; end if;
  return jsonb_build_object('email', lower(btrim(fallback.owner_email)), 'name', null, 'from', 'tenant_fallback',
    'source', null, 'verified', false, 'tenantId', fallback.id);
end;
$$;

revoke all on function public.business_record_sources() from public, anon, authenticated;
revoke all on function public.business_contact_sources() from public, anon, authenticated;
revoke all on function public.business_record_email_valid(text) from public, anon, authenticated;
revoke all on function public.business_contact_phone_key(text) from public, anon, authenticated;
revoke all on function public.business_record_text_valid(jsonb, integer, integer) from public, anon, authenticated;
revoke all on function public.business_record_time_valid(jsonb) from public, anon, authenticated;
revoke all on function public.business_record_fact_valid(text, jsonb) from public, anon, authenticated;
revoke all on function public.business_record_history_immutable() from public, anon, authenticated;
revoke all on function public.tenant_workspace_link_guard() from public, anon, authenticated;
revoke all on function public.business_record_assert_actor(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.business_record_agency_work_ids(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.business_record_revision_touches_contacts(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.business_record_entity_state(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.business_record_entity_write(uuid, text, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.business_record_apply(uuid, uuid, text, text, jsonb, jsonb, bigint, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.business_record_begin_write(uuid, uuid, text, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.tenant_conversion_assert_operator(text) from public, anon, authenticated, service_role;
revoke all on function public.tenant_unlink_plan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.tenant_workspace_unlink_immutable() from public, anon, authenticated;

revoke all on function public.read_business_record(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.patch_business_record(uuid, uuid, text, text, bigint, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.undo_business_record_revision(uuid, uuid, text, text, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.upsert_business_contacts(uuid, uuid, text, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.read_business_contacts(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.read_business_record_history(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.read_tenant_workspace_link(text, text) from public, anon, authenticated;
revoke all on function public.convert_tenant_to_business(text, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.resolve_business_owner_recipient(uuid) from public, anon, authenticated;
grant execute on function public.resolve_business_owner_recipient(uuid) to service_role;
grant execute on function public.read_business_record(uuid, uuid, text) to service_role;
grant execute on function public.patch_business_record(uuid, uuid, text, text, bigint, jsonb, uuid, text) to service_role;
grant execute on function public.undo_business_record_revision(uuid, uuid, text, text, bigint, uuid, text) to service_role;
grant execute on function public.upsert_business_contacts(uuid, uuid, text, text, jsonb, uuid, text) to service_role;
grant execute on function public.read_business_contacts(uuid, uuid, text, integer) to service_role;
grant execute on function public.read_business_record_history(uuid, uuid, text, integer) to service_role;
grant execute on function public.read_tenant_workspace_link(text, text) to service_role;
grant execute on function public.convert_tenant_to_business(text, text, jsonb, uuid, text) to service_role;
revoke all on function public.preview_tenant_unlink(text, text) from public, anon, authenticated;
revoke all on function public.unlink_tenant_from_business(text, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.preview_tenant_unlink(text, text) to service_role;
grant execute on function public.unlink_tenant_from_business(text, text, uuid, uuid, text) to service_role;

-- Client leads (20261005090000_tenant_leads.sql) may be applied to production
-- before this migration. When it was, converting a tenant must still attach the
-- tenant's earlier leads to the business, so create the same trigger here.
do $$
begin
  if to_regprocedure('public.tenant_leads_attach_workspace()') is not null
    and not exists (select 1 from pg_trigger where tgname = 'tenant_workspace_links_attach_leads'
      and tgrelid = 'public.tenant_workspace_links'::regclass) then
    create trigger tenant_workspace_links_attach_leads after insert on public.tenant_workspace_links
      for each row execute function public.tenant_leads_attach_workspace();
  end if;
end $$;
