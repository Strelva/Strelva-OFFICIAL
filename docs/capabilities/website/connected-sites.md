# Connected sites

Status: built locally Oct 8 on `w2/website-system`, flag
`STRELVA_CONNECTED_SITES_RELEASE` off. Not in production; the migration needs
Jacob's yes. Working default for decision 3 in the
[website System spec](./website-system-spec-2026-10-06.md#9-open-decisions).

A business keeps its website where it is (Wix, Squarespace, WordPress, a
builder, a developer) and adds two lines. Strelva fills confirmed business
facts into the page, takes its inquiries, and counts visits and contact taps.
Strelva never edits the pages. The site is a website System with origin
`connected_site:<id>`, so a later rebuild keeps the same System.

## How it works

1. An owner or admin opens `/workspace/site?workspaceId=…` and enters the
   address. Strelva returns a verification meta tag and the script line.
2. The owner (or their web person) pastes both into the site's header code and
   publishes.
3. "Check my site" reads the live page (pinned, public addresses only). The
   meta token or the site's own script key on the page proves control of the
   host. Until then the site accepts no writes. One business per proven host.
4. `public/connect.js` then fills `[data-strelva-fact]` elements, adds
   schema.org when the site has none, mounts `[data-strelva-form]` forms,
   optionally captures the site's own contact forms, and beacons visits and
   contact taps. No cookies, no query strings, no keystrokes.

## Contracts

| Route | Purpose |
| --- | --- |
| `GET /api/v1/connect/{siteKey}/context` | Confirmed facts from the business record (verified, or stated by the owner or a Strelva operator). Public, cached 60 s |
| `POST /api/v1/connect/{siteKey}/events` | Visits and taps, deduplicated. Verified site, own Origin only |
| `POST /api/v1/connect/{siteKey}/inquiries` | An inquiry into `tenant_leads`; spam held in the spam pit; honeypots dropped. Verified site, own Origin only; limiter fails closed |
| `GET/POST /api/workspace/connected-sites` | List, connect, verify, update, disconnect |

All `/api/v1/connect/*` routes are additive to the v1 contract.

## What changed from `feat/connected-sites`

- Migration renamed from `20261002120000` (taken by the business record) to
  `20261008151000`, and moved to service-role RPCs only.
- No second fact store: `business_contexts` and its facts are gone; context
  reads the business record. Fact editing happens on the business record.
- No second inquiry store: inquiries are `tenant_leads` rows with
  `connected_site_id`; held spam is `tenant_client_records` `spam_held`.
- Domain-ownership proof added; writes without an Origin are refused.
- Retention: events 400 days, held spam 30 days, inquiries kept with the
  business. `purge_connected_site_records` is not on a cron yet.
- Not carried over (still on the branch): assistant tokens and OAuth, MCP,
  the `/b/{handle}` context page, response checks, platform detection in the
  audit, the integrations folder.

## Not done

- A link to `/workspace/site` from Home for a business with no website (Home
  is a shared file; one line in `BusinessHome.tsx`).
- Connected inquiries in the Inquiries System inbox (they show on the
  website System page and in `business_outcome_month`).
- Installation on a real Wix or Squarespace site. Never run end to end on a
  builder.
