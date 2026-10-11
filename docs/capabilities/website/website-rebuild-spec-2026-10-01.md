# Websites: paste a URL, get it back rebuilt and live

**Wave 6 round 5, local only:** saved crawl omissions and fact review, exact
candidate approval, linked-tenant publication and read-back, immutable History
restores, domain decisions with uncertain-write receipts, owner-attested cutover
undo, and both entry paths are implemented. Model composition, Jev risk scoring
and changed-copy verification require an explicit off-default paid-call opt-in,
recheck authority before each call and share a durable per-work allowance.
Hosted public fact reads have a separate opt-in and never rewrite the issued
document. [Current proof and rollout steps](../../product/streams/w6-website.md).

**§11 auto-approve is not built for document publication:** the risk and
verification machinery is wired, but every new copy claim stays reviewed and
SQL requires the owner's exact revision/hash approval. Existing tenant auto mode
is not a standing document-publication grant. Defining and implementing that
grant is a local decision/code prerequisite, not a real-provider smoke test.

Status: local implementation and read-only public-source spike prepared on
October 1, 2026. Production deployment and acceptance are pending. See the
[implementation receipt](../../operations/testing-and-ci.md#october-1-website-rebuild-implementation-receipt)
for measured results, local checks, and remaining gaps. The release is off by
default. This spec replaces the template-based plan in
`../../.scratch/website-creation/options-2026-10-01.html` (Option A, with B's
report and ownership and C's agency flow).

## Tenant zero

Jacob selected `scaffoldweb.com` as the custom domain on October 1, 2026.
Use Strelva as the business label for this internal production proof. The
verified owner/workspace, source content and exact production execution still
need to be established. Selecting the domain does not authorize a migration,
deployment, production environment change or domain attachment.

## What it does

A business pastes its current website address. A few minutes later Strelva
shows the same business on a new site: its own content, a design composed for
it, a working inquiry form and booking. Every claim on the site traces back to
the old site or the owner. The owner approves it, and it goes live on their
domain. After that, every change goes through approval, leaves a receipt and
can be undone. The owner can export the whole site at any time.

We believe a small business should get a site as good as a funded startup's,
without hiring anyone or filling in a single form. Their existing site already
contains the answers.

## The moment

The Mooney Firm's site, attymooney.com, is [n] years old. It lists the
practice areas, has a bio and some reviews. It has no booking and no
inquiry form, and ChatGPT doesn't name the firm for "[practice area] lawyer
Buffalo". Getting a new site today means a $2.5K–15K agency project. The
agency's first step is chasing the client for content they already published
years ago. That's the step design firms name as their #1 source of delay
(38.5%, GoodFirms).

## The experience

### Owner, self-serve

1. **One field.** "Your current website." There's a secondary link: "No site
   yet? Describe your business." There's no brief form and no template
   picker.
2. **Watch it build.** A live progress list: `Read 9 pages` → `Found 6 practice
   areas, 14 reviews, 1 bio` → `Composed home, about, practice areas, contact`
   → `Checked 31 facts: 29 supported, 2 need you`. The preview fills in as it
   goes.
3. **Review.** A full preview with one side panel that lists only what needs a
   decision:
   - Facts the checker couldn't confirm, each with its source sentence or
     "no source found"
   - High-risk claims: years, prices, guarantees, licenses, outcomes
   - Old pages that didn't map to a new page
   The owner confirms, edits or removes each one. Nothing else needs their
   attention.
4. **Approve and go live.** The site is live at `mooney.strelva.com`
   immediately. The domain step shows the exact DNS records and checks them
   every minute until the domain is verified.
5. **Before and after.** The audit runs on the old site and the new one and
   shows the score change, item by item.

### Strelva-managed client (the October 1 default)

The same pipeline, run by an operator from `/admin`. The client only sees
step 3, as a review link, and approves. Strelva does setup, testing, the
domain and maintenance. The client never touches Strelva's software or
agents.

### Agency

The agency pastes a prospect's URL inside its own workspace and gets a
private, noindexed preview plus the before/after audit to share as a signed,
expiring link. If the owner accepts, the site moves into the owner's
workspace. The agency keeps scoped, expiring edit access through the existing
agency draft authority. Strelva never contacts the prospect.

### After launch

- The owner asks the website agent: "Add a page for estate planning." The
  agent patches the site document. The change shows as a preview with a
  diff. The owner approves it, and it publishes with a receipt. Undo restores
  the prior revision.
- Every month (Option B), the owner gets a report: inquiries, bookings,
  whether AI assistants name the business, and the changes made, with
  receipts.
- Export at any time: the site document, a static build, images and data.

## Decisions

| Decision | Default | Why |
| --- | --- | --- |
| Input | Existing URL; description as fallback | 83% of small businesses already have a site (Clutch 2025). Their content is the brief. |
| Templates | Removed | Sites are composed from a typed component catalog. Composition varies; the components and tokens don't. |
| Who writes copy | Source content first, a writer model second | We don't invent facts. The model rewrites and structures what the business already said. |
| Who decides layout and checks facts | Jev, a typed decision model | Cheap (about $0.0006 a site) and fast (70–500 ms), and it returns a confidence we can set thresholds on. |
| What gets stored | One versioned site document per revision | Diffs, receipts, undo, preview and export all work on the same object. |
| Hosting | REB serves the site by hostname | No repo or Vercel project per site. Domains attach to the REB project. |
| Publishing | Owner approval; nothing auto-publishes on first launch | Matches outside-write governance. |
| Ownership | Export and leave at any time | The loudest complaint about Hibu and Thryv is "the site I paid for wasn't mine." |

What we removed: the brief form, the template picker, the downloadable tar as
the launch path, and per-site repos for this tier.

## Pipeline

```
intake → crawl → extract → write → compose → verify → render → review → publish → domain → operate
```

Each stage writes a typed result to the website's work record. Each stage can
be retried on its own. A failed stage never discards earlier stages.

### 1. Intake

- Input: `{ url }` or `{ description, businessName }`, plus the workspace and
  actor.
- Normalize the URL. Reject it unless `isSafeFetchUrl` (`src/lib/safe-fetch.ts:63`)
  passes. One rebuild per registrable domain per workspace stays in progress
  at a time. A repeat request with the same request ID reopens the same work.
- Rate limit: [n] rebuilds per workspace per day through `src/lib/rate-limit.ts`.

### 2. Crawl

- Start at the URL. Follow same-registrable-domain links only, breadth-first.
  Stop at **25 pages, 8 MB of HTML, or 60 seconds**.
- Respect `robots.txt` for the Strelva user agent. Record skipped paths.
- Reuse the audit fetcher (`runAuditSnapshot`, `src/lib/audit/checks.ts:452`)
  for each page's HTML, parsed handle and visible text.
- Sites that only render with JavaScript (Wix, some Squarespace): detect a
  near-empty visible text with heavy script. Fall back to a headless render in
  Vercel Sandbox. If that's unavailable, say so plainly and offer the
  description path.
- Images: collect `src`, `alt`, size hints, and Open Graph and favicon assets.
  Download the ones we use later, in the render stage, into tenant media
  (`uploadTenantMedia`, `src/lib/media-store.ts:138`).

Output: `CrawlResult { pages: CrawledPage[], skipped: SkippedPath[], assets: AssetRef[] }`.
Every `CrawledPage` has a stable `sourceId` (URL plus a content hash).

### 3. Extract

Pull structured facts out of the crawl without a model where possible:

- Rules extract JSON-LD, `tel:`, `mailto:`, address microformats, hours
  tables, nav structure, headings, and testimonial and review blocks.
- The writer model fills in the rest with a strict Zod schema. Each extracted
  item carries `sources: SourceRef[]` (page `sourceId` plus a quoted span of
  at most 300 characters).

Output: `BusinessFacts`: name, category, services, people, locations, hours,
contact, reviews, claims, brand colors (from CSS), logo, and old URL paths.

### 4. Write

- The model is `getPrimaryModel()` (`src/lib/ai-models.ts:23`, Gemini Flash),
  with the existing fallback, through `generateObject`.
- Input: `BusinessFacts` plus the page plan. Output: a `ContentBlock[]` for
  each planned page.
- **Rules the prompt and the schema both enforce:**
  - Every factual sentence references one or more `factId`s. Marketing
    sentences carry no facts.
  - No numbers, years, prices, credentials, guarantees or outcomes unless they
    come from a fact.
  - Keep the business's voice. Tighten it; don't replace it.
- Description path: the facts are the description, and every fact is
  `owner_stated`.

### 5. Compose (Jev)

The application turns each content block into **candidate components with
props already filled in**. Jev answers typed questions about which candidates
to use and where. It never writes text.

| Question | Type | Candidates |
| --- | --- | --- |
| Which pages should the site have? | choice, multiple | home, about, services index, a page per service, team, reviews, contact, FAQ, locations |
| Which component should present this block? | choice | the catalog entries whose props fit this block |
| Which variant fits this business? | choice | e.g. `Hero.split`, `Hero.image`, `Hero.statement` |
| What order should the home page go in? | choice over orderings | the 3–5 orderings the rules generate |
| Which palette fits these brand colors? | choice | the token palettes from DESIGN.md that pass contrast |

- Use json-render's `experimental_composeSpec` in `batch` mode where it
  helps: one call per page instead of one per element.
- Wrap it behind our own interface, `SiteComposer`, with three
  implementations:
  - `JevComposer`
  - `ModelComposer`: the writer model picks with `generateObject` over the
    same candidates
  - `RuleComposer`: deterministic defaults
- If Jev errors, times out (more than 2 s) or returns confidence below 0.55,
  fall back to the next composer. Record which one decided.

### 6. Verify (Jev)

Every node with facts gets checked against its sources before anyone sees it.

| Question | Type | Threshold |
| --- | --- | --- |
| Is this sentence supported by these source quotes? | boolean + confidence | ≥ 0.85 counts as supported; below that, flag it for the owner |
| Is this a high-risk claim (years, money, credentials, guarantees, medical or legal outcomes)? | boolean | true always needs the owner's confirmation, whatever the support score |
| Does this page carry the main content of its source page? | score 1–5 | below 3 lists the old page as "not carried over" |
| Is this page ready to show? | score 1–5 | below 3 regenerates once, then flags it |

The results are stored on each node as `verification`. Owners see the flags.
Operators see all scores.

### 7. Render

- The site document is rendered by a **catalog renderer** inside REB's
  `(public)` routes. A tenant with a site document renders from it.
  Everything else keeps today's `SectionRenderer` path untouched.
- Use `@json-render/react` and `@json-render/next` for spec rendering and
  streaming preview, behind a `SiteRenderer` interface so the dependency can
  be replaced. **Adding them needs Jacob's yes.**
- Per-tenant SEO must be correct before anything goes live:
  - canonical URL
  - Open Graph tags
  - JSON-LD (`LocalBusiness`, or `LegalService` and other subtypes, from
    facts)
  - `sitemap.xml`, `robots.txt` and icons
  Today these are global (`src/app/(public)/layout.tsx:46,125`,
  `src/app/sitemap.ts:5`, `src/app/robots.ts:9`). Fixing them benefits every
  hosted tenant.
- Rehost every image we use into tenant media and serve it through
  `next/image`. Never hotlink the old site.
- Revalidate through the existing content revalidation path on publish.

### 8. Review

- Private preview at `/workspace/.../websites/[workId]/preview/[revision]`.
  It is noindexed, frames only same-origin, and never submits forms. This is
  the existing preview policy.
- The review panel lists flagged facts, high-risk claims and old pages that
  weren't carried over. Each item resolves to confirm, edit or remove. Any
  resolution creates a new revision; approval clears whenever the content hash
  changes. That's existing behavior (`websiteArtifactSchema`).
- Approval is blocked while any high-risk claim is unresolved.

### 9. Publish

- First publish creates the tenant: `createTenant` (`src/lib/tenants.ts:476`)
  with `deliveryModel: "platform_template"`. That's the existing value, so
  there's no contract change. The tenant gets a slug from the business name,
  checked for collisions.
- Write the approved site document revision as the published pointer. Bind
  the workspace website to the tenant.
- A launch receipt (`websiteLaunchReceiptSchema`, status `published`) records
  the provider `strelva-hosted`, the URL, the artifact hash and the candidate
  revision.
- Read back: fetch `https://[slug].strelva.com/` and compare the rendered
  document hash. A failed read-back is recorded separately and is **not**
  retried as a new publish (AGENTS.md, outside writes).

### 10. Domain

- `addCustomDomain` (`src/lib/domains.ts:340`), then `refreshDomainClaim`
  (`:394`) on a backoff until Vercel reports the config verified. The
  existing domain map then routes it.
- The UI shows the exact A/CNAME records Vercel returns, the current status
  and the last check time.
- Old-URL redirects: every crawled path maps to a new path or to the closest
  parent. Redirects are stored on the site document and served as 301s by the
  proxy for hosted tenants.
- Domain verification doubles as the ownership check. A rebuilt copy of a
  site cannot go live on that site's domain without DNS control.

### 11. Operate

- **Agent edits.** Add two tools beside the section tools in
  `src/app/api/agent/route.ts`:
  - `read_site(path?)`: returns nodes with IDs.
  - `patch_site(ops)`: RFC 6902 operations on nodes, validated against the
    catalog with Zod.
  Patches go through `decideAiContentGovernance` (`src/lib/ai-governance.ts:137`).
  New fact claims re-run verification.
- **Auto-approve.** Jev scores each patch's risk alongside the existing
  streak logic (`src/lib/ai-auto-approve.ts:37`). A patch publishes without
  review only when governance allows it, risk confidence is ≥ 0.9 low, and
  the tenant has auto mode on. Today no tenant has auto mode on.
- **Undo.** Republish the previous revision as a new revision that is
  force-reviewed. This matches `forceReview` in `applySectionUpdate`.
- **Monitoring.** The site's domain joins `domain-monitor` automatically. Add
  a `website-health` cron that fetches each hosted site daily, checks status
  and the rendered hash, and alerts on drift or failure. It gets declared in
  `vercel.json`, authenticated with `requireCronRequest`, and registered in
  `CRON_MAX_AGE_SECONDS`.
- **Monthly report (B).** Inquiries and bookings from the native stores, the
  AI-visibility check, and receipts for changes. It's sent through
  `src/lib/email/send.ts` from `updates.strelva.com` and gated by
  `email-enabled.ts`. It's also always visible in the workspace.

## The site document

One immutable, hashed document per revision. It is the source for preview,
render, diff, receipts, undo and export.

```ts
const SiteDocument = z.object({
  version: z.literal(2),
  siteName: shortText(160),
  theme: z.object({
    palette: PaletteId,            // a DESIGN.md palette, chosen by Jev, contrast-checked
    accent: HexColor.optional(),   // from brand CSS, only if it passes contrast against the palette
    typeScale: z.enum(["compact", "standard", "editorial"]),
    logo: AssetId.optional(),
  }).strict(),
  pages: z.array(z.object({
    path: SafePath,                // "/", "/about", "/services/estate-planning"
    title: shortText(70),
    description: shortText(160),
    root: NodeId,
  }).strict()).min(1).max(12),
  nodes: z.record(NodeId, CatalogNode),   // flat map, json-render style
  facts: z.record(FactId, Fact),
  assets: z.record(AssetId, Asset),
  capabilities: websitePublishedCapabilitiesSchema.optional(),  // existing contract
  redirects: z.array(z.object({ from: SafePath, to: SafePath })).max(200),
  provenance: z.object({
    sourceUrl: z.string().url().optional(),
    crawledAt: IsoDate.optional(),
    composer: z.enum(["jev", "model", "rules"]),
  }).strict(),
}).strict();

const Fact = z.object({
  text: shortText(500),
  kind: z.enum(["contact", "hours", "location", "service", "person", "credential", "number", "review", "claim"]),
  highRisk: z.boolean(),
  origin: z.enum(["source", "owner_stated", "owner_confirmed"]),
  sources: z.array(z.object({ sourceId: z.string(), quote: shortText(300) })),
  verification: z.object({ supported: z.boolean(), confidence: z.number().min(0).max(1) }).optional(),
}).strict();
```

`CatalogNode` is a discriminated union over the catalog below. Each node has
`id`, `type`, `variant`, typed `props`, `children` (node IDs) and `factIds`.
A document that fails `SiteDocument.parse` can't be saved, previewed or
published.

The existing v1 `websiteSpecSchema` (`src/products/websites/contracts.ts:104`)
stays readable. v1 websites keep rendering and exporting as they do today.
The two versions are kept apart by `version`.

## The catalog

About 22 components. Each one is a React component built from DESIGN.md
tokens, with Zod props. Most start from the existing section components in
`src/components/public/`.

| Component | Variants | Starts from |
| --- | --- | --- |
| `Header` | logo-left, centered | `Header.tsx` |
| `Footer` | simple, columns | `Footer.tsx` |
| `Hero` | split, image, statement | `Hero.tsx` |
| `TrustStrip` | logos, stats, badges | `TrustStrip.tsx` |
| `ServiceGrid` | cards, list, icons | `Services.tsx` |
| `ServiceDetail` | standard | new |
| `Story` | split, long-form | `Story.tsx` |
| `TeamGrid` | cards, single-bio | new |
| `Testimonials` | carousel, wall, single | `Testimonials.tsx`, `TestimonialQuote.tsx` |
| `ReviewSummary` | stars-and-count | new |
| `Faq` | accordion, two-column | `Faq.tsx` |
| `Stats` | row | new |
| `Gallery` | grid, masonry | new |
| `Hours` | table | new |
| `Map` | static image plus link | new; no third-party embed by default |
| `Locations` | list | new |
| `Cta` | band, card | `PageCTA.tsx` |
| `InquiryForm` | inline, card | new; posts to `/api/v1/leads/[tenant]` |
| `Booking` | inline | `BookingWidget.tsx`; native booking grant when bound |
| `PageHeader` | standard | `PageHeader.tsx` |
| `RichText` | standard | new; limited markdown subset |
| `Section` | container, band | new layout primitive |

Every component handles empty props by rendering nothing. None of them
render unsupported markup. Contrast and focus states come from tokens.
Changes go into `docs/design/component-system.md`.

## Data and storage

- **Postgres** owns site document revisions, the published pointer, facts
  and receipts. New table: `website_documents`
  (`workspace_id, website_work_id, revision, content_hash, document jsonb,
  created_by, created_at`), immutable rows, RLS by workspace membership, read
  by the service role only through RPCs. **A migration is required and needs
  Jacob's yes.**
- **Redis** caches the published document by tenant for rendering. Cache
  miss means read from Postgres. Redis is never the authority.
- **Media**: rehosted images live in tenant media with source URL and hash.
- **Crawl results** are kept 30 days for debugging and evidence, then dropped.
  Facts and quotes remain on the document.

## API

Additive only. Nothing changes under `/api/v1`.

| Route | Purpose |
| --- | --- |
| `POST /api/websites/rebuild` | Start from `{ url }` or `{ description, businessName }`; returns `workId` |
| `GET /api/websites/[workId]/progress` | Stream stage events (server-sent) |
| `POST /api/websites/[workId]/facts/[factId]` | Confirm, edit or remove a flagged fact |
| `POST /api/websites/[workId]/approve` | Existing approval, now on v2 documents |
| `POST /api/websites/[workId]/launch` | Publish to `slug.strelva.com` (hosted provider) |
| `POST /api/websites/[workId]/domain` | Attach a domain; `GET` returns status and records |
| `GET /api/websites/[workId]/export` | Existing export, extended for v2 |
| `POST /api/websites/[workId]/share` | Agency: signed, expiring preview link |
| `POST /api/websites/[workId]/handoff` | Agency: move to the accepting owner's workspace |

Every route checks workspace membership and permission (`requireTenantAccess` /
workspace equivalents). Agency routes also check the agency's scoped grant.

## Export

One archive:
- `site.json`: the current document
- `site/`: a static HTML build from the same renderer
- `assets/`
- `facts.csv`
- `receipts.json`
- `redirects.csv`

It's included in the workspace export snapshot. The static build is checked
the same way as today's export: build it, hash it, compare.

## Failure paths

| Failure | What the user sees | What the system does |
| --- | --- | --- |
| URL unreachable or unsafe | "We couldn't open [url]." Retry, or describe instead | Nothing is created beyond the work record |
| Blocked by robots.txt | Lists the skipped pages; offers description | Crawls the allowed pages only |
| JavaScript-only site, no sandbox | "This site needs a browser to read." Description path | Records the reason |
| Writer model fails | Stage shows failed, with Retry | Earlier stages kept; fallback model tried once |
| Jev unavailable | Nothing visible | Model composer, then rules; recorded on provenance |
| Fact can't be verified | Listed in the review panel | Never auto-published |
| Publish read-back fails | "Live, but we couldn't confirm it yet" | Recorded separately; no republish |
| Domain never verifies | Status, records, last check | Backoff to daily after 48 h; operator alert after 7 days |
| Slug collision | None | Suffix, then recheck |
| Owner revokes or workspace exits | Site stays live until exit completes | Exit flow hands off or retires the tenant |
| Duplicate rebuild request | Reopens the same work | Request ID dedupe |

## Cost and speed targets

| Measure | Target |
| --- | --- |
| URL to first preview | under 3 minutes, half of runs |
| Model cost per site (writer) | under $0.05 |
| Jev cost per site | under $0.002 |
| Pages carried over intact | 90% or more of crawled content pages |
| Facts supported without owner action | 85% or more |
| Lighthouse on the published site | 90+ performance and accessibility on mobile |

These are targets, not measurements. The spike measures them.

## Done means proven: the bar for a 5

- [ ] A rebuild from a real URL produces a live site on a verified custom
      domain in production, on tenant zero.
- [ ] Inquiry form submits to the native inquiry or lead store and shows in
      the owner's inbox; booking writes to a real calendar where bound.
- [ ] Every factual sentence has a source or owner confirmation. High-risk
      claims block approval until resolved.
- [ ] Agent edits patch the document, preview, publish through governance,
      leave receipts and undo.
- [ ] Export builds and matches the published hash.
- [ ] Per-tenant SEO is correct on hosted sites, checked by test.
- [ ] Failure-path tests for every row of the failure table.
- [ ] Desktop and mobile review of entry, progress, review panel, preview,
      domain step and the published site, including empty, loading, error and
      permission states.
- [ ] `pnpm check`, `check:custom-repos`, `check:workspace-sql` and
      `check:workspace-upgrade` pass. Existing tenant storefront responses are
      byte-identical before and after.
- [ ] `website-health` cron declared, authenticated and registered.

## Build plan

| Phase | Work | Days |
| --- | --- | --- |
| 0. Spike | attymooney.com through the template rebuild and the catalog plus Jev rebuild, side by side with screenshots, timing and fact counts | 3 |
| 1. Document and catalog | `SiteDocument` v2, 22 components, catalog renderer, per-tenant SEO | 5 |
| 2. Pipeline | Crawl, extract, write, compose, verify; progress stream; failure paths | 4 |
| 3. Review and publish | Review panel, hosted launch, read-back, domain step, redirects | 3 |
| 4. Operate | Agent `read_site`/`patch_site`, undo, `website-health`, export v2 | 3 |
| 5. Report and agency | Monthly report, share link, handoff | 3 |

About 21 working days including the spike. Phases 1–3 are a usable,
proven product on their own.

**Kill rule from the spike:** if the Jev composer doesn't beat the model
composer on a blind side-by-side of [n] sites, drop Jev from composition and
keep it only for verification and edit risk. If the catalog site doesn't beat
the template rebuild, keep templates for phase 1 and revisit.

## Needs Jacob's yes

1. **Hosting this tier on REB.** AGENTS.md says each paid client site gets its
   own repo and Vercel project. This tier is the exception. Custom-repo
   clients don't change.
2. **New dependencies:** `@json-render/core`, `@json-render/react`,
   `@json-render/next`.
3. **Model providers:** Jev through Vercel AI Gateway or OpenRouter (a new
   key), plus paid writer calls.
4. **Database migration** for `website_documents`.
5. **Production env:** `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`,
   `AI_GATEWAY_API_KEY` or `OPENROUTER_API_KEY`.
6. **Creating tenant zero** and attaching its domain in production.
7. **For the monthly report:** client email on, and pricing.

## What it can't do yet

- **Ecommerce migration.** Shop products don't carry over.
- **Blogs over 25 pages.** Only the first 25 crawled pages are read.
- **Logged-in areas and member portals.**
- **Pixel-perfect copies.** This is a redesign, not a clone.
- **Sites in a language other than English** haven't been tested.
- **JavaScript-only sites** depend on Vercel Sandbox, which this repo hasn't
  used yet.
- **Jev is in beta,** and the json-render integration is marked
  `experimental_`. Both sit behind our interfaces so either can be swapped
  out.

## Open questions

- Which DESIGN.md palettes and type scales go into the catalog first.
- Whether `Map` should embed a provider map or stay a static image.
- Jev's real accuracy on fact support. The spike measures agreement with a
  human check on [n] facts.
- Monthly report contents and price, which sit with the commercial decision.
