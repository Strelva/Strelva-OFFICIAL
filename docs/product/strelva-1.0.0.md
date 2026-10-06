# Strelva 1.0.0

Created: 2026-10-05
Status: planning. Nothing here is a 1.0.0 release yet; production runs `0.2.0`.

**1.0.0 is Strelva's launch: a business, or the agency running it, opens one
workspace and finds its real systems working.** Its website, inquiries,
bookings, publishing and internal tools read one business record, Strelva
keeps them running, and the owner only sees the few decisions that are theirs.
[Strelva Reborn](./strelva-reborn.md) is the build that gets there. Since
October 6 it builds straight to `1.0.0`; only the lead fix (`0.2.1`) ships
first. This page is the full list of what the launch contains.
[What Strelva becomes at 1.0.0](./product-model.md) is the product model behind
it, area by area.

## Specs

| Area | Spec | State |
| --- | --- | --- |
| The model, every area | [product-model.md](./product-model.md) | Draft, Oct 6 |
| Needs you and Strelva handled | [specs/needs-you.md](./specs/needs-you.md) | Draft, Oct 6 |
| Owners entering, leaving `/dashboard` | [specs/owner-entry.md](./specs/owner-entry.md) | Draft, Oct 6 |
| Ask Strelva in the workspace | [specs/ask-strelva.md](./specs/ask-strelva.md) | Draft, Oct 6 |
| Agency surface and Versions | [specs/agency-and-versions.md](./specs/agency-and-versions.md) | Draft, Oct 6 |
| One operator place | [specs/operator.md](./specs/operator.md) | Draft, Oct 6 |
| Internal tools, store, wellness, reports, documents | [specs/systems-catalog.md](./specs/systems-catalog.md) | Draft, Oct 6 |
| Billing, Redis exit, export, outcome loop | [specs/money-and-data.md](./specs/money-and-data.md) | Draft, Oct 6 |
| Publishing | [publishing spec](../capabilities/publishing/publishing-spec-2026-10-06.md) | Draft, Oct 6 |
| Website rebuild | [rebuild spec](../capabilities/website/website-rebuild-spec-2026-10-01.md) | Built locally, flag off |
| Inquiries | [inquiry spec](../capabilities/inquiries/inquiry-first-product-spec-2026-09-11.md) | Canonical Sept 11; predates Systems and the business record |
| Bookings | [bookings spec](../capabilities/bookings/bookings-spec-2026-10-01.md) | Proposed Oct 1, not approved |
| Business record, conversion, structure | [Reborn §1, §3, §7](./strelva-reborn.md) | Line-level plan |

Every feature below names its source and its state today. States come from the
October 4 product audit (`output/product-audit-2026-10-04/`, local only), the Reborn page and `pnpm reborn:progress`. "Local" means
built and tested on a branch, not in production.

## What a customer sees at launch

### 1. The workspace

| Feature | Today | Source |
| --- | --- | --- |
| Home shows the business's actual Systems, each with Draft/Live/Paused and a separate health signal | Local on `transition/systems` | ADR 0011, `PRIM_SYSTEM` |
| **Needs you**: only the decisions the owner must make, set by policy, not an approval per change | Local UI, no real policy source | agency-in-the-loop decision, Oct 2 |
| System page: the real thing first (live site, inbox, calendar, tool), Connections, Possibilities and Versions beside it | Local | `DESIGN.md` Oct 4 |
| Possibilities you can open, compare and **Make real**, with honest partial states and undo where undo exists | Local, fake effects only, in-memory progress | `COMP_MULTI_SYSTEM_ACTIVATION` |
| Versions: one System adapted per location or client, with shared improvements offered, never forced | Local, in-memory only | `PRIM_CONTEXT_VERSION` |
| Health from real monitors; pause that keeps existing obligations | Local; website health reads real monitors in preview | `RULE_SYSTEM_PAUSE_HEALTH` |
| Ask Strelva inside the workspace, using the same tools as today's owner agent | 0% in the workspace | Reborn §4 |
| Owners sign in on their client admin host and land in their workspace; old `/dashboard` links redirect | Not started | Reborn §6 |

### 2. The systems a business starts with

Each must reach the [capability bar of 5](#the-bar): live with flags on, real
providers, the full trigger → work → approval → outside write → read-back →
receipt → undo loop, failure tests, a production proof on a Strelva-owned test
business, monitoring, and at least the best competitor's bar.

| System | Must do at launch | Today |
| --- | --- | --- |
| **Website** | Live site in the workspace with domain, health and history; edits and publishing for existing sites; connected sites (bring a site made elsewhere via `connect.js`) | Tenant sites live; workspace view ~30%; connected sites on `feat/connected-sites`, unmerged; rebuild flag off |
| **Inquiries** | Every lead kept, spam review, reply from the workspace, owner notified | Leads Redis-only (fix on `reborn-stop-losing-data`); product ~35%, flag off |
| **Bookings** | Weekly hours, services, buffers, confirmations, reminders, one booking store, pause | ~25%; schedule caps at ~125 bookings; two stores |
| **Publishing** | Review replies, Google Business Profile, blog and newsletter, all through approval and receipts | 0% in the workspace; GBP writes depend on Google approval |
| **Internal tools** | Agency/Strelva build from a sentence (work plan → app draft); records link to business contacts; notify on submit | Native apps shipped, unused; drafting flag off; ~10% |
| **Store, rewards, newsletter, wellness** | Existing client features keep working inside the workspace | Tenant-side only |
| **Analytics and reports** | Read the converted workspace; report crons keep running | Tenant-side only |
| **Documents** | Shared documents with history | Unused; breaks after 200 edits |

### 3. One business record

| Feature | Today |
| --- | --- |
| Name, address, hours, services, staff, contacts in one record, read by website, bookings and inquiries | Table local on PR #210; nothing reads it |
| History and undo on every edit | Local |
| One owner-recipient rule for every notification | Not started |
| Export and exit include the record and every linked System | Partial |

### 4. The agency

| Feature | Today |
| --- | --- |
| Agency home loads every client, not pages of 8 | Not started |
| Build, package and bulk-review on the agency surface; owners never have to build | Partly in agency drafts |
| Client Versions of agency sources, with offered upgrades and conflicts shown | Local on `transition/systems` |
| Human minutes per client measured | Draft PR #205 |
| Clients and agencies can switch with full history | Exit/export partial |

### 5. Running it for them

| Feature | Today |
| --- | --- |
| One operator queue across tenants and workspaces (six queues today) | Not started |
| Every outside write leaves a receipt with read-back and undo | Partial; Google writes lack it |
| Health and domain checks cover every site, including custom-repo clients | Domain monitor yes; `website-health` skips some |
| Client leads visible to operators | Local on `reborn-stop-losing-data` |

### 6. Every client moved

| Feature | Today |
| --- | --- |
| All live clients converted into workspaces, storefront responses unchanged | 0 converted; script local on PR #210 |
| All 9 client repos checked against `/api/v1` | Local, 196/196 |
| Billing follows the client (subscription, custom, comped, grandfathered `gldf`/`rohlax`) | Not started; Stripe has no `workspaceId` |
| No client data held only in Redis (leads, bookings, orders, rewards, OAuth, analytics config) | Not started |

### 7. Commercial

| Feature | Today |
| --- | --- |
| One flat workspace plan | Decided Oct 2; **no price set** |
| Outcome data loop: site → inquiry → reply → booking → review, measured per business | Pieces exist; loop not joined |

## Underneath (customers don't see it, launch needs it)

- Shared infrastructure out of `src/lib`; 99 workspace files still import it.
- One capability registry instead of seven declarations; one finite-job record
  instead of four (service request, provider delivery, work job, budget).
- One model-call helper (12 call sites today); one email sender (`newsletter.ts`
  bypasses `send.ts`); one approval store (five today).
- Make real progress in Postgres on `work-execution`, not memory.
- A Preview environment with its own Supabase, so testers can sign in.
- Regenerated database types.

## Cut or frozen for 1.0.0

From the audit and the Reborn page, pending Jacob's confirmation where marked:

- **Out:** new pricing tiers, Home Finder, enterprise customers, owner self-serve
  website building, `/api/v2`.
- **Cut (audit, needs yes):** custom-application builds (need Docker; Vercel has
  none), `src/experience/delivery`, product learning, the Customers page.
- **Merged (audit, needs yes):** tracker into internal tools, saved checks into
  System health, assessment into the website audit, agency website drafts into
  the website System as Possibilities.

## Open decisions for Jacob

1. **What 1.0.0 means on the outside.** Is it a public launch for new
   businesses, or the release where existing clients move in? The list above
   assumes both.
2. **Partner agencies.** Reborn excludes them; ADR 0010 makes agencies the
   channel. In or out of 1.0.0?
3. **Website entry for new businesses.** On Oct 2 the paste-URL rebuild was
   ruled out for new businesses in favor of connected sites, but the rebuild is
   still the strongest Possibility in the code. Which one ships?
4. **The word "Systems" on screen**, and ADR 0011 accepted or not.
5. **The plan price.**
6. **Owner sign-in.** Today 1 person signed in in 30 days. Does 1.0.0 require
   owners to use the workspace, or must it work fully for owners who never log in?

## The bar

1.0.0 ships when every line in sections 1–6 is true in production, proven on a
Strelva-owned test business and on converted clients, and Jacob says it is
something Strelva would stand behind for any new customer.
