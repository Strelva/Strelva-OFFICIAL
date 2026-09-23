# First product-structure migration

Date: 2026-09-05
Status: local implementation; not deployed

## What this change establishes

- `src/platform/relationships`: browser-safe User / Paid User / Client / Enterprise
  display status, with independent paid standing and service relationship.
- `src/products/managed-presence`: the compatibility adapter that carries every
  resolved, non-demo managed-client record forward as Client. It does not create
  memberships, grant permissions, or alter billing.
- `src/products/ai-visibility`: existing scorer, result persistence, HTML output,
  and React views behind browser-safe contracts/UI and a server entry point.
- `src/products/domain-monitor`: domain alert delivery, extracted from the large
  delivery-email module. The rest of portfolio scanning remains in its existing
  library pending a separate installation/scheduling migration.
- `src/experience/conversation`: stream decoding shared with the existing client
  chat. Managed-site execution and authorization remain in their existing route.
- `pnpm check:boundaries`: enforced import direction and public product entry
  points, run by CI and the local CI script.

Existing client dashboards display Client in the selected workspace. Paid User
and Enterprise are modeled and tested but are not new purchasable offers in this
change. No public chat/signup path, account migration, or royalty payouts have
been activated.

## Removed or relocated

| Old location or behavior | Disposition | Why it is safe |
| --- | --- | --- |
| `src/lib/ai-visibility/score.ts` | Moved to `src/products/ai-visibility/score.ts` | Route, CLI, enrichment, and test callers updated |
| `src/lib/ai-visibility/html.ts` | Moved to `src/products/ai-visibility/html.ts` | Existing rendering retained through product entries |
| `src/lib/ai-visibility/results.ts` | Moved to `src/products/ai-visibility/results.ts` | Existing persistence keys, retention, and route behavior retained |
| `src/components/marketing/AiVisibilityPage.tsx` | Moved into the AI Visibility product | Public route preserved |
| `src/components/marketing/AiVisibilityResultView.tsx` | Moved into the AI Visibility product | Result and sharing behavior preserved |
| Inline stream parser in `ChatPanel.tsx` | Replaced by shared decoder | Existing chat consumes decoded events; network chunk boundaries tested |
| Domain-alert sender in `src/lib/delivery-email.ts` | Moved into domain-monitor server entry | Cron caller updated; email transport and operator policy retained |
| Workspace audit execution at import time | Moved behind a dedicated CLI runner | Unit tests no longer inspect unrelated sibling checkouts or exit the test process on import |
| Rohlax workspace requirement for `AGENTS.md` | Removed from `release-manifest.json` | Instruction-file cleanup is intentional; deployed API contracts and required runtime files remain checked |
| Broad TypeScript root inputs | Scoped to this package's source, scripts, tests, starter, and configs | Independent marketing/prototype apps retain their own configurations and files |
| Next.js automatic instruction generation | Disabled with `agentRules: false` | Framework development startup must not rewrite user-owned instructions |
| Ontology scanner's tracked-only file inventory | Replaced with current tracked and untracked source inventory | Relocations no longer crash the check; new files are checked before staging |

These source removals relocate behavior; they do not remove a customer feature.
Old committed locations remain recoverable from Git. Pre-existing user edits and
the intentional `AGENTS.md` deletion were preserved.

## Keep until a replacement proves equivalent behavior

| Existing area | Remaining responsibility | Removal gate |
| --- | --- | --- |
| `src/lib/threads.ts` and `/api/threads/*` | Tenant conversation history and existing API clients | Account-owned thread storage, permission checks, and verified history migration |
| `src/lib/storage/chat-store.ts` | Separate tenant/client-id chat-session persistence | Consumer inventory and explicit data migration; this is not the same schema as thread history |
| `src/components/dashboard/ChatPanel.tsx` and `/api/agent` | Managed-site conversation, uploads, actions, and approvals | New common conversation path with equivalent authorized managed operations |
| `src/lib/features/registry.ts` | Managed-dashboard capabilities and navigation | Product-specific navigation migration with route parity; it is not a billing-entitlement table |
| `src/lib/visibility/*` and `ai-visibility-scorecard.ts` | Recurring observations, history, schedules, and dashboard evidence | Product migration that preserves live-probe evidence semantics |
| `src/lib/audit/modules/ai-readability.ts` | General site-audit category | Independent audit behavior explicitly replaced, not merely similar naming |
| `src/lib/accounts.ts` and phase-0 SQL accounts | Current operator grouping and future durable account schema | Reconcile actual records, identifiers, authority, and subscriptions before switching writes |
| Public routes, template manifests, and `/api/v1/*` | Existing sites and external consumers | Proven consumer migration; lack of internal imports does not make a route unused |

## Next complete slice

Give a person with no managed tenant an account-owned conversation that can run
AI Visibility, save its result, and reopen it. Define durable conversation
ownership and access first. Use the new product entry rather than the
managed-site agent route. Preserve account context when moving between personal
work and managed client work. Activate paid access only from authoritative
billing evidence, with service engagements remaining independent.

The partner experiment stays specified in
[`strategy/2026-09-05-product-structure-and-agency-experiment.md`](strategy/2026-09-05-product-structure-and-agency-experiment.md).

## Local verification

- Full Vitest suite: 251 files passed; 2,042 tests passed, one skipped.
- Boundary tests rerun after path-normalization hardening: six passed.
- TypeScript, product boundaries, and ontology checks passed.
- Production build passed on Next.js 16.3.0, including TypeScript and all 224
  static page-generation steps. Sentry upload credentials were disabled for this
  local check; the existing Sentry `disableLogger` deprecation warning remains.
- Custom-repository contract/workspace checks: 54/54 passed.
- ESLint: zero errors; one existing unused-variable warning in
  `client-intake/sheri-mooney/build_recommendation.mjs`.
- Browser: managed-client conversation rendered at desktop and 390px mobile
  widths; Client and Admin appeared independently in navigation. The relocated
  public AI Visibility form rendered successfully. Both routes returned HTTP 200.
- Preview used a synthetic, local-only tenant. No AI request, domain-alert email,
  billing change, or production data migration was exercised. Synthetic tenant
  and preview analytics files were removed afterward.
- Automatic review rejected deletion of an initial generated preview cache.
  It was instead moved intact to
  `/tmp/strelva-preview-recovery.cjlWF2/.next-structure-preview` for recovery.

These checks establish this extraction's local compatibility, not general-user
adoption or a working account-owned public conversation.


## September 22 native application cleanup

The public `src/products/applications/server.ts` entry and existing wire contracts
are unchanged. Native applications now have three implementation owners:

| Owner | Responsibility |
| --- | --- |
| `domain.ts` | Candidate and release state, record validation, rehearsal checks, and deterministic revise/publish/rollback transitions. Publication time and actor are inputs, not ambient authority. |
| `repository.ts` | Canonical Postgres reads/RPC error translation, compatibility payload projection, and explicitly injected memory storage with per-store/per-application serialization. Missing production storage still fails closed. |
| `server.ts` | Authorized use cases, scoped assignment entry, native RPC dispatch, and the retained legacy command adapter. Membership and accepted grants remain distinct from domain validity. |

The import checker guards the domain's local dependency closure, including its
shared contracts. Pure transitions return a new state; failed transitions do not
mutate the caller's state. Publication still revalidates records under the same
memory lane as submissions. Live Postgres transitions retain their existing
transactional RPC authority. No schema, key, route, release flag, or customer
agreement changed.

Six UI files had no application callers: `CommandTrigger`, `CreateTenantForm`,
`InviteButton`, `AgentPreview`, `AgentTrace`, and `LayoutPanel`. They were removed,
not replaced. The active client access card, operator invite endpoint, onboarding
route, conversation panel, and governed approval path remain. The invite source
regression now targets those active callers; historical evidence is retained.

This cleanup does not migrate the remaining legacy application command rules,
all other product services, or the managed website control plane to pure domain
models. Those boundaries require their own behavior-preserving extraction.

## September 22 product-wide cleanup

This follow-through extends the first native application extraction across the
control plane. The reference inventory covered source, scripts, tests, benchmarks,
the client starter and configuration, rather than only `src/products`. All 18
product directories were included in the dependency and caller review. This is a
source cleanup and regression review, not a manual correctness proof of every
line or a claim about deployed customer behavior.

### Ownership after cleanup

| Area | Result |
| --- | --- |
| Native applications | Candidate/release rules and legacy commands live in `applications/domain.ts`. Authorized orchestration stays in `server.ts`; canonical storage and explicit test compatibility stay in `repository.ts`. Legacy revise still rejects incompatible records immediately, unlike the explicit candidate/rehearse path. |
| Operations | `native-execution.ts` owns native capability dispatch and its admission checks; `assignments.ts` owns delegated operations; `responsibilities.ts` owns finite/standing coordination and reconciliation. `server.ts` retains the public entry. No second executor or scheduling authority was introduced. |
| Work plans | `domain.ts` validates supported operations, dependencies, reviewable drafts and required decisions. `generation.ts` owns model interaction, `native-output.ts` maps supported outputs, `execution.ts` owns replay/freshness/atomic output, and `service.ts` coordinates creation and presentation. Public exports stay stable. |
| Budget execution | `execution-contracts.ts` and `execution-engine.ts` no longer import storage or allowance services. `runtime.ts` assembles the real stores. Budget inspection and provider evidence import the contracts, not the runtime. Accepted or ambiguous effects remain non-replayable. |
| Custom applications | Build and intake share one source-file validator. Source limits count UTF-8 bytes without the browser depending on Node's `Buffer`. Artifact contracts no longer import the container-build adapter. |
| Inquiries | Portfolio types moved inward to `portfolio-contracts.ts`. `delivery-approval-service.ts` is explicitly the effectful owner, not a purported pure engine. Removed the uncalled registration globals and alternate approval wrappers; routes still use the same durable approval service and receipts. |
| Workspace | HTTP handling belongs to `WorkspaceRequest.tsx`; URL selection is testable in `workspace-selection.ts`. Offering transport, configuration, directory and installation views have separate owners behind the existing entry. A late conflict from the previous business is ignored before any refresh. |
| Shared motion | Removed an unused scroll context. Disposal now removes its exact animation ticker and cancels pending refresh frames. Existing reduced-motion and resize behavior remain. Imports needed only for plugin registration are explicit side-effect imports. |
| Website generation | Removed an uncalled configured-model wrapper and its private prompt/model helpers. The active injected structured-generation provider, compiler, reviewed export and deployment seam remain. |

### Full product disposition

| Product directories | Review outcome |
| --- | --- |
| `applications`, `operations`, `work-plans`, `custom-applications`, `inquiries`, `websites` | Responsibility and dependency changes described above; domain, service and existing route regressions exercise them. |
| `onboarding`, `scheduling`, `investigations`, `tracker` | Removed uncalled convenience exports or types. Existing rule engines, native receipts, calendars, attachment provenance and record history remain. Their domain contracts are included in the transitive check. |
| `documents`, `product-learning` | Retained existing engines and their caller-owned authorization/storage paths. Checked the rule dependency graph and existing behavior tests rather than creating another implementation. |
| `ai-visibility`, `assessment`, `website-audit` | Retained the canonical assessment, audit and recovery paths. Similar names do not make these separate responsibilities duplicates. |
| `home-finder`, `domain-monitor`, `managed-presence` | Retained active product adapters and public entries. A thin adapter does not need an invented domain hierarchy. |

Auth, tenant/customer identity, billing, email, provider secrets, governed website
writes, crons, the scanner and `/api/v1` retain their existing owners. No customer
compatibility name, live plan, grandfathered agreement, release flag, database
schema or persistence authority changes here. Marketing and individual customer
repositories are not part of this refactor. The large synthetic
`DeliveryExperience.tsx` remains a development preview, not a live delivery owner.

### Deletion evidence and retained exceptions

Removed uncalled helpers/types from account contact display, agent prompt-cache
reset/risk context, audit module aliases, bookings, capability discovery, custom
repository summaries, editor types, feature identifiers, production fallback
wrappers, reward storage, site-content checks, suggestion sweeps, thread titles,
weekly-brief predicates, inquiry adapters, calendar conveniences and native
capability aliases. Removed unused skeleton variants and the Vagaro popup button;
active skeleton lines/circles and the embedded booking widget remain.

The deletion review combined module reachability with symbol references in source,
tests, scripts and documentation. Direct Svix 1.92.2 had no caller and was removed
from the manifest and lockfile. Resend's transitive Svix remains. This is not a
dependency upgrade or replacement webhook implementation.

Public product entries, the tenant projection migration bridge, scoped fixtures,
frozen pricing compatibility constants, generated database types, schema history,
retained browser evidence and the tested website deployment seam remain. These
are intentional contracts or evidence, not dead code merely because normal app
imports do not reach them. Release and migration gates in the earlier tables still
apply; cleanup is not authority to delete production records.

### Regression evidence

The earlier `c3dba07` cleanup completed all four hosted workflows before this
follow-through. Its unit baseline was 3,585 passing tests and one intentional
skip. The expanded local coverage run passed 3,635 tests in 486 files with the
same skip and unchanged coverage floors. A subsequent custom-application return
link regression failed against the old URL allowlist and passed after correction.
The late installation and website-binding conflict regressions also failed before
fixing the epoch check and passed afterward.

New tests cover transitive/type/dynamic import boundaries, unsupported module
loads, browser-safe UTF-8 build limits, immutable legacy application commands,
workspace route precedence/recovery and scroll callback disposal. The PR records
final source-revision checks, including the last return-link test. No local result
establishes production deployment, provider operation or human visual acceptance.
