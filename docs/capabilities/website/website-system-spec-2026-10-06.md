# The website System at 1.0.0

Status: draft spec, 2026-10-06, not approved. **Built and proven locally
Oct 6 on `w2/owner-surfaces-b`, not migrated or deployed:** the System
page's edit control opens `/workspace/site` (the existing editor, photos,
look, collections, history, connections and Google Business panels, reused
under the tenant's own API checks) for sites that read Strelva content
(gldf, rohlax, rhm-innovations, hosted templates); custom-repo sites with
no Strelva content get "Ask for a change", which files a Request and shows
its preview, owner decision and deploy receipts
(`20261008111000_website_change_receipts.sql`, behavior 9 and "New" item
6). Strelva records previews and deploys by hand; nothing deploys from
here. Not built: the rest of this spec. Note: behavior 6 says owners see a
preview, never an editor; the workspace editor carries today's
`/dashboard/site` editor over for parity (owners and admins), so that rule
is not enforced yet.

**Then built locally Oct 8 on
`w2/website-system` (not production, migrations need Jacob's yes):**
new item 5 (publish a rebuild onto a linked tenant,
`publish_website_document_to_linked_tenant`, real template instead of
`wellness`), audit P2 #8 (routing after a rename), connected sites as the
new-business entry (decision 3 working default: item 7, behavior 18, with the
fact and inquiry merges, the `connected_site` origin, domain-ownership proof
and retention), behaviors 3, 4, 5 and 10 on the System page (domain state,
Waiting on you, Requests, one History), operator domain work on the owner's
approval (behaviors 12 and 13), and "Make it yourself instead". **Not built:**
website `system_revisions` (item 1), repo-deploy receipts (item 6), Make real
wired to the linked publish (behavior 16 still runs in the sandbox), owner
email approval of a domain, the rebuild cutover undo, and "Ask for a change"
filing a Request (it still pre-fills the composer).

Both merged on `integrate/reborn-1.0` (Oct 6): `/workspace/site` is one route.
With a `system` it opens the site editor tabs (Strelva-content sites) or
"Ask for a change" (repo-only sites, files a Request); without one it is the
connected-site entry (bring the website the business already has), open only
where `STRELVA_CONNECTED_SITES_RELEASE=1` and Systems is on for that business.
The System page's own "Ask for a change" still pre-fills the composer.

Under the October 6 working defaults, every recommendation here is what the
build follows unless Jacob overturns it
([product model](../../product/product-model.md#decisions-the-specs-need)).
None of them authorizes a production step.

**A business's website is the first thing it finds in Strelva, by its own
address: "greatlakesdriedfruit.com · Live". It shows the real site, whether
it's working, what's waiting on the owner, and every past release with undo.
Strelva makes the changes. The owner approves the few that are theirs, by
email if they never sign in.**

This spec covers the website as a System: the live site in the workspace,
edits and publishing for existing sites, domains as Connections, the rebuild
as a Possibility, connected sites, how identity survives a rebuild, and open
decision 3 (how a new business's website comes in).

Sibling specs own the parts this one only uses: approvals and email links
([needs-you](../../product/specs/needs-you.md)), health and domain checks for
every site ([operator](../../product/specs/operator.md), behaviors 9–11),
Twin Trees as two Versions ([agency-and-versions](../../product/specs/agency-and-versions.md)),
blog and collections as website content ([publishing](../publishing/publishing-spec-2026-10-06.md)),
`/dashboard/site` redirects ([owner-entry](../../product/specs/owner-entry.md)).

## 1. The moment

**gldf, a homepage change, owner never signs in.** gldf is a custom-repo
client whose repo reads its content from Strelva (`/api/v1/content`,
`page-config`, `site-capabilities`, per `release-manifest.json`).

- The owner emails Strelva: "Put the holiday gift boxes at the top of the
  homepage until December 20."
- Strelva drafts the hero change through the existing draft path
  (`/api/content/[section]?draft=true`, `src/lib/storage/draft-store.ts`).
  It is `copy.marketing`, so a Strelva reviewer checks it. It is a dated
  promotion on the homepage, so it reaches the owner as one Needs you item.
- The owner gets one email: a before/after image of the hero, the dates, and
  **Approve** and **Not yet**. The link is a signed one-tap link bound to this
  item and this owner (needs-you behavior for owners who don't sign in).
- They tap Approve. Strelva publishes the content, calls the repo's
  revalidate hook (`revalidateClientSite`, `src/lib/revalidate-client.ts`),
  fetches the live homepage, and confirms the new hero is there.
- The receipt lands under **Strelva handled**: "Strelva put the holiday gift
  boxes on greatlakesdriedfruit.com." It has **Undo**. On December 20 a
  Running item ("Holiday hero comes down December 20") reverts it, with its
  own receipt.

**McClear's, a new page.** McClear's repo reads no content from Strelva. It
only posts leads and tracking (`leads`, `track`). A new page means changing
code in the repo.

- The owner asks for a "private events" page. It becomes a **Request**:
  Asked, then In progress once Strelva agrees scope and a date.
- Strelva builds it on a branch of the client repo. The owner gets a preview
  link by email: **Ready for your review**.
- They approve. Strelva deploys. The website's History shows "Private events
  page added" with the deploy as its receipt. The owner never sees GitHub.

**Anyone who opens the workspace** sees the website by its address, Live, with
a health mark ("Up · checked 2 hours ago"), the live site in the frame, one
change waiting on them, one Request in progress, and its History.

## 2. In the model

| Thing | Noun | Source today |
| --- | --- | --- |
| The website | **System**, kind `website` | `systems` (`supabase/migrations/20261004120000_systems.sql`); projected by `src/platform/systems/from-existing.ts` |
| Its identity | origin `tenant:<stable_id>` for every existing client; `saved_work:<id>` for a site first made in the workspace | `system_origin_id()`, immutable by `system_identity_guard` |
| How it is built right now | the current `system_revisions.implementation` (`{kind, ref, contentHash}`) | new rows; nothing writes them for websites yet |
| Domain | **Connection** `appear` → `target_type = 'domain'` | `domain_claims` + `tenants.custom_domains`; hosted domains in `rebuild-domains.ts` |
| Hours, phone, address, services | **Connection** `read` → business record | `src/platform/business-record/` |
| Inquiry form, booking widget on the site | **Connections** `appear` from those Systems onto the website | already projected in `from-existing.ts` |
| Search Console, GA4 | **Connection** `read` → Google account binding | publishing spec |
| Store checkout in the client repo | **Connection** `appear` with the client's own checkout | systems-catalog spec |
| A rebuild, an agency draft, a section alternative | **Possibility** | `rebuild-possibility.ts`; `agency_managed_website_draft_*` |
| Publishing a Possibility | **Make real** | `/api/workspace/systems/make-real` (sandbox only today) |
| Past releases | **History** | `content_versions`, `site_snapshots`, `website_documents` revisions, deploy receipts |
| Is it up | **Health** | domain-monitor, scan, `revalidationHealth`, `website_document_health` |
| Repo work with an end | **Request** | Redis `change_request` events; workspace `service_requests` |
| "Your site stays up and your domain stays verified" | **Running** | domain-monitor, website-health crons |
| Twin Trees, two locations | **Versions** | agency-and-versions spec |

**Four implementation kinds.** The System doesn't change across them. Only the
current revision's `implementation.kind` does:

| `implementation.kind` | `ref` | Who serves it | Edits | Clients today |
| --- | --- | --- | --- | --- |
| `custom_repo_content` | tenant slug + repo commit | the client's Vercel project, content from `/api/v1` | native for declared sections, repo Request for the rest | gldf, rohlax, rhm-innovations |
| `custom_repo` | tenant slug + repo commit | the client's Vercel project, no Strelva content | repo Request | mclears, orange-crate, leslie-bookkeeping, smokin-buddha, cocard-anderson |
| `website_document` | work id + revision | REB by hostname (`hosted-public.tsx`) | native (`patch_site`, `/api/websites/[workId]/patch`) | none in production |
| `connected_site` | `connected_sites.id` | anyone (Wix, Squarespace, a builder) | not Strelva's; facts and forms only | none; vermont-unlimited (Wix) fits here |

*(Inference: vermont-unlimited declares no `/api/v1` endpoints and, per the
connected-sites doc, is still on Wix, so it is a `connected_site` at 1.0.0, not
a custom repo.)*

## 3. What it does at 1.0.0

Each behavior is testable on the Strelva-owned test business (tenant zero,
`scaffoldweb.com`, rebuild spec) plus a fixture of each implementation kind.

**The site in the workspace**

1. Every converted client's website appears on Home and as a System page, named
   by its primary domain, with lifecycle (tenant `active` → Live, inactive →
   Paused) and a separate health mark.
2. The page gives most of its space to the live site in a frame. "Visit site"
   opens the domain. Today's `SystemPage.tsx` already does this.
3. Domain status is shown per domain: verified, pending, misconfigured or
   conflict (`domain_claims.status`), with the last check time. "Live · domain
   misconfigured" is valid and does not change lifecycle.
4. **Waiting on you** on the website page lists that site's open owner items:
   content drafts awaiting review (`draft-store`), Redis `draft_review` events,
   v2 candidates awaiting approval (`website_document_heads`). These are the
   same items as Home's Needs you, filtered to this System. Nothing is stored
   twice.
5. **Requests** on the page lists that site's open Requests, from Redis
   `change_request` events (through the operator projection) and
   `service_requests` attached to this System. "Ask for a change" files a
   Request. It no longer only pre-fills the composer (`WorkspaceLayout.tsx:312`).

**Edits and publishing**

6. For `custom_repo_content` and `website_document`, Strelva drafts changes
   natively (Ask Strelva, or an operator). The owner sees a before/after
   preview, never an editor. Owners don't build at 1.0.0; they ask.
7. Each change takes its route from the needs-you policy table:
   `fact.owner_stated` is handled, `copy.routine` goes to Strelva review,
   `structure` goes to the owner as a Request, and the first launch or a domain
   change is `system.go_live`.
8. Publishing a native change writes content, revalidates (custom repo) or
   moves the published pointer (document), then reads back the live page.
   - The receipt records accepted and read-back as separate facts.
   - A failed read-back is never retried as a new publish (AGENTS.md).
9. For `custom_repo` (and repo-level changes to `custom_repo_content`), the
   change is a Request. Strelva works on a repo branch, the owner reviews a
   preview deployment URL, and approval deploys it.
   - The deploy is recorded as a History entry with a receipt (commit,
     deployment URL, read-back).
   - Repo links are for operators only.
10. **History** lists every release of this System, newest first, from all
    sources: `content_versions`, `site_snapshots`, `website_documents`
    revisions and repo-deploy receipts. Each entry says who did it
    ("Strelva", "You") and what changed, and offers **Undo** where undo
    exists (section 7).
11. Business record changes reach the site through the `read` Connection.
    - `website_document` sites read the record at render.
    - `custom_repo_content` sites get the change as a content write.
    - `custom_repo` sites can't read it, so the Connection is shown as **Not
      connected**, plainly, with "Strelva updates this site by hand"
      (`RULE_SYSTEM_CONNECTION_CONTRACT`: failure behavior stated).

**Domains**

12. Each domain is a Connection with a stated contract: direction `appear`,
    authority (Strelva may check it; changing it is owner-only,
    `system.go_live`), source of truth (`domain_claims`, Vercel for hosted),
    freshness (last check), failure behavior (health mark plus a Needs you
    owner action with the exact DNS records).
13. Adding or moving a domain is owner-decided and DNS-dependent. Strelva
    prepares the records. The owner (or their registrar contact) gets them by
    email. Strelva checks until verified (`website-domain-verification`
    backoff) and sends a receipt when it routes.
14. For custom-repo sites, domains live on the client's own Vercel project.
    Strelva shows and monitors them (domain-monitor already scans every active
    tenant). It does not change them without Jacob's yes.

**Possibilities**

15. A rebuild of an existing site is a Possibility on **that** System, not a
    new System. It opens beside the current site and "Compare" shows both. Its
    evidence is pages carried over and the before/after site check (exists in
    `rebuild-possibility.ts`).
16. **Make real** on a rebuild publishes onto the same tenant (section 5, new
    work) and reports item by item:
    - document published
    - read-back
    - domain moved
    - old project kept as fallback
    - redirects live

    The domain step waits on DNS and says so.
17. Agency website drafts show as Possibilities on the client's website
    System, under their existing grants.

**Connected sites** (if decision 3 picks them; see section 9)

18. A connected site is a website System with origin `connected_site`. Its
    page shows the site in a frame, "reporting" health (`last_event_at`),
    inquiries flowing into the business's inquiries System, and facts read
    from the business record.

## 4. States and rules

**Lifecycle** (`systems.lifecycle`): `draft` (a site made in the workspace and
not yet published), `live`, `paused` (tenant inactive, or the owner paused it).
Pausing a custom-repo site does not take it down. Strelva stops changing it.
The domain and repo are untouched. Taking a site offline is `exit`, not pause.

**Health** (separate): `up`, `degraded` (revalidation failing, read-back
unverified, scan grade drop), `down` (domain-monitor down or parked),
`unknown` (no evidence). Domain verification is health of the domain
Connection.

**Who can do what**

| Actor | Can | Never |
| --- | --- | --- |
| Owner | Approve or decline owner items; launch, publish a Possibility, change domains; undo; file Requests | Has to sign in for any of it except access, money and exit |
| Admin member (Strelva operator in converted workspaces) | Draft, prepare, approve `strelva_reviews` items; run checks; prepare domain records | Launch, publish a Possibility, change domains (`website_document_assert_launch_owner`) |
| Member | See the site, history and health; file a Request | Approve, publish, change domains |
| Agency (Strelva at 1.0.0) | Prepare drafts and Possibilities under a grant | Owner decisions |

**Rules**

- The System id never changes: not across a slug rename, a rebuild, a domain
  move or a switch from custom repo to hosted document.
- An issued receipt never rewrites. Undo is a new release.
- Strelva never auto-publishes a first launch or a domain change.
- A domain is never attached to a rebuilt copy without DNS control by the owner
  (verification doubles as the ownership check, rebuild spec §10).
- Vercel domains are never removed. Strelva removes only its own claim
  (operator spec).
- No `/api/v1` change except additive. No `reb:` key renamed.

## 5. Built on

**Reused (paths are from this branch):**

- Systems spine: `src/platform/systems/*`, `20261004120000_systems.sql`, flag
  `STRELVA_SYSTEMS_RELEASE` (`src/platform/systems-release.ts`).
- System page: `src/experience/systems/SystemPage.tsx`, `from-workspace.ts`,
  `server.ts`; health from `src/platform/system-health`.
- Tenant content: `/api/content/[section]`, `/api/publish`,
  `/api/content/[section]/versions`, `/api/site-snapshots`,
  `src/lib/storage/{draft-store,version-store,site-snapshot-store}.ts`,
  `revalidateClientSite`, `revalidation-reconcile` cron,
  `src/lib/website-history.ts`.
- Repo changes: `/api/change-requests`, `CustomChangeRequestMetadata`,
  `redeployVercelProject` (`src/lib/vercel.ts`).
- Hosted documents: `website_documents`, `_heads`, `_publications`,
  `_receipts`, `_health`, `/api/websites/[workId]/*`, `rebuild-service.ts`,
  `site-operations.ts` (`prepareSitePatch`, `prepareSiteUndo`).
- Domains: `src/lib/domains.ts`, `src/lib/db/domain-claims.ts`,
  `rebuild-domains.ts`, crons `domain-monitor`, `website-domain-verification`,
  `website-health`.
- Link: `tenant_workspace_links` is the one link
  (`20261002120000_business_record.sql`). `offering_website_bindings` is read
  only as a fallback, as `from-existing.ts` already does.
- Approvals and email: needs-you spec (one-tap links, `src/lib/approve-link.ts`,
  `src/lib/email/send.ts`).

**New:**

1. Website `system_revisions` written on every release, with
   `implementation.kind` from the table in section 2. The tenant's
   `delivery_model` (`custom_repo | platform_template`) and the published
   document decide the kind. S.
2. "Waiting on you" and "Requests" on the System page, read from the
   operator's single queue projection filtered by System id. S–M, depends on
   the operator spec.
3. One History list across the four sources. M.
4. One domain view across `tenants.custom_domains` and `domain_claims` (the
   same projection the operator spec builds). S.
5. **Publish a rebuild onto an existing tenant.** Today `launch` always calls
   `reserve_website_hosted_tenant`, which raises `website_publication_conflict`
   for a tenant that exists without a reservation. It also hard-codes template
   `wellness`.
   - New RPC: publish a document to a tenant linked to this workspace through
     `tenant_workspace_links`, by the workspace owner.
   - It sets `delivery_model = 'platform_template'` on that row. It keeps
     `stable_id`, slug and `customRepo` metadata (for History and fallback).
   - Migration, Jacob's yes. M.
6. Repo-deploy receipts for `custom_repo` Requests: commit, deployment URL,
   read-back. S.
7. Connected sites, if chosen: a `connected_site` origin kind, plus the merges
   in section 9. M–L.

**Retires:** "Website controls" as the only way to change a site (it stays as
an operator link to `/dashboard/site`). The workspace's own "Revision
history" naming becomes History. Make real's always-listed "Publishing the
rebuilt site at {domain}: not connected" goes once item 5 lands.

**Tenant model vs workspace model.** The tenant stays the runtime for every
existing site: storefront routing, `/api/v1`, `reb:` keys, `content_versions`.
The workspace holds the System, its revisions, Connections, History view and
approvals. The System page reads the tenant through the link. It never copies
tenant content.

## 6. Moving today's clients

1. **Conversion first** (Reborn §3, `scripts/convert-tenant-to-workspace.ts`).
   Once a tenant has a `tenant_workspace_links` row, its website System appears
   by projection. Nothing about the site, repo, `/api/v1` or `/dashboard`
   changes. gldf goes first.
2. **Store the System** (`createSystem` with origin `tenant:<stable_id>`, same
   id as the projection) and write revision 1 with the current implementation
   kind. This is read-only toward the site.
3. **Owner invite** (owner-entry spec). Until a client has an `owner`,
   launch, domain and Make real are impossible
   (`website_document_assert_launch_owner`). Content approvals keep working
   through today's tenant approve links.
4. **Edits keep flowing the old way** until the System page's waiting and
   History lists are proven against the same tenant. `/dashboard/site` stays
   reachable for operators throughout.
5. **No site moves implementation as part of 1.0.0.** Rebuilding an existing
   client is a Possibility the owner can choose later. It is never a migration
   step.
6. **Check per client:**
   - storefront responses byte-identical before and after
     (`pnpm check:custom-repos`)
   - the System id equals `system_origin_id(workspace, 'tenant', stable_id)`

**Facts that shape this:** all nine live clients are custom repos. Three read
content from Strelva, five only send leads or tracking, and one declares no
endpoint (`release-manifest.json`). So at 1.0.0 most edits on most live
sites are repo Requests, not native edits. That is the honest picture.

## 7. Failure and undo

| Failure | The person sees | The system does |
| --- | --- | --- |
| Revalidate hook fails | "Published; your site hasn't refreshed yet" | `revalidation-reconcile` retries the hook (not the publish); operator item after the existing threshold |
| Read-back doesn't find the change | "Done, not yet confirmed" | `verify.failed` to the operator queue; never re-published |
| Repo reads content with a local fallback and the env var is unset | Change shows as published, site unchanged | Read-back catches it. *(Inference: rhm reads content "only when REB_API_URL is set" per the manifest)* |
| Domain misconfigured | "Live · domain needs a DNS fix", with records | Needs you owner action; backoff checks; operator alert at 7 days |
| Owner link expired or item changed | "This changed since we emailed you" | Nothing acts |
| Rebuild Make real: document live, domain not moved | Item by item: "Live at gldf.strelva.com · domain waiting on DNS" | Landed parts keep receipts; old site stays on the domain |
| Owner missing (converted, not invited) | Operator sees "No owner can approve this" | Item held; owner-entry invite path |

**Undo, by kind:**

- Tenant content: restore the prior `content_versions` entry. Today
  `restoreVersionToDraft` makes it a draft needing review. A Strelva-handled
  change undoes in one tap, under the needs-you rule.
- Hosted document: `prepareSiteUndo` saves the earlier revision as a new
  candidate. It needs owner approval (`undo_needs_review`).
- Repo deploy: redeploy the previous commit (`redeployVercelProject`). It is
  an operator action and a new History entry.
- Rebuild cutover: point the domain back at the client's Vercel project and
  restore `delivery_model = 'custom_repo'`. Possible only while that project
  is kept; recommended at least 30 days (section 9).
- Domain removal and Vercel domain changes: no undo. Stated, not faked.

## 8. Proof

- **Unit and SQL:**
  - identity holds across a slug rename, a `custom_repo` →
    `website_document` publish and a `connected_site` → `website_document`
    publish (the systems-transition step 2 proof)
  - publish-onto-linked-tenant RPC refuses an unlinked tenant, a non-owner
    and a stale approval hash
  - History merges the four sources in order
  - `pnpm check:workspace-sql`, `check:workspace-upgrade`
- **Contract:** `pnpm check:custom-repos` and byte-identical storefront
  responses for every tenant before and after conversion.
- **Journeys** (desktop and mobile; empty, loading, error, permission states):
  - gldf fixture: email-approved hero change → receipt → undo
  - McClear's fixture: Request → preview → approve → History entry
  - tenant zero: rebuild → compare → Make real → domain pending → verified
- **Production proof on tenant zero** (`scaffoldweb.com`): a published change
  with read-back and undo, a domain verified by the cron, and health shown on
  the System page with the rebuild flag on. Each step needs Jacob's yes.
- **Converted client:** gldf's website System shows correct domain, health,
  waiting items and History, with zero storefront diff.

## 9. Open decisions

**Decision 3: how a new business's website comes in.**

The record conflicts. The connected-sites doc on `feat/connected-sites` says
that on October 2 Jacob "decided Strelva stops building and rebuilding websites
as the product", with the paste-URL rebuild "Shelved". `strelva-1.0.0.md` and
the product model list it as open.

**Option A: paste-URL rebuild.** A new business pastes its URL (or Strelva's
operator does, the Oct 1 managed default).

- **What happens:**
  - The rebuild crawls up to 25 pages, extracts facts with sources, composes a
    site and checks every claim.
  - The owner reviews flagged facts by email.
  - Approval publishes to `<slug>.strelva.com`. The domain moves after DNS.
  - The System is born `draft` with origin `saved_work`, and becomes `live` at
    launch. Its implementation is `website_document`.
- **What exists:** the whole pipeline, review, launch, domain step, health
  cron, undo and export. All local, flag off (`STRELVA_WEBSITE_REBUILD_RELEASE`).
  It has never run in production. Tenant zero is unproven.
- **What's missing:**
  - production migration of `website_documents`
  - `reserve_website_hosted_tenant` hard-coding `wellness`
  - JavaScript-only sites (needs Vercel Sandbox)
  - production env (`VERCEL_API_TOKEN`, model keys)
  - a measured spike (rebuild spec phase 0)
- **What it costs:** Strelva hosts and is responsible for the whole site.
  - Every later change is Strelva's.
  - The domain must move to Strelva's Vercel project, which is a DNS step the
    owner has to do.
  - Model cost per site is targeted under $0.05. Not measured.
- **Owner who never signs in:** works. Review, approve and DNS records all go
  by email.
- **What it's good at:** the strongest demo in the code, and a better site
  for businesses whose site is bad.

**Option B: connected sites.** A new business keeps its site wherever it is,
and adds one script line (`connect.js`) or has its web person add it.

- **What happens:**
  - Strelva serves confirmed facts into the page and captures forms as
    inquiries.
  - It logs visits, calls and booking clicks, publishes a server-rendered
    context page (`/b/{handle}`) and offers the assistant connector.
  - The System has origin `connected_site` and implementation `connected_site`.
    Strelva never edits the pages.
- **What exists:** about 12,900 lines on `feat/connected-sites` (3 commits,
  Oct 2): `public/connect.js`, `/api/v1/connect/{siteKey}/*`, MCP, owner page,
  owner email, migration `20261002120000_connected_sites.sql`, tests. Local
  only, flag `STRELVA_CONNECTED_SITES_RELEASE`. Never run end to end on a real
  builder.
- **What's missing before it fits 1.0.0:**
  - Migration version collides with `20261002120000_business_record.sql`.
    Rename it.
  - Its facts store (`business_contexts`, `business_context_facts`) duplicates
    the business record. Merge onto `business_record_facts`.
  - Its inquiries (`connected_site_inquiries`) duplicate the inquiries System.
    Route them into the same store as tenant leads, with the spam pit.
  - Add a `connected_site` System origin. The branch predates Systems.
  - Add domain-ownership proof. Today any origin allowlist entry is trusted,
    and requests with no `Origin` header pass (rate-limited).
  - Set a retention limit.
  - About 7 files conflict textually.
- **What it costs:** Strelva doesn't host or build the site, so recurring work
  is facts, forms and inquiries. Installing the script needs a paid plan on
  Wix, Squarespace, Webflow and others, and someone with builder access.
- **Owner who never signs in:** partly. The one-time install needs the
  owner's builder login, or the owner gives Strelva access. Everything after
  works by email.
- **What it's good at:**
  - matches the Oct 2 direction
  - works for any builder
  - no domain move
  - the Google listing System doesn't need a Strelva site either (publishing
    spec)
  - the inquiry and outcome loop is the part 1.0.0 measures

**Recommendation: B is the entry. A stays as a Possibility.**

- Connected sites are how a new business's website comes in.
- The rebuild ships behind its flag as a Possibility Strelva offers on an
  existing website System (connected or custom repo) when the site check says
  the site is failing. Operator-started, owner-decided. It is not the front
  door.
- Why:
  - It honors the Oct 2 decision.
  - It keeps Strelva out of owning every page of every new site.
  - The same System identity covers both: a connected site that later takes a
    rebuild keeps its id, with a new `website_document` revision.
- **Cost of B:** the merge work above (M–L). The fact and inquiry stores have
  to merge regardless, or 1.0.0 ships two of each.
- **If Jacob picks A instead:**
  - Behavior 18 and new item 7 drop.
  - New-business onboarding becomes the rebuild spec's managed flow.
  - Tenant zero becomes the gate for 1.0.0.
  - `feat/connected-sites` is shelved or its pieces (`/b/{handle}`, MCP)
    picked separately.
- **If both:** B for businesses whose site is fine, A when the audit says
  it's failing. That is the recommendation, written as one rule.

**Other decisions (recommended defaults):**

1. **Native edits vs link-out.**
   - Owners: native review and approve, never an editor.
   - Operators: keep `/dashboard/site` as the editor at 1.0.0.
   - Recommend this over building a workspace editor (L), because owners
     don't build.
2. **Repo work for the five no-content clients.** Recommend Requests with
   preview URLs and deploy receipts. Alternative: connect them via
   `connect.js` too (the branch doc's plan), which adds forms and facts but
   still not page edits.
3. **Rebuild cutover fallback window.** Keep the client's Vercel project and
   repo running for 30 days after a domain moves, so undo is real. Hosting
   cost: unmeasured.
4. **Promotions with an end date as Running items.** Recommend yes. Needs the
   Running item store from the needs-you spec.

## 10. Unknowns

**Facts (from code and docs):**

- No website System is stored anywhere. Projection only, behind a flag that
  is off.
- `website-health` and `website-domain-verification` skip in production while
  the rebuild flag is off. They cover only published v2 documents.
- Make real runs only in a sandbox today. Publishing onto an existing tenant
  has no path.
- No production client has an `owner` in a workspace. Converted workspaces get
  the operator as `admin`.

**Inferences to check:**

- Whether rhm, gldf and rohlax actually read live content in production, or
  fall back to local defaults. Check: compare each live page to Strelva
  content (read-only fetch).
- How many open `change_request` events and drafts exist per tenant. Check:
  read-only Redis and `draft-store` count.
- Whether custom-repo domains appear in `domain_claims` at all, since they are
  attached to client Vercel projects. Check: read-only query.
- Whether connect.js works on Wix and Squarespace in practice. Check: install
  on a Strelva-owned test site on each. No client site without Jacob's yes.
- Whether owners will do a DNS step (A) or a script install (B) from an email
  alone. No evidence either way. Measure on the first new business.
