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

Commit and push internal work to `strelvav2`. Do not merge to production, create a release tag, deploy, run production migrations, or enable live providers without Jacob's explicit authorization.

`vercel.json` disables automatic Git deployments for this branch using [Vercel's branch deployment configuration](https://vercel.com/docs/project-configuration/git-configuration). This is a branch-specific guard; manual deployments still require separate authorization.
