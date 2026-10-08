# Agency owner brand — #264

Local implementation, October 7, 2026. Branch `a1/agency-brand`; integrate target
`integrate/reborn-1.0`. No production schema, deployment, messages, DNS or billing
actions. This is implementation evidence, not white-label adoption or commercial proof.

## Current objective and behavior

Agency owners configure name, raster logo, accent and reply-to in agency setup.
The existing agency workspace owns `agency_brand` JSON; #258 has no separate
general agency profile. A customer's active provider seat resolves the brand.
When multiple active seats exist, prefer the active provider of record; without
that match, exactly one active seat is required. Missing, ended or ambiguous
agency relationships retain Strelva. Agency workspaces resolve their own identity.

That presentation reaches Needs-you email, verified decision-link pages,
owner invitations, native and legacy weekly/monthly reports, the shared owner
shell, and #544's attributed audit/AI-check UI, exports and email. Resources
retain their existing authority checks; branding grants no permission. A brand
read failure cannot obscure a completed decision POST. Owner report/invitation
links use the control-plane app, not the operator origin.

Display names and reply-to can change; agency mail stays on `updates.strelva.com`
or `mail.strelva.com`. Custom From names (`{name} via Strelva`) and reply-to apply
only while `agency_effect_allowed(agency, 'email')` is true. Save and every send
check reply-to against a verified current agency member in `public.users` and
`workspace_memberships`; removal or loss of verification removes reply routing.
The current integrate schema has no #265 verified-domain record, so domain-based
reply-to is unavailable. #265 owns sender domains. Self-serve report delivery retains
its existing configuration. R23/#239 is pending: `runs_on_strelva` is the only
accepted credit value. Agency identity keeps a small "Runs on Strelva." credit;
platform controls and language remain explicit. No customer-site credit changes.

## Storage, validation and rollback

Migration `20261012180000_agency_brand.sql` adds a column, constraint and two
service-only RPCs. No new table requires a readiness sentinel. Configuration
checks current verified email and direct owner membership under database locks.
Rollback is timestamped and wired into both SQL rehearsals. It refuses to discard
any configured brand; preserve/export configuration before an authorized rollback.

Logos allow PNG/JPEG/WebP only, bounded at 256 KiB and 2048px per side. The server
checks canonical base64, file signature and dimensions. Stored bytes are served
through a digest URL with `nosniff`, restrictive CSP and a five-minute cache.
This introduces no storage provider or dependency. Replacing/removing a logo
invalidates its previous URL after cache expiry; older emails may lose that image
but retain the agency name. Durable asset history is outside this mechanism.
Six-digit accent colors select black/white fill text at >=4.5:1; pale accents use
dark text on white. Email names are HTML escaped. Names are NFKC-normalized, stripped of bidi and
zero-width controls, and reject addresses, URLs and the reserved platform whole
words at save and send. The shared `email/from.ts` formatter quotes display names
and escapes quotes/backslashes for all transport calls, including raw weekly and
monthly reports. Brand lookup errors log a non-sensitive warning and fall back to
Strelva; workspace/report/prospect requests and email delivery keep working.

## Evidence and remaining uncertainty

- `pnpm install --frozen-lockfile`: passed; no dependency/lockfile changes.
- Targeted regression: 19 files / 279 tests passed before the final report tests.
- Final targeted regression: 21 files / 236 tests passed, including three new
  brand suites, report snapshots, decision GET/POST, permission/origin/body limits,
  logo response/hash, email gates, onboarding and readiness checks.
- Actual weekly/monthly cron snapshots: two written; 2 files / 9 tests passed
  with attributed artifact/transport and self-serve preservation assertions.
- The documented `pnpm test -- <paths>` form unexpectedly ran the whole suite:
  784 files passed, 2 skipped; 7184 tests passed, 41 skipped, two new report test
  expectations failed (weekly response is a tenant array; sender sanitization
  removes tag contents). Corrected expectations pass in the focused suite.
- Typecheck caught a late attribution field mismatch; corrected to root reply-to.
  Earlier local failures caught a missing import after moving the pure brand
  contract, SQL JSON subtraction precedence and stale placeholder expectations.
- `pnpm check:workspace-sql` and `pnpm check:workspace-upgrade`: passed with real
  isolated PostgreSQL resolution, provider switch/revocation, RPC exposure,
  rollback/reapply and populated-brand rollback refusal. Both scripts clean their
  own temporary database directories. No production database was accessed.
  The original exposure gate remains in place. An extra late global gate was
  removed: later fixtures leave extension/legacy helpers exposed; the new brand
  RPCs have explicit exposure assertions in their own SQL contract.
- Browser fixture: 320/768/1280/1600px, long name, pale accent, native logo upload,
  save, unavailable/owner-denied states and mobile navigation. Reflow overflow
  found at 320px was corrected. Fictional fixture transport only; no external send.

- Final `pnpm typecheck`, `pnpm lint`, `pnpm check:boundaries`: passed. Boundary
  baseline remains 204 workspace-to-lib imports / 93 files, 44 older imports.
- The single allowed `pnpm build`: passed; compilation, TypeScript and route
  generation completed. Existing Sentry/deprecation/generated-file notices
  remain. No second build was run.

Unproven: production migration/delivery, real email-client image compatibility,
agency adoption, the operational verification criteria (#233), and R23's ultimate
white-label depth. The #254 email predicate is implemented and tested locally.

## Integration handoff

Review the scoped diff and integrate after local gates. Shared files likely to
overlap streams: email layout/send, owner invitation/report senders, workspace
snapshot/API, shell/sidebar, proxy/CSP, prospecting attribution/check components,
design inventory and both SQL rehearsal scripts. No checksum-pinned migration
was edited. Production rollout requires separate explicit authorization.

Proposed durable claim: "Agency workspace branding is implemented locally and
retains platform credit." Do not promote it to deployed/operated/adopted state.
The coordinator owns canonical project/vault reconciliation and R23 review.

## Requested-changes follow-up (October 8 UTC)

Objective: resolve the Opus review on PR #557; no merge or production action.
Merged moved `origin/integrate/reborn-1.0` with merge commit `0169fb10`.
The original migration `20261012180000` is unmerged and outside checksum-pinned
batches; its two RPCs now validate name/member reply identity and return current
email-effect status. Its exact rollback and configured-data refusal are retained.
No new dependencies or email send sites.

Regression evidence against the pre-fix merge head: 35 failures across brand
security, actual report transports and workspace API tests (56 unrelated tests
passed). The new SQL suite fails on the original migration accepting
`hello@strelva.com`. These baseline runs use private archived source and disposable
PostgreSQL; no shared worktree or production data was changed.

The full workspace SQL check reproduced the separately assigned clock-dependent
`tests/booking-owner-evidence-schema.sql:35` failure: "range reads real bookings"
at 00:16 UTC. It was left unchanged. Brand-only full-schema rehearsal passes
independently, including current member/email revocation, effect status,
normalization, provider selection, RPC exposure, rollback/reapply and refusal to
discard configured data. Full workspace upgrade rehearsal passes.

Final checks: typecheck, lint and boundaries passed; 63 targeted files passed
(771 tests passed, 1 skipped). The single production build passed locally.
Final command outputs and counts are recorded in PR #557. Local evidence logs
are under `.scratch/agency-brand-review/`; they include the known SQL failure.
Next action: orchestrator reviews this follow-up and the separate booking-clock
fix, then decides integration. Production remains separately gated. The
coordinator owns canonical project/vault state; this is a proposed local evidence
delta, not a deployed/adopted claim.
