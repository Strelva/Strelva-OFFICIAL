# Connected sites

**Wave 6 round 5, local only:** operator rollout checks, silent inquiry notices,
System identity through a hosted rebuild, merged hosted-domain checks, and
business-fact Connection contracts are tested. The installed script respects
revoked consent for already mounted forms and sends no referrer with inquiries.
All new notices require `STRELVA_CONNECTED_SITE_EMAIL_ENABLED=1` and the
existing global, customer and tenant email gates. Connected-site entry remains
independently switchable from paste-URL rebuilding. Actual builder installation,
domain proof and retained reporting are production acceptance work. See
[current stream evidence](../../product/streams/w6-website.md).

Status: built locally Oct 8 on `w2/website-system`, flag
`STRELVA_CONNECTED_SITES_RELEASE` off. Oct 6 on `w3/decision-gaps` (local): a
per-business `connected_sites` release row, the public gate per business, the
daily purge cron, the Home link and inquiries in the workspace inbox. Not in
production; the migrations need Jacob's yes. Working default for decision 3 in the
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
| `GET /api/v1/connect/{siteKey}/context` | Confirmed facts from the business record (what the owner wrote or decided, #509). Public, cached 60 s |
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
  business. `purge_connected_site_records` runs daily from
  `/api/cron/connected-sites-purge` (bounded batches, heartbeat, off with the
  env switch).
- Not carried over (still on the branch): assistant tokens and OAuth, MCP,
  response checks, platform detection in the audit, the integrations folder.
  The `/b/{handle}` context page is ported as `/biz/{handle}` (below).

## Release gate

`STRELVA_CONNECTED_SITES_RELEASE` is the env switch for the `connected_sites`
release flag (`20261009100000`): `1` is on wherever Systems is on, except a
business whose row says `off`; `workspace` is on only where the business row
says `on` (or `operators`). The workspace screens also need Systems on for the
business. The public `/api/v1/connect/*` routes resolve the site key's
business and check its row (an `operators` row counts as on there, so an
operator can test a real install); an off business answers `503` exactly like
the env switch off and stores nothing.

## Built Oct 6 (`w3/decision-gaps`, local)

- Home links to `/workspace/site` when connected sites are on for the business
  ("Already have a website?" or "Have another website?").
- Connected-site inquiries in `/workspace/inquiries`, one section per site; a
  failed read shows as unavailable, never as an empty inbox.

## Server-rendered visibility (#309, #502, local)

connect.js adds JSON-LD in the browser, and AI crawlers don't run JavaScript.
Two server-side paths carry the same confirmed facts, through one serializer
(`businessJsonLd`, then `schemaBlock`: sorted keys, `<>&` escaped, stable
bytes and a 16-hex SHA-256 hash).

- **Public business page** `/biz/{handle}` and `/biz/{handle}/llms.txt`.
  Server components only; the page ships no JavaScript of its own. App host
  only (a client site's host answers 404). `/b/[token]` is the booking manage
  link, whose tokens a handle could equal, so the branch's `/b/{handle}` moved.
  Off unless `STRELVA_BUSINESS_PAGES=1` on top of the connected sites gate,
  the business's `connected_sites` row is open, and an owner or admin
  published it. App-host robots already allow it (only `/dashboard/` and
  `/api/` are disallowed); a test keeps it that way. Hosted (v2) sites'
  robots now also allow `/api/v1/*/openapi.json` (the bookings agent
  contract) past the `/api/` block; the app host and v1 output stay
  byte-identical to their baseline, so the contract is still closed there.
- **Static paste block** for any site, from the workspace (`/workspace/site`,
  "Readable by AI assistants"): one block per active connected site (its
  `url`), plus one without a `url` for any other site. **Check** reads the
  live page (pinned fetch) and reports `current`, `outdated` (facts changed),
  `edited` (changed by hand) or `missing`. connect.js already skips injecting
  when the page has its own business JSON-LD, so the two never double up.
- **Confirmed** here means the owner decided it (#509): the owner's own
  write or an owner Needs you decision, read from `business_record_confirmed`
  (`20261013110000_public_facts_read_confirmed.sql`). Operator, agency,
  import and model values wait for that decision, even when an operator
  marked them verified; an unconfirmed edit to a confirmed fact keeps
  serving the confirmed value. `read_connected_site_context` (connect.js)
  uses the same SQL read. Published policies (including service area)
  additionally require owner/operator verification under
  `selectPublishedBusinessPolicies`; owner-stated but unverified terms stay
  unknown. No agency-confirmation authority is added.
- Storage: `20261012110000_business_pages.sql` (`business_pages`: handle and
  publish state; `business_confirmed_public_facts`; service-role RPCs).
  Contract: `tests/business-pages-schema.sql`. Rollback:
  `rollback-20261013110000_public_facts_read_confirmed.sql` first (restores
  the working-record read), then
  `rollback-20261012110000_business_pages.sql` restores the prior connected-site
  reader (#509's confirmed-copy reader while #509 is applied) and removes the
  page schema before adoption. It refuses any saved
  page settings rather than discard handles/publication consent. SQL checks
  prove rollback/reapply and refusal after adoption.
- **Business policies** appear in the page, llms.txt, connected-site JSON-LD
  and paste blocks through the canonical published-policy selector. Cancellation,
  deposit, payment, age/waiver, booking and response terms use human-readable
  text and schema.org `PropertyValue`; service area uses `areaServed` and payment
  methods also use `paymentAccepted`. These facts describe terms, never booking
  enforcement or deposit charging. Private actor/workspace IDs are omitted.

## Not done

- WordPress plugin and Wix SEO API for the paste block (#502 follow-ups).
- The page has no contact form; the branch's posted to the public connect
  inquiry route, which needs a verified host and Origin.

- Installation on a real Wix or Squarespace site. Never run end to end on a
  builder.

## Published schema disagreements (#503, local preparation)

When connect.js steps aside for the site's own business JSON-LD, it reports only
that business schema is present as an optional `platformSchema` hint on the
existing events endpoint. `events: []` is accepted only alongside that hint;
old event bodies and responses are unchanged. The server fetches the connected
site's stored, verified URL through the pinned-public-address reader and parses
bounded JSON-LD there. Client values and a forged Origin cannot supply the
compared facts. The comparator selects a unique entity whose URL or `@id`
matches the connected page, uses a sole entity as a fallback, and declines
ambiguous multi-entity graphs. The script leaves platform schema intact.

`STRELVA_CONNECTED_SITE_SCHEMA_CONFLICTS_RELEASE=1` enables comparison (default
off, alongside the existing connected-site business/host gates). Only the
confirmed context RPC feeds comparison: owner/operator-stated or verified facts.
One Needs you item per site records differing shared fields; repeated identical
conflicts reuse the same revision, including after acknowledgement. The existing
store supersedes older open revisions. This is an observation of published facts,
not proof the site is wrong, and a partial report does not prove other pages agree.
Matching reports do not automatically dismiss an older item: another page could
still disagree. Acknowledgement, source revocation, or superseding evidence closes it.

The item can be acknowledged through the existing owner link without an account;
acknowledgement leaves website and business facts unchanged and calls for follow-up
in the website platform. Recording never sends email. Existing Needs you delivery
remains subject to `STRELVA_NEEDS_YOU_RELEASE` and the client-email rollout gate.

New migration: `20261018120000_connected_site_schema_conflicts.sql` (not applied
to production), with a rollback that removes functions only before source decisions
exist and refuses once such records depend on the adapter. Tests:
`connect-js.test.ts`, `connected-site-schema-conflicts.test.ts` and
`tests/connected-site-schema-conflicts.sql`. Real Wix/Squarespace installation
and production delivery remain unproven. No `/b/{handle}`, llms.txt or serializer
files are part of this change.
