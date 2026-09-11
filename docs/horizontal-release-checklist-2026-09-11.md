# Horizontal slice release checklist

This is a rollout checklist for the [selected first scope](./horizontal-first-scope-2026-09-11.md).
It does not authorize a production action. Local implementation and synthetic
browser evidence are separate from authenticated staging and production evidence.

## Scope to review

- Inquiry work inside the existing shared workspace, using the same tenant
  authorization, canonical commands, receipts, rehearsal and publication path.
- CSV import into a saved tracker, with original source, row references, field
  mapping, editable cells, filtering, revision conflicts and attributable history.
- Internal experiment records tied to a tracker revision, including reported
  time, outcome, evidence and known provider cost. They do not publish an offering.
- Website setup suggestions and corrections, scoped business attention, and
  copying an inquiry setup into a fresh draft for another authorized business.

CSV is the supported import format. Excel workbooks, spreadsheet formulas,
arbitrary generated applications and third-party agent execution are outside this
slice. Provider connection entries describe current access; an entry in the list
is not an implemented integration or a tenant grant.

## Local gates

Run the focused behavior and failure tests for the changed boundaries, then:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:ontology
pnpm check:boundaries
pnpm check:custom-repos
pnpm version:check
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
```

Inspect desktop and mobile inquiry, tracker and sharing journeys, including
loading, empty, unavailable, read-only and stale-edit states. Use unique
Playwright output directories for parallel runs. Synthetic browser API responses
prove interaction behavior; they do not prove an authenticated deployed database.

## Authenticated staging proof

Use an isolated Supabase Auth/Postgres and Redis environment with synthetic
businesses and users. Do not point a local fixture at production stores.

1. Verify applied migration history. Apply only pending migrations in order,
   including the workspace prerequisites, inquiry workspace migration
   `20260911100000_inquiry_capability_workspace.sql`, and tracker update migration
   `20260911150000_tracker_work_updates.sql`.
2. Use two unrelated users and a scoped reviewer. Test login, saved-work reload,
   lost membership, revoked delegation, wrong-recipient handoff, stale edits and
   unavailable stores through the real request adapters.
3. Exercise request, shape, edit, rehearsal, exact-version publication, intake,
   receipt and Undo. Confirm that Undo preserves already received inquiries.
4. Interrupt delivery at the claim, provider-acceptance and evidence-write
   boundaries. Retry and restart. Confirm one accepted external action and
   repairable evidence. Check pause, changed version, budget, bounce, reply,
   disconnection and missing-evidence gates.
5. Import two structurally different synthetic CSV files. Save, reload, edit,
   filter, share within the supported scope and revoke access. Attempt a stale
   experiment submission and confirm that it cannot describe a newer revision.

## Repeat the isolated local adapter checks

The optional browser files are `tests/tracker-authenticated-local.spec.ts`,
`tests/tracker-handoff-authenticated-local.spec.ts`, and
`tests/inquiry-authenticated-local.spec.ts`. They require loopback application
and Supabase URLs and use actual local Auth sessions. They skip unless
`STRELVA_LOCAL_AUTH_PROOF=1` is set.

Create a separate local Supabase project with the forward numeric migrations,
and keep its keys outside tracked files and logs. Run the app with the matching
local Supabase URL, anonymous key and service-role key, the workspace/inquiry
release flags enabled, `TENANTS_SOURCE=postgres`, and
`REB_DEV_UNGATED_ACCESS=0`. Clear production provider and storage credentials
from the app process. Match the exact app hostname in `PLAYWRIGHT_BASE_URL` so
the same-origin check remains active.

For inquiry delivery, use a separate Redis store through its local REST adapter.
The Node preload `tests/support/local-provider.mjs` answers the supported Resend
fetches with synthetic results and blocks other non-loopback fetches. Load it
only into the isolated test app with `NODE_OPTIONS=--import=<absolute-path>`,
`STRELVA_LOCAL_PROVIDER_PROOF=1`, and a private
`STRELVA_LOCAL_PROVIDER_LOG` path. The test process needs those proof flags and
local Redis settings too. Use a fake Resend key, the explicit customer-mail
switches, a synthetic reply domain, and locally generated publication/cron
secrets. This fixture proves application behavior around a provider response;
it does not prove Resend configuration or delivery to a mailbox.

Run the browser files with separate output directories. Run the production
build and the full unit suite separately on this workstation so compilation
does not starve the tests' existing timeouts. Never substitute production keys
or real recipients for the local fixture prerequisites.

## External test and production authority

Before any external write, prepare the exact environment, tenant, recipient,
provider operation, cost limit and rollback, then obtain explicit authority.
No sending switch, webhook registration, DNS change, migration or deployment is
implied by local testing.

The relevant exposure flags are `STRELVA_WORKSPACE_RELEASE` and
`STRELVA_INQUIRIES_RELEASE`. Inquiry publication additionally needs a securely
generated `INQUIRY_PUBLICATION_CLAIM_SECRET`. Reply tracking uses an explicitly
configured `INQUIRY_REPLY_TO_DOMAIN`; signed callbacks use `RESEND_WEBHOOK_SECRET`.
Mail-provider configuration, verified sender/receiving setup and tenant email consent
must be checked independently of those flags. Existing audience switches and
responsibility policy remain authoritative for every send.

Install the shared inquiry form in a representative client repository and verify
its versioned storefront contract before enabling that client's capability.
A preview receipt is not evidence that a real client website changed.

## Reply evidence scope

Receiving checks cover replies delivered to the inquiry's configured tracking
address. They do not observe a staff member's unrelated mailbox or a phone call.
When staff answer elsewhere, they must mark the inquiry handled in Strelva.
Unavailable or incomplete receiving evidence blocks automatic follow-up.

The implementation uses [Resend's receiving list](https://resend.com/docs/api-reference/emails/list-received-emails)
and its documented [newer-to-older cursor pagination](https://resend.com/docs/api-reference/pagination#forward-pagination).
A sweep reads at most three pages of 100 message references. It requires a
complete window through the inquiry's received time; malformed data, inconsistent
ordering or an incomplete window cannot establish that no reply exists. No
inbound message body is copied into the inquiry workspace.
