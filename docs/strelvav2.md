# strelvav2

`strelvav2` is the internal name for the current Strelva product migration and its working branch. Use this name in internal release notes, planning, and handoffs.

The customer-facing product remains Strelva. This codename does not change the shared package version, deployed API contracts, environment symbols, or stored compatibility names.

## Scope and evidence

- [Product direction](./horizontal-product-brief-2026-09-11.md)
- [First release scope](./horizontal-first-scope-2026-09-11.md)
- [Local verification and remaining release gates](./horizontal-local-verification-2026-09-11.md)
- [Release checklist](./horizontal-release-checklist-2026-09-11.md)

The implemented first slice is verified locally. This does not establish production readiness for every planned capability or prove real provider delivery and customer outcomes.

## Production hold

Commit and push internal work to `strelvav2`. Do not merge to production, create a release tag, deploy, run production migrations, or enable live providers without Jacob's explicit authorization.

`vercel.json` disables automatic Git deployments for this branch using [Vercel's branch deployment configuration](https://vercel.com/docs/project-configuration/git-configuration). This is a branch-specific guard; manual deployments still require separate authorization.
