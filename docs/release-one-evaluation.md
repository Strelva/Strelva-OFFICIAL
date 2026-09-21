# Release one evaluation — initial baseline

Date: 2026-09-05
Status: historical implementation baseline and acceptance contract. The findings below describe the starting point, not the completed implementation. See [release-one readiness](release-one-readiness-2026-09-05.md) for the final scope and verification boundaries.

## Decision

Release one is not ready from the current source. The repository has a useful product-boundary extraction and a public AI Visibility assessment, but it does not yet have the account-owned work, agency delegation, private sharing boundary, or product entitlement model required by the release-one promise.

Do not define release one as a new chat shell. Define it as one complete piece of work that can move safely between a person, an agency, and a customer:

> Check a business, produce an evidence-backed assessment, keep the draft private, share it deliberately, let the customer take ownership, and preserve the work when agency access is revoked.

Conversation may start or revise that work. The assessment and its ownership state are the durable product.

## What exists now

| Area | Current evidence | Evaluation |
| --- | --- | --- |
| Public assessment | `/ai-visibility` calls `POST /api/ai-visibility` and renders a structured scorecard. | Available as an anonymous acquisition flow. It is not account-owned work. |
| Shareable result | `saveAiVisibilityResult` stores the complete scorecard in Redis for 180 days; `GET /api/ai-visibility/[id]` and `/ai-visibility/[id]` return it without authentication. | Bearer-link public sharing exists. Private draft, explicit publication, unshare, and access audit do not. |
| Product module boundary | `src/products/ai-visibility`, `src/products/managed-presence`, `src/products/domain-monitor`, and `pnpm check:boundaries` establish import direction and product entry points. | Useful foundation. It does not provide installation, ownership, entitlement, agency, or execution contracts. |
| Relationship labels | `src/platform/relationships` derives User, Paid User, Client, and Enterprise from supplied facts. | Display-only local model. It is deliberately not authorization or authoritative billing state. |
| Existing clients | `resolveLegacyManagedPresence` classifies any resolved non-demo tenant as a managed Client; the dashboard still uses tenant memberships and existing product routes. | Compatibility adapter exists. Existing-client route behavior still needs release regression checks. |
| Conversation mechanics | `src/experience/conversation/stream.ts` extracts the existing stream decoder. Existing threads remain keyed by tenant and existing `/api/agent` requires `content:write` plus an active tenant subscription. | Transport reuse exists. There is no no-tenant conversation, account-owned history, saved work, or product dispatcher. |
| General user account | `/account` shows "No invited sites" when an authenticated person has no tenant memberships. | Required ordinary User journey is absent. |
| Account storage | `src/lib/accounts.ts` is an operator Redis grouping of tenant sites. The phase-zero SQL account tables are documented as dormant and deny-by-default. | Not a current customer account authority. Do not build delegation on it until identifiers and deployed state are reconciled. |
| Agency access | No agency, delegation, resource grant, customer handoff, or revocation module or route exists under `src/platform`, `src/products`, or `src/app`. | Absent. Referral/source strings are attribution only and grant no access. |
| Paid product access | Billing and subscription checks are tenant/site based. The relationship resolver recognizes active paid standing only when a caller supplies it. | Standalone product entitlement, payer/beneficiary separation, and product usage limits are absent. |
| Managed approvals | Existing tenant actions use the queue and server-side tenant permission checks. | Preserve for managed clients. There is no customer acceptance/activation step for agency-prepared work. |
| Failure handling | The public assessment returns a retryable error and the managed agent emits action results. | No durable release-one job, resumable attempt, idempotency key, retry receipt, or customer-visible failure history. |

Focused local verification on 2026-09-05 ran seven Vitest files covering AI Visibility scoring/routes/persistence, relationship projection, managed-client compatibility, product boundaries, and stream decoding: 42 tests passed. This confirms only those focused behaviors. It does not verify production data, deployment, browser journeys, agency access, or release readiness.

## Release blockers

### P0: authorization and privacy

1. Agency delegation is absent. A tenant membership is broad site access, not a resource-scoped agency grant. Release one needs grants over named customer work or installations, named actions, an expiry or explicit lifetime, a grantor, and an auditable revocation.
2. AI Visibility results are public bearer objects as soon as they are generated. The user is not asked to publish them, and there is no private owner record, share state, token rotation, or revocation. The shared page also creates search and link-preview metadata from result content. This cannot serve as an agency's private draft workflow.
3. Anonymous-to-account claiming is absent. A saved result cannot be attached safely to the creator after sign-in, and a possession-only scan ID must never be enough to claim private ownership.
4. The public AI Visibility fetch now validates every redirect before opening it and pins the socket lookup to the validated IPv4 address, with timeout, content-type, redirect, and response-size bounds. Focused negative tests cover the application guard. Production still needs an independently verified network-egress policy that denies private and link-local destinations; application validation is not a network sandbox.

### P1: correctness and commercial truth

1. The assessment can emit a numeric F and say AI can barely read a site when the site fetch produced no evidence. Unreachable, rejected, blocked, and unmeasured are different states and must not be collapsed into a measured failure.
2. The loading state says it is "probing live AI answers" even when the provider key is unavailable. The result then exposes an internal environment-variable instruction. The public experience must state what was measured on this run and attribute the live probe to the provider actually used.
3. The marketing question names ChatGPT or Gemini, while the implemented citation probe uses Gemini only. Readiness checks cover several crawler policies, but that is not a live ChatGPT recommendation test.
4. `GET /api/agent/usage` reads `agent:${tenant}` while the write path increments `agent:${tenant}:${userId}`. The displayed usage can therefore disagree with the enforced limit.
5. Product availability is not authoritative. Dashboard feature flags describe managed-site navigation, billing describes tenant subscriptions, and the new relationship status is display metadata. None answers whether this actor may run this operation for this product installation or what it will cost.
6. Joining "monitoring" creates a sales Delivery Lead, not a monitoring installation or recurring service. The current pilot copy is appropriately framed as a waitlist; no other surface may report monitoring as active.

## Acceptance checks

These checks are the release contract. Run them against a fresh local environment with synthetic accounts first, then against an authorized release candidate environment. Record request IDs and resulting rows or events. A screenshot alone does not pass an authorization or persistence check.

### 1. Ordinary user without a managed tenant

- Create and sign in as a confirmed user with zero tenant memberships.
- Open the primary Strelva entry point without seeing "No invited sites," being redirected to a managed dashboard, or needing a website tenant.
- Start an AI Visibility assessment and receive a structured result that distinguishes measured, failed, and unavailable evidence.
- Save it under the user's personal account, sign out, sign back in, and reopen the same work by listing owned work rather than supplying a result ID directly.
- Attempt to read and mutate the work as a second user. Both requests must return an indistinguishable 404 or forbidden response without leaking title, business name, metadata, or existence.
- Repeat the transition from anonymous assessment to sign-in. A one-time claim grant tied to the same browser/session must work once; copying only the scan URL into another session must not claim ownership.

### 2. Agency prepares and shares an assessment

- Create separate agency and customer accounts. Give the agency user membership only in the agency account.
- Let the agency create a customer prospect and prepare an assessment without making the agency the owner of the customer's durable work.
- Confirm the draft is private to authorized agency collaborators before sharing. Search metadata, unauthenticated page requests, API reads, logs, and activity feeds must not expose it.
- Share through an explicit action that creates a scoped, rotatable share grant. The recipient can see the intended assessment and no agency-private notes, conversations, other customers, or internal cost data.
- Record who shared it, when, which revision was shared, and whether the recipient opened it.
- Let the customer sign in, verify the intended identity/account, accept the handoff, and become owner of the customer work. Acceptance must not grant the agency broader customer access.

### 3. Scoped grant and revocation

- Grant an agency `read` and `prepare_revision` on assessment A for customer X. Do not grant publish, billing, connections, assessment B, or any resource for customer Y.
- Verify allowed reads and writes succeed and every out-of-scope direct API request fails server-side.
- Revoke the grant while the agency has an active session. Subsequent reads, mutations, share operations, background jobs, and token refreshes must fail without waiting for sign-out.
- Verify customer-owned data, accepted revisions, share history, billing, and monitoring state remain intact after revocation.
- If the agency is payer, show an explicit payer-transition state. Revocation must neither delete service nor silently make the customer liable.

### 4. Private and shared boundary

- New work starts `private`. Creating, autosaving, or reopening it must not create a public route.
- Sharing creates a separate grant, not a change to resource ownership. Test expiry, manual revoke, token rotation, and recipient scope.
- Revoked and expired share links reveal no resource metadata and cannot be used to claim ownership.
- A shared revision remains stable. Later private edits do not silently change what a customer approved unless the product explicitly labels the share as live.
- Attachments and generated exports inherit the resource's access policy. Their storage URLs cannot bypass the application check.

### 5. Truthful product availability

- Define a server-owned product catalog entry for each release-one product with lifecycle state: available, pilot, waitlist, unavailable, or internal.
- Resolve availability from product state, installation state, actor grant, entitlement, required connection, geography/provider constraints, and operating health.
- Ask for an unavailable operation in conversation and through a direct API call. Both must decline it with the same reason and a valid next step. The model must never create authority.
- Show AI Visibility as a measured assessment. Show recurring monitoring as a pilot/waitlist until scheduling, run history, alerts, quotas, and billing exist.
- Existing managed-client actions continue to use their capability manifest and tenant permission checks during the transition.

### 6. Cost, entitlement, and approval

- Before any paid or metered operation starts, return the entitlement used, included allowance, expected charge or bounded estimate, payer, beneficiary, and whether customer approval is required.
- Reserve usage atomically and use an idempotency key. Two retries of the same request must create one job and one charge.
- An agency cannot approve a customer charge, connection, publish, or recurring schedule unless the scoped grant explicitly includes that action. Referral attribution never qualifies.
- Approval binds the actor, product operation, immutable input/revision, price terms, customer account, and expiry. Editing consequential input invalidates approval.
- Completion records actual model/provider usage, external fees, billed amount, and outcome without exposing internal margins to unauthorized recipients.
- Reconcile checkout/webhook events against the same installation and payer. Existing Client status and service commitments do not disappear when billing state changes.

### 7. Failure and recovery

- Force each dependency to fail separately: site fetch, model provider, Redis/database write, email notification, and billing provider.
- Never report a completed assessment unless its durable result exists. Never charge for a job rejected before execution. Record ambiguous provider outcomes for reconciliation rather than blind retry.
- Persist a user-visible job state with `queued`, `running`, `needs_input`, `needs_approval`, `succeeded`, `failed_retryable`, `failed_final`, and `cancelled` or an equivalent explicit state model.
- A retry resumes or safely replays the same job. It must not create duplicate shares, emails, monitoring schedules, approvals, or charges.
- Show the last confirmed result when refresh fails, label its age, and keep failure details scoped to authorized participants.
- Verify an operator can diagnose the job by request ID without impersonating the customer and can retry only actions allowed by policy.

### 8. Existing-client compatibility

- For every active existing client fixture, verify sign-in, selected tenant, Client label, navigation, content read, draft, approval, publish policy, billing portal, and history access.
- Verify a user with both personal work and client membership chooses context explicitly. Opening a personal link must not select a tenant implicitly; switching tenant must not move personal work into it.
- Verify the public demo remains read-only at the API layer and never displays Client status.
- Compare current route/API contracts before and after the release slice. Do not remove tenant thread storage, feature registry behavior, or managed agent authorization until migrated data and consumers pass parity checks.

## Minimum complete release slice

Ship one product, AI Visibility, through the complete lifecycle above. The release-one interface needs only four user-visible regions:

1. A start action for checking a business.
2. The evolving assessment itself, with evidence and direct revision controls.
3. A clear personal, agency, or customer context switch.
4. Sharing, ownership, approval, and status controls beside the assessment when relevant.

Agency "today" means an agency can complete the prepare, share, customer-accept, and revoke lifecycle safely. A partner directory, royalty dashboard, idea marketplace, and broad portfolio dashboard are outside this release slice. Attribution and any manually administered earning agreement may be recorded separately, but neither grants product or customer access.

## Release evidence required

Release readiness requires all acceptance checks above to have an automated authorization or behavior test where practical, plus browser evidence for the complete ordinary-user and agency-to-customer journeys. Also record:

- the schema and migration applied in the candidate environment;
- product catalog and entitlement fixtures used;
- test identities, accounts, grants, payer, and beneficiary;
- before/after access results for revocation;
- one forced dependency failure and successful idempotent retry;
- actual provider usage and charged amount for one approved metered run;
- regression results for existing managed clients;
- production configuration checks for Redis, model providers, billing webhooks, storage, email, monitoring, and rollback.

Until that evidence exists, describe the work as local architecture or a release candidate, not release one ready.
