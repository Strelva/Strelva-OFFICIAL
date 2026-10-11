# Neutral-platform journeys — October 8, 2026

Issue [#317](https://github.com/Strelva/Strelva-OFFICIAL/issues/317) owns this
private neutral-platform matrix. Its base is exact private candidate
`e28e1a5fcf89d43f4d3fc123a1fbceaee3bb6d00`, not production or the later backlog
release. No later release branch was merged or cherry-picked. The e28 owner
journey already uses `ordinaryConversionAgency`, explicit staffed seats and no
singleton designation; retain that path.

Run the complete neutral matrix with:

```bash
SUPABASE_CLI=supabase bash scripts/check-neutral-agency-browser.sh
```

The owning `check-journeys.sh` registers the new spec in both its full flags-on
and flags-off inventories. `--neutral` selects only this issue's complete two
phases and strict `neutral-on`/`neutral-off` result profiles. Each requires its
actual result, zero skips, zero retries, no flaky or process errors. A neutral
profile never claims that the remaining signed-in specs passed. Full
`check:journeys` still enforces its complete inventory.

The local CLI override reuses an installed CLI; it adds no dependency. The
runner refuses credential files, uses a unique disposable Auth/Postgres stack,
real signed sessions, a loopback Redis bridge and the real Next app, clears
provider credentials and suppresses all email. Flags-off preserves the existing
workspace account baseline while disabling the new client/website/Team paths.

## What the assertions establish

| Original clause | Actual local proof |
| --- | --- |
| Outside agency signs up ordinarily | Anonymous Supabase Auth `signUp` using the anon client; ordinary `/api/workspace` agency creation; no super-admin row or singleton designation |
| Unverified agency cannot publish or write Google | Actual website launch HTTP 403; actual `assert_acting_provider` SQL returns unverified; production `createListingPost` refuses before fictional Google client or receipt invocation |
| Verified agency publishes with exact owner approval | Current owner claims the business, confirms candidate facts and exact immutable preview, grants that named agency's website mandate; synthetic independent publish verification grants no owner authority; actual native launch and one replay receipt |
| Switching does not migrate the business | Owner-only current `choose_business_provider` RPC, successor's actual Team staffing HTTP action; same business/work/payload, same applied migration versions and retained receipt; old agency loses rebuild/history and Google authority, successor can read |
| Agency is payer | Owner's actual payer proposal; old agency denied; current addressed agency accepts; subsequent actual HTTP work-plan economics job resolves the agency party; owner/old agency cannot accept its zero-cent job cap, addressed current agency can; native ledger binds payer workspace and accepted signer |
| Flags on/off baseline | Complete neutral two-phase runner, desktop/mobile screenshots, explicit disabled-effect 503s and no saved work in off mode |

The ordinary direct switch exercises the existing **no selected policy and no
pending request** path. It selects no response-window or attribution terms and
does not qualify a pending-policy recovery path.

The reusable website workflow is extracted into
`tests/support/agency-workflow.ts`; its original browser spec calls the same
function without the neutral extension. The neutral spec adds genuine signup,
Google refusal, switching and payer checks in `tests/support/neutral-agency.ts`.
No production runtime, applied migration bytes or authority rules were changed.

## Retained billing gap

The first new-business billing assertion failed: after real client creation,
publication and accepted agency payer, `read_business_billing` returned `null`.
The final neutral fixture records this same result explicitly. The current
business account is created by the legacy conversion/link path; ordinary native
new customers do not get one. `business_payer_apply` updates existing accounts
and cannot provision the missing home. Consequently the agency's wholesale
client line is also absent. An accepted future-job payer is proven; business
billing account/wholesale line readiness is not.

Do not fabricate an account in this fixture or infer that a zero-cent test cap
is a selected price. A separate additive provisioning successor must preserve
converted accounts, current payer provenance and read-only readers, with native
upgrade, rollback and race proof. No Stripe subscription, intent, payment or
provider call follows from these tests.

## Evidence and limits

The workspace packet under `.scratch/goal-1-0-20261008/317` retains logs, exact
source/tree, file hashes, actual PNGs and earlier setup/ACL/billing failures.
The initial external node_modules symlink was rejected by Turbopack; locked
existing dependencies were restored offline, without adding any dependency.
A later contended run lost the Next connection with ECONNRESET before publication;
that failure is retained and is not counted as a passing journey.
Service-role table SELECT on `workspace_providers` was correctly refused; proof
inspection uses loopback SQL rather than changing its grants.

Actual local Auth confirmation is disabled, so signup establishes no production
confirmation-email proof. Publish verification is an explicit fictional review
fixture. Only Google transport is fictional; its refused calls must remain zero.
Public HTTPS read-back remains failed and visible; local rendering is no DNS,
TLS, hosted Preview or production proof. Owners are signed in. No account-free
owner promise, real provider, commercial operation, existing-client conversion,
public launch or full 1.0 completion is established.
