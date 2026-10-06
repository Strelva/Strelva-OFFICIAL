# Changelog

Strelva uses [Semantic Versioning](https://semver.org/) and releases the app and
marketing site in lockstep. Their `package.json` versions must always match.

## 0.2.1 - Unreleased

- Keep every client website lead in Postgres as well as Redis, so leads survive the 90-day and 500-lead Redis window. A failed copy never changes the visitor's response; it waits in Redis and an hourly job retries it.
- Copy the leads Redis still holds into Postgres with a backfill script that dry-runs by default.
- Show operators every client's leads at `/admin/client-leads` and on each client page.
- Check all nine client repositories against the `/api/v1` contract.

Built on the September 30 production release. The `tenant_leads` migration, the deploy and the backfill each need a separate production yes.

## 0.2.0 - Unreleased

- Create private website drafts from business briefs, review exact revisions, and download buildable website projects.
- Select published inquiry and booking connections for exported websites, with durable booking receipts and readback recovery.
- Let authorized agencies prepare managed website drafts for customer review and publication.
- Bring saved work, native applications, inquiries, documents, recurring work and provider requests into one business workspace.
- Add recipient record corrections, date-only fields and onboarding document review with preserved revisions.
- Prepare governed provider delivery, calendar connections, public website checks and budgeted custom-application lifecycles for local acceptance.
- Add configured subscription allowances, exact provider-cost receipts and customer exit with retained records and bounded export.
- Verify exact client repository revisions before release compatibility checks.

This is a draft release candidate. The [acceptance ledger](./docs/strelvav2-horizontal-acceptance.md)
records completed local proof and remaining integration work. Hosted migration,
provider verification and production deployment remain separate release gates.

## 0.1.1 - 2026-08-03

- Introduce Strelva Labs on the marketing site.
- Keep the Strelva app and marketing site on one shared release version.

## 0.1.0

- Establish the initial Strelva release.
