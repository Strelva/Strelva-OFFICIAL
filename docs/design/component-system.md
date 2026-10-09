# Strelva foundations and component system

Implementation checkpoint: September 17, 2026. Ownership and extension structure
reviewed September 18. This does not establish deployment or final visual approval.

The [visual direction map](../../DESIGN.md#visual-direction-and-extension-map) owns
how identity, imagery, composition and component treatment fit together. This
file owns component contracts, extension and adoption, including gaps in source.

## Party billing, October 7, 2026 (local)

[AgencyBillingView](../../src/experience/workspace/billing/AgencyBillingView.tsx)
uses Card, links, semantic client lists and the owned Button, TextInput and
SelectInput through AgencyInvoiceControls. Null wholesale amounts render as
unpriced, separately from legacy retail amounts. Accepted retail proposals
retain their terms and owner acceptance; provider receipts distinguish payment
page creation from confirmed payment. WorkspacePayerTransition offers business,
agency and named signer proposals and renders acceptance from SQL's current
party authority. The default request remains fetch; the development-only
[billing preview](../../src/app/preview/strelva/billing/page.tsx) supplies isolated
fictional payer replies. Local browser proof covered 1280px and 390px, both
party acceptance controls, empty/loading/error/read-only states and overflow.
This does not prove production or live Stripe behavior. The
[stream contract](../product/streams/a1-payer-billing-completion.md) records the
remaining policy and provider proof.

## Agency Team management, October 7, 2026

[AgencyTeamView](../../src/experience/workspace/agency/AgencyTeamView.tsx) composes
the owned Button, TextInput and SelectInput, semantic lists, native details and
labelled checkboxes. Agency owners/admins manage invitation links, Member/Admin
roles, confirmed staff removal and individual/bulk client assignments. Owners
and the actor's own membership have no role/removal control. Members see the
same agency's assignments without management controls. A failed mutation locks
management until an explicit reload; a confirmed write with a failed refresh is
reported separately. Team reads active seats independently of the Clients page.
Workspace and Systems flags gate the API and tab. Local browser proof covers
1280px and 390px, keyboard focus, loading/error/empty/member states and fictional
management actions. Real SQL proof and limitations are in
[the #261 handoff](../product/streams/a1-agency-team.md); no production or actual
staff adoption is claimed.

## Creator package library, October 7, 2026

[PackageCatalog](../../src/experience/systems/PackageCatalog.tsx),
[SourcePackageControls](../../src/experience/workspace/agency/SourcePackageControls.tsx)
and [PackageInstallDelegation](../../src/experience/systems/PackageInstallDelegation.tsx)
compose owned Button, TextInput, SelectInput and TextArea with semantic declaration
lists and native details. Qualified listings show immutable creator and exact source
revision. Installation saves a private business draft with a stable retry command;
the existing Version owns business bindings and the separate Needs you release.
Owners can grant/revoke one exact, expiring installation to an already delegated
agency. Source managers run exact-revision checks and choose private/clients/listed;
review authority remains empty until a reviewer policy is configured.

Local 1280px and 390px browser proof covers catalog, declaration, denied controls,
loading/error/empty states, lost-response retry, source review/listing, and owner
grant/revoke. Native runtime/authority/upgrade assertions run in disposable SQL.
These receipts establish prepared implementation, not production rollout, approved
review policy, provider delivery or customer adoption.

## Start with tokens and atoms

### Systems mutation recovery, October 8, local

`SystemPage` validates Make real's live or isolated acknowledgment before showing
its result. Only an explicitly isolated result says live Systems are unchanged.
A lost, malformed or failed response locks further Make real actions and offers
Reload this System to read what landed. Concurrent alternatives remain disabled
while one request is pending. A live acknowledgment also offers that reload;
the page does not promise automatic progress refresh.

`SystemVersionManagement` removes stale draft controls while reloading after a
write or uncertain acknowledgment. `SystemVersionImprovements` lets the exact
Version's admitted manager prepare a native draft for review, while owner
authority remains necessary to approve publication. Conflict choices respect
the same read-only and pending state. These controls use the owned Button and
field components. Focused local jsdom tests cover acknowledgment uncertainty,
overlap, stale authority and admin preparation; rendered and actual Auth proof
remain separate release checks.

### Ordinary website fact revision, October 9, local

`RebuildExperience` also exposes supported facts, including facts already
confirmed by the owner, in the collapsed **Edit website facts** section. Flagged
and sensitive decisions remain in their existing review panel. Each fact uses
the owned Button and TextArea with the existing exact candidate edit endpoint;
the server rechecks current management authority. Saving changes the private
document and clears its approval, with the changed rendered hash required before
reapproval. Read-only, loading, rebuilding and pending states disable edits.
Errors retain the correction and return focus to its field; save and cancel
return focus to the mounted Edit fact control. Managed context does not grant
editing or publication authority. Focused component proof belongs to
`website-fact-revision.test.tsx`; actual Auth and desktop/mobile native proof are
separate release checks.

### Supplied website contact destinations, October 9, local

No-site description intake keeps the immutable original input and separately
records positively offered safe email and phone details as owner-stated facts.
Email needs email/contact/reach/write language; phones need call/phone/tel or
direct reach/contact context, including international + numbers. Negated,
retired, date-shaped, identifier-shaped and unlabelled numbers are not routes.
The existing catalog Cta renders Email us and Call us on Home and Contact with
exact fact references and validated mailto/tel destinations. Phone hrefs omit
display separators; equivalent offered formats share one destination fact.

A contact correction projects the same-kind safe destination and its exact
positively offered spans in originating current description claims and copy.
Ordered claim context survives chunk boundaries; contact tokens remain whole.
Historical/negated mentions, unrelated facts, input/provenance and published
versions remain intact. Recomposition uses corrected current claims. Editing
or removing an ordinary claim that would change a currently bound contact
returns a conflict directing the owner to edit the separate contact fact first;
unrelated prose that preserves the exact offered contacts remains editable.
The existing actor/manage, revision/hash, CAS and approval invalidation apply.

Review, private-preview no-submit, hosted native inquiry capture and published
connection gates remain separate. An email link opens the visitor's email
client; it does not configure form delivery. Focused extraction/composition and
static/native render serialization proof belongs to
`website-description-contact.test.ts`; correction and recomposition proof to
`rebuild-service.test.ts`. Actual browser/native contact use remains a separate
release check.

### Website owner consent for agency publication, October 7, local

`RebuildExperience` uses the owned Button and a labelled native checkbox for
explicit owner consent. The unchecked choice names the current serving agency
and this website; each new preview still needs exact owner approval, and domain
authority stays separate. Only a direct customer owner with a current provider
and active seat receives this consent control. An already approved preview can
be approved again with consent. Stored permission is shown separately from
candidate approval. A failed request retains the checkbox and its error without
claiming permission was saved. The checkbox's submitted agency ID prevents a
provider change during review from authorizing a different agency. Focused local
UI tests cover default, opt-in, already-approved, failure and read-only states;
rendered browser proof belongs in the agency workflow handoff.

September 17 clarification: Jacob wants to inspect the tokens and agreed atoms
and build from them before returning to page composition. The atmospheric-card
gallery is one composed example, not the complete foundation or a selected page
layout. The current landing exploration has no mock imagery; that constraint
belongs to that assignment, not every Strelva surface.

This document is the entry point for the foundation. It indexes the existing
color, material and motion contracts rather than replacing their definitions.
Implementation records describe what exists; they do not establish visual
acceptance. Keep these distinctions when making changes:

- **Recorded direction:** a user decision or the global design standard.
- **Implemented:** present in source; adoption and proof can still be incomplete.
- **Open:** a choice not settled or a documented implementation gap.

### Foundation inventory

| Foundation | Recorded direction | Implementation and remaining gap |
| --- | --- | --- |
| Grid and spacing | 8px primary grid, 4px subgrid. Global spacing scale: 0, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 120, 128px. | Values are used in primitives and local CSS. There is no unified Strelva spacing-token API consumed across both repositories. A multiple of 8 alone does not establish a shared token. |
| Geometry | Substantial surface 24px padding / 24px radius; controls 12px radius; utility surfaces 8px. Compact surfaces may use 16px padding. | [Primitive geometry](../../src/components/ui/primitives.module.css) implements button, card and toggle sizes. Atmospheric cards enforce 24/24 independently. These rules do not imply every region needs a card. |
| Color | Semantic surface, text, action and status roles; pair each fill with its foreground. | [Color system](./color-system.md) owns scopes and source links. Light foundation, dark dashboard, workspace and card palettes are different contracts. Marketing and client palettes remain separately owned. |
| Typography | Legible UI type; expressive display moments; shared hierarchy. Characterful ivory lettering is a selected reference, not a licensed typeface selection. | REB now binds Geist Sans once as `--font-body` and aliases `--font-display` to it in [layout.tsx](../../src/app/layout.tsx) and `globals.css`. Marketing remains separately owned and is not changed by this slice. Custom logo lettering remains separate. |
| Type sizes | Global starting roles: metadata 12/16, compact 14/20, body 16/24, introduction 20/28, component 24/32, section 32/40, page 40/48, display 64/72. At most three sizes and weights per authored component. | These are font-size/line-height standards, not a complete implemented token API. Older dashboard CSS comments describe a denser hierarchy. Do not silently treat those comments or a generated image as a new global decision. Expressive type may exceed the scale through a deliberate role. |
| Icons | One family and consistent stroke; 16px small, 20px default, 24px prominent. | Shared examples use Lucide. `IconButton` requires an accessible label. Icon-only affordances still need usable hit areas. |
| Focus and targets | Visible 2px outline, 2px offset; 44px touch target preferred. | Shared controls implement focus geometry and coarse-pointer target expansion. This does not certify older fields, tabs or every consumer. |
| Motion | Gooey disclosure, restrained overshoot, sharp text, interruptible state changes, reduced-motion alternative. Data surfaces add reveal, draw and count. | [Motion contract](./motion.md), [CSS roles](../../src/app/styles/motion.css), [React presets](../../src/platform/infra/motion.ts), `GooeyDisclosure`, and the entrance primitives (`Entrance`, `Reveal`, `CountUp`) own this. Do not substitute page-specific timing recipes. |
| Materials | Real bounded material beneath a continuous frosted surface; sharp content and fine highlights. | [Atmospheric contract](./atmospheric-component-contract.md) owns construction. `AtmosphericCard` provides six compositions. The newest ink/mineral study and smoked/clear/matte comparisons are not all product APIs or final selected materials. |
| Identity | Original cairn; preserve the established identity. | [StrelvaLockup](../../src/components/brand/StrelvaLockup.tsx) and the letter-morph implementation exist. Custom seven-letter artwork is not a font for headings. App-wide adoption remains incomplete. |

The [global design standard](/Users/jacobrhinehart/.codex/DESIGN.md) owns the
starting measurement and accessibility rules. The source files linked here own
runtime values. This inventory does not create another token file.

### Atoms to inspect before composing a page

| Atom | Actual implementation | Status and use |
| --- | --- | --- |
| Button | [Button.tsx](../../src/components/ui/Button.tsx) | Shared primary, secondary, ghost, danger and contrast variants; sm/md/lg; loading, disabled, focus, press feedback and static option. Sage is primary; contrast is an exceptional emphasis, not another default primary. |
| IconButton | [Button.tsx](../../src/components/ui/Button.tsx) | Required `label`; sm/md/lg; default/ghost/danger; loading and disabled. |
| Toggle | [Toggle.tsx](../../src/components/ui/Toggle.tsx) | Controlled switch, accessible label, on/off, disabled, sm/md, 44px minimum target. |
| Surface | [Card.tsx](../../src/components/ui/Card.tsx) | Solid by default; padding none/sm/md/lg. Interactive styling alone does not supply link or button semantics. |
| Field family | [TextInput.tsx](../../src/components/ui/TextInput.tsx) | TextInput, TextArea, SelectInput and FieldLabel now use 12px corners, compact 14px/20px type (16px on narrow inputs), 12px/16px labels and named color/focus roles. Helper/error content receives generated IDs, merges caller descriptions, and exposes `aria-invalid`; disabled/read-only native behavior is preserved. Consumer journeys remain only partly verified. |
| Tabs | [Tabs.tsx](../../src/components/ui/Tabs.tsx) | Underline/pill/segment variants now share 14px/20px control type, a 40px minimum, roving tab stops, orientation-aware arrows, Home/End, disabled skipping, explicit automatic/manual activation, and optional tab/panel IDs. `TabsPanel` hides inactive content and removes it from the tab order. Existing consumers without local panels retain the API and need follow-up journey review. |

AtmosphericCard and its content slots compose these foundations. GooeyDisclosure
provides reusable disclosure behavior. Neither should replace the review of
basic text, fields, buttons, selection, focus and state.

### Inspect the existing rendered references

With the local preview flag enabled:

- [Color roles and controls](http://127.0.0.1:3299/preview/strelva/colors): light/dark surfaces, paired actions, supporting text, statuses, popover and tooltip examples.
- [Component gallery](http://127.0.0.1:3299/preview/strelva/components): materials, logo, disclosure and control states.

Port 3299 is the current local server, not a deployment contract. Source for the
[color reference](../../src/app/preview/strelva/colors/ColorReference.tsx) and
[component reference](../../src/app/preview/strelva/components/ComponentReference.tsx)
is authoritative for what each page demonstrates. The component reference now
uses the shared field family, tabs and panel companion; the color page keeps its
role and contrast probes. Neither page is yet a complete specimen of spacing,
typography, every atom, or every state.

### Build from the foundation

1. Identify the surface scope and use its existing semantic roles. Inspect the
   actual atom and states in source and browser before composing a new surface.
2. Reuse the owned component. Where it lacks the required contract, repair or
   extend that component instead of introducing a lookalike in page CSS.
3. Keep page CSS responsible for composition. Do not override an atom's fill,
   foreground, focus, radius or motion to repair a local cascade conflict.
4. If a new shared role is needed, add it at its owning boundary and document its
   purpose and consumers. Do not call local values a shared system.
5. Verify both behavior and visual fidelity. A passing build, contrast sample,
   screenshot or interaction suite alone does not establish design acceptance.

### Cross-repository boundary and open work

Marketing has its own shadcn configuration, Button, fields, tabs and `.glass`
material. REB has the atoms and atmospheric implementation documented here.
There is no shared package establishing automatic parity. In particular,
marketing's backdrop-blur class is not the `AtmosphericCard` material renderer.
Do not describe the two as equivalent because both use sage, 24px corners or blur.
See the [marketing component audit](../../../strelva-marketing/docs/design/component-system-audit-2026-09-17.md).

Before claiming a unified foundation, reconcile field/tab behavior, typography
roles, spacing-token ownership, material reuse and cross-repository delivery.
The mechanism for sharing code is not selected by this document. Marketing and
client palette ownership must remain explicit during that work.

Geist Sans, custom logo lettering, prominent gloss and independently finished light/dark
components are selected. Exact rendered material recipes and any future placement
of logo morph still need review. No generated page silently resolves them.

### Adoption work and completion evidence

This is the current migration record; update these rows rather than creating a
second component-system plan. A row is complete only when the named consumers use
the owning implementation and the affected rendered behavior has been checked.

| Work | Owner and current state | Evidence needed to close |
| --- | --- | --- |
| Shared spacing and type roles | Product globals/primitive styles and marketing globals. The documented scale is not a unified runtime API. | Named roles consumed by the migrated atoms; inspect computed sizes, wrapping and enlarged text. Remove conflicting local recipes in those consumers. |
| Field family | REB TextInput.tsx. Shared geometry and generated helper/error associations are implemented; the component reference exercises helper, invalid, read-only and disabled states. | Verify label/error associations, focus, disabled/read-only, long content and touch use after adoption; named browser coverage now exists for the local specimen, while broad consumer review remains open. |
| Offering connected-work action | WorkspaceOfferings uses the owned Button with secondary treatment, a named Open action, and the existing native work router. | September 19 journey evidence is recorded in the horizontal acceptance ledger. This adoption covers the connected-work action, not the directory's remaining legacy controls. |
| Workspace places and pinned Systems | [StrelvaSidebar](../../src/experience/app-frame/StrelvaSidebar.tsx) shows three places (Home, Requests, Running; the Customers page was retired October 6 and `view=customers` opens Home), a "Systems" list (up to eight Systems by name, websites first, each with its kind icon and `aria-current` on the open one) ending in "All systems and files", Recent (files only), and a "Business menu" with Business details, People & access and Help. [workspace-places](../../src/experience/app-frame/workspace-places.ts) owns which place a view belongs to, its title and link, `pinnedSystems`, and `view=system`; old `work`, `apps`, `products`, `delivery` and `operations` links still resolve, and the apps place is titled from `SYSTEMS_LABEL` so the on-screen word is one edit. [WorkspaceRequests](../../src/experience/workspace/WorkspaceRequests.tsx) lists service requests and finite jobs by stage. October 4: [BusinessHome](../../src/experience/workspace/BusinessHome.tsx) leads a business with its name, Needs you, then its Systems (see the Systems row), then the ask composer, Strelva handled, In progress, and Files and results (saved work that is not a System). A personal workspace keeps the composer-first layout. October 5: all of this is behind `STRELVA_SYSTEMS_RELEASE` (`systemsReleased` on StrelvaShell, StrelvaSidebar, BusinessHome, BusinessOfferingSummary and `sectionTitle`, read from the server snapshot's `releases.systems`). Off (the default) renders the pre-Systems labels and Home: "Website and apps" pinned by name, "All apps and files", the composer-first Home with Recent, and "offerings" wording on Home. | October 4, 2026 (local preview, port 3107): `workspace-places.test.ts`, `business-home.test.tsx`, `app-frame-contract.test.ts`, `systems-experience.test.tsx`; preview Playwright `workspace-ui-preview`, `illustrated-home`, `personal-ai-access-ui`, `self-service-library`, `workspace-release` and `systems-experience-ui` passing locally. Authenticated-local specs had strings updated but were not run. |
| Systems experience | [SystemList](../../src/experience/systems/SystemList.tsx) renders a business's Systems as linked cards: kind, name, detail, `LifecyclePill` (Draft/Live/Paused) and a separate `HealthSignal` (Working/Something is off/Not working/Unknown from `src/platform/system-health`; no fresh evidence is Unknown; text always carries the meaning). [SystemPage](../../src/experience/systems/SystemPage.tsx) gives the actual thing most of the page (live website iframe with Current/Possibility/Side by side compare, the inquiry experience, the booking calendar, the internal tool) and puts Connections (incoming ones labeled from the target, e.g. "Shows"), Possibilities and Versions in a 320px contextual column that stacks below 1280px. Make real posts to `/api/workspace/systems/make-real` (owners only) and renders the isolated run's partial state: headline, done, waiting, not started and not connected, with copy that outside effects aren't connected. Non-owners see a disabled button with the reason. System management and Ask for a change require owner/admin access; runtime use is separate, so ordinary members can submit to a released app and reserve workspace time without editor, sharing, or external calendar management controls. Shared read-only and stopped workspaces keep runtime changes disabled. Work-backed websites use the saved v1/v2 discriminator and carry the rebuild release, managed-service, and agency context from the workspace. [model.ts](../../src/experience/systems/model.ts) is a thin view over spine types and [from-workspace.ts](../../src/experience/systems/from-workspace.ts) reads the server projection `snapshot.systems` built by [server.ts](../../src/experience/systems/server.ts). Styles live in [systems.module.css](../../src/experience/systems/systems.module.css); link-shaped actions use `.linkAction` instead of nesting a Button in a link. October 6 (branch `w2/systems-live`, local preview only): SystemPage draws only blocks with content, in order Making it live (one line per step in the customer's words), Possibilities (with why a stale one went back to Exploring), Connections (working ones fold into a `<details>` "Works with N things"), Versions, History; with none, the surface takes the full width (`.body[data-context="none"]`) and one line asks what else it could become. Paused adds what keeps working (`PAUSED_KEEPS`). A live Make real answer renders its headline. October 6 (branch `w3/journeys`, local preview only): the website and Possibility iframes are `tabIndex={-1}`, so Tab goes from Visit site to Compare, Open and Make real instead of walking every link of the embedded site with no visible focus; Visit site stays the keyboard way into the site. [PossibilityTry](../../src/experience/systems/PossibilityTry.tsx) is the signed Try it page (`/try/<token>`; fixture `/preview/strelva/try?state=ready|changed|expired`); its test form never sends. Checked at 1440 and 390px with `makeReal=partly` on `scenario=mooney`, the bare Mediation intake page, and the Try it states; no horizontal overflow, no page errors. [AgencyHome](../../src/experience/workspace/AgencyHome.tsx) reads every client in one batched call (`loadAgencyClients`, server cursor, "Show more clients" only when `nextCursor` is set; no per-client fetch or 8-client pager) and, with the Systems release on, splits into Clients, Queue, Library and Team views through `Tabs`/`TabsPanel` ([agency/AgencyViews.tsx](../../src/experience/workspace/agency/AgencyViews.tsx), [agency/AgencyLibraryView.tsx](../../src/experience/workspace/agency/AgencyLibraryView.tsx)). A client that failed to load is named with a Retry that refetches its page; Library shows per-Version status, conflicts side by side (read only) and Review all for ready Versions only. October 6, 2026, local preview only: `/preview/strelva?scenario=agency-systems&systems=on&agency=full|many|loading|empty|error|delegated|library-empty|library-error` (fictional fixture in `preview/agency-fixture.ts`), checked at 1440 and 390px. | October 5, 2026, local preview only: scenarios `mooney`, `mooney-empty`, `mooney-loading`, `mooney-shared`, `mooney-member`, `mooney-error`, `agency-systems`, `twin-trees`, projected on the server by the same code as the route; screenshots at 1440 and 390px in `output/systems-experience-2026-10-05/`. Embedded experiences keep their own headings and legacy labels (for example "Reservations"). Monitor evidence in the preview is fixture data. No production or authenticated proof. October 5 integration regression coverage: `systems-runtime.test.tsx` exercises a standalone v2 website and member app/schedule commands against local native services; desktop-to-phone main geometry is asserted by `systems-experience-ui.spec.ts` (browser rerun pending). October 5: the whole row is behind `STRELVA_SYSTEMS_RELEASE`; `/api/workspace` builds no projection when it is off, the Make real route answers 503, `view=system` opens Home, and AgencyHome drops the Clients/Queue/Library/Team views and its Possibility copy. Preview: `systems=on` or `systems=off`. A one-off local render comparison found the flag-off BusinessHome (9 states) and AgencyHome (2 states) identical to the pre-Systems components apart from React `useId` values. |
| Operator human-minute coverage | [BusinessEffortPortfolio / BusinessEffortForSite](../../src/app/admin/work/BusinessEffort.tsx) compose console `Panel`, `Vital`, `Chip` and the shared field/Button family. Every customer business appears; missing monthly logs read "Not logged". Explicit zero logs count, and portfolio median/average show the all-business denominator and require complete log coverage. Mobile business names get their own line so unknown periods stay readable. | October 7, 2026, #505 local fixture: `/preview/strelva/business-effort?scenario=complete` (also default incomplete, empty, unavailable, denied, disabled). Desktop/mobile checks at 1280/390, 320px reflow and 360/768/1600 width checks; zero input, keyboard focus and release-off rejection preserving input observed. UI/service/stat/action tests: 61 passed. SQL persistence checked in isolated Postgres. No authenticated browser save or production proof. |
| Who decides (Needs you policy) | [DecisionPolicySettings](../../src/experience/workspace/DecisionPolicySettings.tsx) is a section of Business details, shown only with `STRELVA_NEEDS_YOU_RELEASE` on and never to agencies. Per kind of change it composes the shared `SelectInput` (aria-labelled, no visible duplicate label) offering Strelva's default and anything stricter, plus ghost `Button`s for Back to default and one-tap Undo; kinds with nothing stricter, and every kind for members/admins, read as plain text. Fixed kinds are listed under Always yours. The operator screen [/admin/needs-you](../../src/app/admin/needs-you/PolicyView.tsx) and the queue's [Owner not told](../../src/app/admin/queue/OwnerNotToldPanel.tsx) panel use the console `Panel`/`Chip` primitives; operators read "Owner decides" where owners read "You decide". | October 6, 2026, local preview only: `/preview/strelva?scenario=mooney (also mooney-empty, mooney-member, mooney-error) with &needsYou=on&view=settings` and `/preview/strelva/who-decides?state=` ready, empty, error, denied and off, checked at 1440 and 390px (no horizontal scroll). Flag off: the section is absent. Loading is covered by `needs-you-policy-settings-ui.test.tsx`. No authenticated or production proof. |
| Linen workspace, ink rail, dusk Home (Strelva 1.0, phase 1) | October 6, 2026. [StrelvaShell](../../src/experience/app-frame/StrelvaShell.tsx) takes `theme` (`linen`, the default; the tenant [ConversationShell](../../src/components/dashboard/ConversationShell.tsx) passes `dashboard` and keeps the dark foundation) and sets `data-workspace-theme="linen"`, which remaps the shared tokens onto linen and switches the shell to DM Sans (`--font-workspace`, loaded in the root layout with `next/font`). [StrelvaSidebar](../../src/experience/app-frame/StrelvaSidebar.tsx) renders as the ink rail from the `navigation-*` roles and takes `needsYou` (`{ count }`): with `STRELVA_NEEDS_YOU_RELEASE` on, a Needs you place follows Home with a clay count badge (`view=needs-you`, opened as Home when the release is off). [BusinessHome](../../src/experience/workspace/BusinessHome.tsx) leads with a dusk band (time-of-day greeting from the client clock only, the business name, the glass [WorkspaceComposer](../../src/experience/workspace/WorkspaceComposer.tsx) `tone="glass"`, and live chips drawn only from the site summary and Systems), then two sides: the ink-moss "Strelva is working" panel (the running Make real with its progress and steps, or the first in-progress request, then Strelva handled) and the linen "Your side" ([NeedsYouSection](../../src/experience/workspace/NeedsYouSection.tsx) `variant="rows"`, the who-decides line and the site's week as light numerals from [SiteSummarySection](../../src/experience/workspace/SiteSummarySection.tsx)). Systems, files, unassigned websites and usage follow below. `view="needs-you"` renders the deck (`variant="deck"`): one card per decision, shaped by [needs-you-presentation](../../src/experience/workspace/needs-you-presentation.ts) from the decision's own kind and words (price, go-live, quoted message, plain) with a named primary action, Not yet and Open. Buttons are pills inside the linen scope. Entry reveals are local to Home (opacity and an 8px rise, 280ms, 40ms stagger, none under reduced motion). | October 6, 2026, local preview only (port 3417): `/preview/strelva?scenario=mooney&needsYou=on&systems=on` (with `makeReal=partly`), `mooney-empty`, `mooney-loading`, `mooney-error`, `mooney-member`, `read-only`, `managed`, the Needs you place, Requests, Business details, Ask, a website System and the inquiries System at 1440×900, Home at 390×844. Screenshots in `../.scratch/1.0/integrated/`. `needs-you-home.test.tsx`, `business-home.test.tsx`, `owner-entry-homes-ui.test.tsx`, `workspace-places.test.ts`, `color-system.test.ts`. No authenticated or production proof; the tenant dashboard was not re-rendered. |
| Workspace shell stop state | [StrelvaShell](../../src/experience/app-frame/StrelvaShell.tsx) and [StrelvaSidebar](../../src/experience/app-frame/StrelvaSidebar.tsx) expose the optional `startDisabled` API. [WorkspaceLayout](../../src/experience/workspace/WorkspaceLayout.tsx) uses it for an exited or unconfirmed workspace while keeping saved work and export links available. | September 20, 2026: `workspace-exit-ui.test.tsx` verifies the stopped banner, disabled New control, retained-work link and export link. The authenticated desktop/mobile reopening journey remains the product proof for this consumer. |
| Workspace shell narrow geometry | [AppFrame styles](../../src/experience/app-frame/app-frame.module.css) release the navigation rail's width immediately below 1024px; desktop collapse retains its animation. The main occupies the narrow viewport, and its nested scrollers must not hide horizontal content. | October 7, 2026: the preserved owner receipt image exposed a transient left gutter during desktop-to-mobile resize. [Agency workflow browser proof](../../tests/agency-workflow-authenticated-local.spec.ts) polls main bounds and nested overflow, and scrolls the published receipt into the viewport before capture. The real Auth/Postgres journey passed after integration (21.4s); owner layout at 390px and visible receipts at 1440px/390px were inspected. Original failure and corrected screenshots remain separately in `.scratch/agency-workflow-proof/2026-10-07/` and its `final/` folder. This is local proof; fictional link delivery and publish verification fixtures do not prove email transport or production publication. |
| Managed website editor fields and recovery | [ContentWorkspace](../../src/components/dashboard/ContentWorkspace.tsx) composes [SitePreview](../../src/components/dashboard/SitePreview.tsx), [PropertiesEditor](../../src/components/dashboard/PropertiesEditor.tsx), [VersionHistory](../../src/components/dashboard/VersionHistory.tsx), [PublishBar](../../src/components/dashboard/design/PublishBar.tsx), and the shared [field family](../../src/components/ui/TextInput.tsx). History recovery uses the draft boundary; mobile editing uses the same preview, fields and publish controls in a stacked layout. | September 20, 2026: `content-versioning.test.ts` and `site-editor-publish.test.ts` pass 23/23; `owner-journey-copy.test.ts`, `website-history.test.ts`, and `website-history-page.test.tsx` pass 19/19; isolated `workspace-ui-preview.spec.ts` passes desktop history recovery, 390px draft editing and 390px permission recovery 3/3 on port 3249. The focused browser check verified keyboard focus on the mobile field, the PublishBar and Save changes button within the 390px viewport, and a disabled publish control after a denied draft save. Screenshots: `/tmp/strelva-website-history-desktop.png`, `/tmp/strelva-website-editor-mobile.png`, `/tmp/strelva-website-editor-mobile-permission.png`. The browser fixture has no authenticated provider or live publish, and the preview iframe emitted a synthetic image warning; physical-device, screen-reader and production verification remain open. |
| Ask Strelva and the workspace website | [AskStrelva](../../src/experience/ask/AskStrelva.tsx) is the workspace chat (`view=ask`, and `compact` beside the editor): streamed reply, one receipt line per result item (drafted and not live, Possibility opened, Request filed), earlier conversations in an 8/4 split, pill composer; read-only, error, unsaved and release-off states. [WorkspaceSiteFrame](../../src/experience/websites/WorkspaceSiteFrame.tsx) hosts a managed website's own pages at `/workspace/site` and reuses the dashboard panels unchanged: `DashboardProvider` takes `resolveHref` so their `/dashboard/...` links stay in the workspace and `/api/...` calls reach the tenant through `/client/<tenant>`; `ContentWorkspace` takes `assistant` to put Ask Strelva in its right panel. [WebsiteChangeRequests](../../src/experience/websites/WebsiteChangeRequests.tsx) is Ask for a change on a repo-only site with preview, owner decision and deploy receipts. | October 6, 2026 (`w2/owner-surfaces-b`, local): rendered at 1440×900 and 390×844 through `/preview/strelva?…&ask=on|error|forbidden` and `/preview/strelva/workspace-site` fixtures: empty, streaming draft and request turns, error, shared read-only, member read-only, permission, filed-request success and request-read error. Tenant-backed tabs (photos, look, collections, history, connections, Google) were not exercised against a live tenant. |
| Signed website review | `/api/owner-website-preview` renders the exact native candidate for one signed Needs you decision. Its review banner shows complete copy as readable paragraphs, then the website with internal page navigation. Visitor buttons and fields are disabled; external actions have no destination. No account is created. | October 7, 2026 (`w6/owner-ask`, local only): fictional `/preview/strelva/owner-website-preview` inspected at 1280×800 and 390×844. Long copy wraps without horizontal overflow. SQL and route tests cover recipient/revision mismatch, expiry, disabled flags, no GET writes, token-preserving navigation and no-referrer protection. |
| Working website Try | [SiteDocumentTry](../../src/products/websites/SiteDocumentTry.tsx) uses the native website catalog inside the signed [PossibilityTry](../../src/experience/systems/PossibilityTry.tsx) page. Informational candidates support isolated page navigation. Ask and System Open link to the exact signed Try revision, while the comparison iframe keeps its native review preview. Existing-site booking candidates open their new page with the shared `StrelvaBookingForm`, configured test slots, local callbacks and explicit test-only wording; visitor details are cleared after the test. Outside links are held. Make real still needs owner review and current Connections. Unsupported flows remain Requests. | October 7, 2026 (`w6/owner-ask`, local only): fixtures `/preview/strelva/try?state=pages` and `state=booking`; automated navigation, interactive booking, no-network/no-storage, immutable signed revision and failure-path checks. Native collaborative browser inspected both at 1280px and 390px, including a completed fictional booking. `w6-owner-ask-ui.spec.ts` passes 14 checks with keyboard navigation, no horizontal overflow and no booking write requests. This is fixture proof; authenticated service publication remains unproven. |
| Self-service website brief and artifact review | [WebsiteExperience](../../src/experience/websites/WebsiteExperience.tsx) and its [visitor form selector](../../src/experience/websites/WebsiteConnections.tsx) use the shared [field family](../../src/components/ui/TextInput.tsx) and [Button](../../src/components/ui/Button.tsx). The product-owned `WebsiteRecord` and `WebsiteArtifact` remain the lifecycle and preview authority; the customer component renders `candidate.preview.href` in an iframe and carries the candidate hash through approval and launch preparation. | September 20, 2026: `website-experience.test.tsx` passes 9/9 and `website-connections.test.tsx` passes 4/4. Coverage includes explicit source selection, connection failure/retry, empty/read-only states, response ownership, and saved-artifact reopen, exact candidate hash/revision actions, conflict-preserved brief, artifact failure recovery, permission state, late-response ownership and `/api/websites/{workId}` transport paths. Local authenticated desktop/mobile artifact proof is recorded separately; no provider launch or production publication is implied. |
| URL rebuild, factual review and hosted website operation | [RebuildExperience](../../src/experience/websites/RebuildExperience.tsx) composes existing [Button](../../src/components/ui/Button.tsx) and [fields](../../src/components/ui/TextInput.tsx), with product schema validation in [rebuild transport](../../src/experience/websites/rebuild-transport.ts). It provides URL/description intake, persisted progress, source-backed fact decisions, a sandboxed hash-checked private iframe, exact candidate approval, launch verification, domain records, measured HTML before/after comparisons, document-revision restore and exact-revision export. The existing visitor-form selector is shared with v1. [Operator entry](../../src/experience/websites/OperatorRebuildEntry.tsx) preserves workspace/work selection in the URL. [Monthly report](../../src/experience/websites/WebsiteRebuildReport.tsx) shows recorded counts or explicit unavailable measurements, and separates saved assistant citation results from website readiness checks; [agency sharing](../../src/experience/websites/WebsiteRebuildSharing.tsx) prepares recipient-bound links without sending messages. Business owners may choose native visitor forms and publish their exact approved native preview from the current website entry or System; the server still checks current owner/mandate authority. This publication affordance is separate from operator-only domain and restore controls. Managed customers review results; authorized makers prepare changes and domain work remains separately gated. | October 1, 2026: `website-rebuild-experience.test.tsx` and the existing v1 experience/connection tests pass 20/20; `pnpm typecheck` passes locally. Native collaborative browser inspected desktop 1280px and mobile 390px, including confirm/edit/approve, read-only and failed mutation preservation. After the native browser host disconnected, local headless Chromium checked 320px reflow (document scroll width 320px), remove/approve/publish, read-back-failure copy and loading. Publication and pending/verified/error domain fixtures also cover exact long synthetic DNS records and unavailable monthly measurements at 1280, 390 and 320px; provider error messages remain visible. These are synthetic interface fixtures, not authenticated provider or production proof. The rebuild release flag preserves v1 creation when disabled. No dependency installed; the 21st CLI is unavailable in this environment. |
| Scoped agency website document drafts | [AgencyWebsiteDocumentDraftExperience](../../src/experience/agency-website/AgencyWebsiteDocumentDraftExperience.tsx) is reached from the existing agency client-work website link. It discovers a version 2 candidate through the managed binding, edits only accepted native sections with shared fields and buttons, sends controlled props/order patches with exact candidate identity, and saves for customer review. Private multi-page previews use the current scoped grant on every request. Navigation/footer preparation stays with the customer or Strelva. The original [legacy editor](../../src/experience/agency-website/AgencyManagedWebsiteDraftExperience.tsx) remains the default when rollout is off or the binding has no version 2 document. | October 1, 2026: agency document and legacy UI tests pass 24/24; typecheck and product boundaries pass locally. Headless Chromium inspected 24 active/loading/expired/revoked/no-permission/error/stale/private-preview-denial states at 1280, 390 and 320px, plus saved section ordering and a detail-page edit. Unsaved changes survive preview page navigation and stale saves; permission failures remove save controls. Followed sign-in redirects, non-JSON responses and incomplete successful envelopes require a fresh permission read while retaining unsaved proposals; the disabled discovery envelope still preserves the legacy editor. The actual no-session private-preview request returns an auth redirect with SAMEORIGIN/private CSP and exposes recovery, not document data. Local interface/HTTP proof is in `output/website-rebuild-spike-2026-10-01/ui-proof/agency-evidence.json`; it does not claim an authenticated client save or production publication. |
| Generated client visitor forms | The starter [renderer](../../custom-repo-starter/website-generation/renderer.ts) and exported [runtime](../../custom-repo-starter/website-generation/renderer.mjs) own capability form layout and styling using the generated site's existing theme variables. This is a client-site renderer, not a replacement for REB field components. | September 20, 2026: the native booking Auth journey exports and builds the selected project, submits inquiries and confirms bookings on desktop, then changes and cancels at 390px. Rendered controls use full-width fields, visible focus and 44px minimum targets. Exact local captures and provider-fixture limits are in the horizontal acceptance ledger. |
| Booking customer and owner controls | [ManageBooking](../../src/experience/bookings/ManageBooking.tsx) owns the signed manage page and held confirmation, request, paused, unavailable and recovery states. [InquiryBookingOffer](../../src/experience/bookings/InquiryBookingOffer.tsx) never preselects a time or labels a request confirmed. Owner [BookingActions](../../src/experience/bookings/BookingActions.tsx) and [BookingHoursEditor](../../src/experience/bookings/BookingHoursEditor.tsx) retain the shared Button API and desktop compact sizing; buttons gain a 44px minimum height below 640px, in addition to the primitive's coarse-pointer sizing. [WorkspaceBookings](../../src/experience/bookings/WorkspaceBookings.tsx) adds gated authority/status/history, calendar health and record-hours evidence. [ProposeBookingTimes](../../src/experience/bookings/ProposeBookingTimes.tsx) lets an owner inspect the named inquiry recipient, choose up to three current times and explicitly send one request-mode reply; accepted, suppressed and unknown delivery remain distinct. [ManualBookingForm](../../src/experience/bookings/ManualBookingForm.tsx) takes an owner booking request using shared labelled service/time/customer/intake fields, preserves the customer draft on reopen, and separates the saved request from owner confirmation. The gated workspace-only path lists a real Bookings System without a website tenant; its setup prompt uses a Request, and taking a booking still requires the owner’s confirmation. [CalendarConnectionPanel](../../src/experience/scheduling/CalendarConnectionPanel.tsx) validates the gated Outlook disconnect follow-up before rendering a status and fixed Microsoft My Apps consent-removal link; the link has a 44px target and a visible 2px keyboard outline. A failed Google revocation is recorded while local credentials are cleared. Manage times, proposal checkboxes and booking-hour inputs have 44px targets; the final manual input/select recheck measures 44px at 390px, and required textarea intake measures 64px. | October 7, 2026, local preview fixtures only: desktop 1280px, mobile layout 390px, and representative 320px reflow. Native radio/checkbox Tab and arrow selection have visible 2px outlines. The generated visitor fixture uses the exported starter renderer/runtime with entirely synthetic transport and visible 3px field focus. State captures and exact limits live in [booking UI evidence](../../output/w6-bookings-ui/README.md). No provider write, authenticated save, physical-device or screen-reader proof. |
| Tabs | REB Tabs.tsx. Shared variants implement a roving tab stop, orientation-aware keyboard navigation, disabled handling and optional panel relationships; the component reference uses actual tabs and `TabsPanel`. | Verify automatic/manual activation, selected tab stop, arrow/Home/End handling, panel relationships and visible focus in affected consumers; current local browser coverage is the component specimen, while route-like consumer semantics remain open. |
| Marketing primitives and composition | Marketing owns its components and CSS. Earlier audit findings must be rechecked against current code. | Adopt the agreed measurements and semantic roles at primitive owners; migrate page controls without breaking brief persistence, dialogs, keyboard or recovery. |
| Materials | REB owns AtmosphericCard; marketing has a separate implementation. Latest study variant 6 is not in the product API. | Choose any new material explicitly; record its implementation and consumers, and verify readability, pause, reduced motion and fallback. Similar-looking blur is not parity. |
| Font and identity adoption | REB now loads Geist Sans for interface and display roles through one Next font binding; the original vector lettering remains separate. The component reference renders the actual family in both theme modes. | Verify computed family after fonts load and review 400/500/600 weights on the actual materials. Marketing and client repositories retain their own adoption rows. |
| Rendered foundation reference | Existing colors/components previews cover only part of the system. | Show spacing/type roles and actual atoms with relevant states, not inline lookalikes. Verify desktop/mobile, keyboard, reflow and enlarged content. |

October 7, Wave 6 local History contract: [WebsiteHistoryPanel](../../src/experience/systems/WebsiteSystemPanels.tsx)
uses the shared Button for native content and earlier document restores. The
document action pins the saved revision and prepares a new candidate through
the existing undo service; approval is cleared and the live site is unchanged.
Saved-copy actions say **Ask Strelva to restore** and file a Request containing
the exact snapshot ID and date, because full-copy preparation still belongs to
Strelva. Read-only access has no restore action. Busy actions cannot repeat;
an unconfirmed response shows an alert and requires a reload before another
attempt. Successful preparation shows a status message and refreshes the lists.
`website-history-restore.test.ts`, `website-system-detail.test.ts` and
`website-system-panels.test.tsx` cover authority, exact targets, failure states
and the owner action. Desktop/mobile fixture proof is recorded in the
[Wave 6 website handoff](../product/streams/w6-website.md); no production proof
is implied.

October 7, Wave 6 cutover undo: [WebsiteCutoverUndo](../../src/experience/websites/WebsiteRecoveryControls.tsx)
requires separate confirmations that the owner restored DNS and opened and
tested the old website. Its copy states that Strelva switches its routing
after those confirmations; it does not claim an automatic fallback check.
The shared Button remains disabled until both confirmations are checked.

October 7, Wave 6 website Connections: the System page retains a business-record
read across a connected site's rebuild. Hosted documents describe reads at
render; native content describes reviewed publication; repo-only sites say
**Not connected** and "Strelva updates this site by hand." Per-domain
**appear** Connections use the same domain observations as the Domains panel,
with source of truth, owner authority, last check and DNS failure behavior.
Disconnected or unconfirmed Connections remain visible; working ones use the
existing **Works with** disclosure. These are read-only contracts behind the
Systems release, not new grants or provider writes. Focused projection and
render tests cover the contracts; browser proof belongs in the stream handoff.

Keep completion scoped to named consumers. A repaired Button does not migrate all
native buttons, and passing component tests does not prove an entire page journey.
Record local checks with their revision and limitations in the existing
[verification record](./atmospheric-components-verification.md) or owning
feature handoff. Human acceptance and production release remain separate.

### Outcome components (October 6, local preview only)

Contract: [outcome-components.md](./outcome-components.md). Seven components
in [src/experience/workspace/outcomes](../../src/experience/workspace/outcomes/),
one shared CSS module (`outcomes.module.css`, contract colors scoped as
`--oc-*` on `.card`/`.scope`, not added to global palettes) and DM Sans loaded
for these components only (`outcome-font.ts`, `--font-outcome`; the app font
stays Geist). Every verdict, ratio and geometry comes from a pure function
with tests (`outcome-models.test.ts`); rendering, accessibility and the
honesty rails are covered by `outcome-components.test.tsx`.

| Component | Props in | Pure functions | Honest empty state |
| --- | --- | --- | --- |
| `LoopRibbon` | `eyebrow`, five `LoopStage`s (`value: null` = no source), optional `trend`, `footer` | `loopRibbonGeometry`, `loopHeadline`, `loopChips` | "Not measured yet" per stage; no ribbon when nothing is measured; Found marked Estimated |
| `AiMirror` | `AiMirrorData`; `aiMirrorFromScorecard()` adapts `AiVisibilityScorecard` (one Gemini column today) | `aiMirrorMatrix`, `aiMirrorHeadline`, `splitAnswer` | Only probed assistants get columns, only mentioned / wrong-info-fixed cells draw, rows with no mention are omitted; never "not mentioned" |
| `ReplyPattern` | `ReplyLead[]` (day, time, name, minutes or null) | `replyVerdict` ("Steady." when all ≤ 5 min), `pinLayout`, `arrivalOrder` | "No leads this week."; unanswered leads pin in clay and count as waiting |
| `RatingTrend` | `RatingPoint[]`, `cutoff` (4.5), notes | `ratingChartGeometry`, `ratingCrossing`, `ratingTrendWord` | Needs two readings; says so otherwise |
| `SundayPictureText` | `WeeklyReport` | `weeklyPictureLine`, `weeklyReportBubbles`, `weeklyReportText` (plain SMS) | Unmeasured parts omitted, never written as zero |
| `PriceSheet` | title, price, terms, `onConfirm` | `slideCommits` (> 85%), `slideProgress`, `confirmLabel` | Real button always present and equivalent; slider on coarse pointers (or `slider="always"`); one confirm per commit; failure keeps the button usable |
| `LocationHeatmap` | `HeatmapRow[]`, optional `suggestion`, `onAction` | `heatStep` (contract scale), `formatTileMinutes`, `heatmapVerdict` | One action only when a location is slipping |

Interactive marks are keyboard reachable: Loop stage numerals link to receipts
when a `receiptHref` exists; reply pins are buttons (links with a receipt)
labeled with who, when and minutes; heatmap tiles are links to the day's
receipts or focusable images with the reply time. Tooltips mirror the label
and are aria-hidden.

Wiring: only the Loop ribbon reaches a product surface, on business Home via
`HomeOutcomesProvider` (default null; only `WorkspacePreview` provides it, for
`outcomes=on`). No live route reads or sets outcome data; the loop is not
joined on the server yet.

Preview (with `STRELVA_UI_PREVIEW=1`): `/preview/strelva/outcomes` (all seven,
plus partial and empty Loop ribbon and an empty AI mirror) and
`/preview/strelva?outcomes=on` (any scenario). Fixtures:
[outcomes-fixture.ts](../../src/experience/workspace/preview/outcomes-fixture.ts)
(fictional Hertel Ave Bakery and Comfort Air). Checked in Chromium at 1440 and
390 px with and without reduced motion: 200s, no console errors, no
horizontal overflow. Jacob's visual acceptance, screen readers and physical
devices remain open.

### Agency setup checklist (October 7, flag off)

[AgencyOnboarding](../../src/experience/workspace/agency/AgencyOnboarding.tsx)
at `/workspace/agency/start` (#258, `STRELVA_AGENCY_SIGNUP_RELEASE`). Composed
from `Button`, `TextInput` and dashboard tokens under `data-dashboard`; rules
and whitespace group the steps, with no cards. One ordered list of four steps
(profile, team, verification, first client), each with a ring or check mark
and a text status ("Done", "Next", "Recorded by Strelva", "Not started"), so
colour is never the only signal. Verification is a four-row list of effects
with what each unlocks and "Not verified"/"Verified". The dashed monogram
stands in for the agency logo until the brand layer (#264). States: loading,
signed out (sign-in link back to `?as=agency`), not a member, failed read
with retry, choose among several agencies, create (inline validation and
the per-account cap message), ready. The `/sign-up` account-kind choice is
two plain links in a pill group with `aria-current`. Checked in Chromium at
1440 and 390 px by `tests/agency-signup.spec.ts` with intercepted APIs: no
horizontal overflow. Jacob's visual acceptance, screen readers and physical
devices remain open.

## Extending the foundation

Use the existing source owners and references. Keep changes small enough to
compare and reverse; an experiment should not silently redefine every consumer.

| Change | Extend here | Demonstrate here |
| --- | --- | --- |
| Semantic color or theme role | [Color contract](./color-system.md) and its linked scoped CSS | [Color reference](../../src/app/preview/strelva/colors/ColorReference.tsx), including paired foregrounds and nested scopes |
| Shared spacing, type or geometry | [Token contract](#token-implementation-contract), then the scoped foundation implementation described there | Existing component reference with resolved values, long content and enlarged text; mark unimplemented roles as proposed |
| Control appearance or behavior | Existing [atom owner](#atoms-to-inspect-before-composing-a-page); preserve or explicitly migrate its public API | [Component reference](../../src/app/preview/strelva/components/ComponentReference.tsx) using the actual component, plus affected consumer checks |
| Material | [Atmospheric contract](./atmospheric-component-contract.md) and its renderer/CSS; keep composition separate from material style | Existing material comparison first, then the real component in both themes, with fallback and reduced motion |
| Identity or motion | [Brand components](../../src/components/brand/StrelvaLockup.tsx), [motion contract](./motion.md) and their source owners | Static and motion specimens at real sizes, interruption, focus and reduced motion |
| Imagery or composition | [Visual record](./strelva-visual-direction.md#visual-review-and-extension); the owning surface's design record | Relevant study or authorized surface with realistic content; component changes still go through their primitive owners |

### Record with each enhancement

Extend the relevant contract or adoption row rather than creating another system
document. Retain:

- **Purpose and scope:** what becomes better, affected themes/components/surfaces,
  and the accepted direction being preserved or deliberately reconsidered.
- **Reference and decision:** original asset or source, what is borrowed from it,
  its use rights where applicable, selected versus experimental status, and any
  superseded decision. Generated or fictional content stays labeled.
- **Implementation:** owning token/component, API change, default behavior,
  compatibility adapter if needed, and which consumers actually adopt it.
- **Proof:** specimen route, code revision or patch identity, exact checks,
  browser/viewport/theme/state coverage and known failures. Store dated results
  in the [existing verification record](./atmospheric-components-verification.md).
- **Review and recovery:** visual decision where required, remaining behavior or
  accessibility limits, and how to restore the previous treatment without
  losing user state. Deployment status is recorded separately.

Use the existing distinction between recorded direction, implemented and open.
For adoption, name the verified consumers instead of assigning a system-wide
percentage. A proposed numeric value stays proposed until implemented and
inspected; an implemented value stays reviewable until visual acceptance.

### Cross-repository changes

For a change intended for both product and marketing, give the contract revision
the same dated reference in each repository's existing design record. Use the
same specimen content and required states, implemented through each repository's
own primitives. Record each repository's source revision, coverage and remaining
differences independently. A pass in REB cannot close marketing's adoption row.
Inspect the installed behavior libraries before changing an adapter; do not
copy sibling source or introduce a shared package merely to synchronize styling.

### Current work that this structure does not complete

Broader product adoption, the remaining component families, final material
review, exact Geist weight selection and cross-repository parity still follow
the [completion specification](#foundation-completion-specification). This
extension structure makes their ownership and evidence explicit; the REB slice
does not mark those implementations or the overall foundation finished.

## Foundation completion specification

Status: specification for review, not implemented. Jacob's latest decisions
supersede earlier font and material recommendations within this scope.
The earlier C+ assessment was qualitative; the criteria below define observable
completion. An A requires every applicable criterion, not an averaged score that
hides a broken field or inaccessible dialog.

### Scope and selected direction

- Build and verify tokens, atoms and reusable composed components only. Extend
  the existing component references; do not design or redesign product pages.
- Preserve the original cairn and custom Strelva vector lettering as the logo.
  The lettering is artwork, not a general-purpose font. A comparison with the
  old Fraunces wordmark may remain an explicitly labeled historical specimen.
- Use Geist Sans for interface and display text. Inter and Fraunces in ordinary
  Strelva UI become migration inputs, not additional current font choices.
- Gloss is a prominent characteristic of the foundation. Atmospheric material
  is a supported, selective treatment. It is not required beneath every control.
- Finish both light and dark component treatments independently. Light is not
  an inversion of dark. Neither theme may be declared complete from the other.
- Preserve existing APIs and behavior through adapters where necessary. Existing
  product pages and customer-site branding are outside this implementation scope.
  Do not change a global default in a way that silently restyles those pages.

### Governing design method

Jacob explicitly invoked [$design](/Users/jacobrhinehart/.codex/skills/design/SKILL.md)
for this work. Apply it throughout the foundation, using
[the global standard](/Users/jacobrhinehart/.codex/DESIGN.md) and the relevant bundled
typography, colors, UI, accessibility and layout guidance. This specification is
not a substitute for those standards or an invitation to activate unrelated skills.

Build each specimen in order: grid, outer geometry, safe space/content groups,
text and controls, typography, then interactive states. Inspect the existing
shadcn configuration and component owners before replacing an implementation.
The spec remains a component specification; the build mode of a skill does not
expand the user's assignment into page work.

Project decisions override bundled defaults: prominent gloss is selected; the
existing gooey disclosure retains its documented spring instead of the bundle's
zero-bounce default; reduced motion uses the project's immediate-state contract.
The global type scale takes precedence over generic heading line-height recipes.
Within those boundaries, examine optical alignment, layering and legibility
rather than treating token compliance as proof of craft.

### What an A means in each area

| Area | Required completion evidence |
| --- | --- |
| Identity | Correct cairn/custom lettering in static specimens at small and large sizes in both themes; no invented mark or font substitution. Existing motion remains optional and has a static/reduced-motion result. |
| Tokens | One declared contract for scale, semantic roles, states and material properties. Every foundation specimen resolves through it; no undefined variable, accidental fallback or theme-scope leakage. |
| Geometry | Shared spacing, padding, radii and control sizes. Computed browser measurements match the contract with documented optical exceptions; text enlargement can grow controls. |
| Typography | Geist actually loads. Every text specimen consumes a named size/line-height/weight role; wrapping, small text, numerals and enlarged text are inspected on gloss in both themes. |
| Atoms | Documented semantics, props, states and compatibility. No missing error association, keyboard operation or state recovery in the component contract. |
| Materials | Gloss reads clearly without hover in both themes. Atmosphere is recognizably related, with independently tuned readability, fallback and motion behavior. Jacob reviews the actual specimens. |
| Accessibility | Applicable semantics, contrast, focus, keyboard, reduced motion, forced colors, touch and reflow checks pass; manual screen-reader checks complement automation. No blanket conformance claim from an automated scan. |
| Motion | Named presets and lifecycle ownership; rapid interruption, disposal, pause and reduced-motion behavior verified. Content and controls remain sharp and available. |
| Cross-repository delivery | Both repositories render the same contract through their owned components, with an explicit contract revision and matching fixture cases. No sibling-source imports or assumed parity. |
| Documentation | Existing files own decisions, APIs and dated proof. Examples compile against the actual API; historical recommendations cannot masquerade as current rules. |
| Reference and verification | Existing galleries expose all in-scope families, values, states and theme comparisons using real components. Evidence identifies code revision, browser, viewport and failures. |

Whole-product adoption remains a separate grade. Completing this specification
can earn an A for the foundation and its verified component consumers; it cannot
earn an A for untouched product pages or production deployment.

### Token implementation contract

Use the current CSS and Tailwind v4 infrastructure. Define a common contract with
three responsibilities: shared measurement values; semantic theme roles; and
component-specific roles only where a component has a distinct need. Do not make
one token per CSS declaration or one palette apply to every client brand.

The first implementation should use a scoped foundation stylesheet under
`src/app/styles/` and a corresponding marketing-owned stylesheet. This is a
proposed delivery mechanism, not an existing shared package. Keep their contract
revision and invariant values comparable in fixtures. Do not turn the workspace
into a monorepo or require publication of a new package to finish the foundation.
A future package can replace duplication after its ownership/release mechanism
is agreed; it is not an excuse for divergent contracts today.

- Reuse the documented 8px/4px scale and 32/40/48px control minimums. Use rem-based
  measurements and retain the 24px control line box. Distinguish content height,
  borders, visual bounds and expanded touch targets in the specimens.
- Expose named type roles for metadata, compact, body, introduction, component,
  section, page and display using the existing size/line-height scale. Page and
  display roles are text specimens here, not permission to design pages.
- Use semantic foreground/background pairs for text, muted text, action,
  destructive action, selection, status, focus, surface and overlays. Preserve
  legacy aliases at compatibility boundaries rather than silently changing them.
- Bind Tailwind aliases with `@theme inline` where they reference scoped custom
  properties. Keep actual light/dark values in the explicit component theme scope.
  Verify nested themes, portal content and fallback values in the browser.
- Material roles cover tint, opacity, edge, reflection, shadow, blur and opaque
  fallback. Status and focus remain semantic roles independent of decorative hue.
- Keep role definitions with their current owner. Color usage stays in
  [color-system.md](./color-system.md), motion in [motion.md](./motion.md),
  and material construction in the [atmospheric contract](./atmospheric-component-contract.md).

### Geometry and interaction detail

Use the global values through roles: substantial surfaces 24px padding/radius;
compact surfaces 16px padding; control corners 12px; utility corners 8px.
Use 4px grouped-control insets, 8px menu insets, 40/48/64px row minimums by density,
and 16/20/24px icon sizes. Nested surface curves follow their actual inset rather
than repeating the parent's radius. Preserve native corner behavior where a
platform-owned control cannot be styled reliably.

Align header, description and footer edges. Use 8px tight relationships, 16px
related content and 24px between groups as starting roles. Do not wrap every group
in another padded card. Optical icon adjustments are permitted at the primitive
owner and must not become unrecorded feature-level overrides. Use one icon family
per surface, `currentColor`, and inspected stroke weights alongside Geist.

Dialog specimens use the existing global 480/640/960px size roles, clamped to the
viewport with 24px clearance and usable internal scrolling. Allow text and rows
to grow; test actual content breakpoints and logical properties/RTL mirroring.
Decorative layers cannot intercept pointers. Expanded touch targets cannot overlap.

Use 2px focus outlines with 2px offset and measure visibility against every
adjacent material color. Gate hover by hover capability. Keep immediate feedback
available without motion. Explicitly name transition properties, avoid blanket
`transition-all`, and suppress color-transition smearing in the specimen theme
switch. Do not add a product theme switch as part of this work.

### Geist weight and legibility contract

Start at the global design standard: 400 for body, inputs and large text, 500 for
controls/labels/selected states, and 600 for brief strong emphasis. Compare 300 as
an optional large expressive treatment, rather than making it a default before
inspection. These are agent recommendations to test, not weights Jacob has
visually approved. Do not use 300 below the 32/40 role. Do not use opacity to make small text feel thin.
Use at most three sizes and three weights within an authored component.

Render the same meaningful labels, long titles, paragraphs, amounts and ambiguous
characters at their actual sizes. Compare 300/400 for large text and 400/500 for
compact text against both gloss and atmospheric backgrounds. Keep sufficient
contrast across material variation. If 300 looks weak or loses clarity, use 400
for that role rather than darkening unrelated surfaces. Select final weights from
these specimens and record the outcome here.

Use the project's Next font loading mechanism, one Geist family binding per
application and the existing `font-display` utility in REB. Verify computed
family after fonts load; a successful download does not establish inheritance.
Do not add Mono, Pixel or a new serif merely because the Geist package offers it.
No new full alphabet is required for the logo artwork.

Keep mobile inputs at a true 16px minimum; do not scale their text down with a
transform. Body tracking starts at zero; large text may compare approximately
-0.02em. Use tabular numerals for aligned/changing values. Labels and descriptions
remain selectable. Preserve complete meaningful text through wrapping or an
accessible expansion; do not use fixed-height clipping to protect geometry.
Inspect the role's line-height when text grows to three or more lines. Verify
fallback fonts and actual supplied weights rather than relying on synthesized
bold/italic. Test 200% browser zoom separately from enlarged text.

### Material contract

Provide a coherent glossy surface treatment, an atmospheric treatment using the
existing bounded renderer, and an opaque accessibility/unsupported fallback.
Exact prop names should fit the current Card/AtmosphericCard APIs; do not overload
numeric cloud composition variants to mean material style.

Gloss must be visible at rest through its tint, depth and fine edge/reflection.
It must survive real text and controls, not only empty squares. Small controls
may express gloss through a light edge and fill without their own backdrop filter.
An atmospheric surface owns one continuous material layer; nested content must
not accumulate additional live renderers or backdrop filters.

In light specimens, tune tint, shadow, reflection and pigment independently to
avoid the previously rejected bright pastel glare. Preserve the comparison
canvas when adjusting card comfort. Dark specimens retain ink depth and selected
sage/blue-green atmosphere. Final numeric palettes remain reviewable choices.

Keep ambient pause, offscreen/hidden suspension, renderer cleanup, context-loss
recovery, reduced motion, reduced transparency and forced-color fallbacks.
No essential label or state depends on the shader. Record rendering performance
on representative devices before declaring the animated treatment complete;
there is no existing evidence supporting a universal GPU or battery budget.

### Component families and behavioral acceptance

| Family | Required implementation and states |
| --- | --- |
| Button, icon action, link | Rest/hover/press/focus/disabled/loading; correct button vs navigation semantics; explicit submit intent; stable label, accessible icon name, minimum touch target and visible non-color state cues. Preserve existing call signatures. |
| Text input, textarea, native select | Label, description and error IDs associated automatically; caller-provided descriptions merged; invalid state exposed; required/disabled/read-only where native semantics support them; controlled/uncontrolled use, refs, autofill and IME preserved. Textarea grows without clipping enlarged text. |
| Checkbox, radio, switch | Native or established accessible behavior; visible label, checked/unchecked/disabled/focus, indeterminate checkbox where supported, correct radio grouping and keyboard behavior. Do not use one control type as another. |
| Tabs | Complete tab/panel relationships, roving focus and orientation-appropriate keys; explicit activation behavior; disabled tab handling. Automatic activation only for immediately available local panels; support manual activation otherwise. Hidden panels cannot retain interactive focus. Route navigation remains links. |
| Dialog and alert dialog | Accessible name/description, initial focus, modal focus containment, Escape behavior, background inertness, scroll containment and trigger recovery. Busy/destructive variants state cancellation rules. Preserve data on dismissal where callers require it. |
| Menu, popover, tooltip | Reuse established overlay behavior; correct semantics for actions versus descriptive content, keyboard dismissal, positioning at viewport edges, focus recovery and portal theme inheritance. Tooltips do not contain essential-only instructions or interactive forms. |
| Card and disclosure | Card is a surface, not implicit navigation. Heading supplied by caller; aligned content slots; optional details. Disclosure preserves controlled state, interruption and hidden-content focus rules. |
| Feedback | Inline status, validation, notice and optional transient feedback share semantic roles. Appropriate live announcements without duplicates; persistent errors and recovery actions do not disappear on a timer. Do not force all feedback into toasts. |
| Empty and loading | Actual shared primitives with appropriate text, busy state and stable dimensions; reduced-motion skeleton alternative. Samples do not fabricate saved data, completion percentages or unavailable capabilities. |
| Table and list | Semantic table/headers or list as appropriate, shared text/spacing/selection roles, long-cell and empty/loading examples. Contained two-dimensional scrolling where needed; no generic data-grid framework unless existing requirements justify it. |

Marketing already uses Base UI for several behavior primitives. Preserve it.
For REB overlays and tabs, evaluate adapting the same behavior foundation behind
existing public component APIs rather than recreating focus management. Retain
native inputs/selects where sufficient. Pin implementation to the installed
version and inspect its types; Context7 examples are guidance, not proof that
an option exists in that exact version.

### Specimen and verification contract

Extend `/preview/strelva/colors` and `/preview/strelva/components`, and the existing
marketing component reference, rather than building a new product or gallery app.
Use the actual primitives, including fields, not visually similar inline markup.
Show role names, resolved values, component variants and compatibility status.
A laboratory theme/state selector is acceptable here; it is not a new product
settings feature. Fixtures remain local and require no provider calls.

Inspect 360, 768, 1280 and 1600px widths, plus 320px reflow and actual component
breakpoints. Include long strings, 200% text enlargement, keyboard-only use,
coarse-pointer targets, nested theme/portal cases, reduced motion, forced colors,
unsupported filtering and renderer failures. Test supported browser engines;
record exact browser/device coverage rather than claiming universal support.

Target the existing accessibility standard: ordinary text 4.5:1, qualifying large
text 3:1 and necessary non-text indicators 3:1, with relevant exceptions recorded.
Measure translucent content over the supported background range and multiple
animation frames. A token-pair calculation alone does not prove glass readability.
Manual review includes material comfort and screen-reader field/dialog/tab use.

Add focused behavioral tests at the primitive boundary and computed-style tests
for role resolution and geometry. Reuse existing color, atmospheric, motion and
marketing design-stack tests. Update obsolete font expectations deliberately.
Avoid tests that merely assert source strings or bless screenshots without review.
For any modified shared implementation, run its existing consumer regressions
without changing their layouts. If scoping cannot protect a consumer, record the
migration dependency instead of silently redesigning it.

### Delivery order and exit evidence

1. Confirm this spec and its remaining proposed implementation choices. No page
   design, deployment, package publication or global restyling is authorized here.
2. Establish scoped token/type specimens and both theme treatments. Review Geist
   weights and glossy/atmospheric material in actual components.
3. Complete the atom APIs and behavioral families above. Preserve compatibility
   and expand the existing galleries as each family becomes usable.
4. Render the same contract in both repositories and reconcile differences.
   Retain repo-local ownership; do not claim source sharing that does not exist.
5. Run focused component tests, typecheck and relevant consumer regressions;
   perform browser and manual accessibility/material review. Record failures and
   tested revisions in existing verification records, including any device limits.
6. Regrade each foundation area against the table. Unfinished visual selection,
   inaccessible controls or missing theme coverage prevent an A in that area.
   Product-page adoption is a later assignment with its own journeys and proof.

### Component reference research

The inspected [Linear interface and theme controls](https://mobbin.com/screens/abf277ec-d00a-4504-8cfa-54930315f0ab)
show aligned control rows, adjacent labels/descriptions and separate light/dark
choices. This is a reference for component relationships and comparison, not a
page layout or evidence for Strelva's glossy material. A static screenshot does
not establish its keyboard behavior or measurements.

No 21st.dev source-search tool was exposed in this session. No component code
from 21st.dev was inspected or adopted. Use its existing-code search when available
and relevant; never use 21st AI generation. Existing owned components remain the
starting implementation.

### Implementation references checked with Context7

- [Tailwind theme variables](https://tailwindcss.com/docs/theme): theme CSS can be
  shared; semantic aliases can reference scoped values. This supports the token
  mechanism, not a decision to make these independent repositories a monorepo.
- [Base UI Field](https://base-ui.com/react/components/field) and
  [forms](https://base-ui.com/react/handbook/forms): field composition and native
  validation support. Error association and caller compatibility still need tests.
- [Base UI Tabs](https://base-ui.com/react/components/tabs): tab/panel composition
  and mounted-panel lifecycle. Preserving DOM is not permission to retain focus
  inside hidden content.
- [Geist source and integration](https://github.com/vercel/geist-font/tree/main/packages/next):
  family bindings through CSS variables. Weight selection remains a Strelva visual
  judgment to verify in specimens, not a recommendation established by these docs.

## Sources and scope

[DESIGN.md](../../DESIGN.md) owns product direction. [Color system](./color-system.md) owns palette roles; [motion](./motion.md) owns animation behavior; the [atmospheric contract](./atmospheric-component-contract.md) records material decisions and rejections. Source code owns the implemented API.

Publishing uses [ContentWorkspace](../../src/experience/publishing/ContentWorkspace.tsx)
for exact-content review, collection publication/restore, and immutable newsletter
issues. Native website Systems use the same panel and approval controls;
publication confirms the content store, while website rendering remains unverified.
Native newsletter approval stays paused. Approved issue data may include a separate
optional `delivery` projection for linked tenants: current state, accepted/suppressed
counts, unconfirmed batches and append-only batch receipts. The view preserves
approved words and distinguishes provider acceptance, not-sent gates and unconfirmed
sends; it never claims delivery. October 7, 2026, `a1/newsletter-sender`: accepted
desktop and gated/unconfirmed 390px fixtures were observed locally. Sending still
defaults off; see the [implementation handoff](../product/streams/a1-newsletter-sender.md).
[RecordPublishingFields](../../src/experience/publishing/RecordPublishingFields.tsx)
saves hours, special hours and website facts through the owner boundary, shows
the optional Google approval disclosure, and reports each location separately
as confirmed, awaiting approval, unapplied or unknown. Unknown writes never say
that nothing was sent. [WorkspaceGoogle](../../src/experience/places/WorkspaceGoogle.tsx)
composes the same field and Button family for drafts, pause, reply edits,
withdrawal and undo; reply forms retain their command identity through a submission retry,
and undo stays keyed to its original receipt. All have permission and failure states. Local fictional
fixtures live at `/preview/strelva/publishing`; these do not prove provider writes.

| Component | Source | Contract |
| --- | --- | --- |
| Button / IconButton | [Button.tsx](../../src/components/ui/Button.tsx) | Button variants primary, secondary, ghost, danger, contrast; sizes sm/md/lg; loading disables and sets aria-busy; `static` disables press scale. IconButton requires `label`. |
| Card | [Card.tsx](../../src/components/ui/Card.tsx) | Default solid surface; padding none/sm/md/lg. md is 24 px padding/radius; sm is 16/16; lg is 32/24. `interactive` changes hover styling only, not semantics. |
| Toggle | [Toggle.tsx](../../src/components/ui/Toggle.tsx) | Controlled checked/onChange, required accessible label, optional disabled, 44 px minimum hit height. |
| Agency client and Queue rows | [AgencyViews.tsx](../../src/experience/workspace/agency/AgencyViews.tsx) | Existing row controls and tokens; released operator overview adds a separate health label beside lifecycle, scoped links into the client's System, and a named incomplete-source alert. Missing or stale health says Not verified. The old overview remains when the operator release flag is off. |
| Version Possibilities | [SystemVersionImprovements.tsx](../../src/experience/systems/SystemVersionImprovements.tsx), [SystemPage.tsx](../../src/experience/systems/SystemPage.tsx) | Version improvements and unreleased alternatives share the existing Possibilities panel. Native disclosure compares current and alternative definitions; closed native app candidates reuse ApplicationDraftPreview with isolated test records. Conflicts show both values, and shared fields/buttons prepare a draft. Make real approves the existing exact `version_release` Needs you item; only the business owner can decide. Row revision pins invalidate edited candidates. Failed, foreign, stale and uncertain acknowledgments stay visible, and retries retain the same decision command. Local DOM tests cover these states. After the collaborative host disconnected, the existing headless Playwright runner verified 1280px/390px preparation and same-decision Make real, isolated native-app submission, keyboard focus, no page overflow, and mobile loading/error/empty/read-only/missing-account fixtures. These are fictional local records; no authenticated provider or production proof. |
| Operator queue | [QueueBoard.tsx](../../src/app/admin/queue/QueueBoard.tsx), [QueueSourceActions.tsx](../../src/app/admin/queue/QueueSourceActions.tsx), [QueueLoadState.tsx](../../src/app/admin/queue/QueueLoadState.tsx) | Composes console Chips/Panels and shared Button/fields; row and source buttons use the shared 48px large control size, links and checkbox labels have 48px touch areas. Owner decisions offer only Stop chasing in the operator close form. The real loading, unavailable and permission states share the preview specimens at `/preview/strelva/operator-queue?scenario=loading`, `error`, or `denied`. |
| AtmosphericCard | [AtmosphericCard.tsx](../../src/components/ui/atmosphere/AtmosphericCard.tsx) | Semantic section, ref forwarding, theme light/dark, numeric composition variant 0–5, contentClassName, optional controlled paused/onPausedChange. |
| AtmosphericCardHeader / Detail / Footer | [AtmosphericCardParts.tsx](../../src/components/ui/atmosphere/AtmosphericCardParts.tsx) | Content slots inheriting card roles. Header accepts an optional decorative icon; caller supplies heading semantics. Detail is optional, never automatic filler. |
| GooeyDisclosure | [GooeyDisclosure.tsx](../../src/components/ui/motion/GooeyDisclosure.tsx) | Controlled `open`, required `id`, children and optional className. Spring height, sharp content, inert when closed, reduced-motion support. |

Button minimum heights are 32/40/48 px with 24 px label line boxes and 12 px corners (pills inside the October 6 linen workspace). Increase small controls to 44 px for touch. Shared geometry lives in [primitives.module.css](../../src/components/ui/primitives.module.css). A visual Card does not turn a div into a link or button.

## Compose atmospheric content

Use 24 px outer padding/radius and a single continuous material background. The content wrapper has no second padded glass panel. Header, description and footer share alignment edges; add a detail surface only when actual content needs it. Jacob explicitly rejected the study's People / Decisions / Commitments filler.

```tsx
import { AtmosphericCard } from "@/components/ui/atmosphere/AtmosphericCard";
import { AtmosphericCardHeader, AtmosphericCardFooter } from "@/components/ui/atmosphere/AtmosphericCardParts";
import { Button } from "@/components/ui/Button";

<AtmosphericCard theme="dark" aria-labelledby="draft-title" contentClassName="grid gap-6">
  <AtmosphericCardHeader><h2 id="draft-title">Draft ready to review</h2></AtmosphericCardHeader>
  <p>Review the proposed changes before publishing.</p>
  <AtmosphericCardFooter><span>Nothing published</span><Button type="button" onClick={openDraft}>Review draft</Button></AtmosphericCardFooter>
</AtmosphericCard>
```

Pause is internal unless `paused` is supplied. Controlled cards require `onPausedChange` for their local pause control to work. Numeric `variant` means cloud composition, not smoked/clear/mineral. Pass a theme explicitly for independent themed cards; do not assume `data-theme` alone changes every product foundation token.

## Implementation status

- Product: shared primitives, AtmosphericCard, its content parts, Home attention integration and GooeyDisclosure are implemented locally.
- Six cloud compositions: available in the product gallery and standalone material study; final material selection remains open.
- Three material alternatives: smoked glass, clear glass and matte mineral exist in [light-options.html](../prototypes/atmospheric-launch/light-options.html). All remain candidates. Comparison uses a pure-white page at Jacob's request.
- Collapse/expand/close/restore: implemented in that comparison prototype. Shared React disclosure is available; product AtmosphericCard does not yet expose close/restore or a material-style enum. Do not document prototype controls as shipped product behavior.
- No new production deployment, customer data mutation or new dependency is part of this update.

## Preview and verification

With `STRELVA_UI_PREVIEW=1`, use `/preview/strelva/components` for real components, states and the gooey disclosure; `/preview/strelva/colors` for color roles. Serve `docs` with a local static server for the standalone study and material comparison.

```sh
pnpm typecheck
pnpm exec vitest run src/__tests__/color-system.test.ts
STRELVA_UI_PREVIEW=1 pnpm exec playwright test tests/atmospheric-components.spec.ts
node docs/prototypes/atmospheric-launch/check-study.cjs http://127.0.0.1:4332/prototypes/atmospheric-launch/
```

Inspect desktop/mobile, long text, keyboard, empty/loading/error/read-only states and interrupted motion where applicable. Screenshot contrast samples are revision-specific and do not prove comfort or every animation frame. Physical-device performance and screen-reader output remain unverified.

## Cairn and display lettering

`src/components/brand/StrelvaLockup.tsx` pairs the existing cairn geometry with the
reference-derived vector wordmark. This is lettering for “Strelva”, not a font.
It inherits text color; `--lockup-accent` controls the sage pebble. Size the SVG
through `className` and its container. Its accessible image name is “Strelva”.

The default is static. `animated` opts into a single entrance: four stones settle
bottom to top, then seven letters rise 8 SVG units without scaling or blurring.
Each piece uses the 360 ms gooey motion curve; the entire sequence ends at 750 ms.
`paused` freezes progress. Remount with a new React key to replay. Reduced motion
renders the final lockup immediately. Use the static default for navigation and
repeated cards. The product preview demonstrates replay and global pause.

The standalone reference study includes the same lockup, a compact static card
version, and Replay logo. Its `strelva-lockup.svg` is an export; its inline SVG and
`strelva-lockup.css` mirror the React component. Keep those study copies aligned
when changing the geometry or motion. The existing `LogoMark` and `LogoFull`
callers have not been replaced globally.

### Interchangeable lettering

`StrelvaLogoSwitch` wraps the lockup in an accessible button. Fraunces is visible
at rest; mouse hover or keyboard focus reveals the custom vector lettering.
Mouse leave and blur return to Fraunces; touch and keyboard activation toggle it.
Only the lettering changes shape. Seven opaque SVG paths interpolate matched outlines with a damped spring and a 24 ms letter stagger. The cairn
and the outer dimensions remain fixed. A reversal preserves the current outline and velocity. Reduced motion switches immediately. `StrelvaLockup`'s `compare`
prop supplies the seven morphable paths for this wrapper; ordinary static callers
still render the new lettering alone. Entrance pause does not block an explicit
lettering change. Both the material study and React preview use the switch.


## September 22 self-service adoption

StrelvaShell, StrelvaSidebar and AppFrame now provide the customer Home/navigation frame, including the existing mobile focus boundary. BusinessHome composes WorkspaceComposer, shared Button, recorded attention and saved work. WorkspaceStart uses the same composer. Templates use TextInput, SelectInput, TextArea, Button and IconButton, and ApplicationDraftPreview uses ApplicationUseRenderer rather than a second form renderer. Native app creation, app draft changes and plan-output application proposals include that preview; published record surfaces keep their existing runtime.

The frame's main landmark is a programmatic focus target for Skip to work.
Coarse-pointer navigation, disclosure controls and workspace header actions use
44 px minimum touch geometry, including the compact linen rail. Template
navigation restores focus to the originating card after All templates or browser
Back. These contracts retain the existing desktop geometry and owned primitives.

This adoption does not certify every legacy page control. The library supports four curated form/list templates, not arbitrary generated application code. Search is complete over supplied authorized items, not every provider's records. Session storage is continuity only and is cleared on sign-out. Request approval, budgets, external actions and publication remain server-enforced. The implementation and rendered evidence are recorded in [current component context](./current-component-context.md).

Catalog extension (October 7, local): `ApplicationUseRenderer` accepts contact
email/phone and assigned-person email fields. An existing linked ID stays in
the correction draft while the field displays the authorized contact/staff name
and email (or phone). Record lists use those same labels, projected only from
the recipient's visible linked records and fields;
typing a replacement changes the link. Opening a labeled correction focuses its
first field; Tab follows the existing form order. The gated `/preview/strelva/tool`
fixture rehearses labeled records, corrections, read-only and empty states with
no network or persistence. UUIDs never become invalid email input
values. `DocumentExperience` reuses shared fields and Button for private files
and read-only shares, with bounded recent receipts and opt-in keyset pagination,
loading, persistent history error/retry, and cancellation on document change.
The server applies the same saved-work read grant to full history. Local
verification and limitations belong in [the catalog handoff](../product/streams/w6-catalog.md).

## Hosted website catalog (v2)

[SiteRenderer](../../src/products/websites/SiteRenderer.tsx) renders the closed,
Zod-validated [site catalog](../../src/products/websites/site-document-schema.ts).
The 22 entries cover Header, Footer, Hero, TrustStrip, ServiceGrid,
ServiceDetail, Story, TeamGrid, Testimonials, ReviewSummary, Faq, Stats,
Gallery, Hours, Map, Locations, Cta, InquiryForm, Booking, PageHeader,
RichText and Section. Empty data renders nothing. Source text is escaped;
RichText accepts paragraphs and headings without arbitrary HTML. Faq uses native
keyboard-operable disclosure; testimonial carousel uses an accessible scroll
region. The shared tree supplies both React rendering and static export. React
uses next/image for document assets. Semantic theme variables, 24 px component
geometry, responsive grids and visible focus are scoped to `.site-document`.
Brand accents apply only after contrast checking.

An optional configured sites origin mounts published pages at
`/sites/{tenant}`. `SiteRenderer` accepts the trusted mount as `basePath` and
the shared tree prefixes only root-relative navigation links. Approved
document bytes, content hashes, assets and capability endpoints stay pinned.
This route has no preview or legacy fallback, rechecks durable active
publication authority, and keeps app sessions off its host. The origin is
inert until explicitly configured; local evidence is in the
[October 8 release package](../operations/launch-completion-2026-10-08.md).
`RebuildExperience` describes this publication as a hosted address and offers
custom-domain help separately. Its DNS restoration attestation appears only
after an actual domain is attached to that path publication.

Preview inquiry and booking controls are disabled and submit nothing. Published
connections reuse the starter's native inquiry and calendar forms, pinning the
approved capability version; missing connections display their actual state.
The hosted fallback `SiteLeadForm` keeps server-rendered controls disabled until
its client submit handler is ready. It shows a loading state meanwhile and uses
POST as its native method so visitor details never default to a GET query.
Pending writes disable the fields; errors preserve the visitor's input and a
confirmed write resets it. This does not supply a missing published capability.
V1 section rendering remains the fallback when no v2 published document exists.
Per-tenant metadata, sitemap and robots derive from trusted configuration;
private previews are noindexed. The static export includes the immutable
document, each page, redirect mappings, image bytes and file checksums. No new
renderer dependencies were added. Local automated and rendered verification is
recorded with the website rebuild delivery evidence.

An explicitly bound hosted document can read confirmed public business facts
under `STRELVA_WEBSITE_BUSINESS_FACTS_ENABLED`. `SiteRenderer` projects typed
name, contact, address, hours and service slots onto a copy, preserves the issued
document checksum, and reports the business record revision separately. Private
previews remain pinned; unavailable reads use the approved content. The System
Connection claims this behavior only after the issued bindings and runtime read
are confirmed.

### Catalog planning recovery, October 7, 2026

`WorkPlanExperience` preserves the typed goal when planning fails. With Systems
released, a confirmed fallback Request shows its pending review state and hides
the duplicate filing action; a failed fallback retains Ask Strelva to build this.
Scope and deadline remain unagreed. The server rechecks operator/delegation
authority and uses an actor-bound retry identity. Flags off preserve the earlier
unavailable response and planning prompt. Local route and SQL tests cover
confirmed filing, storage failure, revocation and retry; this entry does not
claim provider generation or production delivery.

The standalone workspace planner receives the Systems release and Request
navigation from `WorkspaceLayout`. A denied maker check shows an editable
request with no planning budget or preparation controls; its action opens the
existing Request form with those words. Real isolated local Auth covers owner
filing and failed-provider recovery at 360px, and staff use at 1280 and 360px.
The model and email providers are bounded local fixtures.

### Booking conflict choices and intake

The native visitor form in [StrelvaBookingForm](../../custom-repo-starter/StrelvaBookingForm.tsx) and its
[exported runtime](../../custom-repo-starter/website-generation/capability-runtime.mjs) preserve visitor input when
a time is taken. Store-served conflict responses offer at most three fresh slots;
the forms replace stale choices and keep reserve/change disabled when there are
none. The existing legacy BookingWidget shows the suggested local times in its
error text. These controls appear only when the gated server supplies them.
Optional service intake questions use the existing input/textarea controls,
required semantics and eight-question limit. A store-served native schedule also
marks business confirmation explicitly: calendar sync is a copy, and a pending
request awaits the business. Native visitor forms accept optional phone and show
slots and receipts in the browser time zone, with the zone named. Without native
authority metadata, the flags-off flow keeps its fields and provider wording.

### Inquiry System detail (wave 6)

`src/experience/places/InquirySystemDetails.tsx` composes the owned `TextInput`,
`TextArea`, `SelectInput` and `Button` for a viewing copy of the accepted inquiry
form. The published form comes first, the existing records follow, and typed
Connections and recorded History sit below. Lifecycle and health stay separate.
The viewing copy cannot submit an inquiry. The component preserves records during
loading and errors, offers retry, aborts old business reads, and never projects
private routing destinations into form data. Connected and native website sources
are named without fabricating their current form or History; external forms are
explicitly managed on the business’s own site. Fixture projection, authorization,
publication health and failure states have focused local tests; desktop/mobile
browser inspection remains separate evidence in the stream handoff.

### Inquiry booking choice (wave 6)

[InquiryBookingChoice](../../src/experience/bookings/InquiryBookingChoice.tsx) composes Card and Button for the signed customer choice page. It shows up to three actual appointment times, a saved requested/confirmed booking, an expired link or a storage error. Each time uses a plain POST form; opening a mail link never requests an appointment. Dates use the booking time zone, controls have visible labels, and failure text uses an alert. The component does not confirm appointments or send email. Desktop/mobile visual proof belongs in the inquiry stream handoff.

`InquiryBookingOfferComposer` uses shared Button and SelectInput to prepare up to
three times and append their signed choices to the existing exact-message reply.
Preparation sends nothing. Loading disables selection; failures preserve the
editable inquiry reply. Only the owner can add a booking proposal. The local
System browser journey covers selection, no send before approval, receipt and
390px keyboard use.

### Operator inquiry review (wave 6)

`OperatorInquiryReview` and `OperatorInquiryActions` compose console Panel/Chip
and shared Button (`lg`). `/admin/client-leads/inquiries` is super-admin-only,
paged and bounded. With flags off, the existing lead screen stays unchanged.
Held-message decisions never email. Corrected-recipient notice repairs show
refusals separately from accepted provider receipts. Local fictional previews
cover held, empty, loading, error and permission states at 1440px and 390px,
visible keyboard focus and no horizontal overflow. The stream handoff records
the 28 focused tests and isolated SQL fixture; this is not provider or production
proof.

Workspace inquiry replies: current owner/member/none permission comes from the scoped inquiry read. Assigned or routed members see “Send reply” and the owner approval requirement for prices, dates and promises; unassigned members see the permission explanation. Booking commitments stay owner-only.

### Inquiry Versions in the agency Library (wave 6)

`src/experience/workspace/agency/AgencyLibraryView.tsx` includes read-only inquiry
Versions projected from the existing accepted pattern installations. Source
revision and the client’s own release are separate. Source access comes from
current agency links, target access from current tenant memberships, and both
inquiry release switches still apply. No inquiry data, permissions, connections,
credentials or shape snapshots are copied into the Library. Unavailable reads
remain explicit. The existing client inquiry review and testing commands handle
updates; the owner still approves going live. The rows use the existing type,
border and spacing tokens, wrap on mobile, and expose keyboard-focusable links.
Focused server, current Library tab and desktop/mobile fixture tests cover this
projection; local proof does not establish production adoption.

### Inquiry policy sentences in Running (wave 6)

`src/experience/workspace/InquiryRunning.tsx` reads the same strict-gated System
projection used by the Inquiries page. It displays only the current policy for
an accepted inquiry form, with policy hours, daily limit, trust/approval route,
and separate paused or needs-checking state. It does not promise a universal
reply deadline or create another standing responsibility. The existing Running
surface retains operational work. Off flags hide the section without a read;
revoked/delegated access shows no inquiry policy. Loading and storage errors
leave other work available; retries use the shared Button. Scoped identity and
aborted requests discard old sentences when the business changes. Current
projection, integration, gate, zero, pause and failure tests plus desktop/mobile
rendered fixtures cover the component locally.

## Business portability

`WorkspaceExport` and `WorkspaceExit` compose shared Button, Card and fields.
Export schema 3 exposes background preparation, an authenticated ready download,
and retained failure/expiry messages; the bounded legacy export remains with
schema 3 off. Exit keeps loading, error/retry, permission refusal and retained
billing/provider/site handoff obligations explicit. Optional request injection
uses the existing fetch default and permits fictional local review without
provider writes. `/preview/strelva/portability?surface=export|exit&state=ready|loading|error|permission|empty|completed`
is gated by development and `STRELVA_UI_PREVIEW=1`; fixtures prove presentation,
not export completeness or production handoff.


October 7, 2026, local: the System Versions panel now shows each scoped sibling’s reusable definition changes in keyboard-native disclosures, with source-baseline and local values, removed-path labels, and explicit empty/Not verified states. Private records, bindings, grants, maintenance authority and secret-shaped content are omitted by the scoped PostgreSQL projection. `sibling=ready|empty|unavailable` selects fictional comparison states in the existing preview.

### Agent booking source, October 7, 2026

`WorkspaceBookings` reuses Card, semantic status text, native details disclosures
and existing navigation. Agent source is a wrapping text pill using the owned
gray surface tokens; it grants no authority. The source filter preserves the
chosen date and view, has 44px targets, and names the selected source with
`aria-current`. Delegated reads hide all booking actions. `ManageBooking` reuses
its receipt definition list for Source. These additions are default off under
`STRELVA_BOOKING_AGENT_VISIBILITY`; agent names are supplied at booking.
Local proof and remaining limits live in
[the #304 handoff](../product/streams/a1-agent-bookings-visible.md).

### Agency check attribution (October 7, local)

`AiVisibilityPage`, `AiVisibilityResultView`, and `WebsiteAuditPage` retain their
owned forms/result geometry and semantic marketing tokens. Public attributed
results add name-only agency identity, neutral provider advice and an agency
contact CTA. Embed routes compose those same components without account chrome.
The shared email layout retains optional `preparedBy` compatibility; absent identity
retains the existing Strelva logo markup. The agency brand contract below owns rich identity.
The agency prospects page uses a semantic table, scoped to direct agency members.
See [the stream contract](../product/streams/a1-agency-prospecting.md) for flag,
state, permission and local-proof limitations; no visual acceptance or production
adoption is implied.

### October 7 public booking email confirmation

`/booking-confirm/[token]` uses the owned `Card` and `Button` primitives and
semantic canvas/text roles. Opening the page is read-only; the native form
POSTs to its action route. Expired/unavailable and rate-limit states keep the
customer from claiming a booking was made. This is local implementation for
#529; no production adoption or new visual-system decision is implied.

### Agency owner brand (#264, local implementation)

`OwnerBrandIdentity` accepts an authorized `OwnerBrand` presentation value. It
renders a bounded raster logo, wrapping name, optional reply contact and retained
"Runs on Strelva." credit. Any six-digit accent may fill the identity; black or
white text is selected at 4.5:1 minimum contrast. The sidebar `rail` variant uses
the owned surface and an accent rule, avoiding a second name/logo block.
`StrelvaShell.ownerBrand` supplies workspace identity; legacy tenant shells read
the authorized owner-brand endpoint. A changed workspace cannot reuse the last
workspace's fetched identity. Strelva controls and authority remain explicit.

`AgencyBrandEditor` composes owned `TextInput` and `Button` with native file input,
save/error status and preview. Only direct agency owners can persist a brand.
Public attributed audit/AI-check components and email layouts consume the same
presentation contract, retaining native identity without agency attribution.
R23 remains open: this implements brand presentation, not an accepted decision
to remove platform identity. See [#264 evidence and limits](../product/streams/a1-agency-brand.md).

## Responsibility proof, October 7, 2026 (local)

[ResponsibilityProof](../../src/experience/operations/ResponsibilityProof.tsx)
composes Card, Button and SelectInput with a semantic list and Did / Verified
pairs. Running and the agency Clients portfolio use the same receipt projection;
portfolio proof is loaded only when the assigned provider opens its disclosure.
Cadence uses the existing tenant report state and report transport. Google action
receipts distinguish matched read-back, accepted but unverified, held and failed;
a saved-source check never certifies the maintained responsibility. Review undo
opens the existing Google receipt and undo review and is shown only for an actual reversible
write. Loading, unavailable, empty, read-only and provider-only cadence states
retain native semantics; an unconfirmed mutation requires a reload. The guarded
`/preview/strelva/responsibilities` fixture exposes five mixed evidence states.
Local 1280px and 390px observation proves layout and fictional proof only; it
does not prove provider operation, email delivery or a maintained service promise.

### Public business evidence

`src/products/connected-sites/BusinessEvidence.tsx` renders the shared public
verification receipt inside the business page's existing Section. Linkage and
provider verification are separate states; unknown facts remain explicit. It
uses foundation typography/spacing tokens, with long URLs and agency names
wrapping. The doubly gated `/preview/strelva/agent-oauth?evidence=1` specimen
provides fictional populated/empty desktop/mobile proof; the native route and
JSON-LD contracts are covered by business-page/profile tests.

### October 8 private native Version review follow-through

`SystemVersionImprovements` reuses the owned Button and SelectInput for Inquiry
pattern and FAQ preparation. Conflicts identify the customer content and local/
source titles, not storage paths or raw JSON. Choosing content only stages the
native draft and routes to this business's existing Needs you review; it never
claims publication. Actual collaborative browser observation at1280px/390px
confirmed the review link, honest staged state and no mobile horizontal overflow.
These were fictional local data; native acceptance/readback and current-authority
checks are separate PostgreSQL proof. Generic native-app approval remains distinct
from Inquiry/website native publication. No new visual foundation was accepted.

## Private provider-change recovery (#293)

`ProviderChangeNotices` reuses Button, Card and TextArea. Its `canCancel` prop
is true only for a current direct business owner on the server page. Only an
unacknowledged `awaiting_policy` request offers Cancel; pending disables the
control, errors keep it retryable, and the cancelled row retains its receipt
display. Native SQL rechecks current owner and immutable history independently
of this presentation hint. The provider-change flag remains disabled by default.
The gated local provider-change preview uses fictional transport for interface
proof; it establishes no provider operation or hosted launch evidence.
### Agency client capability availability (October 8 local preparation)

`AgencyClientAvailability` composes the owned `SelectInput`, `TextInput` and
`Button` inside the existing client-row disclosure. The current ceiling,
verification requirement and System are shown before edits. Platform pause,
withdrawn permission, absent permission and failed current-access reads stay
visible; saves carry both revisions, retain errors, and provide an explicit
refresh. The development-only agency-release-flags fixture covers permitted,
empty, paused, unverified, ceiling withdrawal, conflict and read-error states.
No atom API or accepted material/type decision changed. Source/render evidence
is local preparation, not Jacob's visual acceptance or a deployed capability.
## People and access review (private candidate)

`src/experience/workspace/AccessReview.tsx` composes shared Button and semantic
sections/lists for the business review. Organization review uses active customer
mappings only to locate businesses with current direct membership; unavailable
businesses contribute a count, with no private details. Member views are read
only. Owners are protected. Provider seat removal is an access change; ending
the provider of record uses its notice protocol. Each available revoke is one
click and its success names the committed audit result. Loading, denied storage,
retry, unknown use and pending controls are explicit. The loader remounts per
workspace and review scope so a late response cannot update another business.

The development-only `/preview/strelva/access-review?state=ready` fixture supports
`organization`, `member`, `empty`, `loading`, `error` and `permission`. Its actions
change only fictional preview state. Native SQL and HTTP checks are separate from
this rendered proof. Historical last use is available for agent reads/proposals;
other access types show “Not recorded”. This is private local preparation, not
a production or customer-adoption claim.


## October 8 private canonical directory and neutral request preparation

`WorkspaceLayout` released All Systems uses the canonical spine identities, with
separate supporting Files. Directory search covers System name/detail/kind and
file title/evidence; pinned navigation remains independent. Empty and unavailable
registry states do not claim that no Systems exist. Website assignment handoff,
stopped reads and delegated/provider-seat views are retained. Existing work-row
composition is reused, with semantic sections and actual System links.

`WorkspaceHelpForm` and `OfferingInstallView` require an explicit agency choice
from the selected business's active seats. No platform designation orders or
selects a provider. Historical requests remain inspectable; platform support is
separate. `WebsiteEntry` keeps the owned SelectInput and intake controls, and reads
same-tab actor/business draft text without deleting it. Source/UI contract tests
are local proof; rendered desktop/mobile, native authority and combined release
checks remain pending the coordinated verification window.

## Private enterprise and licensed Home Finder preparation

`src/experience/enterprise/Units.tsx` composes the owned Button, SelectInput and
TextInput for explicit business/location/division/franchise hierarchy, edit,
archive and business-owned Version assignment. Member views remain read only;
structure conveys no membership or provider grant. Inaccessible Units show only
a count. Current owner/admin authority and parent business access are native
checks. Access review now locates directly accessible explicit Unit businesses
as well as legacy customer mappings.

`HomeFinder.tsx` provides draft installation, current provider readiness,
publish, pause, revoke, and license/display configuration renewal. Renewal pauses
new intake, clears qualification and invalidates old entry generations. Its
uncertain request preserves the exact command for retry. `HomeFinderBuyer.tsx`
provides licensed search, attribution, explicit buyer consent, uncertain-intake
retry and signed delivery receipt lookup. It uses the owned controls and never
labels queued delivery as delivered. The approved brokerage iframe receives a
scoped encrypted capability; current binding/lifecycle/license/grants remain
independent checks. An approved framing origin is contextual evidence, not an
identity credential.

`WorkspaceExit` shows Home Finder's retained accepted/unresolved obligations and
the need to obtain provider-held buyer content before the provider retention
window expires. Native export includes business-owned Units, assignments,
configuration and content-free receipt/audit outcomes through explicit field
allowlists; provider receipt capabilities, routing and buyer content are omitted.
These are implemented private contracts. Scoped tests/lint/typechecking establish
only their respective behavior; native SQL, rendered desktop/mobile states and
actual licensed provider journeys require separate proof. No new foundation,
material or composition direction was adopted.


### Prepared operator tenant-cleanup recovery (October 8, 2026)

`src/app/admin/tenant-cleanup/[id]/CleanupRecovery.tsx` composes the owned
`Button` and `TextInput` primitives inside the existing admin theme. It reads the
current native receipt through the super-admin GET and retries only its exact id
with typed slug confirmation. Loading, unavailable, missing, pending and complete
states remain distinct; complete receipts retain the retired-slug statement and
have no retry control. Unknown/rejected writes require a fresh receipt read.
The client editor links to recovery after a pending result; a missing tenant at
its original editor URL routes to the standalone page. No component primitive API
or accepted visual direction changes. Focused transport/authority checks pass;
actual Auth desktop/mobile reload/retry/screenshots are prepared, not observed.


### Public assessment keyboard recovery (October 8, 2026)

`AiVisibilityPage` and `WebsiteAuditPage` associate validation and request errors
with retained inputs. Invalid input carries invalid-field state; a server failure
describes the problem without declaring a valid address invalid. Pending and
completed assessments receive focus at their current heading. A failed or reset
assessment returns focus to the retained first field; initial render preserves
the visitor's focus. `AiVisibilityResultView` accepts an optional heading ref for
this handoff without changing other consumers. Reduced-motion loading indicators
use the existing motion utility. Focused unit and Chromium keyboard/recovery
checks cover these transitions. This is local rendered proof; screen-reader,
physical-device, other-browser and live-provider operation remain unproven.
