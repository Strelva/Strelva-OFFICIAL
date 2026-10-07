# The agency surface and Versions

Status: draft spec, 2026-10-06. Not approved. **Built and proven locally
on branch `build/versions-agency` (Oct 6), applied nowhere:** the Versions
tables and RPCs (`20261007150000`), `createSupabaseVersionStore` passing the
same contract suite as the in-memory store against a throwaway cluster, the
hidden same-business source, improvement compare/adopt/decline with
keep-local/take-upstream, a release gate that needs the business's approval
(Make real through Needs you is the port, not yet wired to Needs you),
lineage read from `system_versions` instead of `sourceWorkId`, Strelva's
agency workspace as a row (`platform_workspaces`) instead of `"strelva"`,
`agency_client_overview` with `GET /api/workspace/agency-clients`, the
Library and Review all (`/api/workspace/agency-library`), and the
Clients/Queue/Library/Team views. Not built: Build, Package UI, Team
management, the workspace-keyed approve link, owner email, health and
bounced-email Queue items, bulk receipts. See section 10 for what the build
found.

Built and proven locally on `build/business-ownership` (Oct 6): decision 1A's
`workspace_providers` mark (grants nothing), set by conversion once Strelva's
agency workspace is designated, and the agency home listing operated clients
the actor already belongs to (`providedClients`). The batched read on `build/versions-agency` reads the same mark.

Base: branch `reborn-1.0-model` at `db9566a8`. Every path below was read on
that branch. Nothing here was run against production.

## Wave 6 implementation checkpoint — October 7, 2026

Built locally on `w6/agency-operator`; production remains untouched by this
stream. The earlier status paragraphs below describe the October 6 baseline.
They are retained as history, not the current implementation inventory.

| Launch requirement | Local implementation and proof |
| --- | --- |
| 1–3: all clients in one scoped read, cursor above 100, named partial failure | `agency_client_overview`/`agency_client_overview_v2`, strict server response parsing, Clients view; `agency-versions-server`, `agency-home-ui`, `w6-agency-operator-overview` suites. The 50-client UI case renders all rows from one request; it is not a production latency claim. |
| 4: one Queue with owner asks, improvements and health | Agency view consumes the released operator Queue while retaining scoped Version and owner-decision rows. Incomplete sources are named; missing/stale health is Not verified. `w6-agency-operator-overview` covers inaccessible businesses, delegated scope, operator refusal and source failure. |
| 5–6: Library and Team | Source revisions, per-Version conflicts/missing accounts/declines and team reach are read and rendered. Library now links directly to the client's Version System. |
| 7–8: Build and Package | Existing funded work-plan execution creates an owned Draft System. Package extracts the reusable app definition or Version draft, rejects private records/accounts/secrets, and records a command receipt for lost-reply retries. `w6-agency-authoring` tests accepted-but-unconfirmed publication and altered retries. |
| 9: bulk review | Selected ready Versions get separate business preparations/receipts; conflicted/missing-account Versions are skipped. The release and Needs you gates are checked per business; adopting never moves Live. `w6-version-decisions` and `agency-home-ui` cover this boundary. |
| 10–13: create, override, bind, release | A native internal-app source creates an empty, separately owned executable application and canonical System in one command with its source share and lineage. Local overrides remain drafts; an approved, exactly prepared Version row updates, rehearses and publishes that destination runtime in the same transaction as its immutable release and spine pointer. Records remain owned by the destination. Unsupported automated runtime kinds fail explicitly; custom-repo website Versions require operator-prepared native Possibilities. `w6-version-native-create`, `w6-version-native-runtime`, `tests/w6-version-native-applications.sql` and rollback proof exercise these boundaries. |
| 14–17: compare, resolve, decline, separate adoption from Live | Source improvements project into the normal Possibilities vocabulary with current/candidate definitions and path conflicts. Adoption prepares the existing Version-release Needs you item; Make real decides that exact pinned item, with no duplicate approval path. Later revision comparison, decline reasons, CAS writes and lost preparation retries remain. `w6-version-possibilities`, its rendered UI tests, and `w6-version-decisions` prove these boundaries. Restore from History changes only the working draft and requires its own release decision. |
| 18: source author sees no implicit client data | Version service and Postgres reads require the client's grant. Only its business owner can grant or revoke lineage/data access; migration `20261010163200` also blocks direct service-role saves and disables direct access to the private save implementation. The shared store contract tests owner allowance, admin denial, unchanged admin draft access, revoked grants and binding secrecy. |
| 19: Twin Trees first real set | Mapping and isolated two-location tests exist. Production setup remains blocked on the owner's one-business/two-business answer; custom-repo improvements remain operator-prepared work. No real Version set is claimed. |
| 20: System Versions panel | Stored lineage, source/context/history, shared improvement controls, account binding, local draft changes and restoration are rendered on the owning System. `w6-version-management-ui` covers loading, unavailable, read-only, no-op release and foreign/malformed/stale acknowledgment. |

Round 5 initial focused proof: six test files, **39 passed / 11 skipped**.
The native runtime follow-up passed four focused files with **45 passed**;
Native application SQL and the retained-fixture rollback/reapply roundtrip
passed in the throwaway local PostgreSQL cluster: actual Live runtime and
canonical System lifecycle, destination records, pinned approved decisions,
forged/stale rejection, private ACLs and preparation receipts were checked.
The final integrated SQL and repository checks remain with the coordinator. The skipped
cases require the local PostgreSQL harness and are included by
`pnpm check:workspace-sql`; the coordinator records that run and the full
repository checks in the [stream handoff](../streams/w6-agency-operator.md).
A first typecheck found a missing internal Library callback prop and a widened
grant fixture literal; both were corrected. Focused lint then passed.

Rendered locally in the collaborative browser at `localhost:3046`, using the
existing preview: 1280×800 Library with five ready, one conflict and one missing
account; 390×844 Version comparison with keep-local preparation and an honest
Nothing went live acknowledgment. Version loading, error, read-only and empty
states were inspected at 390px, without document horizontal overflow. The
follow-up Possibilities bridge passed **7/7 local Playwright cases** at 1280px
and 390px, including an isolated native application submission, exact prepared
Make real, and mobile loading/error/read-only/empty/missing-account states;
screenshots are retained in `.scratch/w6-round5/version-possibilities-*.png`. These
are fictional local fixtures, not customer/provider operation. Preview query
`version=full|loading|error|read-only|empty|missing-account` selects the Version
state; `agency` retains the existing client/Library states. New fixtures send
nothing and use no provider credentials.

Remaining production/operating proof: apply and verify the Versions, authoring,
management, owner-grant and native-application migrations with rollback files; convert clients and
establish Strelva's provider marks under approval; resolve Twin Trees ownership;
exercise a real owner email approval and read-back/restore on a Strelva-owned
two-location test business; measure human minutes before/after bulk review.
No operator-time savings, owner engagement or successful production migration
is claimed. Workspace email approval routing and the one owner-recipient rule
are coordinated by the owner-ask/agency-operator integration, not a separate
agency mail implementation.

## 1. The moment

It's Monday. Jacob opens Strelva as Strelva, the agency that runs every
client.

**Clients** lists all of them on one page: gldf, The Mooney Firm, Twin
Trees, McClear's, Rohlax, Leslie Bookkeeping and the rest. Each row shows the
business by name, its Systems by their own names ("attymooney.com · Live",
"Inquiries · Live · 2 new"), anything waiting on the owner and for how long,
and the last thing Strelva did. Nothing is paged in eights.

Twin Trees has one website, run in two places. Its row shows the Camillus
site and the Fayetteville site as two Versions of one website, each with its
own domain, hours and booking calendar. Last week Strelva changed the
Camillus site's hours section. The Fayetteville System page now shows, under
Versions: "Camillus got a new hours section. Bring it here?" Both sites are
custom repos today, so Strelva prepares that change for Fayetteville by
hand. It arrives as a Possibility, not as an automatic copy.

Twin Trees' owner never signs in. The owner gets one email: "Strelva has an update
for your Fayetteville site. Look at it, or approve it." The owner approves. Strelva
publishes, reads it back, and the receipt lands under **Strelva handled**.

Separately, Strelva improves its own inquiry intake, the source behind
clients' contact forms. **Library** shows that intake with its client
Versions and where each stands. Say 7 clients have it: 5 can take the
improvement cleanly, 1 has a conflict, 1 is missing a connected calendar.
The conflicted one shows both values side by side:

> Mooney changed the follow-up message locally. Keep "We'll call you within
> one business day" or take the new default?

**Review all** prepares the 5 clean ones, one Possibility per client, one
approval per owner, one receipt per client. The conflicted one waits for
Strelva's call. The one missing a calendar says so and does nothing.

No client's data, accounts or contacts ever move to another client.

## 2. In the model

- **Version** is a System adapted for a different context: a location (Twin
  Trees), a client of an agency (Strelva's intake for Mooney), later a
  segment or franchise (`VERSION_CONTEXT_KINDS` in
  `src/platform/system-versions/types.ts`). Each Version is its own System,
  owned by the business it runs for.
- A **source** is the System a Version descends from. Strelva's own sources
  live in Strelva's workspace. A same-business source lives in that business.
  ADR 0010's "method" is a source viewed from the agency side.
- An **improvement** is a new source revision offered to a Version. On the
  Version's System it arrives as a **Possibility**. Adopting it is **Make
  real** through the normal approvals. It is never applied silently.
- **History** is the Version's own releases over time. It is never called a
  Version.
- **Connections** stay per Version. Camillus's calendar and domain are never
  Fayetteville's (`bindAccount` refuses a sibling's account, even inside one
  business).
- **Requests** and **Running** are how Strelva's agency work is listed in the
  Queue. They are not Versions.
- Agency website drafts (`src/platform/offerings/agency-website-draft*.ts`)
  are **Possibilities** prepared by a provider for one client's System. They
  are not Versions (`docs/product/systems-transition.md`, "Agency website
  drafts are Possibilities, not Versions").

The agency surface is a view across businesses. It owns no data. Every
client row is read from that client's workspace under the actor's access in
that workspace.

## 3. What it does at 1.0.0

### Agency surface

1. **Clients loads every client in one server read.** One request returns,
   for every customer workspace the actor serves: name, Systems in scope
   with lifecycle and health, Needs you count and oldest age, open Requests
   count, last receipt time. The browser makes one call, not one per client.
   With 12 active tenants this is one page. Over 100 clients it paginates on
   the server by cursor.
2. **Each row is scoped exactly as opening that client would be.** A partner
   agency (later) sees only Systems tied to its delegated or assigned work.
   Strelva, as admin member of converted workspaces, sees the whole business.
   The batched read applies `system_actor_scope` per client; it never widens.
3. **A client that fails to load says so** by name ("Twin Trees could not be
   loaded. Retry.") and the others still render.
4. **Queue** lists Strelva's own work across clients, oldest first: Requests
   in Asked or In progress, Possibilities waiting on an owner, improvements
   ready to offer, health failures, and owner emails that bounced or were
   never opened. Each item opens the client's System, not a copy.
5. **Library** lists Strelva's sources. Each shows its revisions, the
   clients with Versions of it, and per-Version status: up to date, ready,
   has conflicts, missing accounts, declined.
6. **Team** lists the agency's members and which clients each one works.
   At 1.0.0 that is Strelva operators (`super_admins`).
7. **Build** makes a System for a client from a sentence, through the
   existing work-plan path (`src/products/work-plans/`), into the client's
   workspace as a Draft. The owner never has to build.
8. **Package** publishes a System as a source revision. Publishing refuses
   records, bindings, grants and secrets (`assertShareableDefinition`).
9. **Bulk review** takes one source revision and prepares an improvement
   Possibility for every selected Version whose status is ready. Conflicted
   and missing-account Versions are listed and skipped, never forced. Each
   prepared Possibility goes through that client's own approval and leaves
   that client's own receipt.

### Versions

10. **Create a Version** from a source revision for a business. The Version
    gets its own System row in that business. Only the shareable definition
    is copied. Accounts, data, people and grants start empty.
11. **Overrides** are business-owned changes over the baseline. Working
    definition = baseline + overrides (`applyOverrides` in `service.ts`).
12. **Bind accounts** only from the Version's own business, and only if no
    other Version already binds that account.
13. **Release** snapshots the working definition as that Version's release
    N. It also writes a `system_revisions` row for the Version's System so
    History and the spine agree.
14. **Improvements are offered, never forced.** When a source publishes
    revision N+1, every Version sees a three-way compare (baseline, upstream,
    local). Status is `auto_applicable` or `blocked`, with named conflicts
    (`overlapping_edit`, `incompatible_override`) or `missingBindings`.
    Even `auto_applicable` waits for a decision.
15. **Conflicts are shown path by path** with both values. The decider
    picks keep local or take upstream for each. Adoption must equal the
    preview plus the chosen upstream values, or nothing changes.
16. **Decline** records a reason. A later revision is compared against the
    Version's baseline, so declined changes reappear with it.
17. **Adopting changes the working definition only.** Going live is a
    separate release, through Make real.
18. **The source side sees no client data.** The author sees which
    businesses hold Versions and their status only when each business grants
    `lineage`. Bindings never show outside the owning business.
19. **Twin Trees is the first real Version set**, after its owner confirms
    whether Camillus and Fayetteville are one business or two.
20. **Versions panel** on a System page lists the source, sibling Versions,
    each one's context and what it changed, and any improvement waiting.

## 4. States and rules

### Version improvement states

| State | Means | Shown as |
| --- | --- | --- |
| `up_to_date` | Baseline = latest source revision | Nothing waiting |
| `auto_applicable` | No conflicts, accounts present | "Improvement ready" |
| `blocked: conflicts` | Local override overlaps an upstream change | "Needs a choice on 2 changes" |
| `blocked: missingBindings` | Needs an account this Version hasn't connected | "Needs Google calendar connected first" |
| adopted | Working definition updated, not released | Possibility "ready for review" |
| released | Version release N is live | Receipt under Strelva handled |
| declined | Decision recorded with reason | Shown in History |

These keep the inquiry pattern vocabulary underneath
(`installed / update_available / conflicted` in
`src/products/inquiries/inquiry-pattern-updates.ts`), which already calls
`collectChangedPaths` from `src/platform/system-versions/compare.ts`.

### Who can do what on a client's System

| Action | Owner | Member | Strelva (admin member, 1.0.0) | Partner agency (after 1.0.0) |
| --- | --- | --- | --- | --- |
| See Systems | All | All | All | Only delegated/assigned work (7a1ed5a5) |
| See contacts, inquiries | Yes | Yes | Yes | No |
| Prepare a Possibility | Yes | No | Yes | On assigned work |
| Set overrides, adopt an improvement | Yes | No | Yes | Only with an assignment, never by source authorship |
| Release a Version to Live | Yes | No | Only under the owner's approval policy | Never alone |
| Bind an account | Yes | No | Only accounts the business connected | No |
| Grant lineage access to the source author | Yes | No | No | No |
| Pause, exit, change provider, billing | Yes | No | No | No |
| Become owner | n/a | No | Never | Never |

Rules that never bend:

- **An agency is never owner.** Conversion makes the operator `admin`, not
  `owner` (`convert_tenant_to_business`,
  `supabase/migrations/20261002120000_business_record.sql`). Nothing in this
  spec changes that.
- **Being the source author grants nothing** on a Version. Strelva adopts on
  Mooney's intake because it is Mooney's admin member, not because it wrote
  the source. A partner agency with no assignment gets `VersionAccessError`.
- **A provider record grants nothing.** "Operated by Strelva" is shown, but
  access comes only from membership, delegation or assignment.
- **Nothing crosses businesses implicitly.** Data, bindings, people and
  grants never copy from source to Version or between Versions.
- **One business, one decision.** Bulk review never produces one approval
  for many businesses.
- **Same-business Versions are still separate Systems** with separate
  accounts, so Camillus's booking calendar never takes Fayetteville's bookings.
- **A Live Version changes only by release.** Overrides and adoptions land on
  the working definition; visitors see nothing until Make real.

### Owner approval when the owner never signs in

Releasing an improvement to a Live System needs the owner's yes unless the
owner's policy already covers it (Needs you policy, defined in the Needs you
spec). The ask reaches them by email. A tenant-keyed one-click approve link
exists today (`src/lib/approve-link.ts`, `src/app/api/approve/route.ts`: HMAC
token, GET renders a confirm page, POST resolves, idempotent). 1.0.0 needs a
workspace-keyed version of that link that binds `{workspaceId, possibilityId,
action}`. SMS is not needed for this area. If the owner does nothing for 14
days (number open), the Possibility stays unreleased and the Queue shows it.

## 5. Built on

### Reused (exists today)

- **Lineage engine:** `src/platform/system-versions/` (`service.ts`,
  `compare.ts`, `mapping.ts`, `store.ts`, `refs.ts`). In-memory only.
  42 tests pass locally across `system-versions-{lineage,twin-trees,overlap,mapping}`
  and `agency-home` (run 2026-10-06).
- **System spine:** `supabase/migrations/20261004120000_systems.sql`
  (`systems`, `system_revisions`, `system_outputs`, `system_connections`,
  `system_actor_scope`, `business_record_agency_work_ids`). Not applied in
  production.
- **Agency scope:** commit `7a1ed5a5` limits agency Systems access to exactly
  delegated (read) or assigned-with-accepted-delivery (read and write) work.
- **Agency home today:** `src/experience/workspace/agency-home.ts` and
  `AgencyHome.tsx`. `MAX_AGENCY_CLIENT_LOADS = 8`, one `GET /api/workspace`
  per client, clients found only through `workspace_delegations`.
- **Agency source/Version list:** `agencySystemLineage` in
  `src/experience/systems/from-workspace.ts`. It links by `sourceWorkId`.
- **Versions panel:** `VersionsPanel` in `src/experience/systems/SystemPage.tsx`.
  Twin Trees siblings are shown with "Shared changes are not linked between
  them yet" (`from-workspace.ts`).
- **Possibility and Make real:** `src/platform/possibilities/`,
  `src/platform/make-real/`, `POST /api/workspace/systems/make-real`.
- **Agency drafts:** `agency_managed_website_draft_{grants,revisions,preparations}`,
  `src/platform/offerings/agency-draft-access.ts`, `/agency-websites/[bindingId]`,
  `/agency-applications/[workId]`.
- **Grants underneath:** `workspace_delegations` (scope `work:read` only),
  `operational_assignments` (`assignee_kind` includes `agency` and `strelva`),
  `offering_provider_deliveries`, `workspace_handoffs`.
- **Flag:** `STRELVA_SYSTEMS_RELEASE` (`src/platform/systems-release.ts`)
  gates Versions and the agency source/Version list. Off by default.

### New

1. **Versions migration** (Postgres, additive, RLS on, all grants revoked,
   service-role RPCs that recheck the actor through `system_actor_scope`):
   - `system_version_sources (system_id, business_workspace_id)`: marks a
     System as a source. FK to `systems`.
   - `system_version_source_shares (source_system_id, grantee_workspace_id,
     shared_by, shared_at, revoked_at)`: replaces `sharedWith[]`.
   - `system_version_source_revisions (id, source_system_id, number, label,
     summary, definition jsonb, requires_binding_kinds text[], published_by,
     published_at)`: unique `(source_system_id, number)`, append-only by
     trigger. Kept separate from `system_revisions`, whose `implementation`
     only allows `{kind, ref, contentHash}`.
   - `system_versions (id, version_system_id unique, business_workspace_id,
     source_system_id, source_workspace_id, context_kind, context_label,
     baseline_revision_id, baseline_definition jsonb, local_data jsonb,
     current_release, row_revision, created_by, ...)`: FK
     `(version_system_id, business_workspace_id)` to `systems`. `row_revision`
     is compare-and-set, as in the in-memory store.
   - `system_version_overrides (version_id, path, value jsonb, set_by, set_at)`:
     unique `(version_id, path)`.
   - `system_version_bindings (version_id, kind, connection_ref, owner_workspace_id, ...)`:
     partial unique index on `connection_ref` where active, so one account
     binds one Version.
   - `system_version_releases (version_id, number, definition jsonb,
     baseline_revision, override_paths text[], system_revision_id, ...)`.
   - `system_version_decisions (version_id, source_revision, choice,
     resolutions jsonb, reason, by, at)`.
   - `system_version_grants (version_id, grantee_workspace_id, scope
     'lineage'|'lineage_and_data', granted_by, revoked_at)`.

   Timestamp: after the newest migration on the branch
   (`20261005120100_*`). The README's reserved slot `20261004122000` now
   sorts before three later files; using it risks out-of-order apply.
   Built as `20261007150000_system_versions.sql`. Differences from this
   list, found in the build: a `hidden` flag on `system_version_sources`
   (the same-business source); bindings name connections as
   `calendar:<id>` or `tenant:<stableId>`, the only refs the database can
   prove ownership of; adoption cannot forge a baseline (the stored
   definition is always the published revision's); history (releases,
   decisions, grants) only grows and is checked on every save.
2. **`createSupabaseVersionStore`** implementing the existing `VersionStore`
   port, passing the same contract tests as `createInMemoryVersionStore`.
   The port becomes async.
3. **Real ports:** `VersionActor` from `workspace_memberships` and agency
   grants (today a local shape); `ConnectionOwnership` from the workspace's
   connection rows (calendar connections, domain claims, Google tokens).
4. **Batched agency read:** one RPC, `agency_client_overview(actor)`, and one
   route, `GET /api/workspace/agency-clients?workspaceId=<agency>&cursor=`.
   It returns per-client summaries already filtered by scope. Replaces
   `loadAgencyClientSnapshots` and `MAX_AGENCY_CLIENT_LOADS`.
5. **Who Strelva serves:** `workspace_providers (customer_workspace_id,
   provider_workspace_id, status, started_at, ended_at)`. It records the
   provider relationship (ADR 0010 agency of record, provider switching).
   It grants nothing. The client list = provider rows the actor's agency
   holds, intersected with real access.
6. **Improvement Possibility adapter:** turns an adopted improvement into a
   Possibility on the Version's System with Make real = Version release.
7. **Workspace-keyed approve link** (see section 4).

### Retires

- `MAX_AGENCY_CLIENT_LOADS`, per-client fetch and the "Previous/Next
  clients" pager.
- `sourceWorkId` as Version lineage in `agencySystemLineage`. The transition
  map says `source_work_id` is work-to-work lineage and must not be reused for
  Versions; the current code does. Lineage reads `system_versions` instead.
- The synthetic sibling list for multi-website businesses in
  `from-workspace.ts`, once real Version rows exist.
- `STRELVA_AUTHOR_BUSINESS_ID = "strelva"` in `mapping.ts`, a string. It
  becomes Strelva's real agency workspace id.

### Tenant model vs workspace model

Versions exist only on the workspace model. Tenant rows, `/api/v1`, Redis
`reb:` keys and client repos are untouched. A Version of a tenant-backed
website is a `systems` row with `origin_kind = 'tenant'`.

## 6. Moving today's clients

No Version exists in production, and no live client has a workspace. So
there is nothing live to break. The order:

1. **Reborn sections 0–3 first.** A client gets Systems only after
   conversion and `tenant_workspace_links`.
2. **Strelva gets one agency workspace**, and each converted client gets a
   `workspace_providers` row naming it. The operator keeps `admin`
   membership from conversion. Nothing about owner authority changes.
3. **Twin Trees.** Conversion can already join a second tenant into an
   existing workspace (`targetWorkspaceId`). Before any Version is made,
   Strelva asks the owner: one business or two? One business: a source
   System "Twin Trees website" in that workspace, Camillus and Fayetteville
   as location Versions (`multiSiteAccountAsVersions`). Two businesses: two
   workspaces, each a Version of a source in Strelva's workspace.
4. **Custom-repo sites carry lineage, not compare.** Both Twin Trees sites
   are custom repos (`docs/product/roadmap.md`, Active delivery). Their
   "definition" is code, so the three-way compare has nothing to diff.
   At 1.0.0 their Versions record context, accounts and History, and an
   improvement is an operator-prepared Possibility (a change to that
   location's repo). Compare-driven improvements apply to Systems with a
   JSON definition: inquiry intake patterns, offering configuration,
   application drafts, v2 website documents.
5. **Strelva's existing offerings become sources.** `offeringDefinitionAsSource`
   and `offeringInstallationAsVersion` (`mapping.ts`) already project
   `private_staff_requests`, `customer_inquiry_intake` and
   `managed_website_changes` (all `1.0.0`) as sources and installations as
   Versions. The migration stores them; definitions keep their semver as
   `label`.
6. **Inquiry pattern installations** keep working where they are (inside
   inquiry workspace state). They are read through
   `patternInstallationAsVersion` until inquiries move to the spine.
7. Every step is a dry run on the scrubbed copy first, then per-client with
   Jacob's yes, like conversion.

## 7. Failure and undo

| Failure | What the person sees | Undo |
| --- | --- | --- |
| One client fails in the batched read | That client's name with "couldn't load, retry"; others render | n/a |
| Two people adopt on the same Version at once | Second gets "This changed. Reload it" (`VersionStaleError`) | Nothing written |
| Source revision republished with the same number | Refused | n/a, revisions are append-only |
| Adoption result differs from the preview | Refused, nothing changes | n/a |
| Improvement needs an account not connected | "Needs Google calendar connected first"; skipped in bulk | n/a |
| Binding an account another Version holds | "Already used by Camillus" | n/a |
| Release lands, read-back fails | "Published; check didn't confirm" kept separate, not retried | Restore previous release (History) |
| Owner email bounces or is never opened | Queue item "Owner hasn't seen this, 6 days" | Possibility stays unreleased |
| Bulk review: 5 prepared, 1 fails to prepare | Per-client list: 4 ready, 1 "couldn't prepare: reason" | Each prepared Possibility can be withdrawn |
| Owner revokes Strelva or switches provider | Strelva's rows disappear for that client; Versions stay the client's | Business keeps everything |
| Source author unshares a source | Existing Versions keep their definition and releases; no new improvements | Re-share |

Undoable: overrides (clear), unreleased adoptions (withdraw the
Possibility), releases (restore an earlier release from History), shares and
grants (revoke). Not undoable: a published source revision (supersede it
with N+1), a decline (the next revision re-offers it), an outside write
already accepted by a provider (per `AGENTS.md`).

## 8. Proof

1. `createSupabaseVersionStore` passes the same contract suite as the
   in-memory store, against local Supabase.
2. SQL tests: Version owned by the descendant; source author without grant is
   refused; partner agency without assignment is refused; delegated agency is
   read-only; one account binds one Version; revisions append-only; the
   batched read returns exactly what per-client reads would. Each fails
   against the pre-migration database.
3. Batched read: 50 seeded clients load in one request under 1 s locally;
   one failing client doesn't hide the rest.
4. Journeys, desktop and mobile, empty/loading/error/permission states:
   Twin Trees location change offered to the other location; bulk review across 7
   Versions (5 ready, 1 conflict, 1 missing account); owner approves from
   email without signing in.
5. Production proof on a Strelva-owned test business with two locations:
   create Versions, publish a source improvement, adopt, release, read back,
   restore the earlier release. Receipts for each.
6. Economics: operator minutes per client per month measured from the Queue
   (draft PR #205), before and after bulk review. No claim of savings until
   measured.

## 9. Open decisions

1. **How Strelva reaches clients.**
   - A: admin membership from conversion (today), plus a `workspace_providers`
     row for the list and the "Operated by" mark.
   - B: Strelva goes through the partner path (agency workspace, assignments
     and accepted deliveries per client).
   - **Recommend A for 1.0.0.** Strelva runs inquiries and contacts, which
     the agency path deliberately hides. B would mean expiring assignments to
     renew for every client and narrow access Strelva can't operate with.
     Cost: the partner boundary isn't exercised by Strelva's own use, so
     partner launch needs its own proof. Under B, sections 3.2 and 4 change.
2. **Twin Trees: one business or two.** Owner's answer, asked before
   conversion. Changes whether its Versions share a workspace.
3. **Same-business source.** A: a hidden source System both locations
   descend from (what `multiSiteAccountAsVersions` does). B: Camillus is the
   source, Fayetteville its Version. **Recommend A**: neither location is
   subordinate, and adding a third location is the same move.
4. **Agency Queue vs operator queue.** Reborn §5 wants one operator queue in
   `/admin`. **Recommend one queue, two views**: the agency Queue reads the
   same source, filtered to the actor's clients. Otherwise it's a seventh queue.
5. **Owner silence.** How long an improvement waits before the Queue
   escalates, and whether some improvement kinds (security fixes) can be
   covered by a standing owner policy. Needs the Needs you policy spec.
6. **Partner agencies out of 1.0.0** (working assumption). If they come in:
   ADR 0010 attribution, agency-of-record, and "agency told first" on
   provider switch need `workspace_providers` plus a ledger. The access
   rules above already hold for them.
7. **The word "Versions" on screen** follows decision 4 of the shared brief.
   The panel today says "Versions".

## 10. Unknowns

Facts:

- The lineage engine and agency scope exist and pass tests locally. Neither
  the systems spine nor any Versions table is in production.
- Twin Trees' two sites are custom repos; whether both are live is recorded
  as delivery work in the roadmap, not rechecked.
- AgencyHome finds clients only through `workspace_delegations`. Converted
  clients get admin membership, not delegations. So today Strelva's agency
  home would show none of its converted clients.

Inferences:

- Most cross-client improvements in 1.0.0 will be to inquiry intake and
  offering configuration, because those have JSON definitions. Website
  improvements stay operator work until sites move to v2 documents.
- Twin Trees is the only same-business Version case among current clients.

Found while building (Oct 6, local):

- **One calendar per provider per business.** `workspace_calendar_connections`
  is unique on `(workspace_id, provider)`. Two locations in one business
  (Twin Trees as one business) can each bind their own calendar only if one
  is Google and the other Outlook. Separate calendars per location need that
  constraint relaxed, or the two-workspace answer. This is a real limit on
  decision 2, not a Versions limit.
- **Strelva sees none of its converted clients until `workspace_providers`
  exists.** The batched read takes candidates from delegations, accepted
  agency assignments and `workspace_providers` (read only if the table is
  present; the response says `providersRead`). Admin membership alone is not
  treated as a client, so the provider stream's migration is what lists them.
- **A same-business source is a real System row with `hidden`.** The Systems
  view and the batched read leave it out; it still holds revisions.
- **The agency (partner) path is enforced in Postgres, not TypeScript.** The
  TypeScript `VersionActor` carries direct memberships only, so a partner
  agency with an assignment is refused by the service before Postgres would
  have allowed it. Partners are out of 1.0.0; widening this is a later change.

Unknown, and how to find out:

- Whether Strelva already has an agency workspace in production. Read-only
  query of `workspaces where kind = 'agency'` on the scrubbed copy.
- Whether Twin Trees is one legal business. Ask the owner, before conversion.
- How many of Strelva's improvements would be clean vs conflicted per client.
  Run the compare on the scrubbed copy once offering installations are stored.
- Whether owners act on emailed improvement approvals. Today 1 owner signed
  in over 30 days; tenant approve-link use is not measured here. Count
  approve-link POSTs on the tenant path before relying on it.
- Whether a Possibility can span a Version and a sibling in one Make real
  (one hours change for both locations at once). Not specified; one Possibility
  per Version until proven.
