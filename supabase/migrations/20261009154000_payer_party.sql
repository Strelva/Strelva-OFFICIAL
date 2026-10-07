-- Batch 7A (4 of 4): the payer is a party, the business or an agency
-- (agency 1.0 #278, audits A AG-16, B MO-01, H RL-05, company ADR 0012).
-- Additive, layered on 20261007180000 (checksum-pinned, not edited) and the
-- applied 20260918140000. Local only until Jacob's yes. No rates, prices,
-- shares or Stripe calls: who pays is recorded, how much is not decided here.
--
-- Before: the business billing home had no payer column; billing_json named
-- the business owner recipient at read time. Payer succession, job budgets
-- and allowances named a payer USER.
--
-- After:
--   1. The payer party of a business is the latest accepted payer
--      transition: an agency successor means the agency pays; a person or
--      `business` successor means the business pays. No transition: the
--      business. business_payer_party() is that one rule.
--   2. accounts (the billing home) stores it: payer_kind business | agency and
--      payer_workspace_id (the agency; null when the business pays). It is
--      stamped when the billing home is created and rewritten when a
--      transition is accepted. Nothing else writes it.
--   3. business_billing_json adds payerParty {kind, workspaceId, name}.
--      `payer` stays a recipient {email, name, from}: the owner recipient when
--      the business pays (unchanged), the agency's owner when an agency pays.
--      read_business_billing also admits the paying agency's owners/admins.
--   4. workspace_payer_transitions: a successor is a person (as before), an
--      agency workspace (any of its owners/admins accepts), or `business`
--      (an owner accepts; switches back from agency pays). The owner still
--      proposes; the proposer must still be owner at acceptance.
--   5. job_economics, work_allowances and
--      work_allowance_subscription_entitlements carry the payer party too
--      (payer_kind, payer_workspace_id; existing rows: business). payer_id
--      stays the person who signs for the party. A new workspace job resolves
--      the party from the latest accepted transition; for an agency, any of
--      its owners/admins may accept or cancel the job limit and becomes the
--      signer on acceptance. Allowances and entitlements are business-paid
--      only today (their payer must be a member); the column is the key the
--      agency path will use.

set local lock_timeout = '3s';

-- ---- the party on each ledger ----

alter table public.accounts
  add column payer_kind text not null default 'business' check (payer_kind in ('business', 'agency')),
  add column payer_workspace_id uuid references public.workspaces(id) on delete restrict,
  add constraint accounts_payer_party check ((payer_kind = 'business') = (payer_workspace_id is null));

alter table public.workspace_payer_transitions
  add column successor_kind text not null default 'user' check (successor_kind in ('user', 'business', 'agency')),
  add column successor_workspace_id uuid references public.workspaces(id) on delete restrict,
  alter column successor_user_id drop not null,
  alter column successor_email drop not null,
  add constraint workspace_payer_transitions_successor_party check (
    (successor_kind = 'user') = (successor_user_id is not null and successor_email is not null)
    and (successor_kind = 'agency') = (successor_workspace_id is not null));

alter table public.job_economics
  add column payer_kind text not null default 'business' check (payer_kind in ('business', 'agency')),
  add column payer_workspace_id uuid references public.workspaces(id) on delete restrict,
  add constraint job_economics_payer_party check ((payer_kind = 'business') = (payer_workspace_id is null));
alter table public.work_allowances
  add column payer_kind text not null default 'business' check (payer_kind in ('business', 'agency')),
  add column payer_workspace_id uuid references public.workspaces(id) on delete restrict,
  add constraint work_allowances_payer_party check ((payer_kind = 'business') = (payer_workspace_id is null));
alter table public.work_allowance_subscription_entitlements
  add column payer_kind text not null default 'business' check (payer_kind in ('business', 'agency')),
  add column payer_workspace_id uuid references public.workspaces(id) on delete restrict,
  add constraint work_allowance_subscription_entitlements_payer_party
    check ((payer_kind = 'business') = (payer_workspace_id is null));

-- ---- the one rule ----

-- The party that pays for this customer business: the latest accepted payer
-- transition's party, else the business. Never null.
create function public.business_payer_party(p_workspace_id uuid, out kind text, out workspace_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(x.kind, 'business'), x.workspace_id from (select 1) one
  left join lateral (
    select case t.successor_kind when 'agency' then 'agency' else 'business' end as kind,
        case t.successor_kind when 'agency' then t.successor_workspace_id end as workspace_id
      from public.workspace_payer_transitions t
      where t.workspace_id = p_workspace_id and t.status = 'accepted'
      order by t.accepted_at desc, t.id desc limit 1) x on true
$$;

-- Stamp the party when a billing home is attached to a business; clear it
-- when the billing home is detached (unlink sets workspace_id to null).
create function public.accounts_payer_party_stamp() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare party record;
begin
  if new.workspace_id is null then
    new.payer_kind := 'business';
    new.payer_workspace_id := null;
  elsif tg_op = 'INSERT' or new.workspace_id is distinct from old.workspace_id then
    select * into party from public.business_payer_party(new.workspace_id);
    new.payer_kind := party.kind;
    new.payer_workspace_id := party.workspace_id;
  end if;
  return new;
end;
$$;
create trigger accounts_payer_party_stamp before insert or update of workspace_id on public.accounts
  for each row execute function public.accounts_payer_party_stamp();

-- Rewrite the stored party on the billing home after an accepted transition.
create function public.business_payer_apply(p_workspace_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare party record;
begin
  select * into party from public.business_payer_party(p_workspace_id);
  update public.accounts set payer_kind = party.kind, payer_workspace_id = party.workspace_id, updated_at = clock_timestamp()
    where workspace_id = p_workspace_id
      and (payer_kind, payer_workspace_id) is distinct from (party.kind, party.workspace_id);
end;
$$;

-- Who receives an agency's bill: its oldest verified owner, named by the agency.
create function public.agency_billing_recipient(p_agency_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('email', lower(u.email), 'name', w.name, 'from', 'agency_owner')
    from public.workspaces w
    join public.workspace_memberships m on m.workspace_id = w.id and m.role = 'owner'
    join public.users u on u.id = m.user_id and u.verified_at is not null
    where w.id = p_agency_workspace_id and w.kind = 'agency'
    order by m.created_at, m.user_id limit 1
$$;

-- ---- billing reads ----

-- Same shape as 20261007180000, plus payerParty; `payer` follows the party.
create or replace function public.business_billing_json(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'workspaceId', a.workspace_id,
    'accountId', a.id,
    'state', a.billing_type,
    'openItem', a.billing_type = 'none',
    'paymentStatus', coalesce(a.payment_status, 'none'),
    'monthlyCents', coalesce(a.monthly_cents, 0),
    'planKey', a.plan_key,
    'grandfatheredTerms', a.grandfathered_terms,
    'paidThrough', (select to_char(s.current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      from public.subscriptions s where s.account_id = a.id order by s.created_at limit 1),
    'payer', case a.payer_kind when 'agency' then public.agency_billing_recipient(a.payer_workspace_id)
      else public.resolve_business_owner_recipient(a.workspace_id) end,
    'payerParty', jsonb_build_object('kind', a.payer_kind, 'workspaceId', coalesce(a.payer_workspace_id, a.workspace_id),
      'name', (select w.name from public.workspaces w where w.id = coalesce(a.payer_workspace_id, a.workspace_id))),
    'sites', coalesce((select jsonb_agg(jsonb_build_object('tenantId', i.tenant_id, 'siteName', t.site_name,
        'amountCents', coalesce(i.amount_cents, 0)) order by i.created_at, i.tenant_id)
      from public.subscriptions s join public.subscription_items i on i.subscription_id = s.id
      join public.tenants t on t.id = i.tenant_id where s.account_id = a.id), '[]'::jsonb),
    'sources', a.billing_sources,
    'paymentUpdatedAt', a.payment_updated_at)
  from public.accounts a where a.workspace_id = p_workspace_id
$$;

-- Owner or admin of the business, or owner or admin of the agency that pays.
create or replace function public.read_business_billing(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and (exists (select 1 from public.workspace_memberships m
          where m.user_id = u.id and m.workspace_id = p_workspace_id and m.role in ('owner','admin'))
        or exists (select 1 from public.accounts a
          join public.workspace_memberships m on m.workspace_id = a.payer_workspace_id and m.user_id = u.id
            and m.role in ('owner','admin')
          where a.workspace_id = p_workspace_id and a.payer_kind = 'agency'));
  if not found then raise exception 'business_billing_denied'; end if;
  return public.business_billing_json(p_workspace_id);
end;
$$;

-- ---- payer succession ----

-- Same contract as 20260918140000, plus two proposal shapes:
--   {action:'propose', workspaceId, successorEmail}             a person (as before)
--   {action:'propose', workspaceId, successorAgencyWorkspaceId} an agency
--   {action:'propose', workspaceId, successorKind:'business'}   the business itself
-- An agency proposal is accepted or rejected by any owner/admin of that
-- agency; a business proposal by an owner of the business. Acceptance
-- rewrites the billing home's stored party.
create or replace function public.workspace_payer_transition_command(
  p_command jsonb,
  p_actor_id uuid,
  p_verified_email text
) returns setof public.workspace_payer_transitions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a text := p_command->>'action';
  actor_email text := lower(btrim(p_verified_email));
  command_keys text[];
  v_kind text;
  v_workspace_id uuid;
  v_agency_id uuid;
  transition_id uuid;
  successor public.users%rowtype;
  item public.workspace_payer_transitions%rowtype;
begin
  if p_command is null or jsonb_typeof(p_command) <> 'object'
    or a not in ('propose','accept','reject','revoke') then
    raise exception 'payer_transition_command_invalid';
  end if;
  -- Every payer-boundary path takes the actor row before the workspace lock.
  -- The job command uses the same order, preventing actor/advisory deadlocks.
  perform 1 from public.users where id=p_actor_id and lower(email)=actor_email and verified_at is not null for update;
  if not found then raise exception 'payer_transition_identity_denied'; end if;
  command_keys := (select array_agg(key order by key) from jsonb_object_keys(p_command) key);

  if a='propose' then
    if command_keys = array['action','successorEmail','workspaceId']::text[] then v_kind := 'user';
    elsif command_keys = array['action','successorAgencyWorkspaceId','workspaceId']::text[] then v_kind := 'agency';
    elsif command_keys = array['action','successorKind','workspaceId']::text[]
      and p_command->>'successorKind' = 'business' then v_kind := 'business';
    else raise exception 'payer_transition_command_invalid';
    end if;
    begin
      v_workspace_id := (p_command->>'workspaceId')::uuid;
      if v_kind = 'agency' then v_agency_id := (p_command->>'successorAgencyWorkspaceId')::uuid; end if;
    exception when invalid_text_representation then raise exception 'payer_transition_command_invalid'; end;
    perform 1 from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
      where w.id=v_workspace_id and w.kind='customer' and m.user_id=p_actor_id and m.role='owner' for share;
    if not found then raise exception 'payer_transition_owner_required'; end if;
    if v_kind = 'user' then
      select * into successor from public.users
        where lower(email)=lower(btrim(p_command->>'successorEmail')) and verified_at is not null for share;
      if successor.id is null then raise exception 'payer_transition_successor_unavailable'; end if;
    elsif v_kind = 'agency' then
      perform 1 from public.workspaces where id = v_agency_id and kind = 'agency' for share;
      if not found then raise exception 'payer_transition_successor_unavailable'; end if;
    end if;
    perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 7415));
    select * into item from public.workspace_payer_transitions
      where public.workspace_payer_transitions.workspace_id=v_workspace_id and status='pending' for update;
    if found and item.successor_kind = v_kind and item.successor_user_id is not distinct from successor.id
      and item.successor_workspace_id is not distinct from v_agency_id then
      return next item; return;
    end if;
    if found then
      update public.workspace_payer_transitions set status='stale',resolved_by=p_actor_id,resolved_at=clock_timestamp()
        where id=item.id;
    end if;
    insert into public.workspace_payer_transitions(workspace_id,successor_kind,successor_user_id,successor_email,
        successor_workspace_id,proposed_by)
      values(v_workspace_id,v_kind,successor.id,lower(successor.email),v_agency_id,p_actor_id) returning * into item;
    return next item; return;
  end if;

  if command_keys <> array['action','transitionId']::text[] then raise exception 'payer_transition_command_invalid'; end if;
  begin transition_id := (p_command->>'transitionId')::uuid;
  exception when invalid_text_representation then raise exception 'payer_transition_command_invalid'; end;
  select workspace_id into v_workspace_id from public.workspace_payer_transitions where id=transition_id;
  if not found then raise exception 'payer_transition_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 7415));
  select * into item from public.workspace_payer_transitions where id=transition_id for update;
  if not found then raise exception 'payer_transition_not_found'; end if;

  if a in ('accept','reject') then
    if item.successor_kind = 'user' then
      if item.successor_user_id<>p_actor_id or item.successor_email<>actor_email then
        raise exception 'payer_transition_successor_required';
      end if;
    elsif item.successor_kind = 'agency' then
      perform 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
        where m.workspace_id = item.successor_workspace_id and m.user_id = p_actor_id and m.role in ('owner','admin')
        for share of m;
      if not found then raise exception 'payer_transition_successor_required'; end if;
    else
      perform 1 from public.workspace_memberships
        where workspace_id = item.workspace_id and user_id = p_actor_id and role = 'owner' for share;
      if not found then raise exception 'payer_transition_successor_required'; end if;
    end if;
    if a='accept' and item.status='accepted' and item.resolved_by=p_actor_id then return next item; return; end if;
    if item.status<>'pending' then raise exception 'payer_transition_not_pending'; end if;
    if a='accept' then
      perform 1 from public.workspace_memberships
        where workspace_id=item.workspace_id and user_id=item.proposed_by and role='owner' for share;
      if not found then
        update public.workspace_payer_transitions set status='stale',resolved_by=p_actor_id,
          resolved_at=clock_timestamp() where id=item.id returning * into item;
        return next item; return;
      end if;
      update public.workspace_payer_transitions set status='accepted',resolved_by=p_actor_id,
        resolved_at=clock_timestamp(),accepted_at=clock_timestamp() where id=item.id returning * into item;
      perform public.business_payer_apply(item.workspace_id);
    else
      update public.workspace_payer_transitions set status='rejected',resolved_by=p_actor_id,
        resolved_at=clock_timestamp() where id=item.id returning * into item;
    end if;
    return next item; return;
  end if;

  perform 1 from public.workspace_memberships
    where workspace_id=item.workspace_id and user_id=p_actor_id and role='owner' for share;
  if not found then raise exception 'payer_transition_owner_required'; end if;
  if item.status='revoked' and item.resolved_by=p_actor_id then return next item; return; end if;
  if item.status<>'pending' then raise exception 'payer_transition_not_pending'; end if;
  update public.workspace_payer_transitions set status='revoked',resolved_by=p_actor_id,
    resolved_at=clock_timestamp() where id=item.id returning * into item;
  return next item;
end $$;

-- Same rows as 20260918140000 plus the successor party. Visible to an owner
-- of the business, the addressed person, or an owner/admin of the addressed agency.
drop function public.workspace_payer_transition_snapshot(uuid, uuid, text);
create function public.workspace_payer_transition_snapshot(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_verified_email text
) returns table (
  id uuid, workspace_id uuid, successor_user_id uuid, successor_email text, status text,
  proposed_by uuid, proposer_email text, resolved_by uuid, proposed_at timestamptz,
  resolved_at timestamptz, accepted_at timestamptz,
  successor_kind text, successor_workspace_id uuid, successor_workspace_name text
) language plpgsql security definer set search_path = public, pg_temp as $$
declare is_owner boolean;
begin
  perform 1 from public.users u where u.id=p_actor_id
    and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'payer_transition_identity_denied'; end if;
  is_owner := exists(select 1 from public.workspace_memberships m
    where m.workspace_id=p_workspace_id and m.user_id=p_actor_id and m.role='owner');
  if not is_owner and not exists(select 1 from public.workspace_payer_transitions x where x.workspace_id=p_workspace_id
      and ((x.successor_user_id=p_actor_id and x.successor_email=lower(btrim(p_verified_email)))
        or exists(select 1 from public.workspace_memberships am where am.workspace_id=x.successor_workspace_id
          and am.user_id=p_actor_id and am.role in ('owner','admin')))) then
    raise exception 'payer_transition_workspace_denied';
  end if;
  return query select t.id,t.workspace_id,t.successor_user_id,t.successor_email,t.status,
    t.proposed_by,p.email,t.resolved_by,t.proposed_at,t.resolved_at,t.accepted_at,
    t.successor_kind,t.successor_workspace_id,sw.name
    from public.workspace_payer_transitions t join public.users p on p.id=t.proposed_by
    left join public.workspaces sw on sw.id=t.successor_workspace_id
    where t.workspace_id=p_workspace_id and (
      is_owner
      or (t.successor_user_id=p_actor_id and t.successor_email=lower(btrim(p_verified_email)))
      or exists(select 1 from public.workspace_memberships am where am.workspace_id=t.successor_workspace_id
        and am.user_id=p_actor_id and am.role in ('owner','admin'))
    ) order by t.proposed_at desc;
end $$;

-- Same rows as 20260918140000 plus the successor party and proposals
-- addressed to an agency the actor is an owner/admin of.
drop function public.workspace_payer_transition_inbox(uuid, text);
create function public.workspace_payer_transition_inbox(p_actor_id uuid,p_verified_email text)
returns table (
  id uuid, workspace_id uuid, workspace_name text, successor_user_id uuid,
  successor_email text, status text, proposed_by uuid, proposer_email text,
  resolved_by uuid, proposed_at timestamptz, resolved_at timestamptz, accepted_at timestamptz,
  successor_kind text, successor_workspace_id uuid, successor_workspace_name text
) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u where u.id=p_actor_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'payer_transition_identity_denied'; end if;
  return query select t.id,t.workspace_id,w.name,t.successor_user_id,t.successor_email,t.status,
    t.proposed_by,p.email,t.resolved_by,t.proposed_at,t.resolved_at,t.accepted_at,
    t.successor_kind,t.successor_workspace_id,sw.name
    from public.workspace_payer_transitions t
    join public.workspaces w on w.id=t.workspace_id
    join public.users p on p.id=t.proposed_by
    left join public.workspaces sw on sw.id=t.successor_workspace_id
    where (t.successor_user_id=p_actor_id and t.successor_email=lower(btrim(p_verified_email)))
      or exists(select 1 from public.workspace_memberships am where am.workspace_id=t.successor_workspace_id
        and am.user_id=p_actor_id and am.role in ('owner','admin'))
    order by t.proposed_at desc;
end $$;

-- ---- job budgets ----

-- Same contract as 20260918140000. The payer resolves from the latest
-- accepted transition: a person signs for the business; an agency's
-- accepting owner/admin signs for the agency, and the job records the agency
-- as its payer party.
create or replace function public.job_economics_create_with_payer_transition(
  p_command jsonb,
  p_actor_id uuid,
  p_verified_email text
) returns setof public.job_economics
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_workspace_id uuid;
  v_work_id uuid;
  resolved_payer uuid;
  last_transition public.workspace_payer_transitions%rowtype;
  existing_job public.job_economics%rowtype;
  created_job public.job_economics%rowtype;
begin
  if p_command->>'action'<>'create' or p_command->>'workspaceId' is null then
    return query select * from public.job_economics_command(p_command,p_actor_id,p_verified_email); return;
  end if;
  begin
    v_workspace_id := (p_command->>'workspaceId')::uuid;
    v_work_id := nullif(p_command->>'workId','')::uuid;
  exception when invalid_text_representation then raise exception 'job_economics_command_invalid'; end;
  perform 1 from public.users where id=p_actor_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for update;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 7415));
  perform 1 from public.workspace_memberships where workspace_id=v_workspace_id and user_id=p_actor_id for share;
  if not found then raise exception 'job_economics_workspace_denied'; end if;
  if v_work_id is null and p_command->>'productId'='work_plans' then
    select * into existing_job from public.job_economics
      where public.job_economics.workspace_id=v_workspace_id and public.job_economics.work_id is null
        and product_id='work_plans' and resource_kind='plan' and status not in ('settled','cancelled')
      order by created_at desc limit 1 for update;
  elsif v_work_id is not null then
    select * into existing_job from public.job_economics
      where public.job_economics.workspace_id=v_workspace_id and public.job_economics.work_id=v_work_id
        and status not in ('settled','cancelled') order by created_at desc limit 1 for update;
  end if;
  if existing_job.id is not null then
    if existing_job.product_id<>p_command->>'productId' or existing_job.resource_kind<>p_command->>'resourceKind'
      or existing_job.estimate_cents is distinct from (p_command->>'estimateCents')::integer
      or existing_job.max_authorized_cents<>(p_command->>'maxAuthorizedCents')::integer then
      raise exception 'job_economics_existing_conflict';
    end if;
    return next existing_job;
    return;
  end if;
  select * into last_transition from public.workspace_payer_transitions
    where public.workspace_payer_transitions.workspace_id=v_workspace_id and status='accepted'
    order by accepted_at desc,id desc limit 1;
  resolved_payer := case last_transition.successor_kind
    when 'user' then last_transition.successor_user_id
    when 'agency' then last_transition.resolved_by end;
  resolved_payer := coalesce(resolved_payer,(p_command->>'payerId')::uuid);
  if exists(select 1 from public.workspace_memberships where workspace_id=v_workspace_id and user_id=resolved_payer) then
    select * into created_job from public.job_economics_command(
      p_command || jsonb_build_object('payerId',resolved_payer::text),p_actor_id,p_verified_email);
  else
    -- Reuse the native command's complete target and amount validation with the
    -- creator as its temporary payer, then replace only the unaccepted row's
    -- payer inside this transaction. No workspace access is granted to the payer.
    select * into created_job from public.job_economics_command(
      p_command || jsonb_build_object('payerId',p_actor_id::text),p_actor_id,p_verified_email);
    update public.job_economics set payer_id=resolved_payer,updated_at=clock_timestamp()
      where id=created_job.id and status='draft' and payer_id=p_actor_id returning * into created_job;
    if created_job.id is null then raise exception 'job_economics_existing_conflict'; end if;
  end if;
  if last_transition.successor_kind = 'agency' and created_job.status = 'draft' then
    update public.job_economics set payer_kind='agency',payer_workspace_id=last_transition.successor_workspace_id,
        updated_at=clock_timestamp()
      where id=created_job.id returning * into created_job;
  end if;
  return next created_job;
end $$;

-- Same contract as 20260918140000. For an agency-paid job, any owner/admin
-- of the paying agency holds payer authority; accepting makes them its signer.
create or replace function public.job_economics_command_with_payer_authority(p_command jsonb,p_actor_id uuid,p_verified_email text)
returns setof public.job_economics language plpgsql security definer set search_path=public,pg_temp as $$
declare a text:=p_command->>'action'; j public.job_economics%rowtype; jid uuid; agency_signer boolean;
begin
  if a not in ('accept','cancel') then
    return query select * from public.job_economics_command(p_command,p_actor_id,p_verified_email); return;
  end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_command) key)<>array['action','jobId']::text[] then
    raise exception 'job_economics_command_invalid';
  end if;
  begin jid:=(p_command->>'jobId')::uuid; exception when invalid_text_representation then raise exception 'job_economics_command_invalid'; end;
  perform 1 from public.users where id=p_actor_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for update;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  select * into j from public.job_economics where id=jid for update;
  if not found then raise exception 'job_economics_not_found'; end if;
  agency_signer := j.payer_kind = 'agency' and j.payer_id <> p_actor_id and exists (
    select 1 from public.workspace_memberships m join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
      where m.workspace_id = j.payer_workspace_id and m.user_id = p_actor_id and m.role in ('owner','admin'));
  if j.payer_id<>p_actor_id and not agency_signer then
    return query select * from public.job_economics_command(p_command,p_actor_id,p_verified_email); return;
  end if;
  if a='accept' then
    if j.status='draft' then update public.job_economics set status='accepted',payer_id=p_actor_id,accepted_by=p_actor_id,
      accepted_at=clock_timestamp(),updated_at=clock_timestamp() where id=j.id returning * into j;
    elsif j.status not in ('accepted','reserved','settled') then raise exception 'job_economics_invalid_transition'; end if;
  else
    if j.status not in ('settled','cancelled') then
      update public.job_economics_executions set status='finished',effect='none',amount_cents=0,billable_cents=0,finished_at=clock_timestamp()
        where job_id=j.id and status='reserved';
      update public.job_economics set reserved_cents=used_cents+coalesce((select sum(maximum_cents)
        from public.job_economics_executions where job_id=j.id and attribution='normal'
          and (status='running' or (status='finished' and amount_cents is null))),0),status='cancelled',updated_at=clock_timestamp()
        where id=j.id returning * into j;
    end if;
  end if;
  return next j;
end $$;

-- Same rows as 20260918140000: jobs the actor signs for, plus jobs paid by an
-- agency the actor is an owner/admin of.
create or replace function public.job_economics_payer_inbox(p_actor_id uuid,p_verified_email text)
returns table(id uuid,workspace_id uuid,workspace_name text,product_id text,resource_kind text,
  estimate_cents integer,max_authorized_cents integer,reserved_cents integer,used_cents integer,
  actual_cents integer,actual_known boolean,status text,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u where u.id=p_actor_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  return query select j.id,j.workspace_id,w.name,j.product_id,j.resource_kind,j.estimate_cents,
    j.max_authorized_cents,j.reserved_cents,j.used_cents,j.actual_cents,j.actual_known,j.status,j.created_at
    from public.job_economics j join public.workspaces w on w.id=j.workspace_id
    where j.payer_id=p_actor_id
      or (j.payer_kind='agency' and exists(select 1 from public.workspace_memberships m
        where m.workspace_id=j.payer_workspace_id and m.user_id=p_actor_id and m.role in ('owner','admin')))
    order by j.created_at desc;
end $$;

revoke all on function public.business_payer_party(uuid) from public, anon, authenticated, service_role;
revoke all on function public.accounts_payer_party_stamp() from public, anon, authenticated, service_role;
revoke all on function public.business_payer_apply(uuid) from public, anon, authenticated, service_role;
revoke all on function public.agency_billing_recipient(uuid) from public, anon, authenticated, service_role;
revoke all on function public.business_billing_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.read_business_billing(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.workspace_payer_transition_command(jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.workspace_payer_transition_snapshot(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.workspace_payer_transition_inbox(uuid,text) from public,anon,authenticated;
revoke all on function public.job_economics_create_with_payer_transition(jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.job_economics_command_with_payer_authority(jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.job_economics_payer_inbox(uuid,text) from public,anon,authenticated;
grant execute on function public.read_business_billing(uuid, uuid, text) to service_role;
grant execute on function public.workspace_payer_transition_command(jsonb,uuid,text) to service_role;
grant execute on function public.workspace_payer_transition_snapshot(uuid,uuid,text) to service_role;
grant execute on function public.workspace_payer_transition_inbox(uuid,text) to service_role;
grant execute on function public.job_economics_create_with_payer_transition(jsonb,uuid,text) to service_role;
grant execute on function public.job_economics_command_with_payer_authority(jsonb,uuid,text) to service_role;
grant execute on function public.job_economics_payer_inbox(uuid,text) to service_role;
