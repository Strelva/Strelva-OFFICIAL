# Delivery-email ownership extraction — 2026-10-08

Prepared from release baseline `e9ac136f9a0eecf362421c4046a333f0c20496fd`
for open issue #482. This is isolated code preparation, not deployed or integrated
proof, and does not close the issue.

## Ownership and compatibility

- `platform/bookings/notice-email.ts` owns the complete booking confirmation and
  owner-notice envelope/send implementations (128 lines).
- `platform/operator-notices/email.ts` owns complete operator intake, signup and
  payment-failure messages (184 lines); `recipients.ts` owns the configured list
  and existing `jacob@strelva.com` fallback (14 lines).
- Legacy `lib/delivery-email.ts` retains the same exported signatures. Its async
  compatibility functions load the owning modules through the established app
  workspace ports and remain fail-soft if a module fails to load. Its recipient
  API remains synchronous through a pure configuration port. The app edge,
  instrumentation and Vitest bootstrap already register this runtime contract;
  standalone entry points reaching ports must register it too.
- `platform/infra/tenant-crm.ts` is the unchanged complete Redis persistence
  implementation (269 lines). `lib/tenant-crm.ts` reexports the same functions,
  not a second store. Original/moved SHA-256:
  `39230536ca12fce1d03da883dc587ac6c1214bd6cd8117234c0e1ec31ed3d07c`.
- Shared email input shapes and completed-send activity recording are infra.
  Recipient, booking, approval and trigger decisions are not moved into infra.

The three extracted booking/operator implementation blocks match the original
source byte-for-byte. The activity helper only changes its CRM import owner.
The existing customer confirmation envelope still omits transport `tenantId`
while logging its completed send to the provided CRM tenant; owner notices still
forward `tenantId` to the client gate. No eligibility, recipient authority,
deduplication, approval, failure or suppression decision is changed.

## Measured scope

| Measure | Release baseline | Prepared source |
| --- | ---: | ---: |
| `lib/delivery-email.ts` lines | 938 | 646 |
| Actual baselined workspace → lib imports | 202 | 199 |
| Files containing those imports | 92 | 91 |
| Older product-boundary exceptions | 43 | 43 |

The issue's 1,011-line / 204-import / 93-file figures were historical.
The removed edges are booking notices → delivery-email, domain monitor →
delivery-email and inquiry delivery → tenant-crm. `check:boundaries --prune`
removed exactly those three entries; no entry was added or relaxed.

Residual work is explicit: 199 legacy import edges remain. The 646-line legacy
file still owns update-live, past-due, lead, welcome, site-live, review and health
messages plus prospect delivery status and ops-digest compatibility. Moving these
requires their own coherent owner seams; this patch does not claim all of #482.

## Local proof and limits

- Before extraction: nine existing relevant suites, 81 passed / one skipped.
- Final `pnpm test`: 900 files passed / two skipped; 8,524 tests passed / 46 skipped.
- New direct-owner qualification: 19 cases cover audience/recipient preservation,
  suppressed-send and provider-error paths, completed-send CRM ordering, CRM
  failure after a real send, original customer/owner tenant scoping, module-load
  failures and direct/legacy module identity.
- `pnpm lint`, `pnpm typecheck`, `pnpm check:boundaries`, and `git diff --check` pass.
- Final default `pnpm build` (Turbopack) passes with provider credentials empty
  and `NODE_OPTIONS=--max-old-space-size=8192`; compilation, typechecking and
  prerender complete, exit 0. The isolated worktree's initial dependency symlink
  was rejected before application compilation. Replaced only that owned symlink
  with an APFS clone of the existing locked dependency directory; no dependency
  or lockfile changed. Preserved the initial failure and a diagnostic webpack
  attempt that exhausted Node's default 4 GB heap. No webpack-success claim.
- Independent read-only comparison confirmed the unchanged send/CRM blocks and
  inspected Next node callsites/bootstrap. A cold standalone legacy recipient
  call now needs the registered configuration port; none of the inspected
  production/script callsites lacks bootstrap. That compatibility constraint
  remains explicit for future standalone callers.

Raw bounded local logs are `/tmp/issue482-baseline.log`,
`/tmp/issue482-final-tests.log`, `/tmp/issue482-final-lint.log`,
`/tmp/issue482-final-typecheck.log`, `/tmp/issue482-boundaries.log`,
`/tmp/issue482-build.log`, `/tmp/issue482-webpack-build.log` and
`/tmp/issue482-default-build-recovered.log`; they are not tracked.
No UI flow changed, no real mail or provider operation was performed, and no
production environment, database, dependency or deployed migration was changed.
Hosted Actions proof and release integration are pending.

Next: independently review these owner/port seams, then integrate the draft into
`release/security-runtime-20261007` and qualify its hosted release build. Keep #482
open for the residual extraction and import baseline.
