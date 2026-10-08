# Operator support attribution — proposed #251 slice

Prepared locally against `release/security-runtime-20261007` at `3f3eac4f`.
No production migration, provider effect, deployment or GitHub write is authorized
by this preparation. The isolated proposed batch 17 contains only migration
`20261020090038_newsletter_backfill_audit.sql`; it does not include another
worktree's private money/apps tail. Every earlier migration remains byte-identical.

## Behavior

Queue lead mirror repairs, hosted health checks and domain refresh commands persist
an attributed attempt before their effect, using the current operator and real
business audit tenant. They then record completed or unconfirmed outcomes. A lost
outcome log preserves an accepted effect; it does not automatically repeat it.
Website section restores persist the preparer's current user identity and attempt.
Forced review remains enforced. `preparedBy` describes provenance; it creates no
owner approval, delegated authority, confirmed fact or publication receipt.

The inquiry support view calls a service-only audited SQL composition. SQL checks
and locks the actual verified, unrevoked operator, calls the existing bounded pure
reader, resolves immutable source-row business scope and persists the existing
workspace operator audit plus real linked tenant audit before returning records.
Tenant-only held records resolve `tenant_leads.id` to `tenant_stable_id`; notices
resolve `inquiry_events.id` to its stable tenant. No capture slug or fabricated `*`
tenant supplies audit identity. Audit metadata contains record IDs, scope, view
and count, without inquiry names, email addresses or message text.

An empty page has no disclosed records or business scope and creates no invented
business audit; actor checks still apply. A retained inquiry whose original stable
tenant no longer exists refuses the entire page with
`inquiry_operator_audit_scope_unavailable`, before any audit or data return.
The records stay retained. This is a support-read refusal, not a retention or
provisioning repair. A replacement tenant reusing the capture slug does not inherit
access or attribution; a rename of the original stable tenant remains readable.

Newsletter backfill keeps its request-session identity, release, link and consent
gates. Both dry-run and apply record the canonical workspace operator action,
actual user identity, business scope and aggregate counts. A dry run leaves
subscriber, contact and sync data unchanged while appending access audit. Apply
and audit share one transaction; audit failure rolls back contact/sync projection.
No subscriber consent is changed and no subscriber email is copied into metadata.

The old dry-run RPC already performed `SELECT ... FOR SHARE`, so it was never an
actual PostgreSQL `READ ONLY` transaction contract. The prior TypeScript comment
"Preparation is read-only by default" referred to the no-contact-write behavior;
it now explicitly distinguishes that behavior from operator access audit.
Existing pure inquiry readers and their actual READ ONLY qualification remain
unchanged. The audited wrapper is intentionally a writer and does not carry that
pure-reader promise.

## Proof and preserved failures

The initial TS attempt had an illegal platform-to-storage import and attempted an
inquiry read audit with tenant `*`, which real audit foreign keys reject. Those
failures were preserved and corrected by the service-only SQL wrapper. Mock tests
alone had not established native audit persistence. Independent review also
reproduced retained-tenant deletion plus capture-slug reuse disclosing former
inquiries under a replacement tenant; the immutable source-row scope and native
regression now refuse both deletion and reuse without partial audit writes.

`bash scripts/check-operator-support-audit.sh` exercises real migrated PostgreSQL
and foreign keys: old repair lacks audit (red), new dry-run/apply attribution,
current user/session denial, revoked/unverified denial, notices, empty pages,
tenant rename, retained deletion and reused slug refusal, native audit outages,
atomic rollback, and exact accepted-row preservation across inverse/reapply.
The original identity-only fixture now inserts a real linked workspace directly;
its former legacy conversion fixture was invalid after the later provider-seat
conversion contract. No original migration bytes were changed to accommodate it. The historical
checkpoint first refused the rename fixture because its pre-append-only-audit FK
protects already audited tenant IDs. The regression now uses a distinct unaudited
legacy tenant, rolls back the rename audit probe, then proves real deletion and
slug reuse denial without loosening that historical constraint.

Standard proof is wired into `check-agency-workflow-sql.sh` (complete ordered
fresh schema), `check-workspace-upgrade.sh` (retained historical rows and final
ordered schema) and `check-workspace-sql.sh` (historical checkpoint checks followed
by the new slice). The current-tail release safety rehearsal includes the new
functions at their actual source position; its permission recovery scope remains
limited to original batch-8 functions. The new wrapper keeps its reviewed
service-only grant.

The inverse quarantines the backfill and new audited read entrypoints by revoking
execution. It retains functions, protections, accepted contacts/sync rows, audit,
and inquiry history. It never restores an unaudited repair or deletes accepted
records. Reapply restores the reviewed grants without changing those rows.

## Local qualification result

All checks below passed on the isolated `3f3eac4f`-based source. These establish
local implementation behavior, not deployment, production compatibility or
provider acceptance.

- Five focused Vitest files: 74 tests passed (operator inquiry review, queue
  source actions, History restore, section updates and AI review preparation).
- `pnpm typecheck`, targeted ESLint, `pnpm check:boundaries`, shell syntax and
  `git diff --check` passed.
- Native support audit red/green, inverse and reapply passed; 1,290 final public
  functions were checked by the existing pure-reader lock graph scanner.
- Complete ordered agency fresh schema (277 migrations), standard historical
  fresh checkpoint suite, and standard retained-row ordered upgrade passed.
  The upgrade applies migration 38 before the later October 20/21 source files;
  the final-schema attribution and failure assertions remain green afterward.
- `scripts/check-release-safety-batch8.ts --current-tail` passed with 51 remaining
  forward files. Two permission recovery rounds quarantined 187 original
  introduced service RPCs while preserving all public rows and exact catalog/ACL;
  new tail APIs retain their own reviewed grant scope.
- Proposed batch 17 pins forward SHA-256
  `5c0c7403b74e078427246bdbf051f593751b066c97858f56ea7c63f290e4c57a`
  and inverse SHA-256
  `b0d7219653cfe96ecef4b3e983fdfd36aa2a110d9f5f99d50d991c7923c3c23d`.

## Remaining #251 scope

Already addressed in current source: inquiry operator revocation/current user
identity (`20261010125955`), newsletter `auth.uid()` identity (`20261011100100`),
operator approval attribution and owner-versus-delegate receipts, confirmed-fact
publication boundaries, and customer-message `owner_decides` default. These do
not establish deployment or real provider acceptance.

This slice addresses explicit repair attribution, restore preparer identity,
inquiry support-read audit and newsletter repair audit. It does not close #251.
The coordinator separately owns portfolio scan routes' invalid `*` audit scopes.

Verified adjacent unaudited support reads remain in current source:

- `read_catalog_report_failures` in `20261010152000_catalog_report_receipts.sql`
  returns global failed/suppressed report business details through a platform
  operator gate; `src/platform/catalog-reports/operator-source.ts` calls it
  without persisting a support-read audit.
- `read_catalog_tool_notice_failures` in
  `20261010150200_internal_tool_notice_delivery.sql` returns global business/work
  failure details; `src/platform/catalog-reports/tool-notices.ts` calls it without
  persisting a support-read audit.
- `read_operator_queue_context_v2` in
  `20261010161400_operator_complete_sources.sql` returns cross-business links,
  delegations, operators and readback details;
  `src/platform/operator-queue/store.ts` calls it without support-read audit.
  The later READ ONLY authority successor changes the gate to a pure reader,
  retaining its no-write behavior.

`read_catalog_report_receipts` is a different boundary: the later acting-provider
migration `20261014112000` replaces its per-business operator shortcut with
`needs_you_provider_id(p_workspace_id, ...)`. It is an ordinary authorized member
or acting-provider read, not evidence of an unaudited global support power. This
slice does not impose platform support audit on those provider reads.

These source findings establish missing audit composition, not provider-policy
violations or disclosure to a nonoperator. Remaining global readers/actions were
not exhaustively inspected in this slice. Any broader claim needs a catalog of
actual reachable support reads and writes with current identity/scope/failure
proof, rather than an old issue title.

Provider neutrality is a separate policy/acceptance question: supervised reply
responsibility still has `strelva_reviews` paths; ordinary provider membership
alone does not confer platform operator authority. This repair does not widen
roles, erase supervised commitments or claim equivalent real provider acceptance.
