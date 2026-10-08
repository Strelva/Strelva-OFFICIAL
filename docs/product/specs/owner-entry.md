# Owner entry and the move off /dashboard

Status: implemented locally on `w6/owner-ask`, October 7, 2026. Not
migrated or deployed; release and email flags remain off. Current proof and
production stop points are in [the stream handoff](../streams/w6-owner-ask.md).

- All 25 dashboard page files have dispositions: 24 `ready`, and Settings
  intentionally retained on `/dashboard`. Content, Sources, Health,
  Ownership, Members and Store now have exact workspace destinations.
  Store and Members reuse the existing evidence panels; checkout and
  rewards behavior stay in the client site.
- Every new redirect requires `STRELVA_OWNER_ENTRY`, linked workspace
  membership and its destination's release gates. They remain reversible
  307s; operators keep `?legacy=1`. Settings does not block owner entry.
- The operator invitation panel and endpoint are built, separately gated
  by `STRELVA_OWNER_INVITATIONS_RELEASE=0`. A verified magic-link entry
  claims only a pending operator-issued invitation, including an existing
  member or admin, with
  `STRELVA_OWNER_INVITATION_CLAIM=1`; the existing accept transaction grants
  both memberships. Invitations remain deferred, and sends require the
  existing global, customer and per-tenant email gates.
- Reports, review alerts, health alerts, lead notices, lifecycle notices
  and billing return links resolve the moved destination through a narrow
  workspace port. Recipient ownership remains with the agency-operator
  stream. Flag off: no new destination lookup, existing URLs and behavior.
- Routine Needs you decisions can use signed email links for an owner
  without an account, under `STRELVA_OWNER_DECISION_LINKS_RELEASE=0`.
  Make real retains its separate owner-link gate. Access, money and exit
  still require sign-in. Website facts, copy, preview approval and launch
  bind the exact revision; no membership is synthesized. Signed read-only
  website review shows complete copy and navigable pages without sign-in,
  disables visitor actions and refuses changed recipients or candidates.
  The prepared `20261014110000_owner_decision_effects.sql` migration binds the
  intended approve/decline and rechecks the same active provider's actual
  execution effect at admission and each session use. Website reserve and
  publish each require `publish`; Google decisions require `google`, sending
  decisions `email`. Preview/fact/plan approval and decline have no immediate
  outside effect; later outside writes retain their own gates. Unknown repair
  effects and sign-in-only decisions fail closed. The immutable session also
  names the exact provider-assignment row: ending and granting the same agency
  again never revives it. Admission and each native use hold assignment,
  verified member, decision and agency-verification authority until transaction
  commit; concurrent revocation applies to subsequent calls. An explicit signed
  owner decision provides this one-shot source approval; a provider seat alone
  never supplies the business-member identity used by this service executor.
  Existing unbound sessions fail closed. The focused local proof command is
  `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-owner-decision-effects-sql.sh`.
  Rollback refuses retained owner-link sessions. This is local implementation, with activation still off.

Not proven here: authenticated admin-host entry and rollback on an isolated
Supabase Auth stack, actual mail delivery, production migrations, live
provider read-back, owner use or commercial results. Local render and SQL
proof do not establish those.

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

**Current count (October 7, `w6/owner-ask`).** 24 route pages plus
`[...notFound]`: **24 ready, 1 intentionally retained Settings page**.
The four former redirect stubs now redirect directly to their own workspace
place. Store and Members move as existing read-only evidence Connections,
without activating checkout, points, rewards or membership actions.
`src/platform/owner-entry/dispositions.ts` owns the current map; tests compare
it with the actual page files and verify sign-in-safe destinations and rollback.
A client has no unsettled page blocker at launch; destination release gates
still apply per page. Historical partial counts are superseded by this map.

The nav that owners see comes from `getDashboardSurfaces`
(`src/lib/dashboard-surfaces.ts`). It shows Today, Ask Strelva, Website,
Google Business, Analytics, Reports and Reviews, plus Schedule, Members and
Roster from the wellness set in `src/lib/features/registry.ts`. Store is a
Website sub-tab when `tenantHasStore` is true. Settings is the footer gear.
The other pages are reached from inside those.

| `/dashboard` page | Lands in the workspace | Today | Work needed |
| --- | --- | --- | --- |
| `/` Today | Home: Needs you, **From your site** (visits, customer actions, who reached out, Strelva's work, links to the places below), Strelva handled, In progress, Recent | **Ready** while Needs you is on (`w2/owner-surfaces-a`). Approvals come through Needs you's tenant-event adapter; the rest from `/api/workspace/site-summary` | Parity gaps: no onboarding checklist or wizard, day-one cards, retention panel or "Do this next"; no sparklines; no Edit site / View live site buttons on Home |
| `/chat` Ask Strelva | Ask Strelva (`view=ask`) on Home and each System | **Ready** while Ask and Systems are released | No approvals in chat; workspace conversations start fresh |
| `/site` Website editor | Website System ("greatlakesdriedfruit.com") | **Ready**, gate `systems`; native editor or repo-site request surface | Existing client APIs and governed Requests are reused; repo sites remain requests for Strelva |
| `/content` | Website System, Edit | **Ready**, gate `systems` | Reuses the website editor |
| `/assets` Photos | Website System, photos and files | **Ready**, gate `systems` | Reuses the existing photo library through the tenant link |
| `/brand-kit` | Website System, look (fonts, colors) | **Ready**, gate `systems` | Reuses the existing brand panel through the tenant link |
| `/collections` Blog and collections | Publishing System (blog), or Website System content | **Ready**, gate `systems` | Reuses the existing collections manager; entries still serve through `/api/v1/collections` |
| `/google` Google Business | Publishing System, plus an *acts on* Connection to the Google Business profile | **Ready**, gate `systems` | Reuses existing Google Business reads and governed tools; grants stay in their existing authority |
| `/health` | `/workspace/results#site-health` | **Ready** | Keeps valid analytics date parameters |
| `/history` Site safety, request and check history | Website System, History | **Ready**, gate `systems` | Reads existing tenant history; request selection survives the redirect |
| `/integrations` Connections | Connections on each System, plus account grants under Business details | **Ready**, gate `systems` | Reuses existing Connections reads and controls |
| `/sources` | Website System, Connections | **Ready**, gate `systems` | Reuses existing Connections reads and controls |
| `/sources/[id]` Connection detail | That Connection on its System | **Ready**, gate `systems` | Safe connection id preserved; invalid ids fall back to Connections |
| `/leads` | Inquiries, `/workspace/inquiries` | **Ready** (`w2/owner-surfaces-a`). Every linked site's leads from Redis via `src/lib/leads.ts`, newest first, reply by email, 30-day count | Parity gaps: the `tenant_leads` mirror isn't read (Redis outage shows "couldn't be read"); not the inquiries spec's System page (status, assignee, follow-ups) |
| `/members` (wellness) | Website Connection, Members | **Ready**, gates `owner_entry` and `systems` | Existing read-only members panel; rewards remain frozen |
| `/roster` (wellness) | Bookings System, day roster | **Ready**, gate `systems` | Existing booking store, day view |
| `/schedule` (wellness) | Bookings System | **Ready**, gate `systems` | Existing booking store, week view; hours and services remain business-record edits |
| `/ownership` | `/workspace/business-details#ownership` | **Ready** | Export and exit still require sign-in and their existing authority |
| `/reports` Weekly and monthly recaps | `/workspace/recaps`, linked from Home (`?view=monthly` → `period=month`) | **Ready** (branch `build/owner-entry`). Reads every linked site's recaps through the tenant link | Crons resolving the recipient through the link is the systems-catalog stream's |
| `/analytics` Live traffic, milestone, AI visibility | Website results and health, `/workspace/results` (`?range=` kept) | **Ready** (`w2/owner-surfaces-a`). Same reads as the old page; Search Console and GA4 through `tenant_analytics_config`; latest scan as site health | Parity gaps: site health is the scan summary, not the interactive audit card; no custom date picker; no Ask Strelva hand-offs; not yet a panel on the Website System page |
| `/review` Approval queue | Needs you, on Home | **Ready** while Needs you is on (`w2/owner-surfaces-a`) | Parity gaps: no edit-before-approve, resolved history or stale-section count; operator queue controls stay on `/dashboard/review?legacy=1` |
| `/reviews` Reviews and replies | Google listing: Reviews, `/workspace/reviews` | **Ready** (`w2/owner-surfaces-a`). Reviews, existing replies, Strelva's waiting draft, reply through `/api/workspace/reviews/reply` (same governed path as `/api/reviews/reply`, plus `requireTenantAccess`), review request link | Parity gaps: no reply-voice settings or AI draft button; no copy buttons; reads the tenant review store, not Publishing's listing receipts |
| `/settings` | Business details, `/workspace/business-details`, with a section for every old `#anchor` linking on to People and access, account, plan/ownership and the website | **Stay** (Oct 6: the home is built on `w2/owner-surfaces-a`, but `/dashboard/settings` keeps serving until branding, site basics and domains are editable here). Owner (or a Strelva operator as admin) edits name, phone, public email, description and the owner recipient in the business record, revision-checked | Parity gaps: no branding, site basics, navigation, connected services or domain editing; tenant profile fields don't change; billing still has no `workspaceId` |
| `/store` (gldf) | Website Connection, Store | **Ready**, gates `owner_entry` and `systems` | Existing products, summary and orders panel; checkout unchanged |
| `[...notFound]` | Home | **Ready** | Home; gated owner entry preserves the legacy fallback while off |

**Which pages block which client.** No remaining disposition blocks owner
entry for the store, wellness, local or always-used groups. Settings is the
explicit retained exception. Actual tenant feature use and release eligibility
still need the authorized rollout inventory; code readiness grants no rollout.

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

## 10. Decisions and launch defaults

These close implementation choices for this stream. They grant no production,
invitation, pricing or provider authority.

1. **Flip rule:** operators can rehearse mixed surfaces; owner `on` requires
   settled dispositions. Settings is the requested retained exception.
2. **Env off is the kill switch.** A workspace row cannot override it;
   `workspace` mode allows per-client rollout and rollback.
3. **Ownership comes only from an operator-issued invitation.** Matching an
   imported email never auto-grants owner authority. Magic-link claim accepts
   that existing invitation and creates both memberships atomically.
4. **Strelva stays admin** in converted businesses. The client's owner
   authority is never borrowed by Ask or synthesized for email execution.
5. **Same-host workspace entry.** It preserves host-only auth cookies;
   custom-admin fallback keeps `/client/<tenant>` routing. Authenticated host
   proof belongs to the isolated journey and rollout gates.
6. **Owners can decide without signing in.** Routine decisions use a signed,
   revision-bound owner link, with a separately gated, logged service executor.
   Make real has its existing separate gate. Access, money and exit require
   sign-in. No inbound email parser or SMS provider is added.
7. **Existing converted clients use invitations.** Independent new businesses
   retain their existing workspace-creation ownership path.

## 11. Unknowns

| Unknown | Fact or inference | How to find out |
| --- | --- | --- |
| Which tenants use which `/dashboard` pages | Unknown | Read-only query of `tenants.features`, Redis `connections:*`, and dashboard engagement events (`EngagementTracker`) per tenant |
| Whether any tenant has client email armed (`reb:client-email:{tenant}`) | Unknown. Global client email is paused unless `EMAIL_SENDING_ENABLED` | Read-only Redis check. It decides whether invitations and report links reach anyone today |
| Whether `/workspace` renders fully on `admin.<tenant>.strelva.com` and custom admin domains (CSP, `appBase`, cookies) | Inference: the proxy passes `/workspace` through with `x-tenant` set; not tested | Local journey on `gldf.localhost` admin host |
| Where the 22-page count came from | Fact: 24 page files plus the catch-all today | Reconcile with the Oct 2 audit in `output/product-audit-2026-10-04/` (local only) |
| Whether owners will sign in at all | Fact: 1 sign-in in 30 days | Measure after gldf's invitation: accepted, first sign-in, return within 30 days |
| Whether Stripe's customer portal and return URLs need `workspaceId` first | Inference: they work through the redirect | Billing spec |
