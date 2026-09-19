# strelvav2

`strelvav2` is the internal name for the current Strelva product migration and its working branch. Use this name in internal release notes, planning, and handoffs.

The customer-facing product remains Strelva. This codename does not change the shared package version, deployed API contracts, environment symbols, or stored compatibility names.

## Scope and evidence

- [Current component, material and motion context](./design/current-component-context.md)

- [Definition of done: horizontal product and internal learning](./strelvav2-definition-of-done.md)
- [Full horizontal acceptance target](./strelvav2-horizontal-acceptance.md)
- [Product direction](./horizontal-product-brief-2026-09-11.md)
- [First release scope](./horizontal-first-scope-2026-09-11.md)
- [Local verification and remaining release gates](./horizontal-local-verification-2026-09-11.md)
- [Release checklist](./horizontal-release-checklist-2026-09-11.md)

The implemented first slice is verified locally. This does not establish production readiness for every planned capability or prove real provider delivery and customer outcomes.

## Current local review

The September 11 expansion adds New, private documents, tracker starts and grouped
edits, model-backed planning, private plan outputs, pattern updates, internal
budgets, and candidate comparisons. The full acceptance ledger separates these
implementations from remaining product work. No full-product percentage is
established by a passing test suite.

Jacob is handling end-to-end review. Development uses focused command tests,
critical failure checks, type checking, and isolated SQL checks. No new broad
browser run is required for this implementation checkpoint.

The current local interface preview is
[New in strelvav2](http://localhost:3210/preview/strelva?scenario=managed&view=start).
Its data is fictional and changes reset on reload. The separate
[authenticated local workspace](http://localhost:3214/workspace) uses local
Supabase and Redis. Its model/provider credentials are intentionally unconfigured;
planning and real outbound delivery have not been exercised there.

## Production hold

Commit and push internal work to `strelvav2`. Jacob authorized preparing draft PRs into `main` on September 19, without publishing the product. Merge approval, release tags, deployments, production migrations and live-provider activation remain separate decisions.

`vercel.json` disables all automatic Git deployments using [Vercel's Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration). Keep this guard in the proposed merge so moving the reviewed code into `main` does not itself request a Vercel deployment. Manual deployments still require separate authorization. This checked-in guard does not attest to the current production revision or change Vercel project settings.

## September 19 PR preparation

The app snapshot `3120dd7` contains the current product implementation. The older
draft PR #190 stops at `0330f75` and does not contain the subsequent horizontal
product work. Prepare the current `strelvav2` branch as its replacement; do not
merge both as separate releases. Marketing belongs in a companion PR in
`strelva-marketing`, whose checked-in configuration also disables Git deployments.

Both package versions remain `0.1.1`. `strelvav2` is an internal name, not a
selected `2.0.0` release. A proposed next version is `0.2.0` under the existing
[pre-1.0 versioning policy](../VERSIONING.md); selecting and applying it requires
matching package versions and changelog headings in both repositories. Do not
tag a draft integration checkpoint as a released product.

The [September 18 integrated local verification](./strelvav2-horizontal-acceptance.md#september-18-integrated-local-verification)
records 388 passing test files, 2,845 passing tests, one skipped test, a successful
build, compatibility checks and isolated schema rehearsals. That evidence names
an earlier working tree, not the current PR revision. The September 19 check of
the committed snapshot found three TypeScript errors in the model-cost evidence
integration; current PR checks must establish the result after correction.

Human acceptance, production schema and authenticated journeys, real-provider
evidence, and the Mooney Outlook / ADR Notable handoff remain separate release
gates. See the [acceptance ledger](./strelvav2-horizontal-acceptance.md) and
[release checklist](./horizontal-release-checklist-2026-09-11.md). A draft PR or
green local check does not close those gates.
