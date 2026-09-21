# Inquiry-first migration acceptance

Prepared 2026-09-11. This checklist records evidence, not intention. A row is
complete only when its named evidence exists and has been inspected. Local,
preview, hosted, and production evidence must stay separate.

Authority: [inquiry-first product specification](./inquiry-first-product-spec-2026-09-11.md).
Independent review: [architecture and security review](./inquiry-first-architecture-security-review-2026-09-11.md).

The status columns below preserve the initial inquiry audit. Later implementation
and authenticated local evidence are recorded in the
[horizontal verification record](./horizontal-local-verification-2026-09-11.md).
Do not use the initial partial/pending rows as a current completion percentage.

## Status key

- **Specified** means the requirement is selected and documented.
- **Pending** means implementation or evidence is missing.
- **Partial** means a working portion exists, but the entire row is not accepted.
- **Local pass** means the exact local evidence named in the row passed.
- **Blocked** means a named prerequisite prevents the check.
- **Not authorized** means the action requires separate production authority.

## Product and interaction acceptance

| ID | Requirement | Exact evidence required | Status |
| --- | --- | --- | --- |
| IF-01 | One persistent sidebar exposes separate New and Search actions, Businesses or Clients, Recent work, and Account. | Rendered desktop and mobile inspection with an authenticated fixture; keyboard focus and access-revocation checks. | Partial |
| IF-02 | Home always orders Needs you, Strelva is handling, What changed, What's live and uses quiet lists without cards or charts. | Rendered populated and empty states at desktop and mobile widths; component assertion for order. | Local pass |
| IF-03 | Shape shows the form, record, route, follow-up, sender, responsibility, connections, and evidence before Go. | Browser journey with brokerage and service fixtures; assertion that work cannot start without exact draft authorization. | Partial |
| IF-04 | The preview is editable and shares a structured model with the receipt. | Browser edit and reload test; contract test proving preview and receipt project the same versioned facts. | Partial |
| IF-05 | Capability and rules are durable, versioned records built from fixed components. | Repository and transition tests for draft, publish, edit-after-publish, rule order, and unsupported component rejection. | Partial |
| IF-06 | Inspector shows actor, action, target, time, reason, evidence, outcome, and version. | Rendered timeline for success, bounce, block, verification failure, and undo; tenant-isolation test. | Partial |
| IF-07 | Bulk work confirms exact targets, preserves per-record authority, and reports partial failure honestly. | Focused authorization and mixed-success tests; rendered partial-failure result. | Partial |
| IF-08 | Rehearsal is saved, isolated, rerunnable, and tied to an exact version. | Storage and rerun tests; eight named stored checks; proof external transports are blocked; stale-rehearsal publish rejection. | Local pass |
| IF-09 | Make live publishes only the exact passing version and creates an exact receipt. | Transition, concurrency, stale-version, and receipt-count tests; rendered before and after view. | Local pass |
| IF-10 | Undo restores the prior capability behavior while preserving inquiries received after publication. | Integration test that publishes, receives an inquiry, undoes, verifies prior version, and reloads the unchanged inquiry and provenance. | Local pass |
| IF-11 | Why builds a causal chain from recorded evidence and admits missing evidence. | Deterministic bounce scenario plus missing-link scenario; rendered source links and bounded fix. | Partial |
| IF-12 | Responsibilities enforce allowed, forbidden, asks-first, limits, escalation, voice, hours, and trust. | Policy tests for each gate; pause race test; supervised-to-trusted promotion test with actor authorization and clean-record evidence. | Partial |
| IF-13 | Connections record consent, purpose, scopes, health, last check, and disconnect without exposing secrets. | Auth and tenant-isolation tests; payload/log secret scan; disconnect and missing-scope failure tests. | Partial |
| IF-14 | Website onboarding proposes sourced facts inline and requires correction or confirmation of only needed facts. | Rendered desktop/mobile journey with provenance, unknown facts, corrections, and a failed scan. | Pending |
| IF-15 | Agency Attention is assignment-scoped and handles consequential decisions one at a time. | Cross-tenant authorization tests and rendered assigned/unassigned/empty states. | Pending |
| IF-16 | Agency Patterns copy shape only and require client adaptation plus a fresh rehearsal. | Test proving no credentials, inquiry data, approvals, or grants cross tenants; browser adaptation and rehearsal journey. | Partial |
| IF-17 | Brokerage buyer/seller and service quote/booking variants use one engine and fixed components. | Contract fixtures for all four variants plus source inspection showing one lifecycle and receipt path. | Local pass |

## Engine, storage, delivery, and security acceptance

| ID | Requirement | Exact evidence required | Status |
| --- | --- | --- | --- |
| IF-18 | All reads and writes derive business scope from trusted membership or routing. | Focused same-tenant, wrong-tenant, no-membership, agency-assignment, and service-role-bypass tests. | Partial |
| IF-19 | State transitions reject stale versions, invalid order, duplicate commands, and unauthorized actors. | Transition-table unit tests plus concurrent Go, publish, pause, follow-up, and Undo tests. | Partial |
| IF-20 | Inquiry evidence survives pause, Undo, capability edits, and failed delivery. | Persistence integration tests covering each event and reload. | Partial |
| IF-21 | Non-idempotent writes close on provider acceptance and cannot duplicate after failed read-back. | Failure-path tests with accepted write, failed verification, retry attempt, and one provider call. | Local pass |
| IF-22 | Notification outcomes distinguish suppressed, accepted, delivered, deferred, bounced, and failed where provider evidence supports them. | Delivery adapter tests and truthful receipt projections for each supported state. | Partial |
| IF-23 | Follow-up rechecks current state and policy immediately before acting. | Tests for reply arrived, paused capability, changed version, exhausted budget, disconnected provider, and bounced recipient. | Partial |
| IF-24 | Receipts are structured, append-only, actor-bound, and redact secrets and unnecessary personal data. | Schema tests, mutation rejection, retention/redaction review, and fixture/log scan. | Partial |
| IF-25 | Rehearsal cannot reach live email, calendar, Stripe, Google, MLS, site publication, or arbitrary network targets. | Adapter-boundary tests plus a network-deny execution test. | Local pass |
| IF-26 | Fixed components validate input and output at the engine boundary. | Schema tests with malformed form fields, conditions, recipients, templates, and follow-up definitions. | Local pass |
| IF-27 | Legacy tenant, Redis, HMAC, environment, and `/api/v1` contracts remain compatible. | Existing focused contract tests and `pnpm check:custom-repos` if the storefront contract changes. | Local pass |
| IF-28 | No production action is inferred from local work. | Diff inspection shows no live credentials; implementation receipt lists local commands separately from preview, hosted, and production evidence. | Local pass |

## Initial verification record

This table records the initial checkpoint, before the later horizontal implementation. Consult the [release checklist](./horizontal-release-checklist-2026-09-11.md) for current release requirements.

The working tree is uncommitted and includes earlier user changes. The root coordinator ran and inspected the checks below. These results apply locally only. See [remaining work](./inquiry-first-implementation-status-2026-09-11.md).

| Evidence | Result | Scope and limitation |
| --- | --- | --- |
| Documentation links and complete diff | Pending | Required before documentation acceptance. |
| Focused engine tests | Local pass | Engine, publication, preview journey, fixed form and consent success/failure tests. |
| Focused storage tests | Local pass | Repository and publication tests; isolated workspace, recovery, customer and inquiry SQL migrations passed. |
| Focused delivery tests | Local pass | Fake/blocked transports, recipient/version checks and accepted-write retry protection. Real provider reply tracking remains missing. |
| Focused UI/browser journeys | Local pass | Four Playwright journeys cover ordered home, inline edit through rehearsal/publication/test inquiry, mobile navigation, read-only and unavailable states. This is an isolated fixture, not an authenticated provider-backed journey. |
| `pnpm typecheck` | Local pass | Local type evidence only. |
| Broader repository gate | Local pass | Full Vitest suite, lint, production build, product boundaries, ontology, isolated SQL, and 54 representative custom-repository compatibility checks passed locally. |
| Production behavior | Not authorized | No deployment, migration, live send, or provider write is authorized. |

## Independent review questions

Before release review, answer these from implementation evidence:

1. Can any route, server action, background job, or bulk handler accept a
   caller-supplied tenant id without checking membership or assignment?
2. Can the same command publish, notify, follow up, or undo twice under a retry
   or race?
3. Can a changed draft reuse an older Go or rehearsal?
4. Can Undo remove or rewrite a received inquiry?
5. Can a pattern, receipt, log, fixture, or error expose a credential or another
   tenant's data?
6. Can a paused, disconnected, out-of-hours, over-budget, or bounced path still
   send a follow-up?
7. Can UI wording claim sent, delivered, verified, live, or handled from weaker
   evidence?
8. Can Strelva appear to be a human sender or claim a universal legal duty that
   this product policy has not established?
9. Can rehearsal reach a live transport or mutate a production-like authority?
10. Does every consequential action produce a receipt that answers actor, what,
    why, and evidence?
