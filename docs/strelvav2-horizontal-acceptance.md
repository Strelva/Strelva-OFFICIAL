# strelvav2 horizontal acceptance

## Self-service website implementation follow-through

After the review below, Jacob instructed the team to implement the missing flows.
Five Luna agents continue at maximum reasoning effort: onboarding owns website
contracts, persistence and APIs; apps owns the editor; custom apps owns generation,
repository artifacts and launch adapters; delivery owns agency website drafting;
intake owns client inquiry/booking connections. The parent owns workspace routing,
auth return continuity, shared integration and acceptance. This is implementation
authority, not permission to deploy, migrate hosted data, send live messages or
select new commercial prices. The [product brief](./horizontal-product-brief-2026-09-11.md#self-service-website-implementation)
owns the intended customer behavior. The dated review below remains the baseline,
not the completion result of this new work.

September 20 local integration proof: a signed-in customer in a personal workspace
can create a website from a business name and description, view its actual HTML,
approve the saved preview, reload it and generate a changed version. The changed
version clears the earlier approval. Desktop (1440px) and mobile (390px) journeys
passed against real loopback Supabase Auth/Postgres, including stale approval and
unrelated-account rejection. The private preview is scriptless, permits only
same-origin framing and keeps page navigation within the selected revision.
The exported tar archive extracts and builds with the same saved content hash;
the built home page matches the exported preview bytes. Tests live in
`tests/website-creation-authenticated-local.spec.ts` and
`src/__tests__/website-preview.test.ts`. Logs: `/tmp/strelva-website-creation-check.log`
and `/tmp/strelva-website-all-focused.log` (six suites, 39 tests at this checkpoint).
These are local results, not evidence of hosted deployment or live booking.

The default generator currently creates a three-page website from the supplied
brief with empty unsupported business facts. A configured structured-model adapter
exists separately; the default path does not make paid model calls. Local launch
preparation saves a receipt for the exact approved downloadable project and permits
later revisions. It does not create a GitHub repository, deploy to Vercel or connect
a domain. The prepared state, reload, private download and subsequent edit passed
on desktop and mobile in `/tmp/strelva-website-preparation-browser.log`.
Candidates also retain renderer and complete artifact digests. Preview and export
reject changed rendering or generated runtime files instead of changing approved
files under the same content hash. The focused preview, route and interface suites
passed 17 tests in `/tmp/strelva-website-root-current.log` after this addition.

Public entry now preserves a prepared brief through local sign-in and creates a
website through the canonical service. A stable request identifier reopens the
same draft on retry. The public-brief journey and the marketing-to-Auth/Postgres
journey each passed; marketing's focused browser checks passed 3/3. The marketing
entry and its isolated production build are recorded in sibling draft PR #10 at
`c8d0b11`. Neither repository has deployed this website flow.

Website forms are selected explicitly from the customer's authorized managed
website bindings. The customer chooses an inquiry form and booking calendar,
regenerates the private preview and reviews the new revision. An empty new
personal workspace does not inherit a tenant or forms. Connection selection,
empty state and changed-approval behavior have focused tests; desktop and mobile
creation journeys passed with the empty state. Exported forms use the published
native inquiry and calendar contracts. Private previews do not submit forms.

Public booking receipts retain a durable request fingerprint and original slot
before a provider write. Repeating the same request returns its receipt; reusing
its identifier for different visitor or slot data is rejected. Pending receipts
expose a readback action, which reconciles existing native calendar evidence
without creating another reservation. Request identifiers persist across form
remounts. Receipt lookups follow the current tenant slug while retaining the
original booking identity and fingerprint. An uncertain cancellation retries only
through an explicit cancellation request after fresh event and receipt checks;
readback itself remains read-only. An accepted delete with failed readback is
not repeated. Existing receipt recovery remains available after revocation; new work
still requires the active native binding and published grant.

September 20 integration checkpoint: the coverage gate passed 456 Vitest files,
with 3,265 passing tests and one skipped test
(`/tmp/strelva-website-final-coverage.log`). The isolated
production build and 25 artifact tests passed; compiled preview/export traces
include both generated runtime files. TypeScript, ESLint, product boundaries,
ontology and shared version parity passed. Clean workspace SQL and ordered upgrade
rehearsals passed through migration `20260920123000`. These checks use local
fixtures and do not establish live calendar operation, hosted migration or
production release.

The fresh agency Auth journey passed on a dedicated local process at port 3291.
It exercises customer, agency and unrelated accounts, explicit draft permission,
native draft preparation, customer publication, revocation and rejection of
further agency changes. The retained rerun passed in 12.1 seconds
(`/tmp/strelva-agency-fresh-3291-capture-test.log`), with desktop/mobile captures
and trace in `/tmp/strelva-agency-3291-captures-1719/`. Fresh process isolation
was sufficient; no extra SQL grants or migrations were used for this rerun.
No production provider or customer data was used.
The native booking journey now passes against local Supabase Auth/Postgres,
loopback Redis and a synthetic Outlook adapter. It creates and publishes a native
inquiry, publishes an explicit booking grant, selects both forms in the website
editor, exports and builds that actual project, submits a visitor inquiry and
reserves, changes and cancels a booking. Owner-side inquiry and schedule reads
confirm the results. The proof caught and repaired a direct table read that
bypassed the offering store's supported RPC path. No table permissions were
expanded. Logs: `/tmp/strelva-public-booking-final.log` (one passing journey, 7.8 seconds).
The same run changes and cancels the reservation at 390px after confirming it
on desktop. Captures are `/tmp/strelva-native-booking-confirmed-desktop.png`
and `/tmp/strelva-native-booking-confirmed-mobile.png`. Rendered review found
unstyled visitor controls; the shared generated renderer now gives them the
existing site colors, full-width fields, visible focus and 44px minimum controls.

Fixture setup requires a local Redis REST endpoint for the governed publication
queue. Direct fixture tenant insertion and cleanup invalidate only that local
tenant cache. This avoids repeated tests reading the previous fixture's tenant
list. Native booking proof does not verify live Outlook or Google accounts.

Final public smoke in the isolated candidate checkout passed 94 cases with
215 explicit skips. Separate workspace acceptance passed 38/38 and owner/operator
surfaces passed 20/20. Public smoke used empty provider configuration and excluded the
unrelated temporary billing spec present only in the working checkout. Logs:
`/tmp/strelva-completion-public-smoke-gated-rerun.log`,
`/tmp/strelva-final-workspace-smoke.log` and
`/tmp/strelva-final-surface-smoke.log`. The separate authenticated website rerun
passed desktop and mobile 2/2 (`/tmp/strelva-final-website-ui-rerun.log`).

The four migration sources used by the local SQL checks are frozen at:

| Migration | SHA-256 |
| --- | --- |
| [20260920120000_websites.sql](../supabase/migrations/20260920120000_websites.sql) | `4ba720c088c78a40b8723246b42730f85b9f89c98f1f248624eb2e7d7568a2cc` |
| [20260920121000_agency_managed_website_draft_authority.sql](../supabase/migrations/20260920121000_agency_managed_website_draft_authority.sql) | `436fb9c854427a14c91a33ad73c5207542419f23c139aee82e1a485749b19fbe` |
| [20260920122000_public_website_bookings.sql](../supabase/migrations/20260920122000_public_website_bookings.sql) | `e7774fbead71c1dd2ae8c4b5c45cae80479ec30faae5ebb4ce0140dfc28b8066` |
| [20260920123000_public_website_booking_fingerprints.sql](../supabase/migrations/20260920123000_public_website_booking_fingerprints.sql) | `8193e2eef865c159af85c565b7c67b0b6f9d339fcb8997ef2411038918ca469e` |

## Website release review

Baseline judgment before the implementation above: ready for continued draft-PR
review, not ready to launch the complete public self-service website promise.
At that checkpoint, new-site creation, agency native website drafting and
representative website integration proof remained open. The implementation
record above supersedes this baseline where it supplies newer evidence.

Jacob selected the [website release focus](./horizontal-product-brief-2026-09-11.md#september-20-website-release-focus)
after reviewing the broader product and customer segments. Five retained Luna
agents at maximum reasoning effort now inspect the complete website journey.
The parent owns integration, commercial claim reconciliation and release proof.
These assignments do not establish readiness or authorize live actions.

| Owner | Review and repair scope | Required distinction |
| --- | --- | --- |
| `onboarding_completion` | New customer entry, account continuity, website creation/request/provisioning and preview | Customer-executable work versus operator delivery; public audit versus owned website |
| `apps_completion` | Existing website request, governed change, review, publication, history and recovery | Local provider fixtures versus verified live publication |
| `intake_checks_completion` | Website visitor inquiry, owner visibility, governed follow-up, booking and Checks connections | A workspace feature versus a connected website outcome |
| `delivery_completion` | Agency access, website delivery, customer approval, handoff and revocation | Website authority versus an unrelated application grant |
| `custom_apps_completion` | Website claims, pricing boundaries, customer agreements, migration and activation dependencies | Supported self-service promise versus unimplemented creation/import or unselected commercial terms |

Repairs must follow the existing native owners and proof requirements. Missing
major product paths return to the parent as explicit scope decisions. Preserve
existing completion work and customer behavior; do not create a parallel website
builder, publishing path or scanner to make the review appear complete.

The verified baseline is committed and pushed in draft PR #191 at `e5ec58bf`.
It includes the completion work below, before the website-specific follow-up
repairs. Both repositories now prepare `0.2.0` as Unreleased. Hosted results
must be checked against their exact revision.

Source review confirms a release-blocking gap for new-customer self-service
website creation. `/onboard` redirects to `/access-request`; intake stores a lead,
not a website. The temporary `website-request-draft.ts` handoff stores text in
session storage for an existing managed website. Operator provisioning prepares
resources around a separately built repository and leaves repository connection,
DNS, content and other setup as operator tasks. The starter supplies reusable
client behavior; the development preview is a synthetic fixture. Neither is a
public website creation journey. Existing-client readiness must not be reported
as readiness for that new-customer promise.

The entry review passed four public browser checks and a separate real local
Auth/Postgres existing-site assignment journey: member and wrong-business writes
were denied, owner/admin assignment succeeded, Settings links resolved, and exact
retries stayed idempotent. Logs: `/tmp/strelva-new-website-public-entry.log` and
`/tmp/strelva-existing-website-auth-3260-correct.log`.

A durable customer-owned website request, a repository/build receipt and a real
preview target are missing pieces of new creation. A request-only flow followed
by an operator build would make delivery trackable, but would still be assisted
creation. It must not silently replace the selected self-service direction.
Customer approval of a preview, production deployment and domain changes also
need distinct recorded authority. Existing draft/publish and signed client-preview
contracts can be reused after a real website exists; they do not generate it.

The first combined CI attempt found six inquiry API imports bypassing the
product's supported public entry point. The parent exposed the exit resolver and
its errors through `products/inquiries/server.ts` and routed those imports
through it. The existing boundary check then passed; four affected route suites
passed all 37 tests, and TypeScript passed. The refreshed isolated candidate
passed all 429 coverage-test files (3,104 tests, one skipped), the workspace SQL
gate and the complete ordered schema upgrade rehearsal. The later build and
browser results are recorded below. Evidence: `/tmp/strelva-website-boundaries-green.log`,
`/tmp/strelva-website-barrel-focused.log`,
`/tmp/strelva-website-barrel-typecheck.log`,
`/tmp/strelva-website-candidate-ci.log` and `/tmp/strelva-website-upgrade.log`.

That isolated candidate subsequently passed its production build, public browser
gate (93 passed, 206 explicitly gated skips) and workspace browser gate (38
passed). Surface smoke initially failed one of 20 cases because its analytics
assertion expected the older Google section instead of the current unconnected
state. Inspection of the rendered failure and `AnalyticsLiveView` confirmed
the current "Connect Google to unlock your analytics" state. The assertion now
matches that state; all 20 surface cases passed when repeated under the same
CI environment and synthetic tenant setup. The combined command therefore has
a recorded failed final stage followed by a passing focused correction, not a
single entirely green invocation. Logs: `/tmp/strelva-website-candidate-ci.log`
and `/tmp/strelva-website-surfaces-final.log`. Exact pinned-client compatibility
also passed 58/58 checks in `/tmp/strelva-website-client-compatibility.log`.
Subsequent website-review repairs still need their own integration verification.

The candidate checkpoint is `c09f8dd1`. Staging exposed trailing blank lines in
new files, including migrations `20260920070000`, `20260920070100` and
`20260920080100`. The follow-up removes only those trailing blank lines; SQL
statements are unchanged. The original local-applied hash manifest remains
intact, with before/after source hashes in
`/tmp/strelva-candidate-migration-whitespace.json`. The normalized candidate
passed a fresh complete ordered schema rehearsal in
`/tmp/strelva-website-upgrade-normalized.log`. No persistent database migration
was repeated for this formatting change.

### Website-specific follow-up

The existing-site review changed history recovery to save a draft, preserving
live content until the customer publishes. Native editing is available at a
phone-sized viewport. Focused storage/route tests and desktop/mobile browser
fixtures passed; fixture proof is not live website publication. Billing copy now
shows no subscription for an unconnected account instead of implying Growth at
$199/month. Existing active-plan prices and founder comp remain unchanged.

The standalone starter form now returns 503 when delivery settings are missing,
instead of acknowledging a message stored only in a log. Its documentation
separates legacy lead capture, native versioned inquiries and external booking
embeds. Availability in the starter does not establish installation in a client
site. The parent ran five affected suites: 34 tests passed in
`/tmp/strelva-website-followup-focused.log`.

Agency-specific native website draft preparation remains unfinished. Review
found missing current tenant-authority checks, exit checks and revocation-race
protection in the proposed implementation, with SQL and Auth/browser proof still
outstanding. That work is preserved outside the candidate at
`/tmp/strelva-agency-website-wip-1789931469`, with a hash manifest and gap
record. Generic agency assignments and delivery records do not establish website editing or publishing
permission. Publication remains on the existing governed tenant path.

The starter includes a versioned inquiry component and transport, but this review
did not prove it rendered on a representative client website. Native calendar
bookings are also not connected by `ScaffoldBooking`, which embeds an outside
booking page. Public website Checks accept one explicitly selected URL through
the canonical scanner; they are not automatically installed on every client
site. Additional intake proof passed 98 tests across nine files in
`/tmp/strelva-website-customer-activity-vitest-final.log`. A rerun against shared
port 3214 was not valid acceptance evidence: that server lacked the inquiry
release and local provider fixture configuration, and returned 500 during the
stranger-read check. The earlier isolated authenticated inquiry proof remains
separately recorded; no new live-provider result is claimed.

The parent then ran the complete `pnpm check:ci` on the isolated website follow-up
candidate: lint, TypeScript, boundaries, ontology, SQL, coverage, dependency audit,
build and all included browser gates passed in one invocation. Coverage passed
431 files and 3,112 tests, with one skipped. Public smoke passed 93 cases with 209
explicitly gated skips; workspace acceptance passed 38 and surface smoke passed
20. Three focused editor fixtures separately cover the newly added desktop
history, mobile editing and mobile permission recovery. Strict pinned-client
compatibility passed 58/58. Logs: `/tmp/strelva-website-followup-ci.log` and
`/tmp/strelva-website-followup-clients.log`. This candidate adds no migrations.
Hosted build and secrets checks separately passed for the earlier pushed
`e5ec58bf`; they do not establish hosted verification of this follow-up.

Additional regression tests then exercised missing-version, failed draft-storage
and denied-permission recovery, plus the actual copied standalone route's 503
response without provider calls or visitor-data logging. A test-only Vitest alias
loads the starter helper without writing temporary files into product source.
The final full unit run passed 432 files and 3,116 tests, with one skipped;
TypeScript and targeted lint passed. Logs:
`/tmp/strelva-website-followup-final-tests.log`,
`/tmp/strelva-website-followup-final-typecheck.log` and
`/tmp/strelva-website-followup-final-lint.log`. Only tests, test configuration and
documentation changed after the fully passing combined CI invocation.

## September 20 completion execution

Jacob requested TDD implementation of the completion plan with Luna agents at
maximum reasoning effort. Work starts from `484dd2c1`; the September 19 planning
changes in `todo.md` and this ledger are retained. The parent agent owns shared
workspace integration, migration ordering, combined verification and PR updates.
Each builder owns a bounded lane and reports observed RED/GREEN behavior.

| Implementation lane | Agent | Current assignment |
| --- | --- | --- |
| Native apps and bookings | `apps_completion` | Native apps and calendar lifecycle locally verified; now shared stopped-work interface and failure states. |
| Onboarding and account continuity | `onboarding_completion` | Onboarding and real local account continuity verified; now independent exit/export review. |
| Delivery | `delivery_completion` | Request-to-delivery composition, scope continuity and explicitly authorized local agency execution. |
| Intake, checks and billing review | `intake_checks_completion` | Inquiry, public website Checks and fractional billing verified locally; now final calendar response review. |
| Custom apps and customer exit | `custom_apps_completion` | Custom lifecycle and billing implementation handed off; now stop-work enforcement and retained export. |

Economics/billing and exit behavior continue in the existing agent lanes. The
remaining hosted/client/marketing preparation stays with the parent. They are
not complete merely because they are assigned in the plan. Agency
pagination is locally verified below. Jacob selected Outlook first, Google next,
and public website changes for Checks. Public
access remains the selected direction. Paid terms, live actions and deployment
remain separate from local implementation.

Jacob subsequently selected subscriptions with included usage, with prices and
included quantities still unset. The selected customer-exit behavior is to stop
future work and retain records for export until explicit deletion is requested.
These are implementation decisions, not evidence of completed billing or exit
flows. No automatic retention deadline or live billing action is authorized.

The shared candidate version is now `0.2.0` in both repositories, with matching
Unreleased changelog headings and marketing lockfile metadata. Version parity
passes from the canonical sibling checkouts. This prepares the candidate; no
release tag, merge or deployment is implied.

### Candidate integration evidence

The parent reran the full unit suite during integration: 425 files passed,
3,063 tests passed and one test was skipped. TypeScript checking passed. The
ordered database upgrade rehearsal also passed with the current migration tail,
including exit, export v2 and fractional provider receipts. These are interim
results; subsequent review fixes still require the final combined gate.

Marketing version `0.2.0` passed its optimized build, all 76 production Chromium
checks and all three development-only study checks. Separate app tests exercised
fresh local email authentication, account continuation from a second marketing
origin, invitation acceptance and returning to saved work. The fresh-account
proof seeds the selected customer workspace; it does not establish unattended
production signup or hosted provider behavior.

The parent also repaired callback origin selection so a loopback Host header
cannot replace a hosted callback origin. The regression failed before the fix;
seven callback cases and 55 focused authentication/routing cases passed afterward.

The parent independently repeated both fresh-account paths after the callback
repair: direct public continuation and the marketing composer on a second origin.
Both passed using local Supabase email authentication and the configured loopback
callback host. A localhost mismatch and a development cache crash were resolved
before the passing run; no hosted authentication result is claimed.

An isolated CI run exposed inherited environment assumptions in two older unit
test files. Their setup now explicitly isolates the legacy bypass variables,
and nine focused cases pass with the primary flag disabled, including its
precedence over an enabled legacy flag. The synthetic surface-smoke subprocess
now explicitly selects its own primary bypass variables. Public and workspace
gates continue to disable bypass.

Four older preview browser files lacked their explicit opt-in flag. They now
use the same development-preview gate as the other preview tests. All eight
journeys passed separately with preview enabled, covering inquiry editing,
rehearsal, publication, portfolio continuity, mobile navigation and public brief
continuation. This separates public smoke from preview evidence without removing
the preview acceptance cases.

### Pinned client compatibility checkpoint

The parent created isolated detached worktrees of the exact manifest revisions:
GLDF `fd088c507bcdaec82257c34ddff1b1f94c72fd34` and Rohlax
`00e4323a9a93029070e802f9da0345cc441b6f59`. Existing client checkouts were not reset
or edited. Executable platform compatibility and structural client checks passed
with exact revision and clean-source checks enabled. The new strict release mode
first failed for a wrong revision, local source edits and a missing checkout;
the four focused cases then passed, including a clean exact revision.

GLDF's `pnpm check` passed lint, TypeScript, 9 test files / 55 tests and its build.
Rohlax's `npm run check` passed TypeScript, its 54 structural checks and its build.
These runs had no production provider credentials and used loopback content URLs.
Rohlax's structural check is not an executable storefront journey. Live domain,
mailbox, Stripe and deployment acceptance remain unverified. GLDF's separate
`check:prod` was not run: it includes an external database rate-limit mutation.

The strict release-check change is pushed as `cab66b0d` in draft PR #191. Its
pre-push TypeScript check passed from an isolated checkout, and the hosted build
and secrets checks passed for that exact revision. The concurrent product
completion changes are not part of that hosted result. No merge or deployment
was performed.

A follow-up, pushed as `59d29399`, fixes isolated-checkout selection for the command-line gate.
`CUSTOM_REPO_CHECKOUTS_ROOT` selects tenant-named folders without falling back to
ordinary client checkouts. Its selection regression failed before the change;
20 focused release/manifest/contract tests and TypeScript checking passed after
it. The CLI passed all 58 checks against the exact isolated GLDF and Rohlax
revisions. The only generated client change, Rohlax's Next route-type import,
was restored inside that temporary checkout before this strict check.
Hosted build and secrets checks also passed for `59d29399`.

### Agency client coverage checkpoint

The agency queue now pages through all clients named by active work delegations,
with at most eight workspace reads per page. Each read uses the existing access
check and filters to the exact shared work. Other pages are explicitly outside
the current check; an unavailable client stays visible. Previous/next controls
reuse the shared Button primitive.

The later-page behavior test failed against the first-eight implementation and
passed after adding bounded offsets. The browser journey then failed because
page controls were absent and passed after composition. Eight focused unit
cases and desktop (1440px) / phone (390px) journeys passed, including keyboard
activation, later-page failure, and return to the first page. Rendered states
were inspected. This proves local pagination, not hosted portfolio operation.

### Billing display checkpoint

A failed payer-history read previously displayed both an error and a claim that
no successor payer existed. It now shows the failure with a retry control and
withholds that claim and the proposal form until history is known. An empty
allowance response now states that no allowance is recorded, without presenting
a free plan. Both browser regressions were observed failing before their fixes
and passed afterward. A separate business-switch journey confirms that the old
payer disappears while the new business's history is pending; that journey
already worked and required no additional implementation.

This closes those display defects only. Subscription entitlements, trusted
provider-cost reconciliation and selected paid terms remain separate from this
display proof. On the current candidate at `http://localhost:3214`, the direct
customer allowance view rendered at both 390px and 1440px without horizontal
overflow. The compact state says “Billing details are not available yet.” and
contains no dollar amount, free-plan claim or plan amount. Current captures are
`/tmp/strelva-billing-allowance-current-mobile.png`,
`/tmp/strelva-billing-allowance-current-desktop.png`, and the full workspace
renders at `/tmp/strelva-billing-workspace-current-mobile.png` and
`/tmp/strelva-billing-workspace-current-desktop.png`. The text and copy check is
`/tmp/strelva-billing-current-capture.log` and
`/tmp/strelva-billing-copy-check.log`.

The three billing browser cases in the existing workspace-release spec passed
against that candidate: unavailable payer history keeps the retry state,
empty allowance records explain billing status without implying access, and a
business switch clears the previous payer while the next history loads. The
exact output is `/tmp/strelva-billing-workspace-release-current.log`. The
broader preview spec reached the allowance assertions but failed later on its
unrelated Explore-offerings heading, so it is not counted as billing evidence.

The dashboard Plan panel was also rendered against real local Supabase Auth and
Postgres rows on the local Next host at port `3240`. At both `1280x900` and
`390x844`, an unconnected account showed “No subscription connected” and “Not
set up”, a canceled account showed “No active subscription” and “Canceled”, and
an active Presence account showed “Presence · $99/mo” and “Active”. The exact
authenticated browser output is `/tmp/strelva-billing-ui.log`; the six captures
are in `/tmp/strelva-billing-ui/`.
These are isolated local fixture records and do not establish hosted billing,
Stripe state, or a production deployment.
A follow-up waited for stable geometry after changing viewport size: the initial
183.92px blank rail was a frame during the existing 180ms navigation transition,
not a persistent mobile layout failure. At 390px all three states settled at
`mainLeft=0`, `mainWidth=390`, `navigationWidth=0` and `scrollWidth=390`.
The authenticated check passed in `/tmp/strelva-billing-ui/stable-proof.log`;
replacement captures use `stable-{none,cancelled,active}-{mobile,desktop}.png`
in that directory. No product source changed for this verification.


### Subscription lifecycle checkpoint

Configured subscription allowances now read current Stripe item-level billing
periods as well as older payloads. Differing item periods remain unresolved
rather than selecting a period arbitrarily. Expanded checkout, subscription
updates, cancellation, invoice parent subscription identity and the trialing
invoice case are covered. Trial-to-active changes preserve the same allowance;
past-due recovery reopens that period without replenishing used units or
discarding cap acceptance. Missing configuration remains unavailable and does
not infer grants, a cap or a price.

Trusted receipts bind the gateway request to the exact admitted execution,
reject a mismatched execution, settle once, and return the existing result on
replay. The focused billing suite passed 17 files and 136 tests; its exact log
is `/tmp/strelva-billing-focused-current.log`.

The isolated billing fixture proves the decimal and retry boundaries. Two
provider-reported `$0.006` receipts retain the exact amount, settle one whole
cent and retain `0.2` cents. Replaying the second receipt adds no receipt and
does not advance the remainder. A following one-cent admission is rejected
against the two-cent cap because the retained fraction counts. A job without
an allowance retains the same exact evidence and aggregate remainder. Two
`strelva_retry` receipts use a separate accumulator, settle one Strelva cost
cent with `0.2` retained, and leave customer `used_cents` and reservations at
zero. Active recovery after `past_due` reuses the original allowance with its
accepted cap, grants and consumption count intact. The SQL fixture is
`tests/work-economics-billing-schema.sql`; the repository run is
`/tmp/strelva-calendar-802-workspace-sql.log`.

Migrations `20260920080000`, `20260920080100` and `20260920080200` were applied
only to the synthetic local database. Their SHA-256 values are retained in
`/tmp/strelva-completion-local-migration-shas.json`; the precise-receipt
migration is `c9847b9f6abb84961228d4b0a3cec21bf7e21afa291700d6560f17cdea753bcf`.
Prices, included quantities and customer-facing cap values still require
commercial selection; the cap values above are synthetic fixture terms. This
proves local parsing, exact receipt accounting and lifecycle recovery, not live
subscription provisioning, collection or production billing.

### Native app completion checkpoint

APP-02, APP-03 and APP-04 are implemented locally. Recipient grants explicitly
choose no editing, own records or all visible records. Corrections retain record
revisions, append-only history and idempotency receipts. Conflicting edits preserve
the draft and require a fresh revision; revoked and foreign access are rejected.
Date-only fields validate real calendar dates and remain YYYY-MM-DD values through
publication, recipient use, release changes and rollback.

The app agent reports 15 focused Vitest cases, 5 browser UI cases and 2 real local
Auth/Postgres cases passing. Root's isolated SQL aggregate includes the new edit
fixture and both application migrations. Migration hashes match the versions
applied to local Supabase. No provider or production operation was performed.
The same Luna agent proceeds to Bookings with Jacob's selected order: Outlook,
then Google Calendar.

Independent review found that a recipient allowed to read shared records but
edit only their own still saw Edit on other people's records. The projection now
exposes edit revisions only for records within the edit grant. The focused
regression failed before the fix and passed afterward; six focused tests and
desktop/phone keyboard journeys passed. Shared records remain readable. Both
rendered states were inspected, and scoped authorization still rejects direct
attempts to edit another person's record.

Two further correction regressions failed before repair: cancelling an edit
reused the old record ID for a new submission, and forms with read-only list
fields submitted those fields outside their write scope. The renderer now starts
a new identity after cancellation and submits only form fields. An isolated SQL
regression also demonstrated that corrections erased values outside the form.
Additive migration `20260920010200` preserves those values, still permits clearing
optional form fields, and records the complete corrected values in history.
Out-of-form writes remain denied. The expanded SQL gate, 12 focused tests, all
9 recipient UI checks and both real local Auth journeys pass. The new migration
was applied only to synthetic local Supabase; the earlier migration stayed
unchanged.

### Intake, Checks and website history checkpoint

The intake agent reports 9 focused files / 87 tests, the one-URL website UI
journey, and the joined real local Auth/Postgres/Redis follow-up journey passing.
External sends and public-page responses use explicit local provider fixtures.
Public website checks establish a baseline, compare subsequent server-visible
page evidence, and retain unavailable/recovery outcomes. Empty server-visible
text does not become an unchanged result.

The parent also exercised the real read-only adapter against `https://example.com`
on September 20. It returned available server-visible text (125 characters) and
a content fingerprint with paid diagnostic keys absent. That proves one public
network read; change detection, scheduling and recovery retain their separate
controlled-test evidence.

Independent website-history review replaced empty fallbacks with explicit
unavailable states, including strict optional reads in the existing event and
scan stores. Legacy callers retain their existing read behavior. The new
request reference uses nullable `content_versions.request_id`, rather than a
synthetic content-field change. The mapper regression failed before this repair
and passed after it; real content fields named `_request_id` remain content.
Thirty-six focused tests and the ordered full-history migration rehearsal pass.
The new column was applied only to synthetic local Supabase. A real local Auth
owner journey verifies unavailable history and keyboard reload at desktop and
phone sizes, preserving the selected request in the URL. No scan or provider
write is triggered by opening history.

### Integration checkpoint in progress

The custom-application owner reports a passing real local Auth/Postgres journey:
create an authorized draft, build in restricted Docker, review the exact artifact,
release to a named recipient, use its interaction at desktop and phone sizes,
build/release a second version, retain the recipient's pinned first-version grant,
and roll back. Eleven focused Vitest tests and the isolated SQL lifecycle fixture
pass. The separate construction check exercises a working shift-hours calculator,
keyboard use, bounded output and restricted build access.

This is an operator-authored frontend artifact lifecycle. It does not establish
arbitrary backend generation, durable records entered inside an artifact, or a
commercial Custom Software offering. The browser proof covers blocked outgoing
links, fetches and external scripts. The standalone recipient parent adds a
scoped `frame-src 'none'` policy that blocks direct `location.href` and
meta-refresh navigation before a local target receives a request; Chromium does
not enforce the artifact's `navigate-to` directive by itself. The management
preview lives inside the shared SPA workspace, so it does not add a persistent
document policy that would survive a view change and affect unrelated iframes;
direct self-navigation there remains an operator-reviewed limitation. The
release remains an operator-reviewed frontend artifact boundary, not a general
sandbox platform. Economics integration continues with the same agent after
the bounded review follow-up.

Onboarding now opens through the common workspace route and native discovery,
with saved-work naming and a return callback. The neutral module sits inside the
existing navigation and main landmark. A browser regression first failed because
the route opened the assessment surface; the joined shell check now passes.
The onboarding owner subsequently completed the local Auth and document
lifecycle, including original-file downloads with byte/hash verification and
private response headers. Existing general documents can be attached at an exact
revision; later edits require reattachment and review. The owner reports 11
focused tests and an ordinary-customer local Auth/Postgres phone journey passing,
including outsider denial. Unsupported extraction remains explicit; no OCR or
external extraction provider is claimed.

Saved custom applications now select their native review surface in the shared
workspace instead of falling through to a generic result. The route regression
failed before integration and passed at 1440px and 390px afterward. Both renders
were inspected; the unavailable response remains visible inside one main
landmark. Keyboard retry at both sizes issues a fresh read without falsely
continuing the loading state. The authenticated release journey also keeps
local interaction working while direct `location.href` and meta-refresh
attempts receive no loopback request under the parent policy. This does not
advertise raw-source authoring as a finished customer offering.

The ordered full-history database upgrade rehearsal passed with all six
September 20 migrations. The isolated workspace gate also passed recipient edit
and onboarding behavior fixtures. Adding the custom-application lifecycle fixture
then exposed a mismatch with the existing budget creation contract. The additive
economics migration resolves
that mismatch, and the expanded aggregate now passes the custom lifecycle,
recipient edit and onboarding fixtures. The original six migrations and three
subsequent attachment, agency-access and economics migrations were applied to
the synthetic local Supabase stack, with their file hashes retained for
comparison. No hosted migration was performed. Calendar migration installation
also passes in the isolated aggregate; its connected behavior remains in progress.

An isolated checkout of marketing commit
`89eb9ee428f772519b1af9d2dae284e8cdc41b76` passed lint, TypeScript and production
build. Its complete browser suite produced **61 passing and 20 failing checks**.
Those failures referenced superseded homepage artwork, tabs or development
studies. The marketing owner reconciled the assertions with the selected spacious
homepage and reports all 76 production browser checks passing, plus the three
unchanged development-study checks in a separate suite. The parent inspected
the complete test diff and desktop/phone renders. Account continuation in this
marketing suite still uses a mocked app response; real Auth continuity is a
separate active lane. The canonical marketing checkout and its untracked
workspace configuration were preserved.
The test reconciliation is committed as `9f96440` and pushed to draft marketing
PR #10. The canonical marketing branch was fast-forwarded without changing its
untracked workspace configuration. No hosted checks are reported for that
marketing branch; its passing evidence is local.

A fresh local Auth/Postgres website-assignment browser journey passed after the
shared workspace changes. It covers business/site identity, owner and admin
assignment, member and foreign-business denial, Settings links, and exact retry
without duplicate bindings. This verifies assignment continuity only, not a
governed website edit, domain handoff, or live customer submission.

## September 19 product remediation assignments

Jacob requested implementation orchestration with the explicitly invoked
`tdd` skill and Luna agents at maximum reasoning effort. The work starts from `cf8c5d71` in draft PR #191.
The table distinguishes assignment scope from local proof and release approval. Preserve the full horizontal direction; staff requests remain a
regression journey rather than the whole product strategy.

Each implementation slice must record its observed failing behavior test, the
fix, passing focused tests and any remaining integration or provider proof.
Prefer public interfaces and real collaborators. Test doubles belong at external
boundaries; passing fixtures do not establish real provider operation. Root owns
integration, the combined checks and this evidence record. Agents do not commit
or change deployment settings independently.

| Task | Agent | Scope and acceptance | Dependency / state |
| --- | --- | --- | --- |
| R1 Navigation continuity | `navigation_tdd` | A pending business switch survives subsequent navigation and stale responses; connected work URLs survive reload and sign-in without stale offering parameters. | Local race, late-save, agency handoff, read-only context and history browser checks pass. |
| R2 Offering recovery | `offering_experience_tdd` | A conflicting update preserves the customer's input, reloads current state, and lets them review and retry without overwriting another person's change. | Local recovery implemented; real component tests cover conflict, failed refresh and stale responses. |
| R3 Coherent discovery | `offering_experience_tdd` | One customer discovery surface names outcomes and actual start/request availability; existing specialist products retain their distinct behavior. | Mounted in Layout; focused tests and desktop/mobile preview journeys pass. |
| R4 Outcome entry and Home | `entry_home_tdd` | Multi-part intent survives entry and existing planning; Home emphasizes actual work and next actions without inventing business metrics. | Local slice implemented; focused behavior and browser tests pass. |
| R5 Delivery visibility | `offering_experience_tdd` | Home distinguishes requested, accepted, revoked and customer-review states from actual delivery records and shows unavailable evidence honestly. | Local summary implemented and tested against the existing delivery endpoint contract. |
| R6 Immediate service request | `service_request_tdd` | A customer can save a request before installation; requests retain scope and eligible provider choice without implying acceptance, price, authority or execution. | Local customer save/reopen/edit and agency/Strelva review inboxes implemented; SQL and focused UI tests pass. |
| R7 Offer completion task map | `offer_modules_plan` | Split Apps, Intake, Bookings, Onboarding, Checks, Websites and commercial behavior into independently testable slices with source owners and dependencies. | Task map recorded; BOOK-01/02 implemented and locally verified. |

The later slices must explicitly cover recipient app editing and practical
fields; inquiry installation and delivery recovery; real calendar lifecycle;
document collection and onboarding completion; defined live-source checks;
managed website continuity; and horizontal payer, usage and subscription
behavior. Existing engines should be composed before new stores or runtimes are
introduced. Provider choice, commercial terms and customer prices are not
selected by this assignment.

### Local implementation and verification

The first batch implements R1–R6, APP-01 and BOOK-01/02. R7 records the remaining
work with owners and dependencies. The queue below still distinguishes unbuilt
local behavior from provider and commercial proof; this is not a completed
horizontal-product or production-release claim.

Observed regression checks cover a pending workspace switch reverting to the
old workspace, stale save callbacks and agency inbox responses, conflicting
offering edits, and recipient projection rejecting the newly supported choice field. The fixes preserve
existing workspace, installation, request, reservation and record identities.

The complete unit suite passes: 402 files, 2,929 tests passed and one skipped.
Local lint, TypeScript, production build, product boundaries, ontology, version
parity, isolated workspace SQL and the ordered full-schema upgrade rehearsal
pass. The new migrations remain unapplied to hosted or production databases.

The affected browser suites finish with all 50 cases verified: 49 passed in the
combined run; the remaining topology test passed after its stale heading
expectation was corrected. Both `STRELVA_UI_PREVIEW=1` and
`STRELVA_WORKSPACE_RELEASE=1` were enabled, with no skips in that run.
Browser proof includes Home and multi-outcome entry, unified discovery,
read-only and agency navigation, delayed responses, and desktop/mobile request,
application and scheduling surfaces. Real local Supabase Auth/Postgres journeys
separately prove:

- Owner option editing, rehearsal, publication, recipient submission, compatible
  addition, rejection of a used-option rename, and record-preserving rollback.
- Scheduling create/read/reserve/cancel/reschedule, conflict rejection and retry
  identity through the actual `/api/bounded-work` route.
- Customer service-request save/reopen/edit, preserved scope/context/provider,
  agency review, rejection of stale review, acceptance of the exact revision,
  and customer history through the actual request route and Postgres store.

The service-request test cleans up its own synthetic workspaces and request
receipts. None of these checks establishes live model, calendar, email or other
provider operation, hosted acceptance, or human product approval. Existing
production activation restrictions remain in force.

### Subsequent task queue

The remaining work is split by customer behavior below. Queued means an
assignment exists but its implementation has not been verified. An external
proof requirement does not block unrelated local implementation. Use synthetic
data and the existing product seams for local work. Routine field or interface
choices can follow repository conventions; prices and provider commitments
cannot be invented.

Follow-up owners are `apps_fields_tdd` for APP, `offering_experience_tdd` for
INT, `offer_modules_plan` for BOOK, `entry_home_tdd` for ONB,
`navigation_tdd` for CHECK and WEB, and `service_request_tdd` for BILL. All use
Luna with maximum reasoning effort. Booking implementation and its real local
Auth/Postgres API journey pass. Follow-ups wait for the current slice's integration
review; an assigned task is not a claim that an agent is executing
it already.

| Task | Customer behavior and first proof | Implementation owner / dependency |
| --- | --- | --- |
| APP-01 | Publish a choice field, submit a valid option, reject an invalid option, and preserve records through updates and rollback. | Local implementation, SQL and real local Auth/Postgres owner-to-recipient lifecycle passed; projection compatibility regression passes. |
| APP-02 | Edit an existing submitted record under an explicit grant; reject a stale revision and preserve correction history. | Locally implemented September 20: explicit none/own/all edit grants, record revisions/history, idempotent correction receipts and stale-draft recovery; SQL, browser and real local Auth proof pass. |
| APP-03 | Store and reopen a date-only field without timezone conversion. | Locally implemented September 20: calendar-valid YYYY-MM-DD values across owner/recipient/SQL and release paths. Date-time and booking actions remain separate. |
| APP-04 | Reopen the same published app from Home and connected work after publication and rollback. | Local authenticated reopen, release and rollback proof passes with existing records retained; hosted activation remains open. |
| INT-01 | Set up the existing inquiry workspace through its offering while retaining the production release gate. | Installation now binds the customer business to the existing inquiry workspace behind the release gate. Focused and local Auth proof pass; no new inquiry engine. |
| INT-02 | Complete intake, assignment, reviewed response, follow-up and failed delivery recovery in one local journey. | Joined local Auth/Postgres/Redis proof passes due follow-up, reply recheck, attempt limit, handled suppression, read-back failure, recovery, replay without duplicate sends, undo and reload. Provider transport is simulated. |
| INT-03 | Verify actual authorized outbound delivery and recipient response. | Intake external proof after INT-02; requires named recipient and provider authority. |
| BOOK-01 | Exercise scheduling create/read/reserve/cancel through `/api/bounded-work`. | Service, browser-fixture and real local Auth/Postgres API lifecycle proofs passed. |
| BOOK-02 | Reschedule a local reservation, reject a conflict, and make retries preserve one reservation identity. | Local rescheduling, retries and conflicts passed focused tests and the real local Auth/Postgres API journey. |
| BOOK-03 | Connect calendar availability, confirmation, reschedule, cancellation and reminders to one actual provider. | Outlook-first adapter, connection refresh, availability, confirmation, reschedule, cancellation and recovery are locally verified through fixture transport and real local Auth/Postgres; Google follows the same contract. No live OAuth, provider write, reminder or production proof is claimed. |
| ONB-01 | Track customer, employee or supplier requirements with missing, supplied, correction and accepted states. | Local lifecycle, revision/history and reviewer controls implemented; focused tests, SQL, and authenticated supplier and ordinary-customer phone journeys pass. |
| ONB-02 | Attach an existing document revision to a requirement; preserve what was reviewed when the document changes. | Exact uploaded and general-document revisions can be attached. Later general-document changes require reattachment and review; immutable uploads remain protected. Focused and local Auth proof pass. |
| ONB-03 | Upload a synthetic file, reopen it through the authorized workspace, and preserve its requirement provenance. | Private uploads up to 2 MB retain original bytes and provenance. Authorized original downloads verify their bytes/hash; unparsed formats can be reopened. Local Auth and outsider-denial proof pass. |
| ONB-04 | Extract proposed information from a document, let a person correct it, and recheck requirements. | Local text/CSV/JSON parsing, manual correction and reviewed acceptance implemented. Other formats explicitly report unavailable extraction; paid OCR and live communication remain unverified. |
| CHECK-01 | Reopen a scheduled saved-source comparison with source versions, changes, no-change and unavailable states. | Durable missing, inaccessible and changed-source outcomes preserve prior evidence and support retry. Local investigation and standing-execution recovery tests pass. |
| CHECK-02 | Read one defined external source with freshness, failure and recovery evidence. | One URL is monitored over time through the existing audit reader and scheduled investigation engine. Local proof covers baseline, unchanged, price changes without score changes, unavailable/recovery and limited server-visible text. No rendered-browser page coverage is claimed. |
| WEB-01 | Preserve site/request identity through request, proposal, review, result and history. | Governed event references flow into published versions; request history retains proposal, decision and outcome stages. Root repaired provenance storage and unavailable states; provider writes remain unverified. |
| WEB-02 | Reopen the dated canonical site check and history without implying a new scan. | Dated canonical history reopens through the existing store without triggering another scan. Strict reads expose unavailable storage; real local Auth desktop/phone retry proof passes. Hosted scans remain separate. |
| WEB-03 | Prove new-customer setup, domains and client-repository continuity. | Website external proof after WEB-01; requires a selected customer/site and deployment authority. |
| BILL-01 | Display only known payer, allowance and billing-mode facts, including unavailable values. | Commercial follow-up, queued; reuse existing authorities and Settings rather than another billing store. |
| BILL-02 | Apply a selected subscription entitlement once, preserve existing jobs' payer, and handle out-of-order events. | Commercial integration; exact entitlement terms must be selected before expected amounts can be tested. |
| BILL-03 | Reconcile a provider receipt to the exact work once; retain unknown costs as unresolved. | Commercial integration; extend existing evidence handling after a real receipt contract is available. |
| BILL-04 | Prove one-off payments, existing subscriptions and grandfathered agreements remain distinct. | Existing billing-mode guard and related tests cover these distinctions. Preserve this regression at the release revision; do not treat it as missing billing implementation. |

The source survey is retained in
[`output/product-remediation/offer-module-tasks.md`](../output/product-remediation/offer-module-tasks.md)
as working detail, not as a separate product contract. The queue here excludes
the survey's unrelated site-provisioning repair from the current feature batch.

Code and draft PR preparation remain separate from production activation.
Preserve the existing deployment hold. No live migrations, messages, payments,
provider writes or release flags are authorized by local implementation proof.

Updated: 2026-09-18. Jacob requested the full horizontal vision, running locally,
with tested customer journeys and production kept off. This expands the earlier
[first slice](./horizontal-first-scope-2026-09-11.md); it does not discard its
permissions, storage, compatibility, or proof requirements.

## Product promise

A person brings a business goal and the context they have. Strelva helps them
choose a useful starting point, proposes what it will create or change, rehearses
the result, and operates approved work within explicit limits. The same work can
move between self-service, Strelva assistance, and an outside agency. Customers
retain their records, decisions, and history.

The foundation works across industries. Internal R&D develops industry knowledge
and proves offerings against customer outcomes, human effort, and cost. A working
demonstration is not proof of saved money or a supported offering.

## Current acceptance gate

Jacob's September 15 direction authorizes the business and offering topology in
the [product brief](./horizontal-product-brief-2026-09-11.md), including connected
offerings, shared context, operational assignments, agency participation and
usage controls. The September 14 application lifecycle below remains a required
regression. Adding output types does not compensate for an incomplete owner
experience. New topology work is under local implementation and review; earlier
proof does not cover it.

### September 15 implementation and remaining work

| Area | Current local work | Still requires proof or implementation |
| --- | --- | --- |
| Installed offerings | Customer-workspace installation record, native resource references, configuration, retirement and server-authored entrances; default staff-request draft creation and dual-owner website binding pass isolated SQL checks, including rename, revocation and tenant deletion; route-shaped browser setup and lost-response retry pass; direct website assignment now passes an isolated local Auth/Postgres browser journey | Coordinated native configuration and provider acceptance remain open |
| Context | Shared bounded preparation for selected planning sources and granted work context; likely-secret redaction is defense in depth | Live connectors, automatic source selection with explicit use authority, and general business knowledge |
| Assignments | Explicit accepted assignments to run approved finite work using current identity and native permissions; independent review, isolated SQL, command tests and three route-shaped desktop/mobile browser tests pass, including expiry before effect, exact-claim recovery and retry cases | Real local Auth/Postgres browser execution; outside-guest least-privilege native writes, paid delegated work, provider service commitments |
| Allowances | Configured period/unit allowances, payer cap acceptance, operator-awarded contribution credits, explicit subscription entitlement projection and trusted provider receipt settlement; isolated SQL, runtime retry tests and focused billing tests pass | Prices and included quantities remain unset; no royalties, live Stripe charging, provider quota enforcement or production activation; provider outcomes that remain unconfirmed require explicit reconciliation, while fractional receipts retain exact evidence and aggregate their remainder |
| Experience | Offering views, explicit website assignment, allowance summary, assignment links and accurate discovery state in the existing workspace; Home and Settings expose the same assignment command and remain useful without a website; desktop/mobile fixture journeys and the isolated local Auth/Postgres assignment journey cover permission denial, owner/admin success, native destinations and exact retry | Installation-scoped agency permissions, general branded portals and domain lifecycle |
| External AI | Personal integration token tied to its verified issuer, exact work and native read/propose grant; token lifecycle, bounded HTTP requests, bearer-route authentication and aggregate isolated SQL checks pass | Host-specific connectors, independent agent identity and broader execution |

This table is an implementation tracker, not a release claim. No migration has
been applied to a live database, and no customer price or allowance has been
changed.

Most September 15 browser proofs use explicit fictional request adapters; the
database checks use isolated PostgreSQL. On September 18 the website-assignment
journey separately passed against isolated local Supabase Auth and Postgres.
Other connected journeys retain their recorded limits. The operational
assignment Auth spec remains prepared but unexecuted. No live model or provider
call was made.

Shared capability contracts and execution remain in `src/platform/capabilities`.
Concrete product definitions now live in `src/server/capabilities.ts`; the old
platform definitions file was moved, not duplicated. The source boundary check
passes. Customer records were not deleted during this work.

Final September 15 local checks: 2,736 Vitest tests pass, one is skipped;
TypeScript, full ESLint, production build, product boundaries, ontology,
app/marketing version parity and the aggregate isolated workspace SQL checks
pass. Desktop/mobile fixture screenshots were inspected. This is local
implementation evidence, not launch acceptance or production verification.

Use a staff request application to prove: request → creation →
owner use and sharing → employee submissions → proposed change beside the live
app → exact review → publish → recovery → continued use. The owner sees what
exists, what will change and any ongoing behavior attached to the work. Existing
records and the employee's access must survive compatible publication and
recovery. Review must disclose actual changes and validated effects, not infer
that records are safe from a decorative summary.

Current local proof covers owner submissions while a candidate is edited,
recipient use, owner controls for fields and supported views, an exact
field/view/title/behavior review, owner publication, record-preserving rollback
and revoked access. An interrupted proposal save preserves the owner's inputs;
new fields receive new identities and existing field identities stay stable. Publish binds the displayed
candidate and live release versions and rechecks current records. The local
repair-request journey proves these mechanics. The
[request-to-application journey](../tests/application-request-authenticated-local.spec.ts)
also uses New, preserves a failed request for retry, creates the application,
publishes, shares with an employee and edits the application through owner
controls. Its planning response and saved plan are fixtures; subsequent actions
use real local Auth and Postgres. A real model request through the complete
creation path remains unverified. No production or human product acceptance is
claimed.

A real generation check needs the existing primary provider key,
`STRELVA_WORKSPACE_RELEASE=1` and `STRELVA_PLANNING_ENABLED=1`. Use one synthetic
request without source documents or fallback settings. The generation call has
a 20-second deadline, a 1,800-output-token ceiling and zero SDK retries. It now
requires a user-entered maximum and explicit payer acceptance through the shared
work-economics boundary. Unknown provider cost preserves the accepted maximum as
a visible hold and a durable receipt prevents replay. Verified-cost
reconciliation and provider quota enforcement remain unfinished. Provider use
is a separate authorized step and was not exercised here.

Jacob will repolish the interface after the connected behavior is in place.
Use existing components and focus this pass on functional review, publication,
sharing and recovery. Visual redesign is not part of this gate.

### September 18 acceptance increment

The following evidence was rerun locally on September 18:

- Entry routing recognizes ordinary application, scheduling, tracker and
  investigation paraphrases. Continuation actions and supported saved-work rows
  name their actual native destination.
- Home and Settings expose the same managed-website assignment command. The
  connected browser journey passed against an isolated local Supabase stack for
  owner and administrator success, member denial, cross-business denial, native
  settings destinations and exact idempotent retry. The stack was stopped after
  the run.
- The deterministic application review journey connects a prepared request to
  owner use, employee submission, exact candidate review, a second release,
  record-preserving rollback and revoked access. It does not exercise Auth or a
  model provider; those limits remain visible beside the separate connected
  tests.
- Model-backed planning now requires an accepted workspace-scoped economics job.
  The customer enters the maximum, the named payer accepts it, and the server
  records an unknown-cost hold without replaying a durable receipt. Verified
  provider-cost reconciliation is still missing.
- The standing-work scheduler passed authorized admission, duplicate-trigger
  replay, recovery after a lost terminal receipt and zero-cost accounting tests.
  Production scheduling remains off.
- `pnpm check:workspace-upgrade` applied the repository's ordered migrations
  from `20260729180000_org_layer_phase0_accounts.sql` through all current
  workspace/recovery migrations in isolated PostgreSQL. It preserved seeded
  tenant/content identity, enforced permissions and RLS, rejected unverified
  creation, and rejected a duplicate migration atomically.
- REB and marketing now use one Geist family at their foundation owners. Their
  field and tab primitives carry described-by/error relationships and keyboard
  tab behavior. This is named primitive adoption, not whole-product visual
  acceptance.

Focused verification passed: 104 Vitest cases across 16 files, 27 REB preview
browser cases, the application lifecycle fixture, the connected website
assignment case, two marketing design-stack browser cases, TypeScript in both
repositories, product boundaries, ontology, version parity, the aggregate
workspace SQL suite and the full-schema upgrade rehearsal. All evidence is local.
No production deployment, migration, provider call, customer charge or external
write followed from it.

### Visible preview review follow-up

The September 18 unavailable-destination defect is repaired. The joined preview
now opens one usable app after the exact setup retry, then verifies owner records,
scoped access, exact change review, publication of two releases, record-preserving
rollback, revocation and its declared reload reset. Two focused preview cases,
three application-use UI cases and eight application release/use unit cases pass.
The managed account website link also renders and navigates, but its generic
preview destination does not establish matching customer content.

The authenticated application-request and application-use journeys now pass
locally. The earlier mobile assertion measured a hidden inner navigation element;
the outer frame was collapsed and the inner sidebar was not visible. Tests are
being corrected to assert visible drawer behavior rather than a hidden element's
computed desktop width. This was an assertion defect, not evidence that customers
saw an open mobile sidebar.

### Additional connected proof, September 18

Against isolated local Supabase Auth/Postgres, the operational-assignment journey
passed explicit acceptance, scoped native execution, revocation, expiry and retry.
Two standing-responsibility cases passed distinct jobs, duplicate triggers,
lost-terminal-projection recovery with one effect, pause, cancellation, revocation
and retained history. The application-installation case also passed. Two runtime
defects were repaired: valid Postgres timestamp offsets are accepted, and a
committed assigned effect returns its durable result after its active lease clears.

The personal-agent Auth journey passed exact-work read/propose, wrong-business
denial, pending proposals without native mutation, token redaction and revocation.
It does not establish native third-party AI-host connectors.

The internal product-learning Auth/Postgres journey passed the ten-stage record
lifecycle, contrary evidence, independent build acceptance, source change/outage,
stale-revision denial, pause and revoked internal access. Evidence and participants
were synthetic. Collection was explicitly invoked after moving the isolated test
record's due time; no running production scheduler, real cohort or customer value
is claimed. Production access now requires `STRELVA_PRODUCT_LEARNING_RELEASE=1`
in addition to the workspace gate and verified internal access. It stays off by
default; no environment flag was activated in production.

The integrated unit rerun passed 2,820 tests across 382 files, with one intentional
skip. The ordered full-schema upgrade rehearsal also passed, including the new
provider-delivery and public-continuation migrations. Remaining agent changes
still require their focused checks and final integration. Connected inquiry,
public-account and provider-delivery journeys remain under verification; these
aggregate passes do not establish customer acceptance.

Jacob has paused generated visual studies and deferred UI/UX refinement until
functional journeys are in place. Existing components provide the interim
interface; permission clarity, accessible actions and recoverable failures remain
required for functional review.

## Completion contract

The [definition of done](./strelvav2-definition-of-done.md) now specifies the
proposed horizontal screen gate, local product gate, and internal product
learning loop. This ledger remains the current implementation inventory for
the twenty customer-product requirements; its R&D row does not stand in for the
ten new learning requirements.

## What 95% must mean

Earlier estimates of 40%, 55%, 64%, 85%, 95%, and 100% used different scopes or
unverified screen classifications and are not an audited completion measure.
Do not reuse them as measured progress. A directory with fourteen inquiry links
does not establish fourteen accepted horizontal screens.

The 95% target requires all core journeys below to work through authenticated
local adapters, with durable state and failure recovery. The remaining work may
be minor polish or separately authorized rollout. Missing execution, permissions,
data durability, cost enforcement, or whole capability classes cannot be counted
as the last 5%. Count demonstrated behavior, not routes, screens, code volume, or
unit-test totals. Hosted operation and customer value require separate evidence.

## Acceptance ledger

| Area | Required behavior | Current implementation and remaining work |
| --- | --- | --- |
| Surface topology | Public discovery, business work, direct application use, agency work and internal operations have connected entrances; personal AI uses the same exact work | The [shared sidebar](../src/experience/app-frame/StrelvaSidebar.tsx) connects Home, Work, Ongoing, People & access, and Settings, with separate utilities and personal Account. [Agency Home](../src/experience/workspace/AgencyHome.tsx) loads at most eight explicitly delegated clients, filters exact work IDs and opens the selected work; partial and failed loads are visible. [Internal work](../src/app/admin/work/page.tsx) connects existing delivery/support/development/cost controls without giving staff super-admin access. Public pricing/audit entrances are in the sibling marketing repository. Direct application use remains `/apps/[workId]`. [Business navigation](../tests/illustrated-home.spec.ts), agency, internal, and public desktop/mobile fixture checks pass, including mobile drawer recovery. [Focused Settings tests](../src/__tests__/workspace-business-settings.test.ts) distinguish loading, unavailable and confirmed-empty assignments. These are local surfaces, not production rollout or completed future offerings. |
| Starting | Useful examples and permitted context help people begin without knowing product names; a request produces an editable proposal before work starts | Result entry and native examples remain in one frame. Document drafting stays in place; website requests arrive as unsent drafts in the governed composer. App requests enter a reviewed native plan. [Interface](../src/experience/workspace/WorkspaceApp.tsx); desktop/mobile fixture journeys passed; Jacob review pending. |
| Planning | Plans name supported operations, dependencies, missing inputs, limits, costs, and decisions; unsupported requests cannot masquerade as executable work | Reviewed document, tracker and bounded application outputs use the atomic plan-output receipt. Planner choices and native execution share qualified, versioned operation definitions. Model generation now requires a workspace-scoped maximum proposed by the customer and explicitly accepted by its payer; unknown cost remains held and replay is refused. Accepted outputs pin their capability version and older v1 receipts still reopen. [Planner](../src/products/work-plans/server.ts), [registry](../src/platform/capabilities/registry.ts); local tests and authenticated native execution pass. Provider-cost reconciliation, a paid model trial, MCP entrance and common event/API dispatch remain open. |
| Shared work | Requests, plans, results, decisions, receipts and costs reopen at stable links in one workspace | Saved native results, proposals and responsibility history reopen in the same frame. Generated results link back to their exact plan. [Workspace](../src/experience/workspace/result.ts), [execution](../src/platform/work-execution/runtime.ts); local durable document journey passed. |
| Business home | Needs you, delegated jobs, changes, and live capabilities appear in order, with useful empty and error states | Saved results and recorded decisions take precedence. A multi-output plan remains until its saved outputs exist; returning Home reloads native state. [Projection](../src/experience/workspace/workspace-home.ts); browser fixture proof and human review pending. |
| Records | Lists and detail views support editing, history, filtering, adding records and scoped bulk changes | Native trackers support member assignments and exact related records alongside CRUD, grouped changes and Undo. [Coordination](../src/products/tracker/coordination.ts) checks membership, workspace and target revision at commit. Real local Auth/browser proof covers reopen, invalid assignees, stale links and Undo preserving later cell edits. Customer handoff clears source-workspace assignments and links. |
| Changes | Preview before applying; one grouped receipt and Undo; later records survive; conflicting edits are protected | Existing native document/tracker/inquiry revision checks and receipts remain authoritative. Shared execution records accepted or uncertain effects without reopening them to replay. [Runtime](../src/platform/work-execution/runtime.ts); concurrency, pause/cancel and unknown-outcome tests pass. |
| Interfaces | Forms, lists, detail views, documents, and pages use approved components and meaningful editable results | Native applications compose form/list/detail/document parts. Owners issue and revoke access; verified recipients use a focused app while a candidate changes. The [real local Auth journey](../tests/application-use-authenticated-local.spec.ts) passes with submissions, retry, publication, rollback and revocation at desktop and phone sizes. The recipient must already have a verified account. This app path supports reading and submitting records; editing existing app records and richer interactions remain open. No invitation email or public portal deployment was added. |
| Rehearsal | Stored tests rerun after relevant changes; pretend inputs and provider inboxes are visibly separate from real operation | Inquiry rehearsals remain; app schema/runtime checks bind the exact spec version and invalidate on changes. Native command tests cover document/record/schedule/investigation failures. This is not a universal external-provider rehearsal system. |
| Ongoing work | Explicit owner, worker, approver and next step; durable wait, resume, retry, pause and cancellation | Owner-approved responsibilities support ordered dependencies, durable waits, pause/resume/cancel, receipts and reconciliation. Standing saved-source checks create distinct jobs and runs; generic execution and recovery update the same results. The [local Auth/browser journey](../tests/standing-responsibilities-authenticated-local.spec.ts) covers create, approve, Run now, pause and reopen. Focused scheduler tests cover authorized interval admission, duplicate-trigger replay, recovery after a lost terminal receipt and zero-cost accounting. [Native runner](../src/products/operations/server.ts), [due sweep](../src/products/operations/sweep.ts). Current scope is saved-source comparisons, with no provider spending; background dispatch remains off in production. |
| Autonomy | Approved rules govern spending, publishing, messaging, deletion and access; revocation takes effect before a new action | Native approvals remain in their products. The shared runner rechecks membership, versions, cancellation and accepted budgets; accepted/unknown effects do not replay. Source selectors in investigations grant that native job access independently of contextual source grants. No general browser operator is enabled. |
| Collaboration | Customers and agencies share scoped work, request review, contribute safely and revoke access | Scoped expiring read/propose grants, attributable contributions, exact-version review and revocation work through [participation](../src/platform/work-participation/index.ts) and a dedicated guest entry. Real local Auth/browser journey passed. Accepting a contribution records a decision; it does not silently edit the native artifact. |
| Agency operations | Cross-client attention, client-specific access, reusable installations and clear maintenance ownership | Existing inquiry attention/read handoff remains. The [local Auth handoff journey](../tests/tracker-handoff-authenticated-local.spec.ts) now requires an explicit receiving business and tests recipient-bound reopening and revoked access. Scoped contribution review and reusable app installations add local breadth. Broader maintenance agreements, cross-client write delegation and operational service acceptance remain open. |
| Reuse | Install definitions without data/secrets/grants, pin versions, review updates, preserve local changes, rehearse and undo | Existing inquiry pattern updates remain. Application installations carry definitions and a pinned source release. The [real local Auth journey](../tests/application-installation-authenticated-local.spec.ts) passes across two independently owned businesses: private source records stay behind, target records and local title changes survive source updates, the old release serves until publication, and conflicting updates are rejected. [Application service](../src/products/applications/server.ts); no production rollout. |
| Connections | Each connection states permitted reads/writes, consent, freshness, failure and disconnect behavior | Existing tenant provider authority is unchanged. New context grants cover exact authorized SavedWork sources, versions, expiry and revocation. They are not universal OAuth connections or live calendar/browser permissions. External connection breadth remains a provider-integration gate. |
| Context | Sourced facts, corrections, preferences and procedures are inspectable; learned preferences cannot grant authority | [Work context](../src/platform/work-context/index.ts) stores sourced facts, freshness, conflicts, corrections and non-authorizing preferences; scoped source retrieval rechecks the grant in SQL. Current source adapters are workspace records. Automatic learned procedures and general cross-system memory are not claimed. |
| Economics | One explicit payer, estimate acceptance, enforced reservations, attributable usage, unknown costs, and no customer charge for Strelva-caused retries | [Runtime admission](../src/platform/work-economics/runtime.ts) atomically reserves approved funds, limits concurrent work, records measured/unknown usage, preserves unresolved holds and excludes Strelva retries. Native document execution exercised the accepted budget through real local Auth/Postgres. Planning now uses the same admission boundary with an explicit user-entered maximum and payer acceptance; unknown provider cost keeps that maximum held and a durable receipt blocks replay. Verified provider-cost reconciliation, provider quota enforcement and Stripe payment are not implied. |
| R&D | Same-workload candidate comparisons, versioned evidence, support-inclusive effort/cost, explicit qualification decision | [Internal learning](../src/products/product-learning/server.ts) implements the ten-stage evidence/decision lifecycle, scheduled registered-source collection, versioned briefs, independent build review and outcome-driven proposals. Local SQL/command/browser proof passed. Live interviews, actual cohorts, frontier trials and customer outcomes remain evidence gates. |
| Agent participation | Bounded agent identity, delegated scope, budget, task status, cancellation and attributable receipts | A sponsored verified account can receive a bounded agent-labeled read/propose grant, submit attributed work within its allowance, inspect its status and lose access on revocation. [Personal AI access](../src/experience/operations/PersonalAiAccessControl.tsx) exposes exact-work token issuance, one-time copying, expiry and revocation beside the work. The [browser fixture journey](../tests/personal-ai-access-ui.spec.ts) covers issuance, work switching, revocation and failed-list recovery at desktop/mobile sizes. Contributions do not become arbitrary execution permissions. This REST entrance is not a Claude/Codex/MCP connector or an unreviewed third-party runner. |
| Custom applications | Bounded generation, sandbox execution, test evidence, dependency management, deployment ownership and recovery | Outcome-driven plans create private fixed-part app drafts, then native checks gate installation. Versioning, records, reuse, rollback and retirement are implemented locally. A [restricted local container build](../scripts/check-custom-application-build.ts) also produced a working custom application, exercised at desktop and phone sizes. That build is not connected to application releases, customer authorization, budgets or deployment. Public deployment and live maintenance delivery remain unproved. |
| Large organizations | Organization policy, identity lifecycle, access review, audit/export, retention and operational requirements | Existing organization identity and workspace membership remain the authority. New work-level grants/history add local access review evidence. Enterprise SSO/SCIM, organization-wide policies, retention choices, exports and service terms still require the concrete offering/acceptance decisions; no enterprise acceptance is asserted. |

## Verification and authority

Local command, SQL, browser and real Auth/Postgres proofs now cover the bounded
horizontal implementation described above. This is still not unrestricted agent
execution, live provider operation, enterprise acceptance or proof of customer
value. Jacob's human review remains pending. No completion percentage is asserted.

Jacob's latest direction is implementation first, with behavior-first TDD at
the public command boundary and a small set of critical failure checks. Jacob
will perform end-to-end behavior review. Do not expand automated browser suites
or repeat broad checks to substitute for completing the product. Record this
manual review as pending until it happens.

Every completed entry must cite its implementation and successful user journey,
including the relevant denial, stale edit, retry, cancellation, and unavailable
state. Keep local simulation, real local Auth/database adapters, hosted staging,
real provider operation, and customer results distinct.

Use [the release checklist](./horizontal-release-checklist-2026-09-11.md) for
activation. No production deployment, migration, live message, paid provider
experiment, billing change, or third-party grant follows from this ledger.

The current branch remains `strelvav2`. Public branding and frozen compatibility
names remain as documented in [the internal release entry](./strelvav2.md).

## September 17 public-entry motion and continuity

The marketing homepage now follows Jacob's architectural reference and the
[accepted public-discovery direction](../DESIGN.md#public-discovery-into-business-home).
The [marketing implementation record](../../strelva-marketing/docs/design/architectural-landing.md)
tracks the exact local scope. Business entry, interactive sample Home,
opportunity previews, dismissal/undo, and the editable contact handoff remain
separate from live discovery or accepted service.

The continuation adds direct opportunity links and versioned tab-local drafts
that survive refresh and Back/Forward. Reset, malformed stored drafts, blocked
storage, and write failures have visible recovery. Navigation URLs contain
screen identifiers, not business text. Scene motion is pausable, stops when
hidden, and honors reduced motion; controls remain stationary after entry.

Local browser checks cover these paths at desktop and phone widths. The
marketing build, typecheck, and lint pass. This is public-preview evidence only.
Live research, supported provider connections, server-side retention, and exact
signup continuation remain unfinished. No checklist-wide completion or
production release is established.

## September 18 inquiry operation and economics evidence

The inquiry path now has one connected local proof from the portable
[`custom-repo-starter` client](../custom-repo-starter/inquiry-client.ts) through
the versioned public API into the canonical inquiry workspace. With synthetic
accounts and loopback-only Auth, Postgres, Redis and provider fixtures, the
journey publishes a rehearsed form, records a submitted customer request and
its timeline, assigns it to the authenticated staff member, exposes that
assignee on the record, verifies one governed reply through provider read-back,
records the handled outcome, and preserves the request and receipts when the
public form is undone. A second isolated request forces one provider read-back
failure after the fixture accepts its governed message. That accepted message
remains durably `accepted_unverified`, a duplicate approval is non-retryable,
and the fixture records one send for that request. This proves the bounded local
workflow and duplicate barrier; it does not prove a live website, live email
delivery, later clean verification of the faulted message, or use by a real
business.

This generic inquiry workspace is not evidence for the selected Mooney firm
handoff. That customer path is a direct website-to-Outlook delivery with an ADR
Notable firm-required step and only minimum received/attempted/delivered/failed
operational metadata. It must not inherit Strelva inquiry statuses or a retained
case pipeline, and it requires its own synthetic proof against the verified
customer form shape before any production claim.

The work-economics boundary requires a payer-authorized maximum before
admission. Atomic reservations prevent concurrent or duplicate execution from
exceeding that admission or charging twice. Trusted provider receipts bind a
gateway request id and exact provider amount to the admitted execution once;
fractional cents retain exact evidence while aggregate whole-cent settlement
keeps the remainder, and Strelva-caused retries use a separate accumulator
without customer spend. Unknown provider cost keeps the authorized hold
instead of becoming a fabricated zero. Accepted actions with an interrupted
settlement retain recoverable receipts and cannot replay the provider action,
while unauthorized and cross-workspace reconciliation are rejected. Current
native operations supply the concrete zero-cost evidence. The selected paid
model is subscription included usage through explicit server-configured
allowance terms, with prices and included quantities still unset; provider
dollars are not passed through to customers.
The local Stripe projection and gateway receipt adapter do not claim provider
quota enforcement, refunds, live charging, or production billing activation.

## September 18 provider-delivery acceptance and security evidence

A connected local journey now covers the supported internal Strelva delivery
path. It used loopback Supabase Auth and Postgres with three synthetic verified
identities, a synthetic customer workspace, an installed staff-request
application, and an operational assignment bound to that exact application.
The customer selected the approved assignment in the offering, requested
delivery, and saw that the request was pending and had not been accepted. An
active internal Strelva staff identity then accepted it explicitly, performed
the one allowed application rehearsal, and returned the result for customer
review. The customer exercised both changes-requested and confirmed decisions.
The customer request never changed provider state by itself.

The security review tightened the identity and authority boundaries in the
[provider-delivery migration](../supabase/migrations/20260918010000_provider_delivery.sql),
[delivery route](../src/app/api/offerings/provider-delivery/route.ts), and
[operations server](../src/products/operations/server.ts). A caller-provided
`strelva` label is insufficient: acceptance and execution require an active
internal `super_admins` identity plus current membership in the customer
workspace. Revoking that internal status blocks acceptance and the next action.
The installation must remain active, and the assignment must name the exact
native application recorded by that installation. A different application in
the same workspace is rejected. Stale revocation leaves the accepted assignment
unchanged; a current revocation updates the delivery and calls the canonical
assignment revocation in one database transaction. Accepted actor and time stay
in history after revocation.

The authenticated desktop browser covered customer request, provider
acceptance, assigned execution, customer review, stale revocation, successful
revocation, and an unauthorized workspace. The phone-sized authenticated view
at 390 by 844 CSS pixels retained the same lifecycle in one column; measured
document width was 390 pixels, so there was no horizontal overflow. Initial
request failures and delivery-load failures now remain visible without clearing
the selected assignment or making a false acceptance claim in
[the offering UI](../src/experience/workspace/WorkspaceOfferings.tsx).
Focused service, repository, route, and UI tests passed 10 cases. The isolated
workspace SQL and ordered upgrade rehearsals passed, including offset
timestamps, partial-acceptance recovery, exact-resource binding, independently
revoked assignment recovery, and revoked-after-accepted history.

This evidence uses the actual application source, local Auth, and local
Postgres. Fake repositories in focused tests supply deterministic retry and
failure injection; they are not the connected acceptance evidence. The only
supported provider is active internal Strelva staff using an existing zero-cost
native assignment. No external provider organization, provider onboarding,
price, payment, service level, response-time promise, commercial commitment, or
live customer operation was selected or proved. A provider-requested offering
record still does not create any of those commitments. The synthetic users,
workspaces, installation, assignment, and delivery were removed after the local
proof; no production system or external provider was contacted.

## September 18 public-brief account continuation follow-up

The bounded public-brief continuation now has a connected local Auth/Postgres
path for a newly confirmed account. The public intake retains the validated
brief in an encrypted, HTTP-only browser-session cookie and returns an opaque
account destination without putting private request text in the response or
URL. After sign-in, the account page establishes that person's personal
workspace, names the signed-in email, and requires the person to choose a
writable destination. Saving creates one native document with the exact brief,
opens that document, and resolves the same workspace and work IDs after reload
or an interrupted response.

The [connected browser case](../tests/public-continuation-authenticated-local.spec.ts)
uses real local Supabase Auth and Postgres. It checks a fresh personal
destination, exact saved document content, idempotent reload, a second confirmed
account that cannot see the title or request, and revoked membership that blocks
both import replay and saved-destination resolution. The
[isolated SQL case](../tests/public-continuation-schema.sql) also preserves an
importer tombstone when the saved document is deleted, so another account cannot
render or reimport the retained cookie. Direct table and function access remain
service-role only. Independent current-tree verification passed 32 focused
continuation, repository, Auth-callback, and workspace-location tests.

This transfers the bounded brief and local file names, not file contents. The
cookie has browser-session retention and no claimed server expiry. Anonymous
visitors are not identity-bound before sign-in, so the confirmed account and
explicit destination are the first ownership decision. This does not prove
general account export, account closure, business ownership, production
deployment, or recovery after the browser cookie is lost.

## September 18 payer-transition follow-up

The local economics boundary now supports an exact verified person as the
future payer without making that person a workspace member. A current business
owner proposes the account by normalized email. The addressed account sees the
proposal and bounded financial obligations in its personal Account surface,
but receives no business, saved-work, operational-history, or customer-data
access. Acceptance changes the payer only for jobs created after that accepted
boundary. Existing jobs retain their original payer, maximum, reservations,
unknown-cost holds, and unresolved actual cost. Every later job maximum still
requires the exact payer's separate acceptance before a current workspace
member can claim runtime capacity.

The connected
[payer-transition journey](../tests/workspace-payer-transition-authenticated-local.spec.ts)
used real loopback Supabase Auth and Postgres with synthetic identities, the
synthetic `Payer Boundary Workshop` business, one pre-transition unknown-cost
job, and one post-transition job. The owner proposed a verified account that
had no workspace membership. A different account was denied. At a 390 by 844
CSS-pixel viewport, the successor accepted from the personal Account surface
without horizontal overflow or business access. The test allowed the first
acceptance request to commit and return HTTP 200, replaced that response with a
synthetic 503, and then retried. The retry returned the same accepted transition
and timestamp. The successor accepted the new job's bounded five-dollar
maximum through the financial-only route, and the owner then claimed one dollar
of runtime capacity. The original ten-dollar job remained bound to the owner
with its two-dollar hold and unresolved actual cost. Removing a proposing owner
made that owner's later pending proposal stale, and a payer-only account could
not read the underlying operations resource.

The durable rules live in the
[payer-transition migration](../supabase/migrations/20260918140000_workspace_payer_transitions.sql),
[transition service](../src/platform/work-economics/payer-transitions.ts),
[bounded route](../src/app/api/work-economics/payer-transition/route.ts), and
[personal Account surface](../src/experience/workspace/AccountPayerInbox.tsx).
The [isolated SQL fixture](../tests/workspace-payer-transitions-schema.sql)
covers exact identity, current-owner revalidation, ordinary-member privacy,
revoked identity, replay, old-job immutability, payer-only job acceptance, and
member runtime claim. The [workspace SQL gate](../scripts/check-workspace-sql.sh)
also runs both acceptance/create orderings and three-session same-actor
propose/create and accept/create races. Lock ordering is verified as actor row,
workspace advisory lock, then membership, transition, and job rows.

The connected browser case passed 1 test. Six focused payer, route, account,
and economics Vitest files passed 46 tests. TypeScript checking, scoped ESLint,
the full isolated workspace SQL gate, and `git diff --check` passed on the
tested local tree. Synthetic identities and rows were removed after the
connected case. This is local mechanism evidence. It does not establish a
production migration, live business use, payment collection, Stripe behavior,
provider pricing, refunds, notification delivery, or a general subscription
policy. The remaining full-product and production blockers elsewhere in this
ledger are unchanged.

## September 18 bounded workspace portability evidence

A current, verified direct owner can download one versioned JSON snapshot for
the selected workspace. The snapshot contains workspace identity, an explicit
allowlist of supported saved results and native application records, and
economics authorizations, reservations, usage receipts, and execution outcomes.
Unknown actual costs remain unknown rather than becoming zero. Its manifest
lists every included category and names the excluded or unavailable categories.
Credentials, connection data, access tokens, invitation tokens, request inputs,
idempotency keys, command digests, internal product-learning records, and
operator notes are outside this snapshot. Tenant-managed website data is also
outside it because this workspace authority does not establish tenant export
authority.

The [isolated SQL case](../tests/workspace-export-schema.sql) proves the exact
owner check, member and foreign/delegated-owner denial, denial after owner
removal, the explicit data projections, preserved unknown cost, and the two
megabyte output limit. An over-limit snapshot creates no success receipt.
Successful downloads create a metadata-only receipt with the requester,
workspace, schema version, byte size, category counts, and time; exported
content is not copied into the receipt. The
[connected browser case](../tests/workspace-export-authenticated-local.spec.ts)
used real local Supabase Auth and Postgres, parsed the downloaded artifact, and
exercised the owner, member, delegated-owner, and revoked-owner paths. The same
owner surface was rendered and inspected at desktop and 390 by 844 CSS pixels
without horizontal overflow. The isolated full-schema and ordered-upgrade
rehearsals passed with this migration in sequence.

This is a bounded current-workspace portability snapshot. It does not establish
complete account export, account closure or deletion, retention terms, managed
site export, provider handover, or production availability. The two megabyte
limit bounds the final JSON and receipt, but is checked after the database builds
the snapshot. Production-scale query memory and time limits remain unproved.

## September 18: Mooney native inquiry retry preparation

Jacob selected The Mooney Firm's existing website → structured inquiry → Outlook /
ADR Notable workflow as the first production acceptance case. Strelva must not
create a second case or inquiry pipeline. The current live contact form was
inspected read-only; its September 8 field contract includes optional organization,
a bounded administrative note and time-sensitive details. No live inquiry was sent.

Local client changes are isolated in `../../../mooney-native-handoff`, branch
`codex/mooney-native-handoff`, based on the canonical `mooney-firm-site` September 8
release. The canonical checkout's existing September 14 work was preserved.
The [client contract](../../../mooney-native-handoff/docs/product/adr-notable-implementation.md)
owns the native handoff and release conditions; client-specific implementation
remains outside this control plane.

Independent review accepts safe retry for one prepared submission. A signed,
payload-bound ticket expires after 23 hours and binds the delivery configuration.
Retries preserve the exact request and provider idempotency key. Expired tickets,
configuration changes and uncertain outcomes cannot silently create another send.
Only the outstanding receipt is stored in browser session storage; inquiry content
remains in memory during retry. Reload and unavailable storage lead to contact
recovery. Logs contain bounded execution metadata, not inquiry content. Provider
acceptance is labeled separately from destination delivery and firm receipt.

The client standard test command passes 15 handler tests, the normal Turbopack
production build and the runtime contact-route test. Typecheck passes; lint has
no errors and three existing proposal-script warnings. Mocked browser checks at
390 and 1280 pixels exercise acceptance, uncertain retry, reload, storage failure,
and a rejected retry after an uncertain first attempt. Root separately inspected
the 390-pixel reload recovery: no form inputs or send action, direct contact
available, and no horizontal overflow. All provider behavior used local mocks.

This is not a completed production handoff. Cross-browser or cleared-storage
repeat submissions are not deduplicated by this session design. Approved recipient
configuration, durable operational evidence and failure monitoring, abuse controls,
actual Outlook visibility, firm-specific ADR Notable forms and resulting records,
and firm use remain unverified. A generic Strelva inquiry test cannot close these
gates. No production environment change, deployment or vendor write was performed.

## September 18 integrated local verification

After the payer, invitation, public-continuation and workspace-export changes
settled, the combined REB working tree passed `pnpm lint`, `pnpm typecheck` and
`pnpm test`: 388 test files passed, with 2,845 passing tests and one skipped test.
The final production build also passed. It ran with a minimal environment and
no provider credentials, using `.next-integrated` to preserve the running local
review servers. Build-generated TypeScript include changes were restored.
These results apply to the local uncommitted working tree based on `a376d20`,
not to a deployed or immutable release revision.

Product boundaries, ontology checks, app/marketing version parity and all 54
representative custom-repository compatibility checks passed. The full isolated
workspace SQL suite and ordered schema-upgrade rehearsal passed after the export
corrections. Focused authenticated browser evidence and its provider/fixture
limits remain in the dated sections above. Earlier account-test fixture failures
were resolved before this combined run. Relative documentation links and
`git diff --check` passed.

This closes the named local verification pass. It does not close the full
production checklist, human acceptance, remaining product choices, external
provider evidence, or Mooney's live Outlook / ADR Notable acceptance case.

## September 19 draft PR preparation

[App draft PR #191](https://github.com/Strelva/Strelva-OFFICIAL/pull/191) replaces
the older #190 and targets `main` from `strelvav2`. The companion
[marketing draft PR #10](https://github.com/Strelva/strelva-marketing/pull/10)
contains the public-site candidate. Both retain package version `0.1.1`; no
release tag was created. Both proposed trees disable automatic Vercel Git
deployments, including after a later merge into `main`. Neither PR was merged.

Fresh checks found and corrected incomplete model-cost evidence context:
reconciliation now carries attribution, and planning supplies the authenticated
actor and workspace target. Focused tests check matching provider receipts and
reject mismatched identity, execution key, maximum or kind without settling the
held cost. The operational inbox now maps assigned work to the API's supported
`inbox` view, derives loading from the current request, and excludes aborted
responses. Its API imports through the product server entry. Two scheduler
recovery assertions now include the sweep's explicit empty failure list.

The combined local tree passed lint, product boundaries, ontology invariants,
version parity and 391 Vitest files: 2,872 tests passed and one was skipped.
The inbox tests render React in jsdom and exercise loading, denied-response
retry, assigned links and stale responses; they do not replace desktop/mobile
browser acceptance. Economics changes separately passed 27 focused tests and
TypeScript checking. The frozen lockfile check and redacted Git secret scan
also passed. Hosted CI, the current app production build, schema rehearsals,
and real-browser acceptance are not claimed by this preparation pass. Earlier
proof retains its recorded revision and environment.

Marketing separately passed lint, TypeScript, version parity and a production
build. Its targeted production-build Chromium run passed 45 of 47 checks. Two
checks still expect homepage artifact/tabs controls from an older composition;
they remain draft-readiness blockers. Account continuation in that browser run
used a mocked app endpoint. Neither local verification nor PR creation proves
production operation, live provider delivery, customer acceptance or adoption.

## September 19 staff-request journey and clean-checkout CI

Follow-up to the [module and PR audit](./strelvav2-module-map-2026-09-19.md), based
on PR head `396facf4137a83ff307f4ed1a059ca15ac7f98ec` plus this change. Installed
apps remain directly reachable in Home and Recent work. Offering details show
the connected work's title and an Open action through the existing native router.
Missing, unavailable, or mismatched-business work does not acquire an Open action.
The existing business navigation remains in place; Home / Work / Business is
still a proposal. Provider delivery setup is not simplified by this change.

The staff-request preview now retains its installed-offering record when views
remount. It remains fictional and resets on reload. The Connected work action
uses the owned Button primitive. Browser checks cover keyboard activation and
reflow at 320, 360, 768, 1280 and 1600 pixels; 360 and 1280 pixel renders were
visually inspected. This does not establish a full component migration.

The hosted TypeScript image-import failure was reproduced in a fresh archive
checkout without `next-env.d.ts`. Running Next type generation before TypeScript
resolved it. `pnpm typecheck` now generates these declarations, and CI invokes
that same command. Vitest now discovers `.test.tsx`, including six previously
undiscovered offering UI cases. One stale static-render assertion expected conditional
provider text before choosing a provider; its default-state assertion is now
accurate, while the browser test still selects provider responsibility and checks
the unaccepted-request explanation.

Local validation passed: 392 Vitest files, 2,878 tests and one intentional skip;
lint, TypeScript, product boundaries, version parity, and whitespace checks.
All 21 Home/workspace preview browser tests passed, including empty, unavailable,
read-only, reduced-motion, mobile navigation, return-path and retry states.
Two existing authenticated local application journeys also passed: request-to-app
with a prepared planning response, and recipient use with safe changes, rollback,
failed-write recovery and access revocation. Auth and Postgres were actual local
services with synthetic identities. The planning response remained a fixture.
No live model, calendar, email, payment, or deployment was invoked.

A third authenticated local browser test passed from the actual staff-request
offering setup: create the standard app, check and publish it, activate the
offering, grant a verified staff recipient access, submit on a phone viewport,
publish a changed field label while preserving the record, and reopen the app
from Home and Connected work. This journey uses no model response fixture.
Its uniquely named synthetic records remain in the isolated local database
because installation references restrict workspace deletion.

These checks prove the named local behavior. They do not establish hosted CI
success for the new revision, production schema readiness, a released horizontal
offering, human acceptance, or general provider delivery. The draft PR and
production deployment hold remain in place.

## September 20 agency authoring completion proof

The request-to-delivery path now reaches an actual bounded agency work outcome
for one installed native application. The [authenticated local journey](../tests/agency-application-authoring-authenticated-local.spec.ts)
uses real loopback Supabase Auth and Postgres identities for the customer owner,
the named agency operator and an outsider. The customer saves and accepts the
request, selects the exact accepted scope and native application resource,
names the operator, and creates the existing provider-delivery assignment. The
operator accepts the assignment and completes the native execution receipt.

Before the customer grant, the operator can inspect and rehearse the exact
application but cannot save a draft. The customer then grants draft-edit
authority for that application and operator only. At 390 by 844 CSS pixels the
operator changes a field label, submits with keyboard focus and Enter, and the
candidate revision and history are recorded. A stale expected revision is
rejected. At 1280 by 900 the customer reviews the exact diff and publishes
Version 2; the operator has no publish control. The customer confirms the
completed delivery, which links the delivery history to the request. An
outsider is denied, and revoking the grant denies the operator's next API write
and removes the save action after reload.

The final run passed one Playwright test in 9.8 seconds. Its log is
`/tmp/strelva-agency-authoring-final.log`. The inspected desktop and phone
captures are under
`/tmp/strelva-agency-authoring-final/agency-application-authori-ee244-it-for-customer-publication-desktop/`.
The focused delivery and application tests passed 7 files / 39 tests, and
`pnpm typecheck` passed. The isolated SQL fixture
`tests/agency-application-authoring-schema.sql` passed with the additive
authority fix; the run is recorded in `/tmp/strelva-agency-authoring-sql-check-30201.log`.

The authority contract is implemented by
[`20260920030200_agency_application_draft_authority.sql`](../supabase/migrations/20260920030200_agency_application_draft_authority.sql)
and its alias correction
[`20260920030201_agency_application_draft_authority_fix.sql`](../supabase/migrations/20260920030201_agency_application_draft_authority_fix.sql).
Their frozen SHA-256 values are `af89e348f6b0b109f64576afd4075a54d1eef7694b4dbb7d980cc14ed140f26a`
and `64aa72cae8bfbf1e5d52e1d83800553d0d4c2e9649985d747cc8f5f34898359a`.
The migrations were applied only to local Supabase; no production or external
agency system was contacted.

This proves one customer-approved agency operator can build and return an exact
native application draft for customer publication. The grant is revocable,
expires with the active delivery and assignment, and does not add customer
workspace membership or access to another resource. Local delivery remains
zero-cost rehearsal and execution; no rate, payment, service-level promise or
commercial commitment was selected. General agency portals, arbitrary backend
authoring, hosted provider operation and production release remain unproved.

## September 20 calendar and stopped-work completion proof

The Outlook-first calendar path now runs through one owned contract for
connection configuration, token refresh, availability, reservation sync,
reschedule, cancellation and recovery. Outlook calendar-view paging and
timezone normalization are covered; Google availability uses paginated event
data when an existing event must be excluded, so a self-overlap does not hide a
different busy event. Accepted, failed-readback and unknown outcomes retain the
provider event identity and stable idempotency key. A failed or timed-out write
remains recoverable evidence and is never blindly repeated.

The focused calendar suite passed 6 files / 48 tests, including connection
refresh and CAS races, route boundaries, Outlook paging/timezones, Google
self-overlap, reservation conflict and stopped-work cleanup. The isolated
workspace SQL and ordered-upgrade checks passed after the calendar and exit
schema changes; the final SQL log is
`/private/tmp/strelva-calendar-exit-final-verify.log`. The service review passed
16 tests in `/private/tmp/strelva-calendar-exit-service-final-verify.log`.

The [calendar Auth journey](../tests/calendar-exit-authenticated-local.spec.ts)
passed one Playwright test in 2.6 seconds against local Supabase Auth/Postgres
and a synthetic Outlook transport. It creates and confirms a reservation,
completes the workspace exit, proves new reservation and reschedule requests
are rejected, keeps availability/readback available, and lets the stopped owner
cancel the accepted event. A delegated reader remains read-only. The exact run
is recorded in `/private/tmp/strelva-calendar-exit-authenticated-3230-final.log`.
The retained calendar layout captures are `/private/tmp/strelva-calendar-desktop.png`,
`/private/tmp/strelva-calendar-mobile.png` and
`/private/tmp/strelva-calendar-mobile-calendar.png`; the Auth test's temporary
Playwright output was replaced by a later run, while its assertions remain in
the log above.

The [stopped-work Auth journey](../tests/workspace-exit-authenticated-local.spec.ts)
passed one Playwright test in 3.0 seconds. It exercises a transient exit-read
failure, keyboard completion, an HTTP workspace export response with a
completed lifecycle state, reopening the same workspace, disabled New/Resume/
Publish controls, retained records and a closed mobile menu. The exact run is
`/private/tmp/strelva-workspace-exit-ui-proof-final-fixed3.log`; the inspected
captures are `/tmp/strelva-workspace-exit-reopened-desktop.png`,
`/tmp/strelva-workspace-exit-reopened-mobile.png` and
`/tmp/strelva-workspace-exit-reopened-mobile-closed.png`.

These are local authenticated proofs with a synthetic provider transport. No
live OAuth, provider write, reminder, production migration, deployment or
external calendar account was used. Token refresh and explicit owner cleanup
remain available after exit; new work and rescheduling stay blocked, and
unknown outcomes retain their recovery path.


### September 20 hosted interface preview

The protected Vercel preview at https://strelva-app-staging-strelva.vercel.app
now redirects its root, sign-in, sign-up and workspace entrance to the existing
synthetic workspace. This requires both `VERCEL_ENV=preview` and
`STRELVA_UI_PREVIEW=1`. Production authentication and real API authorization
are unchanged. Jacob explicitly requested entry without staging database setup.

Deployment `dpl_H7F56mPZV8FDTfoQeCSSzVujEtds` contains the release candidate plus
the hosted fixture entry patch. Local validation: 45 focused tests, TypeScript
and scoped ESLint passed. Hosted browser checks passed on desktop and mobile:
sign-in reaches the synthetic workspace, the interface directory opens, and
agency and managed-website surfaces respond. No browser runtime exceptions were
observed. Rendered inspection found a missing decorative image in workspace home;
this is not a completed visual acceptance.

The preview uses fictional data and resets changes on reload. It establishes
interface access only, not Supabase sign-in, durable saves, live integrations,
billing or release readiness. Vercel team protection remains enabled.

## September 21 production preparation evidence

Observed September 21, 2026 EDT (September 22 01:20–01:30 UTC). Jacob authorized
preparation and required that no client site go down. No hosted migration,
configuration write, deployment, DNS change, billing action or provider message
was performed. Vercel reads, Supabase read-only SQL, a configuration dry-run and
low-volume public GETs supplied the hosted evidence below. Supabase CLI used its
normal temporary login-role initialization; submitted SQL explicitly opened
read-only transactions with finite statement timeouts.

The [release checklist](./horizontal-release-checklist-2026-09-11.md#september-21-production-preparation)
owns execution order, acceptance, stop conditions and recovery requirements.
This record separates observations from uncompleted production acceptance.

### Exact source and production artifacts

The candidate app is `9d5e877af89853fb6197db85235889a8eb0733ee`; marketing is
`029525e9130a368aefd83d9f3ce2971751622599`. Both are version `0.2.0`.
[App merged-commit CI](https://github.com/Strelva/Strelva-OFFICIAL/actions/runs/35668720566)
and security passed. [PR-head launch verification](https://github.com/Strelva/Strelva-OFFICIAL/actions/runs/35667702142)
passed its persisted-delivery and isolated Auth journeys. [Marketing merged-commit verification](https://github.com/Strelva/strelva-marketing/actions/runs/35668736611)
passed. These are repository/isolated evidence, not live delivery proof.

The existing CLI login `rhinehart514-5576` read team
`team_CXZExgSqBSV3zeOqPfmLcclS` (`strelva`). This supersedes the earlier connector
403 as an access blocker. No project link or Git integration was changed.

| Project | Observed production deployment | Source metadata |
| --- | --- | --- |
| `strelva-admin` (`prj_AzaQBS8jM9E5RVgHuMWnQju0GIxb`) | `dpl_Fq9bPeQbCXyG9BASDM2ZPYNwuXgJ` / `strelva-admin-n2ooddsde-strelva.vercel.app` | `7507748ba56c28663325a95b5551749e2a96c576`; **gitDirty=1** |
| `strelva-marketing` (`prj_rXjFhzPg23OGR9leQ3TMVq16IGwa`) | `dpl_8Uo7oaVYgNPYV7gvW9Tx6T3fDM8Y` | `abc5c69c1e96de2fdda5ecf18948e9361bdd226a` |
| `greatlakesdriedfruits` | `dpl_DfGh3dTeC8mscC5uWPikZN1pFkvj` | `a751d63d3d3e8f8495017970084054393096afde` |
| `rohlax-wellness` | `dpl_EEsPa5yxk1qE1C7YAUyXYSJRN2u1` | `9ed876b57ee7c7f922bfb3f75f01b26a71a38dcb` |
| `mooney-firm` | `dpl_HcdQVhZ7zYTFkE2eNoBnjsFsLxB1` | `af54ad7167d47de22d75ed87df0ae6034c1588e9`; **gitDirty=1** |

These are recovery candidates, not rehearsed recovery proof. Rebuilding a dirty
artifact's named commit does not recreate that artifact. The app project's Git
link still names `rhinehart514/REB`; the checked-out repository uses
`Strelva/Strelva-OFFICIAL`. Both candidates disable automatic Git deployment.
Prepare any eventual Git-link repair separately; do not reconnect automatic
production deployment while preparing the release.

The control-plane deployment has `app.strelva.com`, `admin.strelva.com`,
`admin.greatlakesdriedfruit.com`, `admin.rohlaxwellness.com`,
`www.rohlaxwellness.com`, `demo.scaffoldweb.com` and `*.scaffoldweb.com` aliases.
Therefore an app promotion can affect client hosts even when their own Vercel
projects are untouched. The project inventory returned 19 projects with no next
page. `attymooney.com` is not in the observed Mooney project's aliases; its
public site responded, but its actual hosting relationship remains unresolved.

### Database, configuration and recovery findings

Current Vercel production `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` both
resolve to `https://zthifbnrtsirdekzzlxs.supabase.co`. The corresponding Supabase
project is `scaffold-web`, healthy in `us-east-1`, Postgres `17.6.1.127`.
Current project configuration does not independently prove the August app
artifact's effective runtime environment. Source flags are currently configured
as `postgres`; secret values were not written to this evidence.

After Jacob authenticated the CLI, the catalog query read 21 recorded applied
migrations and 48 public tables. Compared with 82 forward candidate migrations:

- **62 candidate migrations are absent from recorded history**, from
  `20260905190000_release_one_workspaces` through
  `20260921220000_customer_business_entry`. The twelve required workspace/native
  relations checked by the target tool are absent.
- **One applied migration is absent from candidate history:**
  `20260802120000_report_snapshots`. Its stored statements create the immutable
  report table, its tenant/capture index, RLS and table comment. The observed SQL
  is retained for reconciliation, not submitted for re-execution or deletion.
- No same-version/different-name mismatch was found. This is not a complete
  schema-equivalence result. Columns, constraints, public function definitions/
  ACLs and table-size metadata were captured without reading customer content.
- Pending `20260920060000_content_version_request_id.sql` adds a nullable column
  and a **non-concurrent** index to existing `content_versions`. Its observed
  total size was 106,496 bytes with an estimate of 11 rows. That small sample
  does not remove locking risk or establish a zero-interruption operation.
  New foreign keys also reference existing `users`/`tenants`; rehearse their locks.
- Backup metadata returned `pitr_enabled=false`, `backups=null`,
  `physical_backup_data={}`, `walg_enabled=true`. This does **not** verify an
  available recoverable backup. No restore test or backup creation was performed.

The target checker returned `blocked`, with missing relations, unapplied
candidate history and unrecognized applied history. It correctly retained
`releaseApproved=false`. Its deployment mapping provenance remains qualified
as current project configuration rather than a proven effective runtime mapping.

Supabase `config pull --dry-run` reported `wrote=false`. Its supported-field diff
shows default auth site URL `https://scaffoldweb.com`, email confirmations on,
Google auth enabled, and redirects including `https://*.strelva.com/**` plus
legacy/client/local origins. Prepare an explicit canonical-app auth change and
verify callback/recovery before selecting it; do not remove existing customer
redirects by copying a local configuration. SMTP/mailbox delivery remains unproved.

Production project environment names include encryption, Stripe, Supabase,
Redis and grandfathering variables. The API did not expose effective values for
some settings, including grandfathering and governed-work flags; presence alone
is not verification. Workspace/background/inquiry release flags and audience
mail switches were not in the project-level production list. Shared/deployment
settings and runtime behavior still need verification before declaring defaults.

### Existing-client baseline and separate DNS defect

Read-only tenant routing metadata found 12 active and 2 inactive records. Active
IDs: `cocard-anderson`, `gldf`, `leslie-bookkeeping`, `mclears`, `orange-crate`,
`rhm-innovations`, `rohlax`, `spacejam-storage`, `strelva`, `twintrees-camillus`,
`twintrees-fayetteville`, `vermont-unlimited`. `demo` and `summit` are inactive.
Several active records lack a production domain. Reconcile their intended hosts
and dependencies rather than asserting they are unused. No owner contact data,
customer content or payment identifiers were exported.

A public GET sweep covered 34 explicit hosts (no wildcard enumeration, forms,
login submissions or authenticated cron calls). Thirty-three ended at HTTP 200;
one of those was Drover's Vercel protection login, **not an application pass**.
GLDF/Rohlax owner domains ended at their `/client/<tenant>/sign-in` pages.
Homepage responses do not prove assets, interactions, transactions or client
acceptance. No production browser journey or paid provider test ran.

`rohlaxwellness.com` returned 200, but **`www.rohlaxwellness.com` did not resolve**
(curl exit 6). Local DNS, Cloudflare `1.1.1.1` and Google `8.8.8.8` returned
`931bd7b36e7b2348.vercel-dns-017.com/.` as its CNAME target: a literal trailing
slash is present. Authoritative nameservers are `dax.ns.cloudflare.com` and
`vivienne.ns.cloudflare.com`. Vercel confirms the `www` alias belongs to
`strelva-admin`, has no configured redirect, and is DNS-misconfigured.

Prepared separate repair proposal: in the existing Cloudflare zone, replace
only the malformed `www` CNAME target with Vercel's current rank-1 recommendation,
`c51a194a5cafbd83.vercel-dns-017.com` (no slash). Before execution, confirm the
intended `www` page on that project, capture the complete current DNS record
including proxy status/TTL, and re-read Vercel's recommendation. Preserve the
apex and all admin/MX/TXT records. Verify authoritative and two recursive DNS
answers, TLS, expected page/redirect and both apex/admin journeys afterward.
If the intended website belongs to another project, prepare that distinct alias
operation instead of silently pointing `www` at the wrong application. This is
an existing defect, not a change caused by preparation; no DNS mutation occurred.

A TLS-verified request using `curl --connect-to` to test the recommended target
without changing DNS failed certificate verification (exit 60). Verification
was not bypassed. Certificate readiness and intended hostname routing therefore
remain part of this repair's preparation; a CNAME edit alone is not proven to
restore the HTTPS journey.

### New local verification and preparation-tool repair

The offline target check could not read this repository because it treated the
three retained rollback/verification SQL helpers as malformed migrations. The
repair excludes only those explicit helper filenames and continues to reject
unknown non-versioned SQL. Its new regression reads the actual repository
history; another verifies rejection of an accidentally unversioned migration.
No runtime, application, provider or customer behavior was changed.

- `pnpm test:workspace-target`: **27 passed**, no skips/failures.
- `pnpm typecheck`: passed (existing Sentry deprecation warning).
- Focused ESLint for the two changed scripts: passed.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade`:
  passed in an isolated Unix-socket PostgreSQL cluster, then stopped. This
  repository-history rehearsal omits production-only `report_snapshots`; it is
  not an actual-production-snapshot upgrade or old-app compatibility rehearsal.
- A separate isolated variant inserted the observed `report_snapshots` SQL
  before the workspace tail, seeded one synthetic report, ran the complete
  existing upgrade assertions, then confirmed that report survived. Passed and
  stopped its cluster. This narrows the unknown-history concern; it does not
  reproduce the live database, its traffic or the dirty production app artifact.
- Strict manifest client pins in isolated worktrees: **58/58 passed**.
- Isolated checkouts at observed live GLDF/Rohlax source SHAs: **54/54 passed**
  with pin verification deliberately off because those are not manifest pins.
  These checks exercise platform contract/structure, not each client's entire
  build/browser suite or all 12 active tenant journeys.
- `pnpm version:check`: both repositories `0.2.0`.

Sanitized local artifacts are in
`output/production-completion/launch-2026-09-21/`: Vercel inventory/project aliases,
public HTTP baseline, catalog/deployment mapping, target comparison, all 82
candidate and 62 pending filenames with SHA-256 digests, schema metadata,
observed report migration SQL, tenant routing, backup metadata, auth summary and
local check logs. They contain no authentication keys. Snapshots must be refreshed
before execution; they are not an approval packet or a production success claim.

Remaining execution blockers: Rohlax `www` repair acceptance; verified effective
runtime/store mapping; missing production migration source reconciliation;
old/new app compatibility and bounded-lock rehearsal against a representative
restored schema; proven backup/recovery; auth/email acceptance; all affected
client journeys; exact approved configuration and hosted artifact; bounded real
agency/provider acceptance; named operational monitoring/recovery ownership;
then app acceptance followed by marketing exposure. No blocker is waived.


## September 21 authorized remediation and recovery rehearsal

This receipt follows the user's instruction to make the prepared updates while
preserving every client site's availability. It supersedes the earlier
preparation status only for the completed actions below.

### Production change verified

Supabase project `zthifbnrtsirdekzzlxs` now uses
`https://app.strelva.com` as Auth `site_url`, replacing
`https://scaffoldweb.com`. A minimal isolated config declared only this property;
the push reported one update and the subsequent diff reported zero declared
updates. The twelve undeclared remote config differences were left untouched,
including redirects, Google, confirmation and MFA settings. The previous
single-property config was retained for reversal. This proves the configuration
change, not delivery of a live email or completion of a production login.

### Private backup and restored-data upgrade

A restricted local directory outside the repository holds logical schema, data
and role dumps for `public`, `auth`, `storage` and `supabase_migrations`. No raw
customer/Auth records or credentials were added to this evidence record.
The dumps restored successfully into an isolated PostgreSQL 18 cluster exposed
only through a local Unix socket. The cluster was stopped after verification.
All pending September migrations then applied successfully to that restored
copy. Before/after row fingerprints across 83 pre-existing tables found no
record changes; the migration tail added 65 tables. These are local recovery
and data-preservation results, not production migration or client-journey proof.

Limitations: production runs PostgreSQL 17; this is a local logical database
recovery point, not PITR or an off-device recovery guarantee. Storage metadata
is included but object blobs are not. Redis-authoritative operational state
still needs its own recovery evidence. The old deployed app has a dirty-source
marker; its exact behavior is not established by checking out its reported SHA.

### Source reconciliation and safer migration execution

Recovered `20260802120000_report_snapshots.sql` from the actual applied migration
statements and restored it to repository history. The ordered rehearsal now
includes this baseline and checks preservation of a synthetic report and RLS.
The pending content-version column change obtains its lock with `NOWAIT`;
its index is a separate concurrent migration with bounded lock/statement waits
and explicit index validation. No hosted migration history or schema was changed.
Current source inventory is 84 migrations, with 63 pending against the captured
21-entry production history; refresh live history before executing anything.

Verification: 27 target-check tests passed; TypeScript passed; the full isolated
ordered upgrade passed, including immediate column-lock rejection without schema
change, continued client write-lock acquisition while index construction waited,
valid index retry and rejection of an incompatible existing index. The actual
restored-data upgrade also passed as described above. Neither test establishes
zero downtime under production traffic.

### Remaining launch gates

Cloudflare sign-in and DNS repair authority were supplied by the user. Chrome
control subsequently failed with `Sky Computer Use native pipe closed before
response`, including after session resets. No DNS or alias change was made.
The malformed Rohlax `www` CNAME, intended project routing and certificate
readiness still require repair and HTTPS verification. The apex remains a
separate working route and must be preserved.

No production deployment, production schema migration, client-site rollout,
Stripe mutation or live application email was performed. Remaining gates are
working DNS/TLS, effective deployed runtime/store mapping, Redis/object recovery,
old/new client compatibility, auth/email journeys, exact release configuration
and hosted artifact, real agency/provider acceptance and monitoring ownership.
The launch remains blocked; no client-availability gate is waived.

Post-change HTTPS GET checks returned 200 for the Rohlax apex, GLDF public site,
both client admin sign-in destinations and `app.strelva.com`. Rohlax `www` still
failed DNS resolution. These are reachability checks, not authenticated journey
acceptance; the sanitized receipt is `post-auth-http-check.json` in the existing
local production-completion artifact directory.


## September 21 recovery coverage and compatibility follow-through

The user explicitly authorized recovery completion, safe pending migrations,
deployment/acceptance, and marketing exposure after production passes. The user
selected a controlled email recipient for live testing; its address stays out
of this public evidence record. No new production mutation has occurred in this
follow-through as of this receipt.

### Recovery and live target evidence

- Exported 644 Redis keys using read-only SCAN and per-key atomic DUMP/PTTL/TYPE
  plus logical-value reads. Restored every key into an isolated local Redis
  server with no TCP listener and compared all 644 logical values successfully.
  An RDB recovery artifact, original TTLs, capture timestamps and SHA-256 digests
  remain in the restricted backup directory outside the repository. The server
  was stopped. The initial serialized-byte comparison was not equivalent across
  Redis encodings; the successful check compares the actual restored values.
- This is an approximately 37-second rolling capture, not a database-wide
  atomic snapshot or PITR. TTL was disabled only in the isolated validation;
  recovery must preserve original expiry deadlines and omit expired entries.
  Never replay accepted provider actions or restore the full snapshot over new
  customer activity automatically. Provider-native backup/off-device retention
  remains a separate recovery gap.
- The configured Vercel Blob store listed zero blobs; Supabase Storage listed
  zero buckets. The database dump contained no direct Sanity CDN or Vercel Blob
  URLs. These findings do not inventory every static/external asset in all client
  repositories and do not establish a backup of arbitrary third-party assets.
- Current production environment export confirms the configured Supabase and
  Redis endpoints. Seven values are provider-redacted, including the encryption
  key, Resend key and grandfathered-tenant setting; `[SENSITIVE]` is a placeholder,
  not a usable secret or a verified value. No environment variable was replaced.
- Pulling environment variables for the READY production deployment failed:
  Vercel requires INITIALIZING state for that operation. Exact effective server
  configuration is not established by the current project export. Separately,
  13 deployed browser scripts expose the expected Supabase origin
  `https://zthifbnrtsirdekzzlxs.supabase.co`, and `/api/health` reports healthy Redis,
  Supabase, Stripe and Gemini dependencies. This does not reveal server secret
  values or prove customer workflows.

### Compatibility evidence

Vercel's deployed-file inventory contained 1,239 source entries. SHA-1 comparison
against the reported Git revision matched 1,208; the 31 differences were outside
application runtime source (local fixture/export/tool metadata). All deployed
`src/` runtime files and package configuration matched the reported source.
This narrows the dirty-source uncertainty; preserve the immutable deployed
artifact rather than claiming a rebuilt artifact is identical.

Compared a schema-only restore of the captured baseline with the upgraded
restored database. All 1,665 pre-existing catalog entries checked were unchanged:
column types/defaults/nullability/order, function definitions/ACLs, constraints,
RLS policies and table RLS/ACLs. There were 2,472 new entries. The earlier 83-table
row fingerprint comparison also passed. These are database compatibility checks;
they do not replace running both applications against the same isolated service
or authenticated customer acceptance.

The actual deployed GLDF/Rohlax source revisions again passed 54/54 structural
contract checks. Production read-only browser checks with GLDF passed five of
six cases: public rendering, mobile geometry and signed-out access redirects.
The same five read-only cases also passed against Rohlax.
The sixth expected the candidate's new sign-in wording and failed against the
older production page; it is recorded as failed, not waived or hidden.

### Execution remains gated

Chrome native control recovered enough to open a tab, but navigation was again
rejected because the active application changed. An isolated in-app browser is
unavailable. Rohlax's existing `www` DNS/TLS repair therefore remains unresolved.
Live controlled signup/email and agency acceptance are prepared but not executed.
No hosted migration, deployment, new release flag, marketing activation or email
was performed in this follow-through. Required next evidence: stable browser
access and DNS repair; effective critical settings/old-new hosted compatibility;
controlled authenticated acceptance; then app promotion and marketing exposure.

Clean-candidate follow-up: commit `b4b73f69` passed the 27 target-check tests,
typecheck, full ordered workspace upgrade and workspace/inquiry SQL checks.
The changes are isolated in draft PR #193; unrelated local edits were excluded.
All 24 public capability/content API reads across the 12 active tenants returned
200 JSON responses without an error envelope. These are baseline read checks,
not proof of authenticated writes or candidate production behavior. GitHub CI
was still running at this checkpoint; the secrets check had passed.

Clean-candidate follow-up: commit `b4b73f69` passed the 27 target-check tests,
typecheck, full ordered workspace upgrade and workspace/inquiry SQL checks.
The changes are isolated in draft PR #193; unrelated local edits were excluded.
All 24 public capability/content API reads across the 12 active tenants returned
200 JSON responses without an error envelope. These are baseline read checks,
not proof of authenticated writes or candidate production behavior. GitHub CI
was still running at this checkpoint; the secrets check had passed.
