# Private split attribution bridge — October 8, 2026

Prepared local source for #285/MO-07 on explicit original-bringer evidence from
#284. This is not a price, agreement, tail, provider permission or production
activation. Money flags remain off unless separately authorized.

## New financial admission

A new accrual requires its exact immutable `invoice_split_sources` record.
Existing signed invoice ingestion and platform collection record that source
before calling the common accrual RPC. Business, account, line, charge, basis,
currency and complete paid period must match. Missing or conflicting provenance
refuses admission. The invoice's frozen payer kind controls wholesale exclusion.

For a business-paid line, the agency beneficiary comes only from explicit
owner-confirmed `business_attributions` covering the entire period. The current
operating provider is not acquisition evidence. A boundary inside the period
raises `split_attribution_period_policy_required`; no partial-period allocation
or tail is invented. No approved agreement still produces an eligible zero row.

`invoice_split_attributions` stores immutable lineage shared by all events for
that source line. It records explicit attribution, no explicit attribution, or
wholesale exclusion. The old `revenue_splits.attribution_id` retains its original
provider FK meaning; new agency rows use the companion evidence instead.
Creator source/install/maintenance logic and refund/dispute/restoration logic
remain the original implementations.

Existing line replays preserve the exact admitted accrual rows. They do not
consult later provider changes, agreements, installation state or acquisition
statements to add beneficiaries. A legacy row without explicit evidence stays
legacy; the upgrade creates no guessed acquisition receipt or historical source.

## Authority and retention

New tables and retired implementation helpers have no direct client or service
role access. Only the existing service-only financial RPC admits new rows. Owner
financial exports include the frozen acquisition receipt; existing operator
exports retain their original projection, without owner-only source references.
The read projection is pure and succeeds in an actual `READ ONLY` transaction.

New accrual serializes on the same business lock as attribution opening and
provider completion. Invoice charge/line locks retain the old order. Completion
ending receipts supply their shared `to_at`; the separate private exit cleanup
can append genuine exit-origin endings without changing this bridge.

The inverse takes an exclusive relation lock, refuses any retained new receipt,
and rejects full definition (including security/config) and normalized ACL drift across all six public and hidden accrual/export routines. With no new receipt
and the exact wrapper order, it restores the full previous function source,
configuration, volatility and ACL catalog. It never drops accepted lineage.

## Local proof

```bash
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-ledger-attribution-sql.sh
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
pnpm exec vitest run src/__tests__/connect-money.test.ts src/__tests__/connect-revenue-source.test.ts src/__tests__/release-safety-tools.test.ts
pnpm typecheck
pnpm lint
pnpm check:boundaries
```

The dedicated rehearsal owns its PostgreSQL cluster, uses only local sockets,
and stops and removes only those disposable resources. It proves a populated
legacy upgrade without backfill, zero and approved fictional rates, source
failure, wholesale exclusion, opening/ending boundaries, frozen none/replay,
refund/dispute/restoration, owner/operator export separation, service ACLs,
actual completion/accrual races in both directions, nonblocking read-only
exports, exact empty inverse, public/private body and private ACL drift refusal and populated inverse refusal.

Original connect-money and creator-ledger fixtures run in a separate clean
regression database: their whole-ledger assertions are not mixed with committed
legacy upgrade rows. Two existing fixtures now seed explicit fictional owner
acquisition evidence; the connect-money mathematical fixture also seeds a
fictional immutable invoice source. These are disposable test provenance, not
runtime backfill or verified provider delivery.

Proposed packet 16 contains only migration 34 and its guarded inverse. Historical
migration files are unchanged. Full combined source/build qualification and
independent review belong to the coordinator after lane convergence. Real Stripe
pinned-API/sandbox/recipient-fee proof and all commercial decisions remain open.
