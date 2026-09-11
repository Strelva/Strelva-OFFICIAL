-- Inquiry capability persistence. Additive only; do not apply this migration
-- to production as part of a code change. Redis remains the authority for
-- customer inquiry records. These rows contain configuration, rehearsal
-- evidence, receipts, and publication safety markers only.

create table public.inquiry_workspaces (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  business_id text not null check (char_length(business_id) between 1 and 160),
  state_version integer not null default 1 check (state_version = 1),
  revision bigint not null default 1 check (revision >= 1),
  -- The durable snapshot must always contain the canonical empty inquiry list.
  state jsonb not null check (
    state ? 'inquiries' and jsonb_typeof(state->'inquiries') = 'array'
    and jsonb_array_length(state->'inquiries') = 0
  ),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, business_id),
  unique (tenant_stable_id, business_id)
);

create index inquiry_workspaces_stable_id_idx
  on public.inquiry_workspaces (tenant_stable_id, business_id);

create trigger inquiry_workspaces_stable_id_trg
  before insert or update on public.inquiry_workspaces
  for each row execute function public.set_tenant_stable_id();

-- Lead fields remain Redis-authoritative. These annotations let the engine
-- retain status and assignment across a reload without copying customer data.
create table public.inquiry_record_overlays (
  tenant_id text not null references public.tenants(id) on delete cascade,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  business_id text not null check (char_length(business_id) between 1 and 160),
  inquiry_id text not null check (char_length(inquiry_id) between 1 and 256),
  capability_id text not null check (char_length(capability_id) between 1 and 256),
  status text not null check (status in ('new', 'assigned', 'follow_up_pending', 'handled', 'blocked')),
  assignee_id text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, business_id, inquiry_id),
  unique (tenant_stable_id, business_id, inquiry_id)
);

create index inquiry_record_overlays_stable_idx
  on public.inquiry_record_overlays (tenant_stable_id, business_id, updated_at desc);

create trigger inquiry_record_overlays_stable_id_trg
  before insert or update on public.inquiry_record_overlays
  for each row execute function public.set_tenant_stable_id();

create table public.inquiry_publication_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  tenant_stable_id uuid not null references public.tenants(stable_id) on delete cascade,
  business_id text not null check (char_length(business_id) between 1 and 160),
  request_id text not null check (char_length(request_id) between 1 and 256),
  capability_id text not null check (char_length(capability_id) between 1 and 256),
  change_id text not null check (char_length(change_id) between 1 and 256),
  action text not null check (action in ('make_live', 'undo')),
  version integer not null check (version >= 1),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 256),
  command_digest text not null check (command_digest ~ '^[a-f0-9]{64}$'),
  -- Only a hash is stored. The short-lived bearer token is returned to the
  -- process that won the claim and is required to record the provider result.
  claim_token_hash text not null check (claim_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'claimed'
    check (status in ('claimed', 'accepted', 'verification_failed', 'failed')),
  acceptance_id text,
  provider_receipt jsonb,
  failure_reason text,
  actor_id text,
  governance_event_id text,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  unique (tenant_stable_id, idempotency_key),
  check ((status in ('accepted', 'verification_failed')) = (acceptance_id is not null)),
  check ((status = 'accepted' or status = 'verification_failed') = (accepted_at is not null))
);

create index inquiry_publication_claims_stable_idx
  on public.inquiry_publication_claims (tenant_stable_id, created_at desc);
create index inquiry_publication_claims_event_idx
  on public.inquiry_publication_claims (tenant_id, governance_event_id)
  where governance_event_id is not null;

create trigger inquiry_publication_claims_stable_id_trg
  before insert or update on public.inquiry_publication_claims
  for each row execute function public.set_tenant_stable_id();

-- Accepted provider writes are never downgraded. Verification failure is a
-- distinct post-acceptance state. A claimed write may only become failed.
create or replace function public.guard_inquiry_publication_transition() returns trigger
language plpgsql set search_path = public as $$
begin
  if (old.tenant_id, old.tenant_stable_id, old.business_id, old.request_id,
      old.capability_id, old.change_id, old.action, old.version,
      old.idempotency_key, old.command_digest, old.claim_token_hash, old.actor_id)
     is distinct from
     (new.tenant_id, new.tenant_stable_id, new.business_id, new.request_id,
      new.capability_id, new.change_id, new.action, new.version,
      new.idempotency_key, new.command_digest, new.claim_token_hash, new.actor_id) then
    raise exception 'inquiry_publication_command_is_immutable';
  end if;
  if old.status in ('accepted', 'verification_failed') and new.status = 'failed' then
    raise exception 'inquiry_publication_accepted_write_cannot_be_downgraded';
  end if;
  if old.status = 'claimed' and new.status = 'verification_failed' then
    raise exception 'inquiry_publication_verification_requires_acceptance';
  end if;
  if old.status = 'claimed' and new.status not in ('claimed', 'accepted', 'failed') then
    raise exception 'inquiry_publication_invalid_transition';
  end if;
  if old.status = 'accepted' and new.status not in ('accepted', 'verification_failed') then
    raise exception 'inquiry_publication_invalid_transition';
  end if;
  if old.status = 'verification_failed' and new.status <> 'verification_failed' then
    raise exception 'inquiry_publication_invalid_transition';
  end if;
  if old.status = 'failed' and new.status <> 'failed' then
    raise exception 'inquiry_publication_invalid_transition';
  end if;
  if old.status = 'claimed' and new.status = 'claimed'
     and (old.acceptance_id, old.provider_receipt, old.failure_reason,
          old.accepted_at)
         is distinct from
         (new.acceptance_id, new.provider_receipt, new.failure_reason,
          new.accepted_at) then
    raise exception 'inquiry_publication_claim_mutation_invalid';
  end if;
  if old.status = 'accepted' and new.status = 'accepted'
     and (old.acceptance_id, old.provider_receipt, old.failure_reason,
          old.accepted_at, old.governance_event_id)
         is distinct from
         (new.acceptance_id, new.provider_receipt, new.failure_reason,
          new.accepted_at, new.governance_event_id) then
    raise exception 'inquiry_publication_accepted_evidence_is_immutable';
  end if;
  if old.status = 'accepted' and new.status = 'verification_failed'
     and (old.acceptance_id, old.provider_receipt, old.accepted_at,
          old.governance_event_id)
         is distinct from
         (new.acceptance_id, new.provider_receipt, new.accepted_at,
          new.governance_event_id) then
    raise exception 'inquiry_publication_accepted_evidence_is_immutable';
  end if;
  if old.status = 'claimed' and new.status = 'accepted'
     and (new.acceptance_id is null or new.accepted_at is null) then
    raise exception 'inquiry_publication_acceptance_required';
  end if;
  if old.status = 'claimed' and new.status = 'failed'
     and (new.acceptance_id is not null or new.accepted_at is not null) then
    raise exception 'inquiry_publication_failed_cannot_have_acceptance';
  end if;
  if old.status = 'verification_failed' and new.status = 'verification_failed'
     and (old.failure_reason, old.acceptance_id, old.provider_receipt,
          old.accepted_at, old.governance_event_id)
         is distinct from
         (new.failure_reason, new.acceptance_id, new.provider_receipt,
          new.accepted_at, new.governance_event_id) then
    raise exception 'inquiry_publication_verification_evidence_is_immutable';
  end if;
  if old.status = 'failed' and new.status = 'failed'
     and (old.failure_reason, old.acceptance_id, old.provider_receipt,
          old.accepted_at, old.governance_event_id)
         is distinct from
         (new.failure_reason, new.acceptance_id, new.provider_receipt,
          new.accepted_at, new.governance_event_id) then
    raise exception 'inquiry_publication_failure_evidence_is_immutable';
  end if;
  return new;
end;
$$;

create trigger inquiry_publication_transition_trg
  before update on public.inquiry_publication_claims
  for each row execute function public.guard_inquiry_publication_transition();

alter table public.inquiry_workspaces enable row level security;
alter table public.inquiry_record_overlays enable row level security;
alter table public.inquiry_publication_claims enable row level security;

-- The service-role repository is the only application access path. Browser
-- roles receive no table privileges and no policies, so RLS is deny-by-default.
revoke all on table public.inquiry_workspaces, public.inquiry_record_overlays,
  public.inquiry_publication_claims
  from public, anon, authenticated;
grant select, insert, update on table public.inquiry_workspaces,
  public.inquiry_record_overlays, public.inquiry_publication_claims to service_role;

revoke all on function public.guard_inquiry_publication_transition() from public;
