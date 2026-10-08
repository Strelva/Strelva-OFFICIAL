-- An agency adds a client business (agency 1.0 #259: audit A AG-09, F MK-1,
-- C SY-T7; company ADR 0012). Additive. Local only until Jacob's yes.
--
-- Before: an agency gained a client only through Strelva's operator
-- (/admin/onboard and tenant conversion), or by the owner choosing it. No
-- other agency had a path.
--
-- After, one transaction (agency_add_client):
--   * a customer business workspace, with NO direct membership for anyone:
--     the agency reaches it through a provider seat (20261009151000), never
--     admin membership;
--   * the agency as provider of record (workspace_providers, source
--     `agency_added`) and its seat (granted_by_kind `agency_added`), so the
--     platform serves the business for an effect exactly as for any agency
--     verified for it (20261009153000), and the business keeps working when
--     the owner never logs in;
--   * the acting agency member staffed on the client;
--   * the business record seeded from the agency's input and the URL scan,
--     every fact `source = agency`, `verified = false`. Only the owner
--     confirms. Nothing here can mark a fact verified;
--   * a receipt (agency_client_additions), linking the prospect when the
--     client came from the agency's prospects list.
-- Who may add: an owner or admin of the agency (the same people who staff
-- clients). Abuse limits per agency: 25 additions per UTC day, and 100 added
-- businesses still waiting for their owner. A replay of the same command
-- uses no quota.
--
-- The owner claim link (agency_client_owner_claims) is how the owner takes
-- the business. It is bound to one email address; accepting requires a
-- verified account with that address, makes it the `owner` member, and
-- leaves the agency's seat in place (the owner can end it). The agency's
-- authority is rechecked at acceptance: it must still be the provider of
-- record and hold its seat. Nothing here sends email. Each link records
-- delivery `not_sent`, reason `gated`: client notifications are off during
-- the silent rollout, and whether an agency may send this mail is the open
-- decision R08 (#235). The agency copies the link and delivers it itself.
-- agency_effect_allowed(agency, 'email') (20261009152000) is recorded on the
-- link so the send seam has its gate ready.
--
-- Also: businesses an agency added do not count toward the acting person's
-- five-workspace cap (create_owned_workspace, enter_customer_business), and
-- connected_site_assert_actor resolves a staffed provider seat like
-- workspace_require does, so the agency can offer "connect the existing
-- site" on a client it added.
--
-- Depends on 20261009151000, 20261009152000, 20261008151000,
-- 20261002120000, 20260921220000 and 20261011170000.

set local lock_timeout = '3s';

alter table public.workspace_providers drop constraint workspace_providers_source_check;
alter table public.workspace_providers add constraint workspace_providers_source_check
  check (source in ('tenant_conversion', 'operator', 'business_choice', 'agency_added'));
alter table public.provider_seats drop constraint provider_seats_granted_by_kind_check;
alter table public.provider_seats add constraint provider_seats_granted_by_kind_check
  check (granted_by_kind in ('owner', 'conversion', 'agency_added'));

create table public.agency_client_additions (
  id uuid primary key default gen_random_uuid(),
  agency_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  customer_workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  added_by uuid not null references public.users(id) on delete restrict,
  source_kind text not null check (source_kind in ('url', 'prospect')),
  source_url text check (source_url is null or (char_length(source_url) between 8 and 2048 and source_url ~ '^https?://[^[:space:]]+$')),
  -- Kept when a prospect is later erased; the receipt still says it came from one.
  prospect_id uuid unique references public.prospects(id) on delete set null,
  facts_seeded integer not null check (facts_seeded >= 0),
  command_id uuid not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  added_at timestamptz not null default clock_timestamp(),
  unique (agency_workspace_id, command_id),
  check (customer_workspace_id <> agency_workspace_id),
  check (source_kind = 'prospect' or prospect_id is null)
);
create index agency_client_additions_agency_idx on public.agency_client_additions(agency_workspace_id, added_at desc, id);

create table public.agency_client_add_quota (
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  day date not null,
  additions integer not null default 0 check (additions >= 0),
  primary key (agency_workspace_id, day)
);

create table public.agency_client_owner_claims (
  id uuid primary key default gen_random_uuid(),
  customer_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_email text not null check (public.business_record_email_valid(recipient_email) and recipient_email = lower(btrim(recipient_email))),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  -- How the link reached the owner. Today always {"status":"not_sent","reason":"gated",...}.
  delivery jsonb not null check (jsonb_typeof(delivery) = 'object' and delivery ? 'status' and octet_length(delivery::text) <= 2000),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  accepted_by uuid references public.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at),
  check ((status = 'accepted') = (accepted_at is not null)),
  check ((status = 'revoked') = (revoked_at is not null))
);
create unique index agency_client_owner_claims_one_pending_idx
  on public.agency_client_owner_claims(customer_workspace_id) where status = 'pending';

alter table public.agency_client_additions enable row level security;
alter table public.agency_client_add_quota enable row level security;
alter table public.agency_client_owner_claims enable row level security;
revoke all on public.agency_client_additions, public.agency_client_add_quota, public.agency_client_owner_claims
  from public, anon, authenticated, service_role;

-- A receipt never changes; it goes only with its business (or the prospect link with the prospect).
create function public.agency_client_addition_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.prospect_id is not null and new.prospect_id is null
    and not exists (select 1 from public.prospects where id = old.prospect_id)
    and (to_jsonb(new) - 'prospect_id') = (to_jsonb(old) - 'prospect_id') then
    return new;
  end if;
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.customer_workspace_id) then
    return old;
  end if;
  raise exception 'agency_client_addition_immutable';
end;
$$;
create trigger agency_client_additions_guard before update or delete on public.agency_client_additions
  for each row execute function public.agency_client_addition_guard();

-- A claim only moves out of `pending`, once, with who and when.
create function public.agency_client_owner_claim_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('accepted', 'revoked', 'expired')
    and (to_jsonb(new) - array['status','accepted_by','accepted_at','revoked_by','revoked_at']::text[])
      = (to_jsonb(old) - array['status','accepted_by','accepted_at','revoked_by','revoked_at']::text[]) then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.accepted_by is not null and new.accepted_by is null
    and not exists (select 1 from public.users where id = old.accepted_by)
    and (to_jsonb(new) - 'accepted_by') = (to_jsonb(old) - 'accepted_by') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.revoked_by is not null and new.revoked_by is null
    and not exists (select 1 from public.users where id = old.revoked_by)
    and (to_jsonb(new) - 'revoked_by') = (to_jsonb(old) - 'revoked_by') then
    return new;
  end if;
  if tg_op = 'DELETE' and (not exists (select 1 from public.workspaces where id = old.customer_workspace_id)
    or not exists (select 1 from public.workspaces where id = old.agency_workspace_id)) then
    return old;
  end if;
  raise exception 'agency_client_owner_claim_immutable';
end;
$$;
create trigger agency_client_owner_claims_guard before update or delete on public.agency_client_owner_claims
  for each row execute function public.agency_client_owner_claim_guard();

-- The abuse limits, in one place.
create function public.agency_client_add_limits(out daily integer, out waiting_for_owner integer)
language sql immutable set search_path = public, pg_temp as $$
  select 25, 100
$$;

-- The verified actor as an owner or admin of this agency, locked FOR SHARE.
create function public.agency_client_assert_actor(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_role text;
begin
  if p_user_id is null or p_verified_email is null or p_agency_workspace_id is null then
    raise exception 'agency_client_access_denied';
  end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'agency_client_access_denied'; end if;
  select m.role into actor_role from public.workspace_memberships m
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where m.workspace_id = p_agency_workspace_id and m.user_id = p_user_id and m.role in ('owner', 'admin')
    for share of m;
  if actor_role is null then raise exception 'agency_client_access_denied'; end if;
  return actor_role;
end;
$$;

-- A business the agency added and whose owner has not taken it yet.
create function public.agency_client_waiting_for_owner(p_customer_workspace_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select not exists (select 1 from public.workspace_memberships
    where workspace_id = p_customer_workspace_id and role = 'owner')
$$;

create function public.agency_client_addition_json(a public.agency_client_additions, p_replayed boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'additionId', a.id,
    'agencyWorkspaceId', a.agency_workspace_id,
    'customerWorkspaceId', a.customer_workspace_id,
    'name', (select name from public.workspaces where id = a.customer_workspace_id),
    'sourceKind', a.source_kind,
    'sourceUrl', a.source_url,
    'prospectId', a.prospect_id,
    'factsSeeded', a.facts_seeded,
    'seatId', (select s.id from public.provider_seats s where s.customer_workspace_id = a.customer_workspace_id
      and s.agency_workspace_id = a.agency_workspace_id and s.status = 'active'),
    'addedBy', a.added_by,
    'addedAt', to_char(a.added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'replayed', p_replayed)
$$;

-- Add a client. p_input: {name, sourceUrl?, prospectId?, facts?}. `facts` is
-- a business-record fact patch ({key: {value}}); any `verified` key is refused.
create function public.agency_add_client(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_input jsonb,
  p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  addition public.agency_client_additions%rowtype;
  limits record;
  business_name text;
  source_url text;
  prospect_row public.prospects%rowtype;
  business_id uuid;
  facts jsonb;
  fact record;
  applied jsonb;
  used integer;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
    or p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['name','sourceUrl','prospectId','facts']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_input->'name') is distinct from 'string'
    or (p_input ? 'sourceUrl' and jsonb_typeof(p_input->'sourceUrl') not in ('string','null'))
    or (p_input ? 'prospectId' and jsonb_typeof(p_input->'prospectId') not in ('string','null'))
    or (p_input ? 'facts' and jsonb_typeof(p_input->'facts') <> 'object') then
    raise exception 'agency_client_invalid';
  end if;
  business_name := btrim(p_input->>'name');
  if char_length(business_name) not between 1 and 120 then raise exception 'agency_client_invalid'; end if;
  source_url := nullif(btrim(coalesce(p_input->>'sourceUrl', '')), '');
  if source_url is not null and (char_length(source_url) not between 8 and 2048 or source_url !~ '^https?://[^[:space:]]+$') then
    raise exception 'agency_client_invalid';
  end if;
  facts := coalesce(p_input->'facts', '{}'::jsonb);
  for fact in select key, value from jsonb_each(facts) loop
    -- Only the owner confirms; owner_recipient is the owner's to set (#524).
    if jsonb_typeof(fact.value) <> 'object' or (fact.value - 'value') <> '{}'::jsonb or fact.value->'value' is null
      or fact.key = 'owner_recipient' then
      raise exception 'agency_client_invalid';
    end if;
  end loop;

  perform public.agency_client_assert_actor(p_user_id, p_verified_email, p_agency_workspace_id);
  -- One add at a time per agency: quota, replay and prospect checks serialize.
  perform pg_advisory_xact_lock(hashtextextended('agency-client-add:' || p_agency_workspace_id::text, 0));

  select * into addition from public.agency_client_additions
    where agency_workspace_id = p_agency_workspace_id and command_id = p_command_id;
  if found then
    if addition.command_digest <> p_command_digest then raise exception 'agency_client_idempotency_conflict'; end if;
    return public.agency_client_addition_json(addition, true);
  end if;

  if p_input->>'prospectId' is not null then
    begin
      select * into prospect_row from public.prospects
        where id = (p_input->>'prospectId')::uuid and agency_workspace_id = p_agency_workspace_id;
    exception when invalid_text_representation then raise exception 'agency_client_invalid';
    end;
    if prospect_row.id is null then raise exception 'agency_client_prospect_not_found'; end if;
    if exists (select 1 from public.agency_client_additions where prospect_id = prospect_row.id) then
      raise exception 'agency_client_prospect_added';
    end if;
  end if;

  select * into limits from public.agency_client_add_limits();
  if (select count(*) from public.agency_client_additions a
      join public.provider_seats s on s.customer_workspace_id = a.customer_workspace_id
        and s.agency_workspace_id = a.agency_workspace_id and s.status = 'active'
      where a.agency_workspace_id = p_agency_workspace_id
        and public.agency_client_waiting_for_owner(a.customer_workspace_id)) >= limits.waiting_for_owner then
    raise exception 'agency_client_waiting_limit';
  end if;
  insert into public.agency_client_add_quota(agency_workspace_id, day, additions)
    values (p_agency_workspace_id, (now() at time zone 'UTC')::date, 1)
    on conflict (agency_workspace_id, day) do update set additions = agency_client_add_quota.additions + 1
      where agency_client_add_quota.additions < limits.daily
    returning additions into used;
  if used is null then raise exception 'agency_client_daily_limit'; end if;

  insert into public.workspaces(kind, name, created_by) values ('customer', business_name, p_user_id)
    returning id into business_id;
  perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
  insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by)
    values (business_id, p_agency_workspace_id, 'agency_added', p_user_id);
  insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
    values (business_id, p_agency_workspace_id, 'agency_added', p_user_id);
  insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by)
    values (p_agency_workspace_id, business_id, p_user_id, p_user_id);

  -- The display name is always seeded; it is the agency's input, unconfirmed like the rest.
  facts := jsonb_build_object('display_name', jsonb_build_object('value', to_jsonb(business_name))) || (facts - 'display_name');
  if source_url is not null and not facts ? 'links' then
    facts := facts || jsonb_build_object('links', jsonb_build_object('value',
      jsonb_build_array(jsonb_build_object('kind', 'website', 'url', source_url))));
  end if;
  applied := public.business_record_apply(business_id, p_user_id, 'agency', 'agency',
    jsonb_build_object('facts', facts), null, null, p_command_id, p_command_digest);

  insert into public.agency_client_additions(agency_workspace_id, customer_workspace_id, added_by, source_kind,
      source_url, prospect_id, facts_seeded, command_id, command_digest)
    values (p_agency_workspace_id, business_id, p_user_id, case when prospect_row.id is null then 'url' else 'prospect' end,
      source_url, prospect_row.id, (select count(*) from public.business_record_facts where workspace_id = business_id),
      p_command_id, p_command_digest)
    returning * into addition;
  return public.agency_client_addition_json(addition, false);
end;
$$;

-- The businesses this agency added, newest first, with each owner claim's
-- state. Any member of the agency may read it.
create function public.list_agency_client_additions(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_agency_workspace_id;
  if not found then raise exception 'agency_client_access_denied'; end if;
  return coalesce((select jsonb_agg(public.agency_client_addition_json(a, false) || jsonb_build_object(
      'ownerClaimed', not public.agency_client_waiting_for_owner(a.customer_workspace_id),
      'seatActive', exists (select 1 from public.provider_seats s where s.customer_workspace_id = a.customer_workspace_id
        and s.agency_workspace_id = a.agency_workspace_id and s.status = 'active'),
      'pendingClaim', (select jsonb_build_object('claimId', c.id, 'recipientEmail', c.recipient_email,
          'expiresAt', to_char(c.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'delivery', c.delivery)
        from public.agency_client_owner_claims c
        where c.customer_workspace_id = a.customer_workspace_id and c.status = 'pending' and c.expires_at > clock_timestamp()))
      order by a.added_at desc, a.id)
    from (select * from public.agency_client_additions where agency_workspace_id = p_agency_workspace_id
      order by added_at desc, id limit 200) a), '[]'::jsonb);
end;
$$;

-- Issue the owner's claim link for a business this agency added. A pending
-- link is replaced (revoked) by the new one. Nothing is sent: the link is
-- recorded not_sent/gated and returned for the agency to deliver.
create function public.issue_agency_client_owner_claim(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_customer_workspace_id uuid,
  p_recipient_email text, p_token_hash text, p_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  recipient text := lower(btrim(coalesce(p_recipient_email, '')));
  replaced integer;
  created public.agency_client_owner_claims%rowtype;
begin
  perform public.agency_client_assert_actor(p_user_id, p_verified_email, p_agency_workspace_id);
  if p_customer_workspace_id is null then raise exception 'agency_client_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer_workspace_id::text, 7415));
  perform 1 from public.agency_client_additions
    where customer_workspace_id = p_customer_workspace_id and agency_workspace_id = p_agency_workspace_id;
  if not found then raise exception 'agency_client_access_denied'; end if;
  perform 1 from public.workspace_providers
    where customer_workspace_id = p_customer_workspace_id and provider_workspace_id = p_agency_workspace_id and status = 'active'
    for share;
  if not found then raise exception 'agency_client_access_denied'; end if;
  perform 1 from public.provider_seats
    where customer_workspace_id = p_customer_workspace_id and agency_workspace_id = p_agency_workspace_id and status = 'active'
    for share;
  if not found then raise exception 'agency_client_access_denied'; end if;
  if public.workspace_exit_completed(p_customer_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not public.agency_client_waiting_for_owner(p_customer_workspace_id) then raise exception 'agency_client_owner_exists'; end if;
  if not public.business_record_email_valid(recipient) or char_length(recipient) > 254
    or p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or p_expires_at is null or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '30 days' then
    raise exception 'agency_client_claim_invalid';
  end if;
  update public.agency_client_owner_claims set status = 'expired'
    where customer_workspace_id = p_customer_workspace_id and status = 'pending' and expires_at <= clock_timestamp();
  update public.agency_client_owner_claims set status = 'revoked', revoked_by = p_user_id, revoked_at = clock_timestamp()
    where customer_workspace_id = p_customer_workspace_id and status = 'pending';
  get diagnostics replaced = row_count;
  insert into public.agency_client_owner_claims(customer_workspace_id, agency_workspace_id, recipient_email, token_hash,
      delivery, created_by, expires_at)
    values (p_customer_workspace_id, p_agency_workspace_id, recipient, p_token_hash,
      jsonb_build_object('status', 'not_sent', 'reason', 'gated', 'decision', 'R08',
        'agencyEmailVerified', public.agency_effect_allowed(p_agency_workspace_id, 'email')),
      p_user_id, p_expires_at)
    returning * into created;
  return jsonb_build_object(
    'claimId', created.id,
    'customerWorkspaceId', created.customer_workspace_id,
    'workspaceName', (select name from public.workspaces where id = created.customer_workspace_id),
    'recipientEmail', created.recipient_email,
    'delivery', created.delivery,
    'expiresAt', to_char(created.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'createdAt', to_char(created.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'replacedPending', replaced > 0);
end;
$$;

-- What a claim link shows before sign-in. The token is the secret; an
-- unknown token reveals nothing.
create function public.read_agency_client_owner_claim(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare claim public.agency_client_owner_claims%rowtype;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'agency_client_claim_not_found'; end if;
  select * into claim from public.agency_client_owner_claims where token_hash = p_token_hash;
  if not found then raise exception 'agency_client_claim_not_found'; end if;
  return jsonb_build_object(
    'workspaceName', (select name from public.workspaces where id = claim.customer_workspace_id),
    'agencyName', (select name from public.workspaces where id = claim.agency_workspace_id),
    'recipientEmail', claim.recipient_email,
    'status', case when claim.status = 'pending' and claim.expires_at <= clock_timestamp() then 'expired' else claim.status end,
    'expiresAt', to_char(claim.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end;
$$;

-- The owner takes the business. The verified account must hold the claimed
-- address. The agency must still be the provider of record holding its seat.
-- Accepting twice by the same person replays.
create function public.accept_agency_client_owner_claim(p_token_hash text, p_actor_id uuid, p_verified_email text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  claim public.agency_client_owner_claims%rowtype;
  v_email text := lower(btrim(coalesce(p_verified_email, '')));
  result jsonb;
begin
  perform 1 from public.users u where u.id = p_actor_id and lower(u.email) = v_email and u.verified_at is not null for key share;
  if not found then raise exception 'agency_client_claim_identity_required'; end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'agency_client_claim_not_found'; end if;
  select * into claim from public.agency_client_owner_claims where token_hash = p_token_hash;
  if not found then raise exception 'agency_client_claim_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(claim.customer_workspace_id::text, 7415));
  select * into claim from public.agency_client_owner_claims where id = claim.id for update;
  if claim.recipient_email <> v_email then raise exception 'agency_client_claim_recipient_mismatch'; end if;
  result := jsonb_build_object('workspaceId', claim.customer_workspace_id,
    'workspaceName', (select name from public.workspaces where id = claim.customer_workspace_id));
  if claim.status = 'accepted' then
    if claim.accepted_by is distinct from p_actor_id then raise exception 'agency_client_claim_recipient_mismatch'; end if;
    return result || jsonb_build_object('status', 'accepted', 'alreadyAccepted', true);
  end if;
  if claim.status = 'pending' and claim.expires_at <= clock_timestamp() then
    update public.agency_client_owner_claims set status = 'expired' where id = claim.id;
    return result || jsonb_build_object('status', 'expired', 'alreadyAccepted', false);
  end if;
  if claim.status <> 'pending' then
    return result || jsonb_build_object('status', claim.status, 'alreadyAccepted', false);
  end if;
  perform 1 from public.workspaces where id = claim.customer_workspace_id and kind = 'customer' for update;
  if not found then raise exception 'agency_client_claim_not_found'; end if;
  if public.workspace_exit_completed(claim.customer_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  -- The agency's offer stands only while it still serves the business.
  perform 1 from public.workspace_providers
    where customer_workspace_id = claim.customer_workspace_id and provider_workspace_id = claim.agency_workspace_id
      and status = 'active' for share;
  if not found then raise exception 'agency_client_claim_sponsor_invalid'; end if;
  perform 1 from public.provider_seats
    where customer_workspace_id = claim.customer_workspace_id and agency_workspace_id = claim.agency_workspace_id
      and status = 'active' for share;
  if not found then raise exception 'agency_client_claim_sponsor_invalid'; end if;
  if exists (select 1 from public.workspace_memberships where workspace_id = claim.customer_workspace_id
      and role = 'owner' and user_id <> p_actor_id) then
    raise exception 'agency_client_owner_exists';
  end if;
  insert into public.workspace_memberships(workspace_id, user_id, role, created_by)
    values (claim.customer_workspace_id, p_actor_id, 'owner', claim.created_by)
    on conflict on constraint workspace_memberships_pkey do update set role = 'owner';
  update public.agency_client_owner_claims set status = 'accepted', accepted_by = p_actor_id, accepted_at = clock_timestamp()
    where id = claim.id;
  return result || jsonb_build_object('status', 'accepted', 'alreadyAccepted', false);
end;
$$;

-- Same contract as 20260905190000, except businesses an agency added (whose
-- creator is the acting agency member) do not count toward the person's cap.
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
  if (select count(*) from public.workspaces w where w.created_by = p_user_id
      and (not exists (select 1 from public.agency_client_additions a where a.customer_workspace_id = w.id)
        or exists (select 1 from public.workspace_memberships m where m.workspace_id = w.id and m.user_id = p_user_id and m.role = 'owner'))) >= 5 then
    raise exception 'workspace_limit_reached';
  end if;

  insert into public.workspaces (kind, name, created_by)
    values (p_kind, btrim(p_name), p_user_id) returning * into created_workspace;
  insert into public.workspace_memberships (workspace_id, user_id, role, created_by)
    values (created_workspace.id, p_user_id, 'owner', p_user_id);
  return next created_workspace;
end;
$$;

-- Same contract as 20260921220000, with the same cap exception.
create or replace function public.enter_customer_business(
  p_user_id uuid, p_verified_email text, p_name text, p_business_id uuid,
  p_request_text text, p_command_id uuid, p_command_digest text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  receipt public.workspace_creation_receipts%rowtype;
  business_id uuid;
  request_row public.service_requests%rowtype;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
    or (p_business_id is null and coalesce(char_length(btrim(p_name)),0) not between 1 and 120)
    or (p_business_id is not null and p_name is not null)
    or (p_request_text is not null and char_length(btrim(p_request_text)) not between 1 and 3000) then
    raise exception 'business_entry_invalid';
  end if;
  -- Same lock as create_owned_workspace: concurrent entry cannot exceed the cap.
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email))
    and verified_at is not null for update;
  if not found then raise exception 'verified_identity_required'; end if;
  select * into receipt from public.workspace_creation_receipts
    where user_id=p_user_id and command_id=p_command_id for update;
  if found then
    if receipt.command_digest <> p_command_digest then raise exception 'business_entry_idempotency_conflict'; end if;
    perform public.service_request_assert_customer(receipt.workspace_id,p_user_id,p_verified_email,true);
    return jsonb_build_object('workspaceId',receipt.workspace_id,'requestId',receipt.request_id,'alreadyCreated',true);
  end if;
  if p_business_id is null then
    if (select count(*) from public.workspaces w where w.created_by=p_user_id
        and (not exists (select 1 from public.agency_client_additions a where a.customer_workspace_id=w.id)
          or exists (select 1 from public.workspace_memberships m where m.workspace_id=w.id and m.user_id=p_user_id and m.role='owner'))) >= 5 then
      raise exception 'workspace_limit_reached';
    end if;
    insert into public.workspaces(kind,name,created_by) values('customer',btrim(p_name),p_user_id) returning id into business_id;
    insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(business_id,p_user_id,'owner',p_user_id);
  else
    perform public.service_request_assert_customer(p_business_id,p_user_id,p_verified_email,true);
    business_id := p_business_id;
  end if;
  if public.workspace_exit_completed(business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_request_text is not null then
    select * into request_row from public.save_service_request(
      p_user_id,p_verified_email,business_id,null,null,'requested',btrim(p_request_text),btrim(p_request_text),
      jsonb_build_object('source','business_entry','workspaceName',(select name from public.workspaces where id=business_id)),
      array['help_request']::text[],'{"kind":"strelva"}'::jsonb,
      'business-entry:'||p_command_id::text,p_command_digest
    );
    if request_row.id is null then raise exception 'business_entry_request_missing'; end if;
  end if;
  insert into public.workspace_creation_receipts(user_id,command_id,command_digest,workspace_id,request_id)
    values(p_user_id,p_command_id,p_command_digest,business_id,request_row.id);
  return jsonb_build_object('workspaceId',business_id,'requestId',request_row.id,'alreadyCreated',false);
end;
$$;

-- Same contract as 20261008151000, plus the provider seat between direct
-- membership and denial, as in workspace_require (20261009151000).
create or replace function public.connected_site_assert_actor(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_manage boolean) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_role text;
begin
  if not exists(select 1 from public.users where id = p_user_id and lower(email) = lower(p_verified_email) and verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  select m.role into v_role from public.workspaces w join public.workspace_memberships m on m.workspace_id = w.id
    where w.id = p_workspace_id and w.kind = 'customer' and m.user_id = p_user_id for share of w, m;
  if v_role is null then v_role := public.provider_seat_role(p_workspace_id, p_user_id, true); end if;
  if v_role is null then raise exception 'workspace_access_denied'; end if;
  if p_manage and v_role not in ('owner','admin') then raise exception 'workspace_access_denied'; end if;
  if p_manage and public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  return v_role;
end $$;

revoke all on function public.agency_client_addition_guard() from public, anon, authenticated, service_role;
revoke all on function public.agency_client_owner_claim_guard() from public, anon, authenticated, service_role;
revoke all on function public.agency_client_add_limits() from public, anon, authenticated, service_role;
revoke all on function public.agency_client_assert_actor(uuid, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.agency_client_waiting_for_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function public.agency_client_addition_json(public.agency_client_additions, boolean) from public, anon, authenticated, service_role;
revoke all on function public.agency_add_client(uuid, text, uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.list_agency_client_additions(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.issue_agency_client_owner_claim(uuid, text, uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.read_agency_client_owner_claim(text) from public, anon, authenticated;
revoke all on function public.accept_agency_client_owner_claim(text, uuid, text) from public, anon, authenticated;
revoke all on function public.create_owned_workspace(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.enter_customer_business(uuid, text, text, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.connected_site_assert_actor(uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.agency_add_client(uuid, text, uuid, jsonb, uuid, text) to service_role;
-- Server-side preflight before crawling; the write retains its locked recheck.
grant execute on function public.agency_client_assert_actor(uuid, text, uuid) to service_role;
grant execute on function public.list_agency_client_additions(uuid, text, uuid) to service_role;
grant execute on function public.issue_agency_client_owner_claim(uuid, text, uuid, uuid, text, text, timestamptz) to service_role;
grant execute on function public.read_agency_client_owner_claim(text) to service_role;
grant execute on function public.accept_agency_client_owner_claim(text, uuid, text) to service_role;
grant execute on function public.create_owned_workspace(uuid, text, text, text) to service_role;
grant execute on function public.enter_customer_business(uuid, text, text, uuid, text, uuid, text) to service_role;
