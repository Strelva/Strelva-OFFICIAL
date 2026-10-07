-- One path to the public record (#509, ADR 0012). Before this, a fact or
-- service written with source 'operator' rendered live on the client's hosted
-- and connected sites with no owner decision, while every other provider's
-- ('agency') writes stayed hidden: a Strelva advantage and an operator bypass.
--
-- Now the business record is the working copy and public readers only see
-- the confirmed copy:
--   business_record_confirmed            per fact key / service id, the last
--                                        state the business decided on.
--   business_record_fact_confirmations   one immutable receipt per Needs you
--                                        decision applied here.
-- A state is confirmed only by
--   * the owner's own write: a business_record_revisions row with source
--     'owner' whose actor is a verified owner member (trigger below), or
--   * an owner Needs you decision ('business_facts' lifecycle, owner_decides,
--     admins never decide) applied by confirm_business_facts: signed in, or by
--     signed link to the business's trusted owner recipient.
-- Every other write (operator, any agency including Strelva's, admins, import,
-- agent, bookings, inquiries) stays pending. An operator recovery edit is
-- still logged as actor_kind 'operator' in business_record_revisions and does
-- not publish. Deleting or undoing a confirmed fact is a pending change too.
-- The Needs you default reviewer is unchanged; this kind is owner-only.
begin;
set local lock_timeout = '3s';

create table public.business_record_confirmed (
  workspace_id uuid not null references public.business_records(workspace_id) on delete cascade,
  entity text not null check (entity in ('fact','service')),
  entity_id text not null check (char_length(entity_id) between 1 and 80),
  -- business_record_entity_state() shape, so history and confirmation compare alike.
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  confirmed_by_kind text not null check (confirmed_by_kind in ('owner_write','owner_decision')),
  decision_id uuid references public.owner_decisions(id) on delete cascade,
  revision_sequence bigint,
  confirmed_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, entity, entity_id),
  check ((confirmed_by_kind = 'owner_decision') = (decision_id is not null))
);

create table public.business_record_fact_confirmations (
  decision_id uuid primary key references public.owner_decisions(id) on delete cascade,
  workspace_id uuid not null references public.business_records(workspace_id) on delete cascade,
  record_revision bigint not null check (record_revision >= 0),
  revision_hash text not null check (revision_hash ~ '^[0-9a-f]{64}$'),
  decided_by_kind text not null check (decided_by_kind in ('owner_link','owner_session')),
  decided_by text not null check (char_length(decided_by) between 1 and 320),
  changes jsonb not null check (jsonb_typeof(changes) = 'array'),
  confirmed_at timestamptz not null default clock_timestamp()
);
create index business_record_fact_confirmations_workspace_idx on public.business_record_fact_confirmations(workspace_id, confirmed_at desc);

alter table public.business_record_confirmed enable row level security;
alter table public.business_record_fact_confirmations enable row level security;
revoke all on public.business_record_confirmed, public.business_record_fact_confirmations from public, anon, authenticated, service_role;

-- Receipts never change; they go only with their business or decision.
create function public.business_record_fact_confirmation_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and (not exists (select 1 from public.business_records where workspace_id = old.workspace_id)
    or not exists (select 1 from public.owner_decisions where id = old.decision_id)) then
    return old;
  end if;
  raise exception 'business_record_history_immutable';
end;
$$;
create trigger business_record_fact_confirmations_immutable before update or delete on public.business_record_fact_confirmations
  for each row execute function public.business_record_fact_confirmation_immutable();

-- What the public sees of one entity state. Provenance is not content.
create function public.business_record_public_content(p_entity text, p_state jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_state is null or jsonb_typeof(p_state) = 'null' then null
    when p_entity = 'fact' then p_state->'value'
    else jsonb_build_object('name', p_state->'name', 'description', p_state->'description',
      'durationMinutes', p_state->'durationMinutes', 'priceText', p_state->'priceText',
      'active', p_state->'active', 'position', p_state->'position') end
$$;

create function public.business_record_owner_actor(p_workspace_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.workspace_memberships m
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'customer'
    join public.users u on u.id = m.user_id and u.verified_at is not null
    where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.role = 'owner')
$$;

-- The owner's own write is the decision. Admins, operators and agencies are not.
create function public.business_record_confirm_owner_write() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb;
begin
  if new.source <> 'owner' or new.actor_kind <> 'member'
    or not public.business_record_owner_actor(new.workspace_id, new.actor_id) then
    return null;
  end if;
  for c in select value from jsonb_array_elements(new.changes) with ordinality t(value, n) order by n loop
    if c->>'entity' not in ('fact','service') then continue; end if;
    if c->'after' is null or jsonb_typeof(c->'after') = 'null' then
      delete from public.business_record_confirmed
        where workspace_id = new.workspace_id and entity = c->>'entity' and entity_id = c->>'id';
    else
      insert into public.business_record_confirmed(workspace_id, entity, entity_id, state, confirmed_by_kind, decision_id, revision_sequence)
        values (new.workspace_id, c->>'entity', c->>'id', c->'after', 'owner_write', null, new.sequence)
        on conflict (workspace_id, entity, entity_id) do update set state = excluded.state,
          confirmed_by_kind = excluded.confirmed_by_kind, decision_id = null,
          revision_sequence = excluded.revision_sequence, confirmed_at = clock_timestamp();
    end if;
  end loop;
  return null;
end;
$$;
create trigger business_record_revisions_confirm_owner_write after insert on public.business_record_revisions
  for each row execute function public.business_record_confirm_owner_write();

-- Existing owner-written rows were already the owner's decision.
insert into public.business_record_confirmed(workspace_id, entity, entity_id, state, confirmed_by_kind)
  select f.workspace_id, 'fact', f.fact_key, public.business_record_entity_state(f.workspace_id, 'fact', f.fact_key), 'owner_write'
    from public.business_record_facts f
    where f.source = 'owner' and public.business_record_owner_actor(f.workspace_id, f.updated_by)
  on conflict do nothing;
insert into public.business_record_confirmed(workspace_id, entity, entity_id, state, confirmed_by_kind)
  select s.workspace_id, 'service', s.id::text, public.business_record_entity_state(s.workspace_id, 'service', s.id::text), 'owner_write'
    from public.business_services s
    where s.source = 'owner' and public.business_record_owner_actor(s.workspace_id, s.updated_by)
  on conflict do nothing;

-- Who may approve by link: the confirmed owner recipient, else the one
-- imported from the tenant, else the tenant's owner email. A recipient an
-- operator or agency wrote is pending like any other fact and never approves
-- its own change.
create function public.business_trusted_owner_recipient(p_workspace_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select lower(btrim(c.state->'value'->>'email')) from public.business_record_confirmed c
      where c.workspace_id = p_workspace_id and c.entity = 'fact' and c.entity_id = 'owner_recipient'),
    (select lower(btrim(f.value->>'email')) from public.business_record_facts f
      where f.workspace_id = p_workspace_id and f.fact_key = 'owner_recipient' and f.source = 'tenant_import'),
    (select case when exists (select 1 from public.business_record_facts f
        where f.workspace_id = p_workspace_id and f.fact_key = 'owner_recipient') then null
      else lower(btrim(t.owner_email)) end
      from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
      where l.workspace_id = p_workspace_id and nullif(btrim(t.owner_email), '') is not null
      order by l.linked_at, l.id limit 1))
$$;

-- Pending changes: working copy vs confirmed copy, by public content, in a
-- stable order. Null when nothing waits. The hash binds the record revision
-- and the exact changes, so any later write supersedes an open item.
create function public.read_business_fact_review(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_revision bigint; v_changes jsonb;
begin
  select revision into v_revision from public.business_records where workspace_id = p_workspace_id;
  if not found or public.workspace_exit_completed(p_workspace_id) then return null; end if;
  with working as (
    select 'fact'::text entity, f.fact_key entity_id, public.business_record_entity_state(f.workspace_id, 'fact', f.fact_key) state
      from public.business_record_facts f where f.workspace_id = p_workspace_id
    union all
    select 'service', s.id::text, public.business_record_entity_state(s.workspace_id, 'service', s.id::text)
      from public.business_services s where s.workspace_id = p_workspace_id
  ), confirmed as (
    select c.entity, c.entity_id, c.state from public.business_record_confirmed c where c.workspace_id = p_workspace_id
  ), diff as (
    select coalesce(w.entity, c.entity) entity, coalesce(w.entity_id, c.entity_id) entity_id,
      public.business_record_public_content(coalesce(w.entity, c.entity), c.state) before,
      public.business_record_public_content(coalesce(w.entity, c.entity), w.state) after,
      w.state->>'source' source
    from working w full join confirmed c on c.entity = w.entity and c.entity_id = w.entity_id
  )
  select jsonb_agg(jsonb_build_object('entity', entity, 'id', entity_id, 'before', coalesce(before, 'null'::jsonb),
      'after', coalesce(after, 'null'::jsonb), 'source', source) order by entity, entity_id)
    into v_changes from diff where before is distinct from after;
  if v_changes is null then return null; end if;
  return jsonb_build_object('workspaceId', p_workspace_id, 'recordRevision', v_revision, 'changes', v_changes,
    'revisionHash', encode(sha256(convert_to(p_workspace_id::text || ':' || v_revision::text || ':' || v_changes::text, 'UTF8')), 'hex'));
end;
$$;

create function public.business_fact_confirmation_json(r public.business_record_fact_confirmations) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('decisionId', r.decision_id, 'workspaceId', r.workspace_id, 'recordRevision', r.record_revision,
    'revisionHash', r.revision_hash, 'decidedByKind', r.decided_by_kind, 'changeCount', jsonb_array_length(r.changes),
    'confirmedAt', r.confirmed_at)
$$;

-- Apply one claimed owner decision. Rechecks the decision, who made it and
-- the exact pending changes; any refusal changes nothing. Replays return the
-- first receipt.
create function public.confirm_business_facts(p_workspace_id uuid, p_decision_id uuid, p_revision_hash text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare d public.owner_decisions; r public.business_record_fact_confirmations; review jsonb; c jsonb; v_state jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer' for share;
  if not found or public.workspace_exit_completed(p_workspace_id) then raise exception 'business_facts_owner_approval_required'; end if;
  select * into r from public.business_record_fact_confirmations where decision_id = p_decision_id;
  if found then
    if r.workspace_id <> p_workspace_id or r.revision_hash <> p_revision_hash then raise exception 'business_facts_changed'; end if;
    return public.business_fact_confirmation_json(r) || jsonb_build_object('replayed', true);
  end if;
  select * into d from public.owner_decisions where id = p_decision_id and workspace_id = p_workspace_id for share;
  if not found or d.state <> 'approved' or d.source_lifecycle <> 'business_facts' or d.source_id <> p_workspace_id::text
    or d.revision_hash <> p_revision_hash or d.change_kind <> 'fact.inferred' or d.route <> 'owner_decides' or d.admin_may_decide then
    raise exception 'business_facts_owner_approval_required';
  end if;
  if d.decided_by_kind = 'owner_link' then
    if public.business_trusted_owner_recipient(p_workspace_id) is distinct from lower(btrim(d.decided_by)) then
      raise exception 'business_facts_owner_approval_required';
    end if;
  elsif d.decided_by_kind = 'owner_session' then
    if d.decided_by !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not public.business_record_owner_actor(p_workspace_id, d.decided_by::uuid) then
      raise exception 'business_facts_owner_approval_required';
    end if;
  else
    raise exception 'business_facts_owner_approval_required';
  end if;
  perform 1 from public.business_records where workspace_id = p_workspace_id for update;
  review := public.read_business_fact_review(p_workspace_id);
  if review is null or review->>'revisionHash' <> p_revision_hash then raise exception 'business_facts_changed'; end if;
  for c in select value from jsonb_array_elements(review->'changes') loop
    v_state := public.business_record_entity_state(p_workspace_id, c->>'entity', c->>'id');
    if v_state is null then
      delete from public.business_record_confirmed where workspace_id = p_workspace_id and entity = c->>'entity' and entity_id = c->>'id';
    else
      insert into public.business_record_confirmed(workspace_id, entity, entity_id, state, confirmed_by_kind, decision_id)
        values (p_workspace_id, c->>'entity', c->>'id', v_state, 'owner_decision', p_decision_id)
        on conflict (workspace_id, entity, entity_id) do update set state = excluded.state,
          confirmed_by_kind = excluded.confirmed_by_kind, decision_id = excluded.decision_id,
          revision_sequence = null, confirmed_at = clock_timestamp();
    end if;
  end loop;
  insert into public.business_record_fact_confirmations(decision_id, workspace_id, record_revision, revision_hash, decided_by_kind, decided_by, changes)
    values (p_decision_id, p_workspace_id, (review->>'recordRevision')::bigint, p_revision_hash, d.decided_by_kind, d.decided_by, review->'changes')
    returning * into r;
  return public.business_fact_confirmation_json(r) || jsonb_build_object('replayed', false);
end;
$$;

-- The confirmed public facts for a member or the business's agency to build
-- with (never contacts, people or the owner recipient). VOLATILE: the actor
-- check takes FOR SHARE locks (20261009150000_reader_rpc_volatility).
create function public.read_confirmed_business_facts(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  return jsonb_build_object(
    'revision', coalesce((select revision from public.business_records where workspace_id = p_workspace_id), 0),
    'facts', coalesce((select jsonb_object_agg(c.entity_id, c.state->'value') from public.business_record_confirmed c
      where c.workspace_id = p_workspace_id and c.entity = 'fact' and c.entity_id <> 'owner_recipient'), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', s.state->'name', 'description', s.state->'description',
        'priceText', s.state->'priceText') order by (s.state->>'position')::integer, s.entity_id)
      from (select * from public.business_record_confirmed c where c.workspace_id = p_workspace_id and c.entity = 'service'
        and (c.state->>'active')::boolean order by (c.state->>'position')::integer, c.entity_id limit 40) s), '[]'::jsonb));
end;
$$;

-- Same projection as 20261010115500, now over the confirmed copy only.
create or replace function public.read_hosted_website_business_facts(p_tenant_id text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare ws uuid;
begin
  select p.workspace_id into ws from public.website_document_publications p
    join public.tenants t on t.id=p.tenant_id
    join public.business_records b on b.workspace_id=p.workspace_id
    where p.tenant_id=p_tenant_id and t.active and t.delivery_model='platform_template'
      and not public.workspace_exit_completed(p.workspace_id)
      and not exists(select 1 from public.tenant_workspace_links l where l.tenant_stable_id=t.stable_id and l.workspace_id<>p.workspace_id);
  if ws is null then return null; end if;
  return jsonb_build_object('revision',coalesce((select revision from public.business_records where workspace_id=ws),0),
    'facts',coalesce((select jsonb_object_agg(c.entity_id,c.state->'value') from public.business_record_confirmed c where c.workspace_id=ws
      and c.entity='fact' and c.entity_id in ('display_name','phone','email','address','hours')),'{}'::jsonb),
    'services',coalesce((select jsonb_agg(jsonb_build_object('name',s.state->'name','description',s.state->'description','priceText',s.state->'priceText')
        order by (s.state->>'position')::integer,s.entity_id)
      from (select * from public.business_record_confirmed c where c.workspace_id=ws and c.entity='service' and (c.state->>'active')::boolean
        order by (c.state->>'position')::integer,c.entity_id limit 40) s),'[]'::jsonb));
end $$;

-- Same body as 20261008151000, with facts and services from the confirmed copy.
create or replace function public.read_connected_site_context(p_public_key text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_site public.connected_sites; v_revision bigint;
begin
  select * into v_site from public.connected_sites where public_key = p_public_key and status = 'active';
  if v_site.id is null then return null; end if;
  select revision into v_revision from public.business_records where workspace_id = v_site.business_workspace_id;
  return jsonb_build_object(
    'revision', coalesce(v_revision, 0),
    'facts', coalesce((select jsonb_object_agg(c.entity_id, c.state->'value') from public.business_record_confirmed c
      where c.workspace_id = v_site.business_workspace_id and c.entity = 'fact' and c.entity_id <> 'owner_recipient'), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', c.state->'name', 'description', c.state->'description', 'priceText', c.state->'priceText')
        order by (c.state->>'position')::integer, c.entity_id)
      from public.business_record_confirmed c where c.workspace_id = v_site.business_workspace_id and c.entity = 'service'
        and (c.state->>'active')::boolean), '[]'::jsonb),
    'site', jsonb_build_object('captureForms', v_site.capture_forms, 'injectSchema', v_site.inject_schema));
end $$;

revoke all on function public.business_record_fact_confirmation_immutable(),
  public.business_record_public_content(text, jsonb), public.business_record_owner_actor(uuid, uuid),
  public.business_record_confirm_owner_write(), public.business_trusted_owner_recipient(uuid),
  public.business_fact_confirmation_json(public.business_record_fact_confirmations)
  from public, anon, authenticated, service_role;
revoke all on function public.read_business_fact_review(uuid), public.confirm_business_facts(uuid, uuid, text),
  public.read_confirmed_business_facts(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.read_business_fact_review(uuid), public.confirm_business_facts(uuid, uuid, text),
  public.read_confirmed_business_facts(uuid, uuid, text) to service_role;
commit;
