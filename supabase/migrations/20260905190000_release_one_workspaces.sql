-- Release one workspace ownership. Additive only; application deploy and live
-- migration are separate operations. This does not change tenant/account access.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('personal', 'agency', 'customer')),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A person has one personal workspace. Agency/customer workspaces remain explicit.
create unique index workspaces_one_personal_per_user_idx
  on public.workspaces (created_by) where kind = 'personal';
create index workspaces_created_by_idx on public.workspaces (created_by);

create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_memberships_user_idx
  on public.workspace_memberships (user_id, workspace_id);

create table public.saved_product_work (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  product_id text not null check (product_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  resource_kind text not null check (resource_kind ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  title text check (title is null or char_length(title) <= 160),
  payload jsonb not null,
  input jsonb,
  source_work_id uuid references public.saved_product_work(id) on delete set null,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index saved_product_work_workspace_updated_idx
  on public.saved_product_work (workspace_id, updated_at desc);
alter table public.saved_product_work
  add constraint saved_product_work_id_workspace_unique unique (id, workspace_id);

create table public.workspace_delegations (
  id uuid primary key default gen_random_uuid(),
  customer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_work_id uuid not null,
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text[] not null default array['work:read']::text[],
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid not null references public.users(id) on delete restrict,
  accepted_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete restrict,
  check (customer_workspace_id <> agency_workspace_id),
  check (scope = array['work:read']::text[]),
  foreign key (customer_work_id, customer_workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade
);
create unique index workspace_delegations_one_active_work_pair_idx
  on public.workspace_delegations (customer_work_id, agency_workspace_id)
  where status = 'active';
create index workspace_delegations_agency_idx
  on public.workspace_delegations (agency_workspace_id, status);

create table public.workspace_handoffs (
  id uuid primary key default gen_random_uuid(),
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_work_id uuid not null,
  recipient_email text not null check (recipient_email = lower(btrim(recipient_email))),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  accepted_by uuid references public.users(id) on delete restrict,
  accepted_at timestamptz,
  customer_workspace_id uuid references public.workspaces(id) on delete restrict,
  customer_work_id uuid,
  delegation_id uuid references public.workspace_delegations(id) on delete set null,
  check ((status = 'accepted') = (
    accepted_by is not null and accepted_at is not null
    and customer_workspace_id is not null and customer_work_id is not null
  )),
  foreign key (source_work_id, agency_workspace_id)
    references public.saved_product_work(id, workspace_id) on delete restrict,
  foreign key (customer_work_id, customer_workspace_id)
    references public.saved_product_work(id, workspace_id) on delete restrict
);
create index workspace_handoffs_agency_created_idx
  on public.workspace_handoffs (agency_workspace_id, created_at desc);
create index workspace_handoffs_recipient_status_idx
  on public.workspace_handoffs (recipient_email, status);

-- Serialize and enforce the two bounded collections at the database boundary.
create or replace function public.enforce_saved_product_work_cap() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('saved-work:' || new.workspace_id::text, 0));
  if (select count(*) from public.saved_product_work where workspace_id = new.workspace_id) >= 500 then
    raise exception 'saved_work_limit_reached';
  end if;
  return new;
end;
$$;
create trigger saved_product_work_cap_trg before insert on public.saved_product_work
  for each row execute function public.enforce_saved_product_work_cap();

create or replace function public.enforce_pending_handoff_cap() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'pending' then
    perform pg_advisory_xact_lock(hashtextextended('pending-handoffs:' || new.agency_workspace_id::text, 0));
    if (select count(*) from public.workspace_handoffs
      where agency_workspace_id = new.agency_workspace_id
        and status = 'pending' and expires_at > now()) >= 50 then
      raise exception 'pending_handoff_limit_reached';
    end if;
  end if;
  return new;
end;
$$;
create trigger pending_handoff_cap_trg before insert on public.workspace_handoffs
  for each row execute function public.enforce_pending_handoff_cap();

alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.saved_product_work enable row level security;
alter table public.workspace_delegations enable row level security;
alter table public.workspace_handoffs enable row level security;

-- Service-role repositories enforce authorization. Browser clients get no direct
-- policies in release one, so all five tables are deny-by-default through RLS.
revoke all on table public.workspaces, public.workspace_memberships,
  public.saved_product_work, public.workspace_delegations,
  public.workspace_handoffs from anon, authenticated;
grant select, insert, update on table public.workspaces,
  public.workspace_memberships, public.saved_product_work,
  public.workspace_delegations, public.workspace_handoffs to service_role;

create or replace function public.create_owned_workspace(
  p_user_id uuid,
  p_verified_email text,
  p_kind text,
  p_name text
) returns setof public.workspaces
language plpgsql security definer set search_path = public as $$
declare
  normalized_email text := lower(btrim(p_verified_email));
  created_workspace public.workspaces%rowtype;
begin
  if p_kind not in ('personal', 'agency') then raise exception 'workspace_kind_invalid'; end if;
  if char_length(btrim(p_name)) not between 1 and 120 then raise exception 'workspace_name_invalid'; end if;

  -- Row lock serializes the per-user cap and personal-workspace idempotency.
  perform 1 from public.users u where u.id = p_user_id
    and lower(u.email) = normalized_email and u.verified_at is not null for update;
  if not found then raise exception 'verified_identity_required'; end if;

  if p_kind = 'personal' then
    select * into created_workspace from public.workspaces
      where created_by = p_user_id and kind = 'personal';
    if found then return next created_workspace; return; end if;
  end if;
  if (select count(*) from public.workspaces where created_by = p_user_id) >= 5 then
    raise exception 'workspace_limit_reached';
  end if;

  insert into public.workspaces (kind, name, created_by)
    values (p_kind, btrim(p_name), p_user_id) returning * into created_workspace;
  insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
    values (created_workspace.id, p_user_id, 'owner', p_user_id);
  return next created_workspace;
end;
$$;

revoke all on function public.create_owned_workspace(uuid, text, text, text) from public;
grant execute on function public.create_owned_workspace(uuid, text, text, text) to service_role;
revoke all on function public.enforce_saved_product_work_cap() from public;
revoke all on function public.enforce_pending_handoff_cap() from public;

create or replace function public.accept_workspace_handoff(
  p_token_hash text,
  p_user_id uuid,
  p_verified_email text,
  p_allow_agency_access boolean
) returns table (
  handoff_id uuid,
  customer_workspace_id uuid,
  customer_work_id uuid,
  delegation_id uuid,
  already_accepted boolean
) language plpgsql security definer set search_path = public as $$
declare
  h public.workspace_handoffs%rowtype;
  source_work public.saved_product_work%rowtype;
  customer_id uuid;
  copied_id uuid;
  delegated_id uuid;
  normalized_email text := lower(btrim(p_verified_email));
begin
  select * into h from public.workspace_handoffs
    where token_hash = p_token_hash for update;
  if not found then raise exception 'handoff_not_found'; end if;

  -- Identity invariants precede the idempotent accepted return. Possessing an
  -- accepted token never lets an unverified or different identity replay it.
  if h.recipient_email <> normalized_email then raise exception 'handoff_recipient_mismatch'; end if;
  perform 1 from public.users u where u.id = p_user_id
    and lower(u.email) = normalized_email and u.verified_at is not null for update;
  if not found then raise exception 'verified_identity_required'; end if;

  if h.status = 'accepted' then
    if h.accepted_by <> p_user_id then raise exception 'handoff_already_claimed'; end if;
    return query select h.id, h.customer_workspace_id, h.customer_work_id,
      h.delegation_id, true;
    return;
  end if;

  if h.status = 'revoked' then raise exception 'handoff_revoked'; end if;
  if h.status <> 'pending' or h.expires_at <= now() then raise exception 'handoff_expired'; end if;

  select * into source_work from public.saved_product_work where id = h.source_work_id;
  if not found or source_work.workspace_id <> h.agency_workspace_id then
    raise exception 'handoff_source_invalid';
  end if;

  select w.id into customer_id from public.workspaces w
    where w.created_by = p_user_id and w.kind = 'customer'
    order by w.created_at asc limit 1;
  if customer_id is null then
    if (select count(*) from public.workspaces where created_by = p_user_id) >= 5 then
      raise exception 'workspace_limit_reached';
    end if;
    insert into public.workspaces (kind, name, created_by)
      values ('customer', split_part(normalized_email, '@', 1), p_user_id)
      returning id into customer_id;
    insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
      values (customer_id, p_user_id, 'owner', p_user_id);
  end if;
  insert into public.saved_product_work (
    workspace_id, product_id, resource_kind, title, payload, input,
    source_work_id, created_by
  ) values (
    customer_id, source_work.product_id, source_work.resource_kind,
    source_work.title, source_work.payload, source_work.input,
    source_work.id, p_user_id
  ) returning id into copied_id;

  if p_allow_agency_access then
    insert into public.workspace_delegations (
      customer_workspace_id, customer_work_id, agency_workspace_id, scope, granted_by, accepted_by
    ) values (
      customer_id, copied_id, h.agency_workspace_id, array['work:read']::text[], p_user_id, p_user_id
    ) returning id into delegated_id;
  end if;

  update public.workspace_handoffs set
    status = 'accepted', accepted_by = p_user_id, accepted_at = now(),
    customer_workspace_id = customer_id, customer_work_id = copied_id,
    delegation_id = delegated_id
  where id = h.id;

  return query select h.id, customer_id, copied_id, delegated_id, false;
end;
$$;

revoke all on function public.accept_workspace_handoff(text, uuid, text, boolean) from public;
grant execute on function public.accept_workspace_handoff(text, uuid, text, boolean) to service_role;
