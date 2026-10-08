# Wave 6 website — round 5 handoff

October 8 follow-on: [native fact mappings (#457)](a1-native-fact-mappings.md)
prepares explicit per-site/service mappings, owner address/services editing and
wiring for the already-existing hours editor. The remaining-gap descriptions
below are the historical round-5 state, not the current owner-form inventory.

Branch: `w6/website`, worktree `REB-w6-website`. Local only. No production calls,
client-repository changes, dependencies, notifications, pushes, PRs or merges.
The interrupted round 1–4 checkpoints are retained; the verification below
supersedes their unverified labels.

Active bet: managed owners ask and approve; Strelva operates the website.
Connected-site and paste-URL entry remain independent choices, and new Systems
use the workspace model. The current objective remains strict A in code; the
two local blockers below require review before that claim.

## Outcome against the launch spec

| Requirement | Local implementation and evidence | Limit |
| --- | --- | --- |
| System page, domains, health, Waiting on you, Requests (behaviors 1–5) | Existing projections retained; hosted domain claims are merged after a connected-site rebuild, with domain Connection contracts and failure states. | Actual tenant conversion and public-domain evidence remain production work. |
| Owners ask; Strelva prepares (6–7) | Owner navigation uses Requests and previews; native editing stays operator-only. History restoration records exact saved targets and prepares a reviewed candidate. | Existing needs-you policy remains the approval authority. |
| Native publication and read-back (8) | Accepted publication, revalidation and public content observation are separate facts. Failed explicit read-back reaches operators; failed audit/event writes cannot make publication retryable. Flags-off tests retain the old path. | Real client revalidation and public content observations are unproven. |
| Repo changes and unified History (9–10) | Request/deploy receipts, immutable snapshots, native versions and document revisions reconcile into one System release history. Owner restore prepares work; it never silently republishes. | Repo execution remains operator work outside this stream; no client repo was changed. |
| Business record read Connection (11) | Hosted documents declare approved typed bindings, then read confirmed public name/contact/address/hours/services at render under a separate gate. The original document/hash remain immutable; a separate meta marker reports record revision. Unavailable or oversized projections fall back to approved content. Native Business details phone/email changes prepare one reviewed contact draft per record revision using a Postgres dispatch claim. | **Partial locally:** native services/name need explicit per-site mappings and mutation wiring. Address/hours adapters exist but the owner form has no mutation entry. See blockers below. |
| Domain Connections and owner decisions (12–14) | Exact DNS proposals, expiry and candidate hash, Needs you approval, routed receipts, last checks and failure contracts. Accepted or unknown provider submissions are consumed even when read/storage fails, with `done_unverified`; no provider replay. | Real credentials, DNS control, provider acceptance and routing need a separately authorized rollout. |
| Rebuild Possibility and Make real (15–17) | Same System/tenant identity, current capability recheck before a new publish, immutable revision/hash selection, accepted replay without a second publication, per-step cutover results, DNS waiting, fallback retention and owner-attested undo. | Actual DNS restoration and fallback testing remain the owner's actions; the server does not perform or certify them. |
| Connected site (18) | Independent rollout authority, identity through hosted rebuilding, business-record facts and native inquiry store, consent revocation for mounted forms, and no inquiry referrer. Notifications remain silent until explicitly armed. | Real builder installation/host proof/reporting retention need acceptance on a controlled site. |
| Rebuild operation | Source-preserving crawl/review, retained skipped-page evidence, model composition opt-in with a durable call cap, Jev patch risk and changed-copy verification against prior supported/owner-confirmed evidence. Shared allowance and current authority are rechecked before each call. | **Auto-publish is not built:** advisory model scores never substitute for owner approval. No real model/provider performance or dollar cost is claimed. |
| Both new-business entries | Connected-site entry and paste-URL rebuild have separate release gates; hydration, retained saved work and failures are verified in the rendered UI. | Neither entry choice is promoted to production. |

## Exact remaining local blockers

1. **Native fact mappings (behavior 11).** The existing native services array
   includes booking links, images, marketing fields and stable service IDs.
   Business services have a different schema. Their imported `externalRef` is
   unscoped and non-unique; it is not a tenant binding. Copying the entire array
   would discard approved data or target the wrong service. Define explicit
   per-site/per-service mappings, confirm which name/contact/service fields are
   connected, and wire every record mutation through the propagation adapter.
   The current app form edits name, phone, email, description and owner recipient;
   it has no services/address/hours entry. Name/services propagation is not
   implemented. Contact deletion/unconfirmed values remain manual review.
2. **Standing document auto-publish grant (rebuild spec §11).** Current SQL
   requires the owner's exact approved revision/hash; a new candidate clears
   approval, agent patches force review, and new copy claims require confirmation.
   Existing tenant auto mode is not a durable document-publication grant. Decide
   whether the owner grants bounded ongoing document publication, then implement
   and test that atomic grant/policy. First launch/domain changes remain owner-only.

These are code/product prerequisites, not production-only smoke tests. This
stream therefore **does not claim strict A** across all four specs. No larger
future was silently activated to erase these boundaries.

## Flags and defaults

Existing `STRELVA_WORKSPACE_RELEASE`, `STRELVA_SYSTEMS_RELEASE`,
`STRELVA_WEBSITE_REBUILD_RELEASE`, `STRELVA_CONNECTED_SITES_RELEASE`,
`STRELVA_MAKE_REAL_LIVE` and their existing per-business/channel release rows
remain required and off by default. Connected sites and rebuild entry stay
independently switchable. Missing release/read infrastructure fails closed.

New round 1–5 enable switches are disabled unless explicitly `1`;
`MODEL_MAX_CALLS` is the separate numeric cap:

| Switch | What it enables | Additional gate |
| --- | --- | --- |
| `STRELVA_WEBSITE_MODEL_CALLS_ENABLED` | Paid rebuild/composition and Jev risk/verification calls | Current rebuild release and membership; durable per-work allowance; provider credentials. |
| `STRELVA_WEBSITE_MODEL_MAX_CALLS` | Call-count ceiling when model calls are enabled | Defaults to 48; integer 1–64; failed/concurrent calls consume allowance. This is not a dollar budget. |
| `STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED` | New candidate read bindings and hosted public fact projection | Current serving tenant's rebuild release, issued bindings, publication/workspace match; confirmed public facts only. |
| `STRELVA_WEBSITE_NATIVE_FACTS_ENABLED` | Business details contact-save review preparation | Systems release, owner/operator authority, active linked native site/subscription, current content manifest, no existing draft and durable dispatch claim. |
| `STRELVA_WEBSITE_DOMAIN_EMAIL_ENABLED` | Domain proposal/routing messages | Existing global, customer and per-tenant email gates. |
| `STRELVA_WEBSITE_REPORT_EMAIL_ENABLED` | Website monthly report mail | Existing global, customer and per-tenant email gates. |
| `STRELVA_CONNECTED_SITE_EMAIL_ENABLED` | Connected-site inquiry notices | Existing global, customer and per-tenant email gates. |

No new default send. Native fact review/operator events only persist locally in
this implementation path; they have no automatic email dispatch.
`STRELVA_UI_PREVIEW=1` is a local fictional-data preview switch only.

## SQL and operations

Additive migrations in the assigned website timestamp range, all with
`lock_timeout` and corresponding `supabase/migrations/rollback-*.sql`:

- `20261010110000_website_cutover_undo.sql`
- `20261010113000_website_system_releases.sql`
- `20261010114000_website_domain_requests.sql`
- `20261010115000_website_model_admission.sql`
- `20261010115500_website_business_facts.sql`
- `20261010115700_website_native_fact_reviews.sql`

115500 adds only a service-role RPC that reads confirmed public facts of the
actual active hosted publication. 115700 adds a service-role RPC-owned review
ledger: one attempt per tenant stable ID/record revision; claimed or uncertain
attempts block automatic dispatch, and accepted business saves remain accepted.
Its SQL fixture and rollback/reapply both passed against isolated Postgres.

Readiness retains integration's missing-table detection fix and adds the
website table sentinels/flags. Function-only 115500 needs schema migration
history to prove application; a table sentinel cannot prove that function.

Existing `website-health`, `website-domain-verification`, `connected-sites-purge`
and website report scheduling are reused. No new cron or deployment registration.

## Verification — local only

| Command / scope | Actual result |
| --- | --- |
| `pnpm typecheck` | Passed, exit 0; route types generated and `tsc --noEmit` completed. |
| `pnpm lint` | Passed, exit 0; existing generated-types Babel size notice. |
| `pnpm check:boundaries` | Passed, exit 0: 204 existing workspace→lib imports in 93 files, 44 older boundary imports; baseline unchanged. |
| `pnpm test` | First full run: 697 files passed, 2 failed, 1 skipped; 6401 tests passed, 2 five-second timeouts, 37 skipped. Final `pnpm test --maxWorkers=4 --testTimeout=30000`: **699 files passed, 1 skipped; 6404 tests passed, 37 skipped** (6441 total), 56.06 seconds, exit 0. |
| `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql` | Passed, exit 0, including workspace/customer/inquiry isolated suites and all six website migrations. Final workspace cluster preserved at `/var/folders/0t/9xnfycn50vd2yv5gb7p4cdsh0000gn/T/strelva-workspace-sql.weHTbw`; stopped, no production connection. |
| `pnpm check:custom-repos` | Passed, exit 0: **196/196** checks. Read-only compatibility check; no client repo edits. |
| `pnpm build` | Initial compile passed but TypeScript cache write failed with `ENOSPC`. Final `NODE_ENV=production pnpm build`: passed, exit 0; optimized compile 22.6 seconds, type checking and static generation completed. Explicit production mode also removes the inherited development-mode warning. |
| Website UI fixture suite | **10 passed**, 15.2 seconds; 1280, 390 and 320 px, both entries, saved errors, crawl omissions, permission, exact History restores, plus empty/loading/error/permission states. All nonlocal requests blocked in browser tests. Screenshots in `output/w6-website-proof/ui/`; desktop/mobile inspected. |
| Focused code proof | Initial 565 tests/65 files passed; hosted facts/service/System projection 84/4 passed; native final focused 42 passed; risk/verification 39/3 passed; domain outcomes 54/5 passed; connected consent 46/6 passed. Counts overlap and are not summed. |

Failures preserved: resumption first found a missing discriminated-union guard
in a History test; fixed and typechecked. First targeted run had two stale mocks
for the moved shared health module; repaired. UI initially had 3 hydration-race
failures and 7 passes; a fixture-only readiness marker produced the final 10/10.
The new hosted SQL test initially ran after the destructive cutover-undo fixture
and could not find its publication; reordered before undo and the whole suite
passed. Boundary checks first found product-internal imports and a new lib type
import; replaced with public entries and the existing port's inferred type.

Full-suite five-second timeouts: approval/color on the default full run; the
four-worker rerun then had 9 timeouts in approval, route handlers, website
connections and session-outage tests (6394 passed, 37 skipped). An unchanged
single-worker approval/color rerun with `--testTimeout=30000` passed all 13.
The final full bounded rerun passed with four workers and a 30-second timeout;
no repository timeout or test assertions were relaxed. A preceding bounded run
exited 1 with zero-test-file failures during machine disk exhaustion; the build
explicitly reported `ENOSPC` while writing its TypeScript cache. Only this
worktree’s generated `.next-w6-ui` and `.next/cache` were cleared before retry.
The final hosted-hours correction has a further 42/2 focused tests and typecheck
pass, and actual renderer output (current facts, dated exception, timezone) was
inspected at 1280 and 390 px in the collaborative browser. Its temporary static
proof is at `/var/folders/0t/9xnfycn50vd2yv5gb7p4cdsh0000gn/T/w6-website-rendered-gu8h3i2b`;
CSS loading was stubbed only for unused form components in that standalone
rendering script; the actual catalog CSS and `SiteRenderer` supplied the page.

## Production acceptance and integration handoff

Production remains untouched. Integration must review all prerequisite plus
website migrations and rollback order, reconcile these owned-spec deltas into
the canonical product model/capability ledger/vault, and add the new flags and
steps to the shared release packet. Shared launch docs were not edited here.

After Jacob explicitly authorizes the exact rollout and the horizontal release
checklist passes: apply migrations, deploy new environment switches with a new
production deployment, verify tenant zero's owner/workspace authority and public
publication/read-back, inspect factual read revision/fallback behavior, and
prove domain routing/undo on controlled infrastructure. Real model/media/provider
credentials and measurements remain required. Verify an actual connected-site
builder install, silent converted-client parity and sustained cron operation.
Owner invites and notifications remain deferred; keep all send switches off.
No price, performance, rebuild speed, measured cost or fallback-hosting economics
was established by local code/tests.

Exact next action: integrate/review this branch locally, resolve the two local
spec blockers before grading the whole Website area A, then prepare tenant-zero
acceptance. Canonical project-model/vault updates belong to the integration
coordinator because the canonical main-checkout state is outside this stream.

## Commits

Chronological since the branch base, including the recovered checkpoints:

- `a336805f` WIP checkpoint 1
- `86a1d03d` WIP checkpoint 2
- `58b5a838` Verify resumed release and domain boundaries
- `cff9cce2` WIP checkpoint 3
- `9784b986` Operator connected-site rollout authority
- `c0647978` Silent connected inquiry notices
- `77a26d1e` Explicit report mail rollout
- `971126a8` Retained skipped crawl pages
- `946199f9` Reviewed owner History restores
- `63c4e396` History restore composition at app edge
- `020cf149` Public observation of accepted native publications
- `bd973c2c` WIP checkpoint 4
- `2cc2083b` Consent revocation and private inquiry referrers
- `7687171e` Current visitor capability authority before linked publication
- `975270bb` Failed explicit-publication read-back reaches operators
- `5ea89fd5` Hosted domain checks retained after connected rebuild
- `83606829` Integration missing-table readiness fix retained
- `5c6a5f83` Truthful cutover-undo attestations
- `4a2cdb91` Business-fact and domain Connection contracts
- `64a48768` Durable uncertain domain outcomes
- `0e5e4477` Bounded Jev risk/verification for reviewed patches
- `4a8a7d5b` Hydrated entry-control UI verification
- `1bf8a1cb` Immutable hosted fact read bindings and truthful Connection evidence
- `41cc8e9c` Durable native contact review preparation
- `e9f4dac2` Native SQL/readiness registration and product boundaries
- `ddb9c5fa` Dated hours and timezone preserved in public fact bindings

The final owned-spec/handoff verification commit follows this list.
