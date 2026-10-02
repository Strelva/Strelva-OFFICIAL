# Release one: private work and agency handoff

Status: local implementation, opt-in only. No production migration or deployment has been performed. This report supersedes the missing-implementation findings in the initial release-one evaluation; it does not certify live readiness.

## Promise and surfaces

A person or agency can assess a business, keep the result private, and hand an independent copy to a named customer. The customer can optionally grant read access to that specific copy, then revoke access without losing the work. The result, evidence, ownership, and next action are the interface; a chat shell is not required.

| Surface | Release-one behavior |
| --- | --- |
| `/workspace` | Personal saved work, private assessment, structured evidence, reopen, explicit failure recovery |
| Agency view inside `/workspace` | Create agency workspace, prepare work, address a handoff, cancel pending handoffs, inspect access status |
| Handoff link | Fragment token removed from URL, authenticated recipient preview, explicit acceptance, optional read access unchecked |
| Customer workspace | Independent accepted copy; revoke exact-work agency access without deleting the copy |
| Workspace sign-in | No managed website or paid plan required; return to workspace, including callback failure recovery |
| Existing managed dashboard | Existing tenant authorization and client experience preserved; not replaced by workspace permissions |
| Public AI Visibility | Existing public acquisition experience remains separate; private assessment never calls public-result storage |

Agency release scope is an individual owner preparing customer work. Team invitation management, royalties, partner agreements, automated payouts, standalone subscriptions, generic chat, and background jobs are not implemented by this slice. Homefinder is explicitly not enabled. Relationship labels are not entitlements or access grants.

## Code structure

```text
src/app/                 HTTP validation, session resolution, routing
src/experience/workspace/ result-first UI, public DTOs, supported-result decoding
src/products/            AI Visibility, managed presence, domain monitoring
src/platform/products/   descriptive product/resource/operation catalog
src/platform/workspaces/ ownership, saved work, handoff, delegation, persistence
src/platform/relationships/ commercial/service labels, separate from authority
```

Future products reuse ownership and access contracts but supply their own operations and renderers. A catalog entry does not activate a product. Unknown or incompatible saved payloads produce a safe unavailable state, not a broken workspace. Do not move product implementation into the shared platform.

The extracted AI Visibility implementation replaces its old component/library locations; callers use product entry points. Existing managed routes, billing, provider callbacks, client prototypes, and historical data are not deletion targets. The user-deleted AGENTS.md remains deleted.

## Security and delivery boundaries

- `STRELVA_WORKSPACE_RELEASE=1` enables the slice; default is off. APIs enforce the gate as well as the page.
- Workspace APIs require a confirmed authenticated identity, same-origin JSON writes, bounded request bodies, rate limits, and server-side membership or exact-resource delegation checks.
- PostgreSQL owns durable records. RLS denies anonymous/authenticated direct access; only narrowly granted service operations are permitted. No Redis or local-file persistence fallback.
- Handoff tokens are random, stored hashed, expire after seven days, and can be revoked while pending. The named verified recipient is checked inside transactional acceptance. Acceptance is idempotent and copies rather than transfers the agency's source.
- Read delegation is customer-work-specific, not agency-wide membership. Later private customer work is not included. Customers can revoke it.
- Private routes use no-store/no-referrer responses and exclude workspace telemetry from the configured analytics/error reporting paths. Tokens are sent in request bodies, not query strings.
- Assessment fetching pins the validated public IPv4 address and bounds redirects, time, content types, and response sizes. Missing website evidence is not rendered as a failing grade; partial measurement is labeled. One sampled Gemini answer is not a claim about all AI systems.
- Limits: five owned workspaces per person, 500 saved items per workspace, 50 live pending handoffs per agency, 60 API writes per minute per actor, ten assessments per day per actor. Confirm the shared rate-limit backend before multi-instance activation.

## Verification

`pnpm check:release-one` checks TypeScript, import boundaries, ontology, focused unit suites, and actual SQL against a disposable isolated PostgreSQL cluster. It never applies the production migration. The cluster is stopped and retained for inspection.

`pnpm smoke:workspace` exercises the real UI with intercepted API fixtures. It covers desktop/mobile and reduced-motion rendering, private save/reopen, sign-in recovery, partial/unavailable evidence, handoff consent, revocation, read-only delegation, and stale responses. These are not live authentication or PostgREST integration tests.

SQL acceptance checks use actual tables, grants, constraints, and RPCs: correct/wrong/unverified recipients, expiry, cancellation, idempotency, copy ownership, exact-work delegation, revocation preserving work, and direct role privileges. Unit tests separately exercise HTTP/store boundaries and outbound-fetch defenses. A read-only public HTTPS fetch was also exercised locally.

Local results: release gate passed (including 72 focused tests and isolated SQL); the full regression suite passed 2,091 tests with one skipped across 256 files. Lint passed with one existing unused-variable warning in a client-intake script. A subsequent production runtime check exposed the proxy redirecting workspace API requests to HTML; the exact-route exception was corrected, with 30 focused proxy/API tests and targeted lint passing afterward. The final production build passed, and all eight fixture-backed browser scenarios passed against that built app using installed Chrome. Actual unauthenticated HTTP checks returned JSON 401 with the flag on and JSON 503 with it off; the closed page rendered correctly. No authenticated live backend was exercised. CI steps are configured, not claimed executed remotely.

The design-system review kept existing tokens and primitives and made the result the focal point. On a local 1–5 assessment, composition and state coverage moved from 2 to 3 for this new flow; foundations and primitive reuse are 3. Keyboard focus, mobile overflow, and reduced motion have focused checks. Adoption remains unproven; this is not a whole-product accessibility certification.

## Required before opening access

1. Approve and apply `supabase/migrations/20260905190000_release_one_workspaces.sql` in the intended environment; verify existing user schema, grants, service access, backups, and regenerate database types.
2. Verify Supabase confirmed-email identity and the public user mirror, callback allowlists, service credentials, shared rate limiting, and provider configuration. Website-only partial measurement must remain valid without Gemini.
3. Run an actual agency/customer two-account journey through deployed auth and PostgREST: private assessment, reload, wrong-recipient denial, customer acceptance, optional delegation, revocation, and reload. Check browser/network/log privacy and existing managed-client access.
4. Set support procedures for account export/deletion and retained handoff audit data. Self-service deletion and team management are not offered yet.
5. Enable the release flag only after those checks. No paid-user entitlement or pricing change is implied.

Remaining constraints: assessments run synchronously; retries after a lost response can create another saved assessment. There is no durable job receipt or operation idempotency key. Work listing is bounded but not paginated, and delegation lookup can make multiple store reads. These require improvement before broad-scale use. Independent network egress restrictions, real repeated agency/customer demand, acquisition, pricing, and delivery economics remain unverified.

## Rollback

Disable the release flag to close workspace pages and APIs while retaining saved customer data and the existing managed product. Do not drop populated tables or remove customer copies as rollback. Database rollback after writes requires a deliberate data-preservation procedure.
