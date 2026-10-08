-- Owner links go only to a trusted owner address (#524, ADR 0012).
--
-- Before: every Needs you owner link (domain approvals, website launch and
-- publish, Make real, business facts, bookings, publishing) went to
-- resolve_business_owner_recipient, which returned whatever owner_recipient
-- fact sat in the working record. Any operator or agency that could write the
-- record could point it at its own inbox and approve its own work.
-- 20261011133700 closed this for business facts only
-- (business_trusted_owner_recipient). This makes that rule the only one and
-- gives it a memory:
--   business_owner_recipient_trust   one row per business: the trusted
--                                    address and how it became trusted.
--   business_owner_recipient_events  append-only: every owner_recipient write
--                                    and every trust change, with its actor.
--   owner_decision_link_bindings     which trusted address each item's link
--                                    was actually sent to.
-- An address becomes trusted only by
--   * conversion: the address imported from the converted site (its
--     tenant_import owner_recipient fact, else its owner_email), and only when
--     the business has no trusted address yet;
--   * the owner: a verified owner's own write, or an owner decision on the
--     business facts item. That item reaches the business only through the
--     previously trusted address or the owner's session. Both arrive here as
--     a business_record_confirmed row for owner_recipient.
-- Every other write (operator, any agency including Strelva's, an admin, an
-- import into a business that already has one) is logged as pending and
-- receives nothing. Removing the contact never moves trust: the last trusted
-- address keeps receiving decisions until the owner sets another.
--
-- Readers that now resolve only the trusted address:
--   resolve_business_owner_recipient  same JSON as before. Used by the Needs
--     you delivery list, domain and Make real link checks, publishing
--     reconnect, tool notices, exports, the billing payer and the owner
--     invitation default.
--   resolve_tenant_owner_recipient    tenant-model notices (leads, reports,
--     Google review alerts and their approve links). A converted site gets
--     its business's trusted address and nothing else: never its own
--     owner_email, which an operator can still edit. Only a site with no
--     business keeps its owner_email.
--   business_trusted_owner_recipient  confirm_business_facts.
-- claim_owner_decision accepts an owner link only from the trusted address,
-- and only if that item's link was sent to it while it was trusted. It reads
-- the trust row FOR SHARE; every trust change takes it FOR UPDATE first, so a
-- change in flight finishes before a claim checks the address. With no
-- trusted address the delivery cron records the item as not sent
-- (no_trusted_owner_recipient) and sends nothing.
begin;
set local lock_timeout = '3s';

-- No foreign keys to workspaces: tenant_unlink_plan counts every table that
-- references a workspace as use, and this is conversion machinery that goes
-- with the business (workspaces_forget_owner_recipient below).
create table public.business_owner_recipient_trust (
  workspace_id uuid primary key,
  email text not null check (email = lower(btrim(email)) and public.business_record_email_valid(email)),
  name text check (name is null or char_length(name) between 1 and 160),
  -- Provenance of the fact it came from; resolve_business_owner_recipient returns it.
  source text check (source is null or char_length(source) between 1 and 40),
  verified boolean not null default false,
  trusted_via text not null check (trusted_via in ('conversion','owner_write','owner_decision')),
  -- Set when the address is the converted site's own owner_email (no imported fact).
  tenant_stable_id uuid,
  decision_id uuid,
  revision_sequence bigint,
  trusted_at timestamptz not null default clock_timestamp(),
  check ((trusted_via = 'owner_decision') = (decision_id is not null)),
  check (tenant_stable_id is null or trusted_via = 'conversion')
);

create table public.business_owner_recipient_events (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  -- written: an owner_recipient change in the working record (null email: removed).
  -- trusted: the address owner links go to from now on.
  event text not null check (event in ('written','trusted')),
  email text check (email is null or char_length(email) <= 320),
  name text check (name is null or char_length(name) <= 160),
  previous_trusted text check (previous_trusted is null or char_length(previous_trusted) <= 320),
  -- written only: true when the written address is not the trusted one.
  pending boolean,
  actor_kind text not null check (actor_kind in
    ('owner','admin','member','operator','agency','owner_link','owner_session','conversion','migration')),
  actor_id text check (actor_id is null or char_length(actor_id) <= 320),
  source text check (source is null or char_length(source) <= 40),
  decision_id uuid,
  revision_sequence bigint,
  created_at timestamptz not null default clock_timestamp(),
  check ((event = 'written') = (pending is not null))
);
create index business_owner_recipient_events_workspace_idx on public.business_owner_recipient_events(workspace_id, id desc);

create table public.owner_decision_link_bindings (
  decision_id uuid not null references public.owner_decisions(id) on delete cascade,
  workspace_id uuid not null,
  recipient text not null check (recipient = lower(btrim(recipient)) and char_length(recipient) <= 320),
  bound_at timestamptz not null default clock_timestamp(),
  primary key (decision_id, recipient)
);

alter table public.business_owner_recipient_trust enable row level security;
alter table public.business_owner_recipient_events enable row level security;
alter table public.owner_decision_link_bindings enable row level security;
revoke all on public.business_owner_recipient_trust, public.business_owner_recipient_events,
  public.owner_decision_link_bindings from public, anon, authenticated, service_role;

-- The log never changes; it goes only with its business.
create function public.business_owner_recipient_events_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return old;
  end if;
  raise exception 'business_record_history_immutable';
end;
$$;
create trigger business_owner_recipient_events_immutable before update or delete on public.business_owner_recipient_events
  for each row execute function public.business_owner_recipient_events_immutable();

-- The address and its log go when the business goes.
create function public.business_owner_recipient_forget() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from public.business_owner_recipient_events where workspace_id = old.id;
  delete from public.business_owner_recipient_trust where workspace_id = old.id;
  return null;
end;
$$;
create trigger workspaces_forget_owner_recipient after delete on public.workspaces
  for each row execute function public.business_owner_recipient_forget();

-- Today's trusted address, by the 20261011133700 rule, plus the import it
-- came from when a provider has since overwritten it. A provider-written
-- address without an owner decision is not carried over.
with candidates as (
  select c.workspace_id, lower(btrim(c.state->'value'->>'email')) email, nullif(btrim(c.state->'value'->>'name'), '') name,
      c.state->>'source' source, coalesce((c.state->>'verified')::boolean, false) verified, c.confirmed_by_kind via,
      null::uuid tenant_stable_id, c.decision_id, c.revision_sequence, 1 rank
    from public.business_record_confirmed c where c.entity = 'fact' and c.entity_id = 'owner_recipient'
  union all
  select f.workspace_id, lower(btrim(f.value->>'email')), nullif(btrim(f.value->>'name'), ''), 'tenant_import', f.verified,
      'conversion', null, null, null, 2
    from public.business_record_facts f where f.fact_key = 'owner_recipient' and f.source = 'tenant_import'
  union all
  select r.workspace_id, lower(btrim(c->'after'->'value'->>'email')), nullif(btrim(c->'after'->'value'->>'name'), ''), 'tenant_import',
      coalesce((c->'after'->>'verified')::boolean, false), 'conversion', null, null, r.sequence, 3
    from public.business_record_revisions r cross join lateral jsonb_array_elements(r.changes) c
    where r.source = 'tenant_import' and r.result->'unlinkOf' is null
      and c->>'entity' = 'fact' and c->>'id' = 'owner_recipient' and c->'after'->'value'->>'email' is not null
  union all
  select l.workspace_id, lower(btrim(t.owner_email)), null, null, false, 'conversion', t.stable_id, null, null, 4
    from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
    where nullif(btrim(t.owner_email), '') is not null
      and not exists (select 1 from public.business_record_facts f where f.workspace_id = l.workspace_id and f.fact_key = 'owner_recipient')
), chosen as (
  select distinct on (c.workspace_id) c.* from candidates c
    join public.workspaces w on w.id = c.workspace_id
    where public.business_record_email_valid(c.email)
    order by c.workspace_id, c.rank, c.revision_sequence desc nulls last
)
insert into public.business_owner_recipient_trust(workspace_id, email, name, source, verified, trusted_via, tenant_stable_id, decision_id, revision_sequence)
  select workspace_id, email, case when tenant_stable_id is null then left(name, 160) end, source, verified, via, tenant_stable_id, decision_id, revision_sequence
    from chosen;
insert into public.business_owner_recipient_events(workspace_id, event, email, name, actor_kind, source, decision_id, revision_sequence)
  select workspace_id, 'trusted', email, name, 'migration', source, decision_id, revision_sequence
    from public.business_owner_recipient_trust order by workspace_id;
-- Links already sent to that address stay usable.
insert into public.owner_decision_link_bindings(decision_id, workspace_id, recipient, bound_at)
  select d.decision_id, d.workspace_id, d.recipient, min(d.created_at)
    from public.owner_decision_deliveries d join public.business_owner_recipient_trust t on t.workspace_id = d.workspace_id and t.email = d.recipient
    where d.status = 'sent'
    group by d.decision_id, d.workspace_id, d.recipient;

-- Owner / admin / member for a member write; otherwise the revision's actor kind.
create function public.business_owner_recipient_actor_kind(p_workspace_id uuid, p_actor_kind text, p_actor_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_actor_kind = 'member' then coalesce((select m.role from public.workspace_memberships m
      where m.workspace_id = p_workspace_id and m.user_id = p_actor_id), 'member')
    else p_actor_kind end
$$;

create function public.business_owner_recipient_set_trust(
  p_workspace_id uuid, p_email text, p_name text, p_source text, p_verified boolean, p_via text,
  p_tenant_stable_id uuid, p_decision_id uuid, p_revision_sequence bigint, p_actor_kind text, p_actor_id text
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_previous text;
begin
  select email into v_previous from public.business_owner_recipient_trust where workspace_id = p_workspace_id for update;
  insert into public.business_owner_recipient_trust(workspace_id, email, name, source, verified, trusted_via, tenant_stable_id,
      decision_id, revision_sequence)
    values (p_workspace_id, p_email, left(p_name, 160), p_source, coalesce(p_verified, false), p_via, p_tenant_stable_id,
      p_decision_id, p_revision_sequence)
    on conflict (workspace_id) do update set email = excluded.email, name = excluded.name, source = excluded.source,
      verified = excluded.verified, trusted_via = excluded.trusted_via, tenant_stable_id = excluded.tenant_stable_id,
      decision_id = excluded.decision_id, revision_sequence = excluded.revision_sequence, trusted_at = clock_timestamp();
  insert into public.business_owner_recipient_events(workspace_id, event, email, name, previous_trusted, actor_kind, actor_id,
      source, decision_id, revision_sequence)
    values (p_workspace_id, 'trusted', p_email, left(p_name, 160), v_previous, p_actor_kind, left(p_actor_id, 320),
      p_source, p_decision_id, p_revision_sequence);
end;
$$;

-- Conversion: the address imported from the site, if the business has none yet.
create function public.business_owner_recipient_trust_conversion() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text; v_name text; v_verified boolean; v_tenant uuid;
begin
  if new.tenant_stable_id is null then return null; end if;
  -- Conversion already holds this lock; it serializes two links to one business.
  perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 7415));
  if exists (select 1 from public.business_owner_recipient_trust where workspace_id = new.workspace_id) then return null; end if;
  select lower(btrim(f.value->>'email')), nullif(btrim(f.value->>'name'), ''), f.verified into v_email, v_name, v_verified
    from public.business_record_facts f
    where f.workspace_id = new.workspace_id and f.fact_key = 'owner_recipient' and f.source = 'tenant_import';
  if v_email is null then
    select lower(btrim(t.owner_email)) into v_email from public.tenants t
      where t.stable_id = new.tenant_stable_id and nullif(btrim(t.owner_email), '') is not null;
    v_name := null; v_verified := false; v_tenant := new.tenant_stable_id;
  end if;
  if v_email is null or not public.business_record_email_valid(v_email) then return null; end if;
  perform public.business_owner_recipient_set_trust(new.workspace_id, v_email, v_name,
    case when v_tenant is null then 'tenant_import' end, v_verified, 'conversion', v_tenant, null, null,
    'conversion', new.linked_by::text);
  return null;
end;
$$;
create trigger tenant_workspace_links_owner_recipient_trust after insert on public.tenant_workspace_links
  for each row execute function public.business_owner_recipient_trust_conversion();

-- The owner's decision: an owner write or an owner-decided business facts item.
create function public.business_owner_recipient_trust_confirmed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text; v_kind text; v_actor text;
begin
  if new.entity <> 'fact' or new.entity_id <> 'owner_recipient' then return null; end if;
  v_email := lower(btrim(new.state->'value'->>'email'));
  if v_email is null or not public.business_record_email_valid(v_email) then return null; end if;
  if new.confirmed_by_kind = 'owner_decision' then
    select d.decided_by_kind, d.decided_by into v_kind, v_actor from public.owner_decisions d where d.id = new.decision_id;
  else
    v_kind := 'owner';
    select r.actor_id::text into v_actor from public.business_record_revisions r
      where r.workspace_id = new.workspace_id and r.sequence = new.revision_sequence;
  end if;
  perform public.business_owner_recipient_set_trust(new.workspace_id, v_email, nullif(btrim(new.state->'value'->>'name'), ''),
    new.state->>'source', coalesce((new.state->>'verified')::boolean, false), new.confirmed_by_kind, null, new.decision_id,
    new.revision_sequence, case when v_kind in ('owner_link','owner_session') then v_kind else 'owner' end, v_actor);
  return null;
end;
$$;
create trigger business_record_confirmed_owner_recipient_trust after insert or update on public.business_record_confirmed
  for each row execute function public.business_owner_recipient_trust_confirmed();

-- Every owner_recipient write, with who wrote it. Runs after
-- business_record_revisions_confirm_owner_write (trigger names order them),
-- so `pending` reflects an owner write that was trusted at once.
create function public.business_owner_recipient_log_write() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb; v_email text; v_trusted text;
begin
  for c in select value from jsonb_array_elements(new.changes) with ordinality t(value, n) order by n loop
    if c->>'entity' <> 'fact' or c->>'id' <> 'owner_recipient' then continue; end if;
    v_email := lower(btrim(c->'after'->'value'->>'email'));
    select email into v_trusted from public.business_owner_recipient_trust where workspace_id = new.workspace_id;
    insert into public.business_owner_recipient_events(workspace_id, event, email, name, previous_trusted, pending, actor_kind,
        actor_id, source, revision_sequence)
      values (new.workspace_id, 'written', v_email, left(nullif(btrim(c->'after'->'value'->>'name'), ''), 160), v_trusted,
        v_email is distinct from v_trusted, public.business_owner_recipient_actor_kind(new.workspace_id, new.actor_kind, new.actor_id),
        new.actor_id::text, new.source, new.sequence);
  end loop;
  return null;
end;
$$;
create trigger business_record_revisions_owner_recipient_log after insert on public.business_record_revisions
  for each row execute function public.business_owner_recipient_log_write();

-- The one trust rule (20261011133700's name, now backed by the trust row).
create or replace function public.business_trusted_owner_recipient(p_workspace_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select t.email from public.business_owner_recipient_trust t where t.workspace_id = p_workspace_id
$$;

-- Same JSON as 20261011133700 (20261002120000 plus `trusted`, always true
-- here): an imported or owner-set address reads as the record's, a converted
-- site's own owner_email as the tenant fallback. No trusted address: null.
create or replace function public.resolve_business_owner_recipient(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare trusted public.business_owner_recipient_trust;
begin
  select * into trusted from public.business_owner_recipient_trust where workspace_id = p_workspace_id;
  if not found then return null; end if;
  if trusted.tenant_stable_id is null then
    return jsonb_build_object('email', trusted.email, 'name', trusted.name, 'from', 'record',
      'source', trusted.source, 'verified', trusted.verified, 'tenantId', null, 'trusted', true);
  end if;
  return jsonb_build_object('email', trusted.email, 'name', null, 'from', 'tenant_fallback',
    'source', null, 'verified', false, 'tenantId', (select t.id from public.tenants t where t.stable_id = trusted.tenant_stable_id),
    'trusted', true);
end;
$$;

-- A converted site: its business's trusted address, or nobody. Its own
-- owner_email stays editable by operators, so it is never read once the site
-- has a business. A site with no business keeps its owner_email (20261007110000).
create or replace function public.resolve_tenant_owner_recipient(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare tenant_row record; ws uuid; trusted public.business_owner_recipient_trust;
begin
  select t.id, t.stable_id, t.owner_email into tenant_row from public.tenants t where t.id = p_tenant_id;
  if not found then return null; end if;
  select l.workspace_id into ws from public.tenant_workspace_links l where l.tenant_stable_id = tenant_row.stable_id;
  if ws is not null then
    select * into trusted from public.business_owner_recipient_trust where workspace_id = ws;
    if not found then return null; end if;
    return jsonb_build_object('email', trusted.email, 'name', trusted.name,
      'from', case when trusted.tenant_stable_id is null then 'record'
        when trusted.tenant_stable_id = tenant_row.stable_id then 'tenant' else 'linked_tenant' end,
      'workspaceId', ws,
      'tenantId', case when trusted.tenant_stable_id is null or trusted.tenant_stable_id = tenant_row.stable_id then tenant_row.id
        else (select t.id from public.tenants t where t.stable_id = trusted.tenant_stable_id) end);
  end if;
  if nullif(btrim(tenant_row.owner_email), '') is not null then
    return jsonb_build_object('email', lower(btrim(tenant_row.owner_email)), 'name', null, 'from', 'tenant',
      'workspaceId', null, 'tenantId', tenant_row.id);
  end if;
  return null;
end;
$$;

create or replace function public.claim_owner_decision(
  p_workspace_id uuid, p_decision_id uuid, p_revision_hash text, p_decision text, p_by_kind text,
  p_user_id uuid, p_verified_email text, p_recipient text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.owner_decisions%rowtype;
  actor_role text;
  v_decided_by text;
  v_trusted text;
  by_kind text := p_by_kind;
begin
  if p_decision not in ('approve','not_yet') then raise exception 'owner_decision_invalid'; end if;
  if p_by_kind not in ('owner_link','session','operator') then raise exception 'owner_decision_invalid'; end if;
  select * into item from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'owner_decision_not_found'; end if;
  if item.state <> 'open' then
    return jsonb_build_object('status', case when item.state = 'superseded' then 'changed' else 'already_handled' end,
      'item', public.owner_decision_json(item));
  end if;
  if item.revision_hash <> p_revision_hash then
    return jsonb_build_object('status', 'changed', 'item', public.owner_decision_json(item));
  end if;
  if clock_timestamp() >= item.expires_at then
    return jsonb_build_object('status', 'expired', 'item', public.owner_decision_json(item));
  end if;

  if p_by_kind = 'owner_link' then
    if item.route <> 'owner_decides' then raise exception 'owner_decision_permission_denied'; end if;
    if item.sign_in_required then raise exception 'owner_decision_sign_in_required'; end if;
    -- Only the trusted owner address (20261013120000), and only an address
    -- that was trusted when this item's link was sent to it. FOR SHARE waits
    -- out a trust change in flight (business_owner_recipient_set_trust locks
    -- this row FOR UPDATE first) and holds off the next until this commits.
    select t.email into v_trusted from public.business_owner_recipient_trust t where t.workspace_id = p_workspace_id for share;
    if p_recipient is null or v_trusted is distinct from lower(btrim(p_recipient))
      or not exists (select 1 from public.owner_decision_link_bindings b
        where b.decision_id = item.id and b.recipient = lower(btrim(p_recipient))) then
      raise exception 'owner_decision_recipient_not_owner';
    end if;
    v_decided_by := lower(btrim(p_recipient));
  elsif p_by_kind = 'operator' then
    if public.needs_you_operator_id(p_user_id, p_verified_email) is null then
      raise exception 'owner_decision_permission_denied';
    end if;
    -- An operator never decides an item routed to the owner.
    if item.route = 'owner_decides' then raise exception 'owner_decision_owner_only'; end if;
    v_decided_by := p_user_id::text;
  else
    actor_role := public.needs_you_member_role(p_workspace_id, p_user_id, p_verified_email);
    if actor_role is null then raise exception 'owner_decision_permission_denied'; end if;
    -- A strelva_reviews item reaches the owner only after an operator escalates it.
    if item.route <> 'owner_decides' then raise exception 'owner_decision_permission_denied'; end if;
    if not (actor_role = 'owner' or (actor_role = 'admin' and item.admin_may_decide)) then
      raise exception 'owner_decision_permission_denied';
    end if;
    by_kind := actor_role || '_session';
    v_decided_by := p_user_id::text;
  end if;

  update public.owner_decisions set
      state = case when p_decision = 'approve' then 'approved' else 'declined' end,
      decided_at = clock_timestamp(), decided_by_kind = by_kind, decided_by = v_decided_by
    where id = item.id returning * into item;
  return jsonb_build_object('status', 'claimed', 'item', public.owner_decision_json(item));
end;
$$;

create or replace function public.record_owner_decision_delivery(
  p_workspace_id uuid, p_decision_id uuid, p_kind text, p_status text, p_recipient text,
  p_provider_message_id text, p_reason text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.owner_decisions%rowtype;
begin
  select * into item from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'owner_decision_not_found'; end if;
  begin
    insert into public.owner_decision_deliveries(decision_id, workspace_id, kind, status, recipient, provider_message_id, reason)
      values (item.id, p_workspace_id, p_kind, p_status, lower(nullif(btrim(p_recipient), '')), p_provider_message_id, left(p_reason, 300));
  exception when check_violation then raise exception 'owner_decision_invalid';
  end;
  -- A link sent to the trusted owner address is the only one that may decide.
  if p_status = 'sent' and lower(nullif(btrim(p_recipient), '')) = public.business_trusted_owner_recipient(p_workspace_id) then
    insert into public.owner_decision_link_bindings(decision_id, workspace_id, recipient)
      values (item.id, p_workspace_id, lower(btrim(p_recipient))) on conflict do nothing;
  end if;
  if item.state = 'open' then
    update public.owner_decisions set
        delivery_state = case
          when p_status = 'failed' then delivery_state
          when p_status in ('suppressed','bounced') then p_status
          when p_kind = 'reminder_1' then 'reminded_1'
          when p_kind = 'reminder_2' then 'reminded_2'
          else 'sent' end,
        reminded_1_at = case when p_kind = 'reminder_1' and p_status <> 'failed' then clock_timestamp() else reminded_1_at end,
        reminded_2_at = case when p_kind = 'reminder_2' and p_status <> 'failed' then clock_timestamp() else reminded_2_at end
      where id = item.id returning * into item;
  end if;
  return public.owner_decision_json(item);
end;
$$;

revoke all on function public.business_owner_recipient_events_immutable(), public.business_owner_recipient_forget(), public.business_owner_recipient_actor_kind(uuid, text, uuid),
  public.business_owner_recipient_set_trust(uuid, text, text, text, boolean, text, uuid, uuid, bigint, text, text),
  public.business_owner_recipient_trust_conversion(), public.business_owner_recipient_trust_confirmed(),
  public.business_owner_recipient_log_write()
  from public, anon, authenticated, service_role;
commit;
