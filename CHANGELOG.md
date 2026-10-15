# Changelog

Strelva uses [Semantic Versioning](https://semver.org/) and releases the app and
marketing site in lockstep. Their `package.json` versions must always match.

## 1.0.0 - Unreleased

- Open separate business and agency entry paths into the workspace, with Systems,
  Connections, Possibilities and Versions behind their existing release gates.
- Prepare agency client import, owner claim review and governed website publication.
- Preserve managed website service and the existing client API during the workspace transition.
- Add a browser gate for the six release flags observed on October 14, ordered
  database-upgrade CI, and narrowly reviewed secret-scan exclusions.
- Report scrubbed workspace failures in server and browser monitoring; browser
  reporting stays off until its public DSN is configured.
- Report the checked-in 1.0.0 version from health when no deployment override is set.
- Browser error reporting reaches Sentry once its public DSN is set (CSP now admits the ingest host).
- History and inbox reads that fail now say so instead of showing an empty list.
- Domain verification checks every five minutes; the production checklist prints the real cron list.
- Add a names-only prod flag report.
- Prepare a report-only nonce CSP behind STRELVA_CSP_NONCE_REPORT_ONLY (off).
- Add per-package license review to the supply-chain gate (no entries approved yet).
- Prepare Keep your site for connected sites behind `keep_your_site` (off): install health, what a site is built with, agency change Requests with the exact edit, live-page checks and Releases, and Clients → Client websites. Three held migrations; no owner email, no prices.

This is the prepared source cut, not a production deployment or tag receipt.
October 12–13 go-live claims and October 14 observations are recorded separately
in the [release packet](docs/operations/release-1.0-packet.md). Existing client
email, owner entry, production settings, prices and rollout authority are unchanged.

## 0.2.1 - Unreleased

- Keep every client website lead in Postgres as well as Redis, so leads survive the 90-day and 500-lead Redis window. A failed copy never changes the visitor's response; it waits in Redis and an hourly job retries it.
- Copy the leads Redis still holds into Postgres with a backfill script that dry-runs by default.
- Show operators every client's leads at `/admin/client-leads` and on each client page.
- Check all nine client repositories against the `/api/v1` contract.

The `tenant_leads` migration, the deploy and the backfill each need a separate production yes.

## 0.2.0 - 2026-09-30

- Create private website drafts from business briefs, review exact revisions, and download buildable website projects.
- Select published inquiry and booking connections for exported websites, with durable booking receipts and readback recovery.
- Let authorized agencies prepare managed website drafts for customer review and publication.
- Bring saved work, native applications, inquiries, documents, recurring work and provider requests into one business workspace.
- Add recipient record corrections, date-only fields and onboarding document review with preserved revisions.
- Prepare governed provider delivery, calendar connections, public website checks and budgeted custom-application lifecycles for local acceptance.
- Add configured subscription allowances, exact provider-cost receipts and customer exit with retained records and bounded export.
- Verify exact client repository revisions before release compatibility checks.

Deployed to production on 2026-09-30, built from `f41e9a6f`. The workspace was
on but held 0 workspaces; no client moved. The [acceptance ledger](./docs/operations/strelvav2-horizontal-acceptance.md#september-30-workspace-production-release)
records the release.

## 0.1.1 - 2026-08-03

- Introduce Strelva Labs on the marketing site.
- Keep the Strelva app and marketing site on one shared release version.

## 0.1.0

- Establish the initial Strelva release.
