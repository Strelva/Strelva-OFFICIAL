# Owner entry and the move off /dashboard

Status: draft spec, 2026-10-06. Partly built on branch `build/owner-entry`,
proven locally only (not migrated, not deployed, every flag off):

- Built: per-workspace release flags (`workspace_release_flags`, testers,
  immutable history; migration `20261007130000`), the env layering
  (`0`/`workspace`/`1`) for all four flags, `STRELVA_OWNER_ENTRY`, operator
  controls on `/admin/clients/[id]`, sign-in/sign-up/admin root through
  `/auth/entry`, 307 redirects from `/dashboard` and
  `/client/<tenant>/dashboard` only for a member of the destination,
  "Back to <business>" on pages that haven't moved, `view=system` kept
  after sign-in, the disposition map (§5) with a page-file test, and
  `/dashboard/reports` → `/workspace/recaps` (ready).
- Not built here: the owner invitation (requirements 8–10, another stream),
  email links pointing at the new place (11), and the workspace homes of
  every page still marked `stay` in §5.
- Proof: `src/__tests__/{release-flags,owner-entry,owner-entry-routes,workspace-recaps}.test.ts(x)`,
  `tests/workspace-release-flags-schema.sql` in `check:workspace-sql`.

Built and proven locally on `build/business-ownership` (Oct 6): requirements
8 and 9 (operator owner invitation, both memberships in one transaction) in
`20261007110000_business_ownership.sql`, `src/platform/workspaces/business-ownership.ts`
and `scripts/business-ownership.ts`. The operator button on
`/admin/clients/[id]` is not built; the script is the only way to issue one.
Requirement 10 (magic-link claim) and the rest are not built.

Covers Reborn section 6 and the 1.0.0 line "Owners sign in on their client
admin host and land in their workspace; old `/dashboard` links redirect."
Depends on the [needs-you spec](./needs-you.md) for how owner decisions reach
owners who never sign in.

## 1. The moment

Ruth at Great Lakes Dried Fruit (`gldf`) gets this week's report email. She
clicks "See the full report". Today that link is a `/dashboard/reports` URL.
After her workspace is moved, the same link opens her workspace instead.

- **If she's signed in and has the owner role,** she lands on Home with the
  report open. Needs you is at the top (one review reply waiting), then
  Strelva handled ("Strelva fixed a broken image on the store page"). Her
  store and website show by their own names: "greatlakesdriedfruit.com ·
  Live".
- **If she isn't signed in,** she sees one sign-in screen titled "Sign in to
  Great Lakes Dried Fruit". She enters her email, gets a link, and comes back
  to the same report in her workspace.
- **If she never clicks anything,** nothing changes for her. Her site, store,
  leads, orders and report emails keep working.

An old bookmark, `admin.greatlakesdriedfruit.com/dashboard`, still works.
That's where the gldf repo's own `/admin` and `/dashboard` paths redirect
(`greatlakesdriedfruits/src/proxy.ts`), and it now lands in her workspace.

## 2. In the model

Owner entry isn't a System. It's the door to the **Business**.

- **Who comes in.** An owner, member or Strelva operator, with a membership
  in the business workspace. The owner holds payer, exit, launch and publish
  authority. Strelva runs the conversion as `admin`, never as `owner`
  (Reborn section 3, decided Oct 2).
- **Where they land.** Home: the business's **Systems** and **Needs you**.
  Each `/dashboard` page lands on a System page (website, inquiries,
  bookings, store, publishing), on a Home section (Needs you, Strelva
  handled, Recent), or in the business menu (Business details, People &
  access, Help).
- **Connections.** `/dashboard/integrations` and `/dashboard/sources/[id]`
  become Connections shown on the System that uses them. They don't get a
  place of their own (DESIGN.md, Oct 4).
- **Flags.** A flag for each workspace decides whether that business's
  traffic goes to the workspace or still to `/dashboard`. That way one client
  can move, and move back, without touching the others.

## 3. What it does at 1.0.0

1. **Admin host sign-in lands in the workspace.** Sign-in on a client admin
   host (`admin.<tenant>.strelva.com`, a custom `admin.<domain>`, or the
   fallback `app.strelva.com/client/<tenant>/sign-in`) sends the person to
   `/workspace?workspaceId=<linked workspace>` when three things are true:
   the tenant is linked in `tenant_workspace_links`, owner entry is on for
   that workspace, and the person has a workspace membership. If any is
   false, they land on `/dashboard` as today.
2. **The callback keeps the destination.** `/auth/callback` passes that
   destination through unchanged. `safeNext` already allows relative paths.
   `workspaceReturnTarget` must also accept `view=system&system=<uuid>` and
   tenant-entry targets. Today it rejects `view=system` (it's missing from
   `VIEWS` in `src/lib/workspace-location.ts`), so a System link would be
   lost after sign-in.
3. **The admin root lands in the workspace.** An admin-host root request
   (`shouldRedirectAdminRoot` in `src/proxy.ts`) goes to the workspace under
   the same three conditions, and to `/dashboard` otherwise.
4. **Every `/dashboard` path keeps resolving.** `/dashboard`, `/dashboard/*`,
   `/client/<tenant>/dashboard` and `/client/<tenant>/dashboard/*` stay
   supported forever. For a moved workspace, each path redirects to the
   workspace place in the table in section 5, keeping its meaning (anchors
   such as `#ownership`, `#domains`, `#plan` and `?checkout=success` map to
   their own places). Unknown paths (`[...notFound]`) go to Home.
5. **Redirects use HTTP 307, not 308.** "Permanent" means these URLs never
   stop working. It doesn't mean the HTTP code. A cached 308 can't be rolled
   back for one client, and requirement 7 needs that rollback.
6. **Pages move one at a time.** A path redirects only when its workspace
   home is marked `ready` in the disposition map. Until then it renders
   `/dashboard` as today, with a "Back to <business name>" link to the
   workspace. A workspace's owner entry can be turned on only when every page
   that client uses is `ready` or `retire` (section 4).
7. **Each workspace has its own release flags.** Owner entry, inquiries,
   website rebuild and Systems resolve per workspace, layered over the env
   flags (rule in section 4). An operator turns one client on or off from
   `/admin/clients/[id]`, with a reason. The change is recorded and takes
   effect within 60 seconds, without a deploy.
8. **Owners are invited through an operator.** For a converted workspace, a
   Strelva operator (active `super_admins` row and `admin` membership) can
   invite exactly one owner. The address defaults to the business record's
   owner recipient (`resolve_business_owner_recipient`, falling back to
   `tenants.owner_email`). The invitation goes out by email through
   `src/lib/email/send.ts` with audience `client` and the tenant id, so the
   per-tenant email override applies. Each invitation needs Jacob's yes.
9. **Accepting grants both memberships at once.** Accepting the invitation
   creates the `workspace_memberships` owner row and, for every tenant linked
   to that workspace, a `memberships` row with role `owner`, in one database
   transaction. While any `/dashboard` page or tenant API remains
   (`requireTenantAccess`), the owner needs both.
10. **Magic-link sign-in claims a pending owner invitation.** A person who
    signs in on the admin host with the invited, verified email gets the
    pending owner invitation claimed. This is the workspace version of
    `claimPendingInviteForCurrentUser`. They don't have to find the
    invitation email first.
11. **Email links point at the new place.** For a moved workspace, every
    owner email that links into the app (weekly and monthly reports, review
    alerts, lead notices, billing return URLs) points at the workspace
    place. For anyone else, links stay as they are. Old links in sent emails
    keep working through requirement 4.
12. **Sign-in is never required.** No owner-facing promise depends on
    signing in. Anything that needs the owner reaches them by email (see the
    needs-you spec). The workspace is where the same items appear for
    someone who does sign in.
13. **Operators keep a way to the old surface.** Super admins can still
    open `/dashboard?legacy=1` for a moved tenant until that tenant's
    `/dashboard` pages retire. Inspect mode (`src/lib/inspect-mode.ts`) is
    unchanged. Clients never get this way back.

## 4. States and rules

**Owner entry states, per workspace:** `off` (everyone lands on `/dashboard`,
today's behavior), `operators` (only super admins and named testers are sent
to the workspace), `on` (every workspace member is sent). Rolling back from
`on` to `off` sends the next request to `/dashboard`.

**Flag layering.** Each env flag gets a third value:

| Env value | Meaning |
| --- | --- |
| unset or `0` | Off everywhere. A workspace row can't turn it on. This is the kill switch. |
| `workspace` | On only where the workspace row says `on` (or `operators`). |
| `1` | On everywhere, except where a workspace row says `off`. |

Flags covered: `STRELVA_OWNER_ENTRY` (new), `STRELVA_INQUIRIES_RELEASE`,
`STRELVA_WEBSITE_REBUILD_RELEASE` and `STRELVA_SYSTEMS_RELEASE`.
`STRELVA_WORKSPACE_RELEASE` stays env-only. If it goes off, every workspace
is off. The existing per-tenant client email override (`reb:client-email:{tenant}`
in Redis, `src/lib/client-email-override.ts`) is the precedent, but it lets a
row override a paused global switch. This spec deliberately doesn't (see
open decision 2).

**Disposition states, per `/dashboard` path:** `ready` (redirect when owner
entry is on), `stay` (render `/dashboard` with a back link), `retire`
(already a redirect today; maps straight to its target's home), `frozen`
(kept on `/dashboard` by a written decision in the
[systems catalog](./systems-catalog.md) §3.2–3.3; renders with the back link
and never blocks owner entry `on`). *Corrected while building:* without
`frozen`, gldf (store) and wellness clients (members) could never go `on`,
since the catalog gives those pages no workspace home at 1.0.0.

**Authority.**

| Action | Who |
| --- | --- |
| Turn a workspace's owner entry or other flags on or off | Strelva operator, with Jacob's yes for each client's first `on` |
| Invite the owner of a converted workspace | Strelva operator, with Jacob's yes for each client |
| Invite members | Owner (today's `create_workspace_invitation` requires `owner`) |
| Open the old `/dashboard` for a moved tenant | Super admin only |
| Change where admin hosts land, globally | Jacob (Reborn "Needs Jacob's yes") |

**Never:**

- A redirect never sends a signed-in person somewhere they have no access
  to. If they lack a workspace membership, they stay on `/dashboard`.
- An email address match never grants `owner` by itself. Only an accepted,
  operator-issued invitation does.
- No client repo changes. gldf (`REB_DASHBOARD_URL`) and rohlax
  (`CANONICAL_REB_DASHBOARD_URL` = `app.strelva.com/client/rohlax/dashboard`)
  keep their hard-coded URLs.
- No `/api/v1` change. No `reb:` key rename. No tenant row change.
- The public `demo` tenant (`/demo` → `/client/demo/dashboard`) never
  redirects.

## 5. Every /dashboard page

**Count.** `src/app/dashboard` holds 24 route pages plus the `[...notFound]`
catch-all. Reborn says 22, split 3 with a home, 4 partial, 4 retire and the
rest to build. This count gives **0 ready, 8 partial, 4 retire, 12 with no
workspace home**. The 4 retire pages match: they're the redirect stubs.
Reborn's "3 have a home" don't hold up when checked page by page. In each
case the workspace place exists, but none of them reads the tenant's data
yet.

*As built on `build/owner-entry` (2026-10-06):* **2 ready** (`/reports`,
`[...notFound]`), **4 retire**, **2 frozen** (`/store`, `/members`), **17
stay**. *Then on `w2/owner-surfaces-b` (Oct 6, local):* **11 ready**:
`/chat` → `view=ask` while `STRELVA_ASK_RELEASE` is on, and `/site`,
`/assets`, `/brand-kit`, `/collections`, `/history`, `/integrations`,
`/sources/[id]`, `/google` → `/workspace/site?…&tab=…` (the website
System's own pages, reusing the dashboard's panels) where Systems are on
for the workspace. **8 stay**. Not at parity yet, and why they are not
`ready`: `/analytics` (no results panel), `/` and `/review` (Needs you),
`/leads`, `/roster`, `/schedule`, `/reviews`, `/settings`. The map is `src/platform/owner-entry/dispositions.ts`; each `stay`
entry carries its reason. gldf still waits on `/`, `/review` (needs-you spec)
and `/site` (editing still opens `/dashboard/site`, so a redirect would loop).
rohlax still waits on `/schedule` and `/roster` (the one booking store).

The nav that owners see comes from `getDashboardSurfaces`
(`src/lib/dashboard-surfaces.ts`). It shows Today, Ask Strelva, Website,
Google Business, Analytics, Reports and Reviews, plus Schedule, Members and
Roster from the wellness set in `src/lib/features/registry.ts`. Store is a
Website sub-tab when `tenantHasStore` is true. Settings is the footer gear.
The other pages are reached from inside those.

| `/dashboard` page | Lands in the workspace | Today | Work needed |
| --- | --- | --- | --- |
| `/` Today | Home: Needs you, Strelva handled, In progress, Recent | Partial. `BusinessHome` is in production but reads no tenant data. Today's queue, "Who reached out", stats and activity are Redis and tenant-side | Home reads the linked tenant's pending approvals, leads and activity through the link (needs-you spec) · M |
| `/chat` Ask Strelva | Ask Strelva on Home and on each System | None. 0% in the workspace | Reborn §4 Ask Strelva: ~24 tools from `api/agent/route.ts` into `agent-shared.ts`, workspace route resolves workspace → link → tenant · L |
| `/site` Website editor | Website System ("greatlakesdriedfruit.com") | Partial. `SystemPage.tsx` shows name, domain, live link, health and preview (local, Systems flag). Editing is link-out only | Edits for existing sites from the System page, native or embedded · S to link, L native |
| `/content` | Website System | Retire. Redirects to `/site` today | Map to the Website System · S |
| `/assets` Photos | Website System, photos and files | None | Photo library on the Website System · M |
| `/brand-kit` | Website System, look (fonts, colors) | None | Brand panel on the Website System · S–M |
| `/collections` Blog and collections | Publishing System (blog), or Website System content | None. Publishing is 0% in the workspace | Part of Reborn §4 Publishing · L |
| `/google` Google Business | Publishing System, plus an *acts on* Connection to the Google Business profile | None. Tenant tokens are Redis only | Token move through `crypto/secrets.ts` without re-consent, GBP panel · L–XL |
| `/health` | Website System health | Retire. Redirects to `/analytics#site-health` | Map to Website System health (exists locally) · S |
| `/history` Site safety, request and check history | Website System, History | Partial. `website_documents` revisions have history; tenant `content_versions` and `site_snapshots` have no workspace view | History reads the tenant stores through the link · M |
| `/integrations` Connections | Connections on each System, plus account grants under Business details | Partial. `ConnectionsPanel` on `SystemPage` (local) doesn't read Redis `connections:{tenant}:{provider}` | Project tenant connections as System Connections · M |
| `/sources` | Same as `/integrations` | Retire. Redirects to `/integrations` | Map · S |
| `/sources/[id]` Connection detail | That Connection on its System | None | Connection detail view · S–M |
| `/leads` | Inquiries System | Partial. ~35%, `STRELVA_INQUIRIES_RELEASE` off, leads Redis-authoritative | Inquiries spec · M |
| `/members` (wellness) | **Frozen** on `/dashboard` (rewards frozen, systems catalog §3.2–3.3) | Frozen | None at 1.0.0 |
| `/roster` (wellness) | Bookings System, day roster | None | Day roster (Reborn §4 Bookings) · in L |
| `/schedule` (wellness) | Bookings System | Partial. Workspace scheduling is ~25% and uses a different store from the tenant widget | One booking store (Reborn §2) · L |
| `/ownership` | Business menu: Business details → ownership, plus `/workspace/export` and `/workspace/exit` | Retire. Redirects to `/settings#ownership` today. Export and exit exist in production | Map to the exit and ownership section · S |
| `/reports` Weekly and monthly recaps | `/workspace/recaps`, linked from Home (`?view=monthly` → `period=month`) | **Ready** (branch `build/owner-entry`). Reads every linked site's recaps through the tenant link | Crons resolving the recipient through the link is the systems-catalog stream's |
| `/analytics` Live traffic, milestone, AI visibility | Website System, results and health | None | Results panel on the Website System · M |
| `/review` Approval queue | Needs you | Partial. Needs-you UI is local with no real policy source; the queue is Redis events | Needs-you spec · L |
| `/reviews` Reviews and replies | Publishing System (reviews), *acts on* Google | None | Reborn §4 Publishing · L |
| `/settings` | Split. *Business* (profile) → Business details on the business record. *Branding* and *site config* → Website System. *Dependencies* → Connections. *Shortcuts* and *ownership* → business menu. *Account* → `/workspace/account`. *Domains* → Website System *appears on* Connection. *Plan* → business menu billing | Partial. `WorkspaceBusinessSettings` and `/workspace/account` exist in production. Business details doesn't edit the business record. Billing has no `workspaceId` in Stripe | Business record editing (business-record spec), domain view (Reborn §5), billing that follows the client (Reborn §3) · L |
| `/store` (gldf) | **Frozen** on `/dashboard`; the website System shows a Store *Connection* (systems catalog §3.2, decision 9.4) | Frozen | None at 1.0.0 |
| `[...notFound]` | Home | n/a | Map · S |

**Which pages block which client.** gldf can't move until `/store`,
`/reports`, `/review`, `/` and `/site` are `ready`. Wellness clients
(rohlax) need `/schedule`, `/members` and `/roster`. Which tenants use which
pages comes from `tenants.features` and Redis connections. That's a
read-only check that hasn't been run (see Unknowns).

## 6. Built on

**Reused.**

- `src/proxy.ts`: admin host parsing (`extractTenantFromHost`,
  `isBareAdminHost`, `shouldUseFallbackAuthForAdminHost`,
  `buildTenantFallbackUrl`), the root redirect, and
  `getOwnershipSettingsRedirectPath`.
- `src/app/sign-in/[[...sign-in]]/page.tsx`: `getTenantAuthContext`.
  Today it hard-codes `next=<root>/dashboard` (line 134). The same
  hard-code is in `src/app/sign-up/[[...sign-up]]/page.tsx` (line 121).
- `src/app/auth/callback/route.ts`. It doesn't hard-code `/dashboard`: it
  defaults to `/account` and follows `next`. The `/dashboard` hard-code is in
  the sign-in and sign-up pages, which set `next`.
- `src/app/(marketing)/account/page.tsx`. With the workspace release on, it
  already sends non-operators to `/workspace` or `/business`, and
  single-tenant users fall back to `getTenantDashboardFallbackUrl`
  (`src/lib/tenant-urls.ts`).
- `src/lib/workspace-location.ts` (`workspaceReturnTarget`).
- `src/app/dashboard/layout.tsx`, which already checks access, claims
  invites and builds surfaces.
- `src/platform/workspaces/invitations.ts` and
  `supabase/migrations/20260918130000_workspace_invitations.sql`. Tokens are
  hashed. Acceptance is at `/workspace/invitations/accept/[token]`.
- `src/lib/invites.ts` and `/api/admin/invites`: the tenant invite that
  emails, via `invite-email.ts`.
- `src/lib/auth.ts` (`claimPendingInviteForCurrentUser`, `hasTenantAccess`,
  `assignUserToTenant`, `memberships` table).
- `tenant_workspace_links` and `resolve_business_owner_recipient`
  (`20261002120000_business_record.sql`), and
  `src/platform/systems/from-existing.ts`, which already resolves link-first
  with `offering_website_bindings` as fallback.
- `systemHref` (`src/experience/systems/model.ts`).
- `src/lib/email/send.ts`, `src/lib/email-enabled.ts` and
  `src/lib/client-email-override.ts`.

**New.**

- A per-workspace flag table with an immutable change history. The
  proposed name is `workspace_release_flags`. It follows the
  `website_documents` pattern: RLS on, grants revoked, service-role
  functions, cross-workspace denial tests. It needs a migration and
  Jacob's yes.
- A flag resolver used by the four release helpers. It takes a workspace
  id, keeps today's signatures as the env-only path, and has a 60-second
  cache.
- *As built:* sign-in, sign-up and the admin root send the person to
  `/auth/entry` (only when `STRELVA_OWNER_ENTRY` is not off), which decides
  once the person is known; the sign-in page can't know membership before
  the magic link. With the env off, `next` stays `/dashboard` exactly as
  before. The trusted header is `x-strelva-dashboard-path`. A `ready` page
  also checks itself, since a soft navigation doesn't re-render the layout.
- A dashboard disposition map: path → workspace target builder → `ready`,
  `stay` or `retire`. It's one module with a test that fails if a new
  `src/app/dashboard/**/page.tsx` has no entry.
- The redirect decision. The proxy sets a trusted request-path header
  (stripped from client input, like `x-client-fallback-root`), and
  `src/app/dashboard/layout.tsx` decides. That's where the user, link and
  membership are already loaded. The Edge proxy doesn't do a membership
  read on every request.
- `create_operator_owner_invitation`. It requires a super admin with an
  `admin` membership on a workspace that has a tenant link and no owner yet.
  The accept path is extended to write tenant `memberships` rows for linked
  tenants in the same transaction.
- An owner invitation email through `send.ts`, plus an operator button on
  `/admin/clients/[id]`.

**Retires (later, not at 1.0.0):** the `/dashboard` page bodies, one per
page, once every workspace that used it has moved. The route files stay
as redirects. **Tenant model vs workspace model:** `/dashboard` and tenant
memberships are tenant-model. Owner entry, flags and invitations are
workspace-model. Tenant membership rows are written only as a compatibility
grant while tenant APIs gate on them.

## 7. Moving today's clients

Production facts (Sept 30 record, not a fresh read): 0 workspaces, 0 tenant
memberships, 1 sign-in in 30 days. *Inference:* today `/dashboard` is used
almost only by operators and the demo. The live risk is links (repos,
emails, Stripe return URLs, bookmarks), not owners' habits.

1. Ship the code with `STRELVA_OWNER_ENTRY` unset. Nothing changes.
2. Convert a Strelva-owned test tenant (Reborn section 3), set its
   workspace to `operators`, and run the proof below.
3. Convert gldf. Set `operators`. Jacob walks every gldf page. Pages not
   `ready` show `/dashboard` with the back link.
4. With Jacob's yes, invite gldf's owner. Set `on` only when gldf's blocking
   pages are `ready`.
5. Repeat per client. Clients who never accept an invitation stay
   `operators`. Their owners keep getting email, and every old link still
   resolves.
6. Set env `STRELVA_OWNER_ENTRY=1` only when every converted workspace is
   `on` or explicitly `off`.

Stripe `success_url` (`src/lib/billing.ts`, `/dashboard?checkout=success`)
and `src/lib/offboarding.ts` (`/dashboard/settings#domains`) keep working
through the redirect. Updating them is follow-up work, not a precondition.

## 8. Failure and undo

| Failure | What the person sees | Undo |
| --- | --- | --- |
| Link or flag read fails in the layout | `/dashboard` as today. Fails toward the old surface, logged | Automatic |
| Moved page breaks | Operator sets the workspace to `off`; next request lands on `/dashboard` | Flag change, no deploy |
| Owner invitation email suppressed (global pause, no tenant override) | Operator sees "not sent" and the accept link to share by hand, as tenant invites do today (`alertInviteEmailGap`) | Revoke invitation (existing RPC) |
| Invitation accepted, tenant membership write fails | Whole accept rolls back. "We couldn't finish adding you. Nothing changed." | Retry the same link |
| Signed in with the wrong email | Existing recipient-mismatch message, then a sign-out-and-retry button | n/a |
| Signed-in member, no tenant membership, page still `stay` | Today's `/no-access`. Prevented by requirement 9 | Re-run accept or operator grant |
| Owner removed later | Both memberships removed together; `/dashboard` access goes too | Re-invite |

Not undoable: an email already sent. The workspace owner role keeps the
last-owner guard in both stores.

## 9. Proof

- **Unit tests.** The flag resolver covers every env value × row state. The
  disposition map has every page file mapped, every anchor mapped, and no
  `ready` target outside `workspaceReturnTarget`. The sign-in and sign-up
  destination is checked for linked/unlinked × flag × membership.
  `workspaceReturnTarget` accepts `view=system`. Extend
  `proxy-tenant-gate.test.ts`, `auth-callback.test.ts`,
  `account-page.test.ts`, `workspace-invitations.test.ts` and
  `dashboard-surfaces.test.ts`.
- **SQL tests** in `check:workspace-sql`. Operator owner invitation: refuses
  a non-super-admin, refuses when an owner exists, refuses a workspace with
  no link. Accept writes both memberships or neither. Cross-workspace
  denial.
- **Authenticated local journeys,** desktop and mobile. gldf admin host
  (custom domain, fallback auth), rohlax `/client/rohlax/dashboard`, and an
  `admin.<tenant>.strelva.com` subdomain. Each in three states: not signed
  in, signed in as owner, and signed in without membership. Every row in
  the section 5 table opened by URL.
- **Redirect contract.** Fetch each `/dashboard` path in the gldf and rohlax
  repos' hard-coded forms and assert 307 to the mapped target. Then flip
  the flag to `off` and assert 200 on `/dashboard`.
- **Production.** On the Strelva-owned test business: owner invitation
  email received, accepted, admin host sign-in lands in the workspace, one
  flag rollback observed. Then gldf on Jacob's yes.

## 10. Open decisions

1. **Flip rule: all pages or page by page?** (a) Build every page the
   client uses before turning owner entry on. (b) Mix: `ready` pages
   redirect and the rest render `/dashboard` with a back link.
   **Recommend (b) inside `operators` and (a) for `on`.** Operators can
   live with mixed surfaces; owners shouldn't bounce between two apps.
2. **Can a workspace row turn on a flag the env has off?** The client email
   override does this today. **Recommend no.** Env off is the kill switch.
   `workspace` mode gives the same per-client rollout without weakening it.
3. **Who is the owner of a converted business?** (a) Operator-issued
   invitation only (this spec). (b) Auto-grant on a verified email that
   matches `owner_recipient`. **Recommend (a).** Owner carries payer and
   exit authority, and email facts come from imports.
4. **Strelva's role after the owner accepts.** It stays `admin` (simplest),
   or becomes a provider relationship like an agency. **Recommend `admin` at
   1.0.0.** Revisit with partner agencies.
5. **Which host serves the workspace?** Session cookies are host-only (no
   cookie `domain` is set in `src/lib/db/*-client.ts`). (a) Serve
   `/workspace` on the admin host where the person signed in. (b) Always
   send them to `app.strelva.com`, which means a second sign-in for
   `admin.<tenant>.strelva.com`. **Recommend (a).** Custom admin domains
   already authenticate on `app.strelva.com/client/<tenant>`, so they
   land there.
6. **Owners who never sign in, under assumption 6.** Owner-only actions
   (Make real requires `owner` in `SystemPage`, plus publish and launch)
   need an email path. If the needs-you spec chooses signed email actions,
   owner entry needs nothing more. If it doesn't, a business with no
   signed-in owner can't Make real at all. Name it in the needs-you spec.
   Nothing in the repo sends SMS. Adding it would be a new provider and a
   new dependency.
7. **If 1.0.0 means only existing clients (assumption 1 changes),** the
   operator invitation is the only owner path. If new businesses come in
   through the same path, they create their own workspace and are `owner`
   from the start (`/workspace/business/new`), so this spec only adds the
   admin host landing for them.

## 11. Unknowns

| Unknown | Fact or inference | How to find out |
| --- | --- | --- |
| Which tenants use which `/dashboard` pages | Unknown | Read-only query of `tenants.features`, Redis `connections:*`, and dashboard engagement events (`EngagementTracker`) per tenant |
| Whether any tenant has client email armed (`reb:client-email:{tenant}`) | Unknown. Global client email is paused unless `EMAIL_SENDING_ENABLED` | Read-only Redis check. It decides whether invitations and report links reach anyone today |
| Whether `/workspace` renders fully on `admin.<tenant>.strelva.com` and custom admin domains (CSP, `appBase`, cookies) | Inference: the proxy passes `/workspace` through with `x-tenant` set; not tested | Local journey on `gldf.localhost` admin host |
| Where the 22-page count came from | Fact: 24 page files plus the catch-all today | Reconcile with the Oct 2 audit in `output/product-audit-2026-10-04/` (local only) |
| Whether owners will sign in at all | Fact: 1 sign-in in 30 days | Measure after gldf's invitation: accepted, first sign-in, return within 30 days |
| Whether Stripe's customer portal and return URLs need `workspaceId` first | Inference: they work through the redirect | Billing spec |
