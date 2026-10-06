# What Strelva becomes at 1.0.0

Created: 2026-10-06
Status: the product model for the 1.0.0 build, area by area. Direction selected
by Jacob (Oct 2 places, Oct 4 Systems model, Oct 6 one build to 1.0.0). Nothing
here is shipped. Each area links the spec that makes it buildable.

**A business opens one place and finds its real things working: its website,
its inquiries, its bookings, its tools. Strelva runs them, and the owner only
sees the few decisions that are theirs.** The owner never has to open it for any
of that to stay true.

This page is the map. [ADR 0011](../../../docs/adr/0011-organize-strelva-around-systems-connections-possibilities-versions.md)
is the decision, [systems-transition.md](./systems-transition.md) maps today's
code onto it, and [strelva-1.0.0.md](./strelva-1.0.0.md) is the feature list.
Where they disagree with this page on the customer model, this page wins and
the others get corrected.

## The model in one picture

```
Business  ─ owns ─  Business record (name, hours, services, people, contacts)
   │                       ▲ read by every System, copied by none
   │
   ├─ Systems ............ what the business has made
   │    attymooney.com · Live          Consult booking · Draft
   │    each one has:
   │      Connections   what it reads, acts on, appears in
   │      Possibilities working alternatives beside it → Make real
   │      Versions      the same System adapted per location or client
   │      History       every past release, with undo
   │      Health        separate from Draft / Live / Paused
   │
   ├─ Requests ........... asked-for work with an end
   ├─ Running ............ what Strelva keeps true, one sentence each
   ├─ Needs you .......... only the owner's decisions, in the app or by email
   └─ Strelva handled .... receipts of what Strelva did, with undo
```

Ask Strelva is the one way in. **Strelva** is the only name that acts on screen:
"Strelva updated your hours", "Strelva needs your call".

## The people

| Role | Who | Can | Never |
| --- | --- | --- | --- |
| Owner | The client (gldf's owner, The Mooney Firm) | Pay, decide, launch, publish, exit, invite | Has to sign in for things to keep working |
| Member | Staff the owner invites | Use Systems (take a booking, answer an inquiry) | Manage, pause or revise a System they weren't given |
| Agency | Strelva at 1.0.0; partners later | Make, operate and adapt Systems for clients | Become owner, pay, exit, or see a client it wasn't delegated |
| Operator | A Strelva super-admin | Run every client from one queue, convert clients | Act without a receipt; write outside without approval |

## Area by area

Each row: what it is today, what it becomes, and which noun it is.

### The business

| Area | Today | At 1.0.0 | Noun | Spec |
| --- | --- | --- | --- | --- |
| Business identity | A `tenants` row per site; Twin Trees is one account with two tenants | One workspace per business. Each live site links in by `stable_id`, never by slug | Business | [Reborn §1, §3](./strelva-reborn.md) |
| Business facts | Copied into each feature: site content, booking config, lead emails | One business record. The website, bookings and inquiries **read** it through Connections | Business record | [Reborn §1](./strelva-reborn.md) |
| Who gets notified | Each notice picks its own address | One rule: the record's owner contact, falling back to `tenants.owner_email` | Business record | [Reborn §1](./strelva-reborn.md) |
| People who reach the business | A Customers page (left navigation Oct 5) | Records inside the Systems that collect them (inquiries, bookings, store). One person, one contact, across them | Records under Systems | [systems-catalog](./specs/systems-catalog.md) |

### The Systems a business starts with

| System | Today | At 1.0.0 | Spec |
| --- | --- | --- | --- |
| **Website** | Live tenant sites; workspace view ~30%; rebuild flag off | The live site, domain, health and history in the workspace; edits and publishing for existing sites; rebuild is a **Possibility** on it | [rebuild spec](../capabilities/website/website-rebuild-spec-2026-10-01.md) |
| **Inquiries** | Leads Redis-only and expiring; workspace product ~35%, flag off | Every lead kept in Postgres, spam review, reply from the workspace, owner told through Needs you | [inquiry spec](../capabilities/inquiries/inquiry-first-product-spec-2026-09-11.md) |
| **Bookings** | Two stores; ~25% | One store; hours and services read from the record; confirmations, reminders, pause that keeps existing bookings | [bookings spec](../capabilities/bookings/bookings-spec-2026-10-01.md) |
| **Google listing** | Tenant-side Google tokens in Redis; review replies and posts per tenant | "The Mooney Firm on Google": reviews, replies, hours, info and posts through approval and receipts, with a Version per location. Hours come from the business record | [publishing spec](../capabilities/publishing/publishing-spec-2026-10-06.md) |
| **Newsletter** | `newsletter.ts` sends around `email/send.ts`; gldf and rohlax sign-ups already in Postgres | Its own System. Subscribers are business contacts; each send is an issued output that never rewrites | [publishing spec](../capabilities/publishing/publishing-spec-2026-10-06.md) |
| **Internal tools** | Native apps shipped, unused; any member can create | Strelva builds from a sentence (owners file a Request). Tracker merges in. Records point at business contacts; submit emails the assigned person | [systems-catalog](./specs/systems-catalog.md) |

Not Systems at 1.0.0 ([systems-catalog](./specs/systems-catalog.md)):

| Today | Becomes |
| --- | --- |
| Blog and collections | Part of the website System (they appear through `/api/v1/collections`) |
| Store (gldf, rhm run checkout in their own repos) | A Connection to the client's own checkout |
| Wellness schedule and roster | Part of the bookings System |
| Analytics, ongoing checks, domain monitor | Health; Search Console is a Connection |
| Weekly and monthly reports | A Running item ("You get a report every Monday") |
| Documents | Supporting files. Today they break for good at edit 201 |
| Rewards, members, Strelva's order view, onboarding, custom-app builds | Frozen on `/dashboard` or cut, by written decision |

A System keeps its identity while everything under it changes. When gldf's
custom-repo site is rebuilt as a hosted document, it is the same System with a
new release, not a new thing. Today's local code already has this spine:
`src/platform/systems` (kinds `website`, `booking`, `inquiry`, `internal_app`
and more; origins `saved_work` or a tenant `stable_id`) behind
`STRELVA_SYSTEMS_RELEASE`, off.

### Around every System

| Area | Today | At 1.0.0 | Noun | Spec |
| --- | --- | --- | --- | --- |
| What a System uses | Google tokens in Redis, calendar connections in Postgres, domains in two stores | Typed Connections: read, act, appear, share, depend, trigger. Each states authority, source of truth, freshness and failure | Connection | [ADR 0011](../../../docs/adr/0011-organize-strelva-around-systems-connections-possibilities-versions.md), [publishing](../capabilities/publishing/publishing-spec-2026-10-06.md) |
| Trying an alternative | Rebuild, inquiry rehearsal, tracker experiments, each its own way | A Possibility opens beside the System on isolated data. **Make real** goes through Needs you and reports what landed, item by item | Possibility | [ADR 0011](../../../docs/adr/0011-organize-strelva-around-systems-connections-possibilities-versions.md) |
| Second location, agency client | Nothing; Twin Trees is two unrelated tenants | The same System adapted per context, with shared improvements offered, never forced | Version | [agency-and-versions](./specs/agency-and-versions.md) |
| Past releases | `content_versions`, `site_snapshots`, document revisions | History with undo, per System. Never called "Version" on screen | History | — |
| Is it working | Six health signals, some sites skipped | One health mark per System, separate from Draft/Live/Paused. "Live · calendar disconnected" is valid | Health | [operator](./specs/operator.md) |

### Working with Strelva

| Area | Today | At 1.0.0 | Noun | Spec |
| --- | --- | --- | --- | --- |
| Asking for something | Tenant agent with ~24 inline tools; workspace composer needs special phrasing for managed work | Ask Strelva in the workspace: answers, drafts changes, opens Possibilities, files Requests, on the same permissions | Ask Strelva | [ask-strelva](./specs/ask-strelva.md) |
| Finite work | Service requests, delivery commitments | Requests: Asked → Needs you → In progress → Ready for your review → Done | Request | [needs-you](./specs/needs-you.md) |
| Ongoing work | Standing responsibilities, crons | Running: "Your hours match Google every day", "Every lead is answered within a day" | Running | [needs-you](./specs/needs-you.md) |
| Decisions | Approvals in five stores, no policy for what reaches the owner | One policy per System and change type. Most changes Strelva just does and reports. The rest reach the owner in the app **and** by email, with one-tap answers | Needs you | [needs-you](./specs/needs-you.md) |
| Proof of work | Receipts on some writes; Google writes have none | Strelva handled: every outside write has a receipt, read-back and undo where undo exists | Strelva handled | [needs-you](./specs/needs-you.md), [operator](./specs/operator.md) |

### Getting in, running it, paying for it

| Area | Today | At 1.0.0 | Spec |
| --- | --- | --- | --- |
| Owner entry | Sign-in hard-codes `/dashboard`; 22 dashboard pages | Client admin hosts land in the workspace; every dashboard page has a home or a redirect; old links keep working | [owner-entry](./specs/owner-entry.md) |
| Agency | Agency home pages through 8 clients | Every client on one home; Queue, Library, Team; Versions per client | [agency-and-versions](./specs/agency-and-versions.md) |
| Operator | Six queues in Redis and Postgres | One queue across every business and System, with minutes per business measured | [operator](./specs/operator.md) |
| Money | Stripe per tenant; grandfathered clients; no workspace link | Billing follows the business: one flat plan (price open), custom and grandfathered states kept, Stripe carries `workspaceId` | [money-and-data](./specs/money-and-data.md) |
| Client data | Leads, bookings config, orders, rewards, OAuth, analytics config in Redis | Postgres is the record; Redis is a cache again. Export and exit include everything | [money-and-data](./specs/money-and-data.md) |
| Client repos | 9 repos on `/api/v1` | Unchanged. Systems resolve behind the slug; additions only | [Reborn §0](./strelva-reborn.md) |
| Public front door | Audit, AI visibility | Evidence that opens a Possibility (a rebuild) for a new business. Not a System | [systems-catalog](./specs/systems-catalog.md) |

## What leaves the customer's view

These stay as machinery underneath. The customer never navigates them:
offerings, installations, the product catalog, "Apps" and "Work" as nouns,
"Capability", "Version" meaning time, and the words AI, agent, automation,
workflow and task. Old links (`view=apps`, `view=work`, `view=products`,
`view=customers`, `/dashboard`) keep resolving.

## Rules that hold everywhere

1. **Identity outlives the build.** Issued things (an accepted proposal, a sent
   reply) never rewrite.
2. **Connections are contracts.** Knowing about Stripe is not permission to
   charge.
3. **Possibilities are isolated.** Make real uses the same approvals as any
   change and never claims atomicity across providers.
4. **Versions are context, not time.** Across businesses nothing is shared
   implicitly.
5. **Lifecycle is not health.** Pausing keeps records and commitments.
6. **Nobody has to sign in.** Everything an owner must decide also reaches them
   outside the app. Clients who never log in keep working.
7. **Live clients don't move.** `/api/v1` is additive, `reb:` keys and tenant
   rows stay, every production step is Jacob's yes.

## Problems that cross specs

The eight specs were drafted separately on October 6. Reading them together
turned up problems no single plan had. Each is from code reading unless marked.

1. **Conversion leaves a business with no owner and no provider.** It makes
   the Strelva operator an `admin` member, so:
   - nobody can invite the real owner (`create_workspace_invitation` needs an owner);
   - the hosted-site monthly report goes to the first `owner`, which is no one;
   - Strelva's agency home lists none of its own clients, because it reads
     `workspace_delegations` and conversion writes none.

   Fix once, not three times: an operator-issued owner invitation
   ([owner-entry](./specs/owner-entry.md)), a `workspace_providers` mark that
   grants nothing ([agency-and-versions](./specs/agency-and-versions.md)), and
   the one owner-recipient rule from Reborn §1 for every notice. *Built and
   proven locally Oct 6 on `build/business-ownership`; nothing applied to
   production.*
2. **Owner-only actions need email.** Make real, publish and launch require
   `owner`. For owners who never sign in, that only works through signed
   one-tap links bound to the item and recipient
   ([needs-you](./specs/needs-you.md)). Access, money and exit need a
   magic-link sign-in.
3. **Owner email may reach nobody today.** Client email is sent only when
   `EMAIL_SENDING_ENABLED` is `"true"` or a per-client override is set. If it
   is off in production, review approve links and weekly reports have gone
   nowhere. A read-only check settles it. `sendUpdateLiveEmail` also skips the
   per-client setting.
4. **Production health checks check nothing.** `website-health` and
   `website-domain-verification` return "skipped" while
   `STRELVA_WEBSITE_REBUILD_RELEASE` is off, which it is. `domain-monitor`
   does cover every tenant ([operator](./specs/operator.md)).
5. **Two link tables.** Conversion uses `tenant_workspace_links`; PR #205
   (human minutes) uses `offering_website_bindings`. Every spec now reads
   `tenant_workspace_links` first. #205 changes before it merges.
6. **Orders: move first or freeze?** The money spec moves orders first (no
   Postgres copy, 90-day expiry). The catalog spec found no client repo sends
   orders to Strelva, so the store is probably near empty. Counting
   `orders:*` keys read-only decides it.
7. **Tenant rename may drop Redis data.** `src/lib/tenant-rename.ts` moves
   keys with `get`/`set`, which likely fails on the sorted sets, hashes and
   lists that hold leads, orders and rewards, and drops TTLs. Not yet run.
8. **One clock for chasing.** Needs you and the operator queue both chase
   owner decisions at days 3 and 7 and lapse at 14. Decide once.
9. **Google comes first.** Basic API access is granted by application with a
   reported backlog; until approved, quota is zero. Whether Strelva's project
   has it, whether the OAuth consent screen is in production (if not, refresh
   tokens older than 7 days are dead and "no re-consent" fails), and whether
   `SECRETS_ENC_KEY` is set are console checks only Jacob can do
   ([publishing](../capabilities/publishing/publishing-spec-2026-10-06.md)).

## Not decided

These change specs, not the model. Each spec drafts against the working
assumption and names what changes if the answer differs.

| Decision | Working assumption |
| --- | --- |
| What 1.0.0 is on the outside | Existing clients moved in, and Strelva can take a new business through the same path |
| Partner agencies | Out of 1.0.0; Strelva is the only agency and uses the agency surface |
| Website entry for a new business | Open: paste-URL rebuild or connected sites |
| The word "Systems" on screen; ADR 0011 accepted | Open; screens show things by their own names |
| Plan price | Open; one flat plan |
| Owner sign-in | Never required (1 sign-in in 30 days today) |

### Decisions the specs need

Each spec ends with its own list, with a recommendation for every item. On
October 6 Jacob said to start every build, so **every recommendation below and
in each spec is the working default the build follows**. Jacob can overturn
any of them; the build then changes, nothing else does. None of them authorizes
a production step. These are the ones that change more than one spec:

| Decision | Recommended | Specs |
| --- | --- | --- |
| How owners decide without signing in | Signed one-tap email links for everything except access, money and exit | needs-you, owner-entry, ask-strelva |
| Can owners loosen Strelva's defaults | Back up to the default, never past it | needs-you |
| Approving in Ask Strelva chat | Never; text in a review could fake a confirm | ask-strelva, needs-you |
| Turning on client email | Per business, `strelva` test business first, then gldf | needs-you, systems-catalog, owner-entry |
| How Strelva reaches its clients | Keep the admin membership; add a provider mark that grants nothing | agency-and-versions, operator |
| One queue or two | One queue, shown in `/admin` and as the agency Queue | operator, agency-and-versions |
| Twin Trees | Ask the owner: one business with two locations, or two | agency-and-versions, money-and-data |
| Existing clients' terms | Kept; the flat plan is for new businesses | money-and-data |
| When to set the price | After 30 days of measured operator minutes on converted clients | money-and-data |
| Can owners build Systems | No at 1.0.0; they file a Request | systems-catalog, ADR 0011 |
| Google listing as its own System | Yes, with blog inside the website | publishing |
| Approving a record change also approves its Google write | Needs Jacob's yes; narrows the AGENTS.md rule | publishing, needs-you |

## What would prove this model

Owners and Strelva's own operators get to a working System faster, decisions
reach owners who never log in and get answered, and operator minutes per
business go down as clients move in. None of that is measured yet.
