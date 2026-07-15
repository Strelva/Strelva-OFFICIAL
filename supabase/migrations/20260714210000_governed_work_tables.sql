-- Governed-work typed tables — Phase 2a ontology foundation.
--
-- ADDITIVE + UNAPPLIED. This migration is authored but NOT applied to any database
-- in this increment. It models the governed-work lifecycle — an AI/admin proposes a
-- change -> the owner approves/dismisses -> the system performs an external write ->
-- a success/verified/failed outcome — as normalized Postgres tables.
--
-- Authority does NOT move here. The live lifecycle stays Redis-authoritative
-- (src/lib/events.ts `UnifiedEvent` + src/lib/event-actions.ts), with the existing
-- `unified_events` table as its non-authoritative mirror. These four tables are a
-- schema-only foundation for a LATER staged cutover (increment #8: dual-write to
-- shadow Redis -> verify parity -> flip reads -> flip authority). Until that
-- cutover nothing reads or writes them on the live path. See
-- docs/ontology-phase2-governed-work.md and docs/persistence-boundaries.md.
--
-- Style mirrors the existing migrations: lowercase SQL, tenant-scoped tables, the
-- standard member-or-super-admin RLS policy (helpers from 20260619140000_rls.sql).

-- proposals — a proposed governed change (the UnifiedEvent while status='pending').
-- id keeps the app-side text id (evt_* / sug_*), NOT a fresh uuid, so a shadow write
-- can be keyed to its Redis event 1:1 during the cutover and parity is checkable.
create table proposals (
  id          text primary key,                         -- app id: evt_* / sug_*
  tenant_id   text not null references tenants(id) on delete cascade,
  source      text not null,                            -- ai | admin | system
  kind        text,                                     -- metadata.kind (e.g. gbp_post_draft)
  entity_type text not null,                            -- the UnifiedEvent `type`
  title       text,
  body        text,
  payload     jsonb,                                    -- the execution-driving metadata
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  -- Closed internal set. `executed`/`failed` are the terminal states the outcome
  -- lifecycle adds beyond the Redis event's approved/dismissed (Redis resolves the
  -- event on a successful write; here the external effect gets its own terminal).
  constraint proposals_status_check
    check (status in ('pending', 'approved', 'dismissed', 'executed', 'failed'))
);
create index proposals_tenant_status_idx on proposals (tenant_id, status);
create index proposals_tenant_created_idx on proposals (tenant_id, created_at desc);

-- decisions — the owner/operator approve|dismiss on a proposal (claimEventAction).
create table decisions (
  id          uuid primary key default gen_random_uuid(),
  proposal_id text not null references proposals(id) on delete cascade,
  action      text not null,
  actor       text not null,
  decided_at  timestamptz not null default now(),
  constraint decisions_action_check check (action in ('approved', 'dismissed'))
);
create index decisions_proposal_idx on decisions (proposal_id);

-- execution_attempts — one attempt to perform the external write for an approved
-- proposal. attempt_no + idempotency_key model the attemptId / `processing` marker
-- reconciliation in event-actions.ts: a non-idempotent provider write (a GBP post,
-- a review reply) must never be retried blind. running -> succeeded|failed.
create table execution_attempts (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      text not null references proposals(id) on delete cascade,
  attempt_no       int not null default 1,
  idempotency_key  text,
  status           text not null default 'running',
  provider_receipt jsonb,                               -- provider ack (post id, etc.)
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  constraint execution_attempts_status_check
    check (status in ('running', 'succeeded', 'failed'))
);
create index execution_attempts_proposal_idx on execution_attempts (proposal_id);

-- outcomes — the terminal result of an attempt. `success` gates resolution (the
-- provider ACCEPTED the write); `verified` is the separate read-back confirmation.
-- A true `success` with a false `verified` is exactly the change_verify_failed
-- signal — the write happened, the read-back couldn't confirm it — so the two are
-- distinct columns, never collapsed into one boolean.
create table outcomes (
  id                   uuid primary key default gen_random_uuid(),
  execution_attempt_id uuid not null references execution_attempts(id) on delete cascade,
  success              boolean not null,
  verified             boolean,
  detail               text,
  created_at           timestamptz not null default now()
);
create index outcomes_attempt_idx on outcomes (execution_attempt_id);

-- RLS — defense-in-depth (the service-role control-plane client bypasses it, but a
-- tenant-scoped table without a policy is a drift/security gap). proposals is
-- tenant-scoped directly; the child rows inherit their tenant through the parent.
alter table proposals enable row level security;
create policy proposals_tenant_rw on proposals for all to authenticated
  using (app_is_super_admin() or tenant_id in (select app_tenant_ids()))
  with check (app_is_super_admin() or tenant_id in (select app_tenant_ids()));

do $$
declare t text;
begin
  foreach t in array array['decisions', 'execution_attempts'] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %1$I_tenant_rw on %1$I for all to authenticated
      using (app_is_super_admin() or exists (
        select 1 from proposals p
        where p.id = %1$I.proposal_id and p.tenant_id in (select app_tenant_ids())
      ))
      with check (app_is_super_admin() or exists (
        select 1 from proposals p
        where p.id = %1$I.proposal_id and p.tenant_id in (select app_tenant_ids())
      ))
    $f$, t);
  end loop;
end $$;

alter table outcomes enable row level security;
create policy outcomes_tenant_rw on outcomes for all to authenticated
  using (app_is_super_admin() or exists (
    select 1 from execution_attempts ea
    join proposals p on p.id = ea.proposal_id
    where ea.id = outcomes.execution_attempt_id and p.tenant_id in (select app_tenant_ids())
  ))
  with check (app_is_super_admin() or exists (
    select 1 from execution_attempts ea
    join proposals p on p.id = ea.proposal_id
    where ea.id = outcomes.execution_attempt_id and p.tenant_id in (select app_tenant_ids())
  ));
