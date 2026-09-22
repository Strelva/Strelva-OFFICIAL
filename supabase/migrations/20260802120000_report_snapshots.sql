-- Recovered September 21 from the applied production migration record.
-- Retain this history and existing reports; do not replay it on that target.
-- Progress ledger: an immutable, per-tenant, per-period freeze of the full report
-- metric set (the "report_snapshots" table).
--
-- Why: most progress data is already durable (site_metrics beacon counters,
-- scan-store health + day-0 baseline, the reviews table, weekly visibility
-- snapshots). The gap is Google-sourced metrics — GSC and GA4 values are fetched
-- live and never persisted (only a ~58-min cache), so historical/late-revised
-- numbers are lost. This table freezes every report metric at report time into one
-- immutable record, so:
--   * GSC/GA4 (and later GBP performance) history is ours, not Google's to expire;
--   * deltas + "since day one" read one frozen row instead of recomputing from
--     scattered live sources;
--   * re-rendering a past month is stable (no drift as Google finalizes late data)
--     and cheap (no live re-fetch).
--
-- One row per (tenant, period, period_type). `metrics` is a versioned JSON blob so
-- the shape can evolve without a migration; `schema_version` guards the reader.
-- Written once at period close and never updated (insert ... on conflict do
-- nothing in the writer) — the freeze is authoritative.

create table if not exists public.report_snapshots (
  tenant_id       text        not null,
  period          text        not null,               -- e.g. '2026-06' for a month
  period_type     text        not null default 'month',
  captured_at     timestamptz not null default now(),
  schema_version  integer     not null default 1,
  metrics         jsonb       not null,
  primary key (tenant_id, period, period_type)
);

-- Newest-first listing per tenant (progress history, milestone reads).
create index if not exists report_snapshots_tenant_captured_idx
  on public.report_snapshots (tenant_id, captured_at desc);

-- RLS on, no policies: the control plane reads/writes via the service-role client
-- (which bypasses RLS); nothing else may touch it. Matches the platform's posture
-- for control-plane-only tables (see db/client.ts).
alter table public.report_snapshots enable row level security;

comment on table public.report_snapshots is
  'Immutable per-tenant/period freeze of the full report metric set (the progress ledger). Written once at period close; never updated.';
