# strelvav2

`strelvav2` is the internal migration name. The customer product is Strelva.
The current source version is `0.2.0` in the app and marketing repositories.
This does not establish a deployed release or change compatibility names.

## September 21 release direction

Strelva continues to build websites for agency customers. The customer reviews
and uses the result; they are not required to operate the website generator.
A business can also start with a native staff application or private onboarding
requirements without buying a website. The same business keeps its work when
it later asks Strelva to deliver something else.

The agency's 24-hour delivery starts only when the provider's exact proposal
has been accepted by the customer. Scope, required inputs, terms reference,
operator, start, deadline and delivery definition are recorded. Request intake
and acceptance for review do not start that commitment. Publication, charging,
custom domains, refunds and additional scope require their own authority.

This clarification supersedes the September 20 emphasis on self-service website
creation as the main release prerequisite. It does not retire that implementation
or make every planned capability available. Older sections of the product brief,
backlog and acceptance ledger retain dated evidence, not current missing-feature
claims. Use source and the specific subsequent acceptance before rebuilding work.

## Current integration

[App PR #192](https://github.com/Strelva/Strelva-OFFICIAL/pull/192) follows merged
PR #191. [Marketing PR #11](https://github.com/Strelva/strelva-marketing/pull/11)
follows merged PR #10. Marketing PR #12 was consolidated into #11 and closed
without merging; it is not a competing release.

| Customer result | Existing implementation and proof owners |
| --- | --- |
| Enter a business without a website | `src/platform/workspaces/business-entry-service.ts`, `/api/workspace/businesses`, `BusinessSetupPanel.tsx`; actor-bound exact retries and explicit business ownership. |
| Choose a native product or hire Strelva | `src/lib/business-start.ts`, workspace start and help, bounded sign-in return; public static starts never carry private request text in URLs. |
| Use a staff request application | Native application releases, records and recipient access; `tests/application-use-authenticated-local.spec.ts`. |
| Review private onboarding documents | Native onboarding requirements, attachments and exact accepted versions; `tests/onboarding-authenticated-local.spec.ts`. |
| Agree on and review agency delivery | `src/platform/service-requests/delivery-commitment-service.ts`, delivery detail and queue; mutual scope acceptance, preserved deadlines and recorded result revisions. |
| Attach the actual client site | Existing offering website-binding API and managed website authority; a business owner still needs the separate website permission. |
| Keep native work while receiving a website | `tests/launch-business-authenticated-local.spec.ts`, desktop and mobile, real isolated Auth/Postgres and synthetic review artifact. |
| Continue from marketing into the right business | `tests/marketing-launch-authenticated-local.spec.ts` in this repo; the marketing workflow pins the exact app revision and exercises both origins. |

Existing storefront publication, revalidation, records, approvals, economics and
operator recovery remain with their native owners. This release does not add a
parallel website builder, generic task database or case-management product.

## Verification that belongs to this release

The [original CI workflow](../.github/workflows/ci.yml) covers full-project lint,
types, boundaries, invariants, tests, coverage, dependency audit and build.
Its public, workspace and owner/operator browser gates require a non-draft PR.
A successful draft run does not include those gates.

[Launch verification](../.github/workflows/launch-verification.yml) additionally
runs the full ordered isolated database upgrade, focused delivery and business
regressions, workspace browser checks and six real local Auth/Postgres journeys.
[The retained-results checker](../scripts/check-launch-browser-results.mjs)
requires the named journeys to execute and pass without skips or retries.
The marketing profile independently requires six public-entry journeys; it
cannot substitute for the core native and delivery journeys.

At core commit `fc8f1d2d3414178d62aa99de78e989522c132e90`, CI run
`35665111316`, Launch verification `35665111321`, and Security `35665111587`
passed. Those are dated results, not proof for later changes. Subsequent
verified-session continuation at `b7cc5a132315942289877e4122d4d3bb2a1143a9`
is being qualified separately. Current PR checks and their exact head identify
the latest result; do not carry an earlier green result forward by assumption.

The paired proof uses genuine local Auth sessions but does not send a login
email or certify live OAuth. Its website repository, commit and review URL are
synthetic. Native records and permissions use the isolated database. Hosted
credentials, customer records, paid model calls and live provider actions are
not test fixtures and have not been used by these workflows.

## Hosted release boundary

Both repositories retain `git.deploymentEnabled: false` in `vercel.json`.
A reviewed merge is therefore code integration, not production activation.
No release flag, domain, billing configuration or hosted schema is selected by
a GitHub workflow result.

The current connection cannot access the Strelva Vercel team: the authorized
team/deployment read returns 403. The actual deployed revision and database
mapping must be established before any hosted migration or promotion. The
previously inspected Supabase project is not assumed to be that target merely
because its name is familiar.

The hosted operation needs the exact application and marketing artifacts,
environment and provider scopes, actual database history and schema delta,
backup/recovery target, existing-client compatibility, and ordinary-account
acceptance. The [offline target checker](../scripts/check-workspace-target.mjs)
and [read-only catalog query](../scripts/workspace-target-snapshot.sql) assist
that comparison. They do not grant release approval or apply migrations.

Publish the marketing destinations only after the intended app and database
support them. Retain the ability to stop new external effects independently
from rolling back the application. A frontend rollback does not undo an email,
charge, reservation or later customer record.

The Mooney Firm remains the existing-customer acceptance case. Preserve the
firm's selected Outlook / ADR Notable handoff and required access boundaries.
Do not introduce another case database to replace unverified vendor delivery.
Its authorized provider rehearsal and receipt are separate from synthetic CI.

Subscription quantities and new prices, automatic overages, refunds, universal
WordPress import, arbitrary custom backend hosting and general unattended
provider operation are not established by this release. Preserve historical
customer agreements and keep unqualified actions unavailable server-side.

## Retained evidence and ownership

- [Operating instructions](../AGENTS.md) and [current product context](../CONTEXT.md).
- [Product brief and dated decisions](./horizontal-product-brief-2026-09-11.md).
- [Native persistence and operational authority](./persistence-boundaries.md).
- [Dated implementation and acceptance ledger](./strelvav2-horizontal-acceptance.md).
- [Current component, material and motion context](./design/current-component-context.md).
- [Definition of done and internal learning](./strelvav2-definition-of-done.md).
- [Provider and customer release checklist](./horizontal-release-checklist-2026-09-11.md).
- [Versioning policy](../VERSIONING.md).

September 11 and September 19 records describe earlier checkpoints. PR #190,
its `0330f75` head, the earlier `0.1.1` version and local preview ports are not the
current release state. Their original proof remains in the dated acceptance
ledger. Synthetic users, passing tests and deployed software do not by themselves
establish customer adoption, economic viability or human design acceptance.
