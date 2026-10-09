# Prepared Home Finder and sandbox provider harnesses

These are source preparations, not provider execution, licensed delivery,
commercial qualification or permission to spend. The closed `full-provider`
preflight still refuses even when every spec exists. The native34 inventory,
dark profiles, production systems and provider credentials are unchanged.

Two named specs now implement genuine future calls without response fulfillment,
fake SDKs, policy seeding, dependency installation or skipped-as-passing cases:

- `tests/home-finder-authenticated-local.spec.ts` reads a real authenticated
  binding, verifies current live/license/origin scope, opens the exact approved
  HTTPS client's iframe, searches the actual licensed source, chooses the
  specifically authorized listing and sends **one** consented inquiry. It checks
  the actual request ID, selected listing and consenting contact, then reads the
  matching external installation/reference until provider delivery is confirmed.
- `tests/sandbox-application-authenticated-local.spec.ts` reads a real candidate
  and accepted native budget, refuses an existing attempt, checks the exact
  native runtime qualification and sends **one** authenticated build command.
  It verifies the actual source/image/2048MB artifact and unchanged release,
  native target/payer/provider scope, runtime binding and same-session create/stop
  observations. It then requires actual per-session USD billing evidence and a
  finished accepted provider ledger execution; counts or estimates cannot pass.

The specs are excluded from ordinary `pnpm smoke` discovery and have an explicit
`playwright.provider.config.ts` with no server startup, one worker and zero
retries. Each spec also sets zero retries and refuses a stock/additional reporter.
The isolated config sets `PLAYWRIGHT_NO_COPY_PROMPT=1`: Playwright 1.59.1 can
otherwise capture an aria snapshot in error-context even with trace/video off.
The sole custom reporter emits fixed status text only, discards test/locator/
assertion errors and stdout/stderr, and produces no HTML/JSON/DOM report.
Sensitive comparisons use booleans; failures expose no buyer/request/token or
listing address. Do not override reporters or enable capture for these cases.

The parsed admission is recursively frozen. After the dispatch claim is burned,
and after Auth/search/native setup, both cases recheck actual app actor and
current direct customer-owner authority through authenticated, no-cache reads
of `/api/workspace/businesses` (actual actor ID and selected business) and
`/api/workspace/needs-you/policy?workspaceId=...` (fresh direct member role).
The policy endpoint restricts to customer direct members and needs both
Workspace and Needs you releases; absent routes/flags, admin-only, provider-seat
or agency-only authority fail closed. The general workspace GET is deliberately
unused because it may ensure/create a personal workspace.

Both revalidate the immutable approval window as the last synchronous check
before the inquiry click/build POST. Expiry or lost authority leaves the claim
permanently consumed and dispatch does not occur. This is a fresh pre-dispatch
observation, not a transaction lock across the external effect; native/product
write gates retain their own responsibility. No service-role actor impersonation
or cached admission role substitutes for these reads.

Before any provider effect, Auth `getUser()` verifies the actual loaded cookie
session, confirmed email and exact approved owner. Declared identity or a
post-build receipt cannot substitute. The session is not refreshed or created.
Admission and session files are lstat-checked current-UID mode-600 regular files,
opened with NOFOLLOW and checked again through fstat; malformed JSON is redacted.
The claim directory must be current-UID mode-700 and nonsymlink.

An exclusive mode-600 dispatch journal is fsynced together with its directory
before the first inquiry click/build call. Its key binds approval reference,
kind and binding/work-version target; the claim never expires, deletes or
releases automatically. This blocks retries, repeats and crash reruns under the
same approval. Home Finder durably records the real request ID on the request
event before observing its response. If no response arrives, the consumed claim
still requires operator lookup. Do not change approval references or journal
directories to evade this hold; subsequent authorization must review prior
claims and native/provider evidence first. A local claim does not establish
provider-side exactly-once delivery or prevent intentional operator bypass.

Both fail with a held diagnostic before loading an owner session when explicit
run inputs are missing. Neither retries an inquiry/build, installs policies,
creates test owners, publishes, changes licenses, accepts budgets, reconciles a
fabricated bill, or automatically clears an uncertain attempt. Home Finder
retains the real request ID before evaluating acceptance; sandbox attempts and
uncertainty remain in the native store for operator lookup. Default trace/video/
screenshot artifacts are disabled to avoid copying licensed content, buyer
contact data or owner sessions. Attachments contain validated scope/request/artifact IDs
only (no arbitrary approval reference), with `fullReleaseQualified:false`.

## Necessary inputs and authority

`tests/support/provider-harness-admission.ts` defines exact discriminated input
schemas. A file or environment flag is **not authorization**. Before any future
manual run, the human must explicitly authorize the listed nonproduction actions,
accounts, destinations and spend. The coordinator must verify the account,
license and client permissions, pin the actual server/test environment, review
its exact input file, and separately approve execution. No such permission or
account readiness was established during this preparation.

Both cases require an expiring nonproduction authorization reference, approver,
owned loopback control plane, current verified owner's existing Auth state and
exact business/actor identity and private persistent dispatch journal directory. The native SQL helper additionally insists on a
disposable loopback database. Browser session files and provider credentials are
private run inputs and must never enter Git or reports.

Home Finder additionally needs:

1. A participating brokerage and actual provider/MLS license/reference permitting
   this test, current exact live binding and external installation, permitted
   listing/query and current display/attribution/freshness rules.
2. A consented approved HTTPS client test page embedding this exact application
   origin/binding. Browser referrer/entry/origin rules stay intact; no synthetic
   token or bypass headers substitute for real client execution. Local-network
   or mixed-content restrictions may still prevent this setup and must remain a
   recorded failure until an authorized deployment arrangement resolves them.
3. A real consenting test buyer and authorization for the brokerage inquiry and
   agency receipt destinations. One actual external message is in the future
   approved scope; this source preparation authorizes none.
4. Server-owned runtime/management configuration and current provider readiness.
   The real search path rechecks all licensing, destination and delivery gates.

Sandbox additionally needs:

1. Explicit nonproduction commercial team/project access, real provider token,
   approved runtime selection, server policy and 2048MB contract, and a reviewed
   digest-pinned image with required isolation helpers. The coordinator must
   compare actual server configuration against the approved team/project/image/
   policy scope before permitting the one build; test-runner values alone do
   not prove server configuration.
2. An existing exact candidate/version/revision/source digest, qualified native
   runtime receipt with current authorized reviewer, and current verified manager
   and payer representative authority. These remain SQL gates, not fields a
   harness can invent or promote.
3. An already accepted positive bounded build cap/job, explicitly approved spend
   and a trustworthy actual session-dollar resolver. The harness never creates
   a budget or installs acceptance on behalf of the payer.
4. Actual native billing evidence/reconciliation from that trusted resolver.
   There is still no generally established automatic Vercel per-session dollar
   retrieval path. If it is absent, the build may be stopped successfully but
   this complete provider case fails and retains the financial hold.

The current integration contains a real HTTP Sandbox port/runtime and exact
native qualifier. The older prepared SDK proposal is dated evidence, not proof
that the current HTTP path needs a new dependency. No SDK dependency was added
or assumed by these harnesses. Actual commercial access, image behavior, native
provider authentication, per-session billing, licensed rights and client delivery
remain unverified here.

## Checks and next action

All 20 admission unit tests passed. Admission tests cover production/hosted control-plane refusal, expiry,
future approval, missing billing authority, mutable image, missing permission
and unbounded/zero spend. A syntactically valid input cannot release the held
provider profile. Filesystem/dispatch tests additionally cover private file and symlink refusal,
permanent same-scope replay refusal, reporter isolation and actual cookie-session
verification through a mocked Auth client, approval expiry after setup with its
claim still consumed, and fresh app actor/business/owner refusal after demotion. Scoped lint passed. Discovery-only checks found 430 ordinary tests with neither
provider case, and exactly two tests in the isolated provider config. No browser, server, provider, native DB,
SDK build or paid session was started. Root typecheck and actual execution are
still pending.

Coordinator next: independently review these source paths and exact missing
inputs. Keep provider preflight held. Obtain explicit account/client/license/
spend/delivery authority, verify and pin the actual environment, then choose a
bounded owned execution window. Passing these focused cases would establish
only the actions and observations they perform; it would not establish all-eight
release readiness, commercial adoption, wider buyer rights or withdrawal proof.
