# Strelva product design

Start with [foundations, tokens and atoms](./docs/component-system.md#start-with-tokens-and-atoms).
Latest implementation handoff: [current component context](./docs/design/current-component-context.md).

## Visual direction and extension map

Reviewed September 18, 2026. This map connects the selected visual direction to
its implementation and review owners. It does not certify component completion.
Use the latest explicit decision within its scope; an older reference or an
extracted token value cannot override it.

| Concern | Current direction and scope | Owner and route to implementation |
| --- | --- | --- |
| Identity | Original cairn and custom Strelva lettering. The lettering is logo artwork, not a text font. | [Identity APIs and adoption](./docs/component-system.md#cairn-and-display-lettering); [existing mark](./src/components/Logo.tsx), [lockup](./src/components/brand/StrelvaLockup.tsx). |
| Typography | Geist Sans for interface and display text. Weight specimens remain reviewable; Inter/Fraunces describe legacy source and historical comparisons. | [Type roles and legibility](./docs/component-system.md#geist-weight-and-legibility-contract). |
| Color and themes | Semantic roles with independently finished light and dark treatments. Workspace, card and client scopes remain explicit. | [Color contract](./docs/color-system.md), which links the actual CSS owners. |
| Geometry and composition | Shared measurement roles; composition follows the task. Atmosphere, containment and expressive type do not prescribe one page template. | [Foundation geometry](./docs/component-system.md#geometry-and-interaction-detail) and the global design standard. |
| Material | Prominent gloss, selective bounded atmosphere and sharp content. Exact pigment, grain, reflection and light-card recipes remain reviewable. | [Atmospheric contract](./docs/design/atmospheric-component-contract.md), [material acceptance](./docs/component-system.md#material-contract). |
| Imagery and illustration | People, businesses, materials and evidence of work; unusual phenomena used sparingly. The world board leads, the earlier board supports atmosphere. | [Visual record and reference collection](./docs/design/strelva-visual-direction.md). |
| Motion | Named presets, interruptible disclosure and optional identity motion, with immediate reduced-motion states. | [Motion contract](./docs/design/motion.md). |
| Components and states | Real owned primitives, both themes, realistic content, semantics and recovery. | [Component inventory](./docs/component-system.md#atoms-to-inspect-before-composing-a-page) and [family acceptance](./docs/component-system.md#component-families-and-behavioral-acceptance). |
| Evidence and adoption | Source implementation, rendered proof, Jacob's visual acceptance and deployment are separate facts. | [Adoption record](./docs/component-system.md#adoption-work-and-completion-evidence), [dated verification](./docs/design/atmospheric-components-verification.md). |

Public composition is owned by [marketing DESIGN.md](../strelva-marketing/DESIGN.md).
Client brands remain owned by their repositories. Shared direction does not
authorize copying product palettes or assets into client work.

### Evolving the direction

Enhancements begin with the affected owner above. Record the concrete problem,
the intended visual effect and the surfaces it concerns. Keep the current
accepted treatment available beside proposed alternatives. Compare material,
type or composition with the same content and states so the difference is
judgeable. Explore without silently changing global defaults.

When Jacob selects a new aesthetic direction, record its date, scope, reference
and the earlier decision it replaces in the owning contract. Routine fixes
within an existing decision can proceed under the assignment's authority;
every adjustment does not require a new taste decision. Implementation extends
the owning token or component, then adds a specimen and relevant verification.
Track actual consumers in the adoption record. A successful study alone does
not replace the selected treatment or migrate a page.

The [extension record](./docs/component-system.md#extending-the-foundation)
defines what to retain with a change. The [visual review criteria](./docs/design/strelva-visual-direction.md#visual-review-and-extension)
cover identity, imagery, composition and material together. Tooling indexes such
as `.21st/design.json` route to these owners; extracted values are not a second
design specification.

## Latest foundation decisions

### September 20 horizontal workspace direction

Jacob selected a shared horizontal frame with the work itself in the main
surface and contextual instructions, changes and review beside it. Website,
inquiry and staff-application work retain their own useful interfaces within
that frame; website navigation must not become the global product navigation.
The Mooney Firm is the default example.

The latest visual direction uses neutral black, white and gray surfaces,
strong rounded panels and controls, and selective green for actions, selection
and meaningful status. Avoid an overall green tint. Retain the owned Strelva
mark and Geist typography. The generated concepts explore composition and
geometry; they do not replace component APIs or certify contrast or behavior.

The [website concept](./output/imagegen/strelva-horizontal-bw-green/01-website.png),
[inquiry concept](./output/imagegen/strelva-horizontal-bw-green/02-inquiries.png)
and [staff-app concept](./output/imagegen/strelva-horizontal-bw-green/03-staff-app.png)
record the latest exploration. [Generation prompts](./output/imagegen/strelva-horizontal-bw-green/prompts.md)
retain the constraints. These are not implemented screens. This selected page
direction supersedes the earlier foundations-only scope for this work; exact
component adoption and rendered acceptance remain pending.

Jacob selected Geist Sans for interface text, the custom Strelva lettering for
the logo, prominent gloss, selective atmospheric material, and equally finished
light and dark components. Current work is foundations and components only, with
no page design. See the [completion specification](./docs/component-system.md#foundation-completion-specification).

These decisions supersede earlier Inter/Fraunces font recommendations for future
Strelva UI. Existing source and historical studies have not been migrated by this
documentation update. Exact Geist weights and material recipes require rendered
component review; the specification records proposed starting weights.

## How to use this record

The global standard at `~/.codex/DESIGN.md` supplies starting measurements and
accessibility requirements. This file records Strelva direction; the foundation
inventory owns component routing and adoption status. Color, motion and material
contracts own their specific decisions. Source owns the implemented API.

Later explicit decisions supersede earlier guidance only within their stated
scope. Historical studies remain evidence. Atmospheric cards and gooey motion
are selected exceptions to older glass and bounce restrictions; neither is a
requirement for every surface. The current landing exploration uses no mock
imagery and must be rebuilt from the agreed atoms before further composition.
That does not remove imagery from every Strelva product.

Do not interpret a dated implementation handoff, generated image or passing test
as Jacob's acceptance of its aesthetic. Geist and the custom logo lettering are
selected. Exact weights, material recipes and motion placement remain open where
the foundation inventory says they need review.

## Selected typography and atmosphere reference, September 17

Jacob selected the [character typography and dark atmosphere reference](./docs/design/character-atmosphere-direction.md): warm ivory display lettering, deep ink/blue-green clouds, irregular moss light and fine grain. The reference's original font has not been identified; the later Geist and custom-lettering decision resolves the product typography direction. Preserve sharp product UI type and the original cairn. This guides the next card-material refinement, not a whole-page background change.

## Atmospheric components: latest clarification, September 17

Read the [atmospheric component contract](./docs/design/atmospheric-component-contract.md)
before building glass cards, blur materials or Strelva brandkit boards. It records
Jacob's original-mark requirement, 8 px grid, strict 24 px card padding/radius,
indigo/sage cloud reference, real animated material behind glass, light/dark
variants, rejected studies and local verification limits. For these
components it supersedes conflicting earlier atmosphere recommendations below.
It does not authorize changing public landing imagery placement or imply that
the laboratory study has shipped or received final visual approval.

## Component and motion foundations

Read the [component system](./docs/component-system.md) for reusable APIs and implementation status, the [motion contract](./docs/design/motion.md) for gooey disclosure and exit behavior, and the [color system](./docs/color-system.md) for palette ownership. These are the current implementation guides. The three card materials remain options until Jacob selects one; their close/restore demonstration is not yet a product card API.

## Current visual direction: September 16, 2026

Read the [Strelva visual direction and reference boards](./docs/design/strelva-visual-direction.md)
before creating Strelva imagery or changing its visual treatment. Both original
boards are preserved there. Jacob selected the second board as the stronger
reference: people, businesses, materials, and evidence of work establish the
world; unusual phenomena appear selectively. The first board remains an
atmosphere reference. Green objects should appear in roughly 10–20% of an image
collection as an initial editorial guide; literal stacked stones should be rarer.

Jacob clarified the landing-page treatment later on September 16: imagery belongs
in separate content regions, never behind text or controls. Use solid interface
surfaces. The supplied material-world board and ink-and-watercolor architectural
reference guide the imagery; see the [recorded clarification](./docs/design/strelva-visual-direction.md#landing-imagery-placement-september-16).

This direction refines the dark palette selected for Home on September 15 and
supersedes the September 9 ivory palette as the forward visual direction. It
does not replace the agreed navigation, product behavior, or accessibility
requirements. The boards establish art direction, not final tokens, fonts, copy,
or evidence of implemented screens.

### Home card backgrounds: September 17, 2026

Jacob selected [this frosted-card reference](./docs/design/references/strelva-frosted-cards-2026-09-17.png):
milky translucent outer cards, soft color fields behind them, fine bright edges,
and inset content in the original reference. The later atmospheric contract removes
automatic opaque inner panels; add detail containment only when the content needs it.
The reference establishes a material
and atmosphere direction, not approval of its copy or an exact palette.
Business Home uses dark translucent surfaces and fine borders. Its attention card now uses the shared AtmosphericCard renderer and full-card frost; the other Home surfaces retain their own quieter treatments.
Text and icons stay sharp. Nested rows do not add another backdrop filter.
Opaque fills remain available when filtering is unsupported or reduced
transparency is requested. This supersedes the decorative-glass prohibition
for these cards; the public landing imagery placement remains unchanged.

## User and result

Strelva gives people a result-first way to use products without becoming
technology operators. Everyone uses the same Strelva environment: free users,
paid users, agencies, managed clients, and enterprise members. People can begin
useful work or resume a result while keeping the business, site, customer, or
record it concerns explicit. A product may be public, private, managed, or
release-gated; availability is not authorization or installation.

The person using Strelva may be a User, Paid User, Client, or Enterprise member
in the selected account context. Those labels describe relationship and service
standing; they do not grant permission. A person can use a personal workspace,
belong to an organization, and receive separately scoped access to another
person's Work.

### One persistent interface

Jacob selected a common interface on September 7, 2026. The ChatGPT comparison
means an accessible entrance, familiar persistent navigation, and easy return
to work. It does not require a chat composer or conversation as the main object.
An assessment, website, or another supported result occupies the working area.

The shared navigation is Home, Work, Ongoing, People & access, and Settings.
New, Search, Explore offerings, and Help are utilities; personal Account stays
at the bottom. Settings concerns the selected business, not the person's
identity. Explore describes supported products and their actual availability.
Relationship labels do not unlock capabilities by themselves.

An agency's Home shows work explicitly shared with that agency, its clients,
and its private work. A person using a finished application can open its direct
link without the owner workspace. Internal administration stays separate from
both; ordinary delivery staff use their exact assignment links. Personal AI
access is issued beside the work it can read or propose changes to, not through
a duplicate workspace.

Opening a managed website retains the shared frame and adds contextual site
navigation, approvals, history, and settings. Ask Strelva remains available where
the governed website conversation exists. Do not show an unavailable discussion
panel around an unrelated result just to fill space. The internal operator
console remains distinct, and operator inspection keeps its actor and tenant
visible.

Use the shared frame for account, empty, loading, and recoverable error states.
Keep the navigation collapsible on desktop and accessible as a modal on narrow
screens. Changing the current workspace or website must keep its identity
explicit and discard stale responses from the previous context.

### Home as a view of the business

On September 14, Jacob selected an illustrated business at the center of Home,
with actual work arranged around it. On September 15, he retained the building,
the dark palette, and a restrained use of Motion. Home uses the shared navigation
described above. Home adds its own header, summary
cards, floating work cards, attention panels, and request field. Opening work
still uses the existing application and document routes. The shared business
illustration represents the selected context without pretending to depict the
customer's property. Strelva's mark can appear in the request field and small
supporting moments without replacing the business illustration.

Counts and attention come from the current workspace snapshot. Do not invent
revenue, activity, or opportunities to fill the view. On mobile, work cards become
a list beneath the illustration. Motion draws the relationship between the business and
its work, bridges filtering and layout changes, and acknowledges direct
interaction. It must respect reduced-motion preferences and must not turn real
business state into looping decoration. Existing data and permission boundaries
remain.

September 19 return-path refinement: work connected to an offering remains
available by its own title in Home and Recent work. An offering describes its
setup and responsibility without replacing the app or result as a destination.
Connected work opens the existing native view when that work is available to
the current business and actor. Missing work shows an unavailable state rather
than a raw resource identifier or an inferred access grant.

### Public discovery into business Home

On September 15, Jacob accepted the following public-entry interaction decisions
while reviewing [todo.md](./todo.md). These are agreed design direction, not
implemented or verified journeys. Public presentation belongs in the sibling
marketing repository; saved work and account continuation belong in the product.

- The visitor brings business context and discovers an opportunity. The entry
  has one field for a business name or website and a visible Connect a tool
  action. Search results show name, location and website together so the visitor
  can select the correct business.
- After identifying the business, open a preview of business Home with reduced
  controls before signup. Use the existing illustrated-business composition and
  dark palette, populated only with information actually found. Public business
  identification does not establish ownership or access to private work.
- Show a few readable opportunity cards beside the business. Each presents a
  specific proposed improvement and a small preview. Selecting one reveals why
  it appeared. On mobile, cards sit beneath the business illustration.
- Opening an opportunity puts it in the main working area while retaining
  business context and a clear return. A website improvement shows the current
  experience and proposed change, with explanation, adjustment and the next
  action beside the preview.
- Examples opens an interactive sample business using the same discovery
  experience. Mark it clearly as an example. Keep Use my business visible and
  carry the chosen area of interest into the visitor's business entry.
- Preserve progress through signup and return to the same result. Support Back,
  refresh and business corrections, and provide recovery when search or a
  connection fails. Detailed retention, connection, authentication and recovery
  states still need specification and proof.

Jacob also accepted these discovery and continuation interactions:

- Open the business view immediately while discovery runs. Show confirmed
  information as it arrives and add opportunities progressively. The visitor
  can correct information or explore an example while waiting. Do not block
  the view with an animation or invent a completion percentage.
- Put Edit beside a compact business summary. Corrections to the business,
  location, services or website update affected suggestions without restarting
  the journey or discarding the visitor's edits.
- Opportunities offer Explore, with quieter Not relevant and Already handled
  actions. Dismissal is reversible; an explanation is optional and can inform
  later suggestions.
- Connect a tool opens a searchable panel of supported connections. Selecting
  one explains its benefit and requested access before the provider flow.
  Return to the same business view afterward; cancellation preserves progress.
- Put the appropriate next action beside the preview: Try it, Connect to
  continue, Save this, or Ask Strelva to help. Explain requirements immediately
  above the action. Agency help opens an editable request containing the
  business and proposed improvement; submitting it does not establish acceptance.
- Keep a small What would you like to improve? field alongside opportunities.
  Open the interpreted request in the same working area. If Strelva cannot
  proceed, preserve the idea and offer a request-for-help path.
- Save my progress opens a focused sign-in/create-account view with a preview
  of what is being kept. Cancellation returns unchanged. Successful signup
  reopens the exact opportunity or draft. Necessary business selection happens
  in that continuation, without a generic onboarding tour.

Public navigation beyond Examples, offering detail composition, and supporting
public pages remain open. Exact retention limits, provider-specific flows and
failure/recovery states still need specification and proof. Do not mark full
checklist items complete from these decisions alone. Earlier research
recommending examples as the default entrance remains research; this accepted
direction makes business context the main entrance and the sample business an
alternate path.

### Managed presence remains a concrete product

The existing managed-presence product serves a local-business owner who wants a
useful site without becoming its webmaster. The owner should be able to see
whether the site is doing useful work, ask Strelva for a change in ordinary
language, understand what will happen, and receive honest evidence after the
change is live.

The Strelva operator manages many client sites. The operator needs to see which
client requires judgment, inspect the exact proposed action and its consequence,
and resolve the portfolio without losing tenant boundaries or pretending
unfinished work is complete.

The client owns their domain and content and can leave. The public site is a
separate hand-built client repository; the control plane manages content,
evidence, and governed actions without turning every client site into one
template. These commitments remain in force beneath the common product model;
they do not make a website or tenant requirement for general Strelva users.

## Product, Work, and specific thing

The product relationship is represented as follows; this is not a mandatory
sequence of screens or a requirement to begin in a catalog:

```text
Products -> Work -> specific thing
```

- **Products** are named, repeatable value systems. The current public first-use
  product is AI Visibility; managed presence remains the installed website
  product; other entries must state their availability and release gate.
- **Work** is the bounded result, draft, assessment, report, or governed action
  a person can create, inspect, save, share, or reopen in an explicit personal or
  organization context. Private Work is owned by that context, not by a browser
  payload or a public bearer URL.
- The **specific thing** is the business, site, customer-owned record, or other
  named subject the Work concerns. Context must be visible and must never switch
  silently. A managed tenant link is a server-authorized pointer, not a copied
  workspace record or a permission grant.

The product catalog explains what exists and what is release-gated. It is not an
entitlement table. Executing a product operation still resolves identity,
membership, delegated access, approval, billing, provider policy, and any other
server-side boundary that operation requires.

## Dominant loops

For a person using a product, the dominant loop is:

1. Begin a supported task from Home or Explore, or return to existing Work.
2. Name or select the specific thing the Work concerns.
3. Receive a usable result, with its ownership, evidence, and next action
   visible.
4. Save, reopen, share, or continue that Work only through the authorized
   context and product contract.

For a managed-presence owner, the dominant loop is:

1. See the current result and the next relevant action on Today, Analytics, Reports, Reviews, or Website.
2. Ask Strelva for a change or inspect work Strelva has prepared.
3. Review the exact consequence when approval is required.
4. See whether the action is pending, accepted, live, failed, or still unverified, with recovery available where the product supports it.

For an operator, the dominant loop is to open the work that needs judgment, inspect it in the context of the correct client, approve, dismiss, or repair it, and see the resulting state. Portfolio rollups support this loop; they are not the product by themselves.

## Product nouns and actions

- A **product** is a repeatable value system; a product entry is descriptive
  until its release, authorization, and installation gates are met.
- **Work** is the durable or active product result in the selected personal or
  organization context; a draft is not a completed external action.
- The **specific thing** is the explicit subject of Work, such as a business,
  site, or customer-owned assessment.
- A **tenant** is the control-plane identity for one managed client site.
- A **client site** is the public website in its own repository and domain.
- **Today** shows the owner's current proof and next action.
- **Ask Strelva** is the plain-language website-management surface.
- **Website** is the spine for site content, assets, history, and an applicable Store sub-surface.
- **Analytics** shows live or selected-period evidence. **Reports** holds written recaps.
- A **proposal** or **draft** is not a completed external action. An **approval** is the human decision authorizing a governed action.
- **What Strelva did for you** contains only work that actually became live; it excludes the owner's own edits and pending drafts.

Use customer language that names the result:

- “See what's working,” not “analytics dashboard.”
- “Tell Strelva what to change,” not “conversational CMS.”
- “47 people found you this week,” not “unique visitors: 47.”
- “Your weekly report,” not “automated insights.”

The assistant refers to itself as **Strelva**. The visible action is **Ask Strelva**, not “Ask AI.”

## Creative premise

The common product workspace is result-first: the Work and its specific thing
are the visual center, while product discovery and account context stay explicit
and quiet. The owner dashboard and operator console are a **restrained dark
operations room**: calm, compact, and legible enough for evidence, review queues,
settings, and site work. Display type gives the system a human editorial voice;
dense UI remains direct and quiet.

Production Strelva marketing is a separate repository. Marketing surfaces that remain here use a **restrained technical field system**: graphite, tinted rules, one green-cyan signal, warm-white primary actions, direct paths, and visible proof rather than generic AI spectacle.

Tenant storefronts are brand-led and visual. The client's real place, products, people, and materials should dominate; shared Strelva components provide reliable behavior without flattening clients into the control-plane brand.

## Official systems and references

- The common customer frame lives in [`StrelvaShell`](./src/experience/app-frame/StrelvaShell.tsx)
  and [`AppFrame`](./src/experience/app-frame/AppFrame.tsx). Workspace,
  managed website, and account views compose their content inside that frame.
- Dashboard tokens live in the `[data-dashboard]` contract in `src/app/globals.css`.
- Dashboard and operator primitives live in `src/components/ui/` and `src/app/admin/console.tsx`.
- Status colors map through `src/lib/status-colors.ts`; use the existing positive, warning, critical, and neutral semantics.
- [Color system](./docs/color-system.md) maps palette ownership, paired foregrounds, and local verification. Current Home and navigation colors live in `src/app/styles/workspace-colors.css`.
- Marketing tokens use the `--m-*` family and shared marketing button classes in `src/app/globals.css`.
- Tenant storefront theme variables and the public section components are the shared storefront foundation. A client repository may establish a narrower brand system for its own surfaces.

Use the existing tokens and primitives when they express the accepted direction. Change them at the narrowest scope when they force a wrong client or product decision.

## States and trust boundaries

- Show actual state: loading, empty, unconfigured, unavailable, pending, approved, dismissed, failed, accepted-but-unverified, live, and recoverable history where applicable.
- Do not turn a missing integration into fake activity or a “coming soon” promise. A relevant disconnected surface may offer a clear connect state; an irrelevant surface stays hidden.
- Never invent traffic, rankings, reviews, baselines, customer activity, competitive benchmarks, completed work, or provider confirmation.
- Preserve existing managed service and billing paths during the interface
  transition. A capability request is feedback, not an accepted delivery promise.
  Unknown capability, pricing, or paid allowance must remain explicit; navigation
  is not evidence that it can be purchased or executed.
- Keep product availability, Work ownership, and paid/service standing separate.
  A public trial or descriptive catalog entry must not imply a paid plan,
  managed installation, or completed provider action.
- Before approval, show the exact copy, fields, hours, destination, or other consequence that will be published. After an external provider accepts a non-idempotent write, represent read-back failure separately rather than inviting a duplicate retry.
- Keep tenant identity visible wherever an operator can act across clients. Client-safe summaries must not leak admin-only intelligence, secrets, or another tenant's data.
- Owner-facing review summaries present real positive evidence and constructive opportunities without shame. Urgent concerns and at-risk intelligence remain on operator surfaces.
- On the light sage accent, use the dark `text-on-accent` foreground. Use theme-aware text tokens on dark surfaces; do not assume white text is accessible.
- Respect reduced motion. Interaction motion explains entry, progress or consequence and never delays meaningful content. Bounded atmospheric material may animate under its pause, visibility, offscreen and fallback contract; this does not authorize arbitrary looping UI.

## Product-specific prohibitions

- No drag-and-drop visual editor or client-facing code editor.
- No checkout or payment engine in the control plane. Client repositories or commerce providers own carts and charges; Strelva may surface the resulting commerce evidence.
- No self-serve provisioning unless a new founder decision explicitly reopens it.
- No tiered-pricing UI as a proxy for code feature flags.
- Do not make a workspace, catalog entry, or relationship label stand in for an
  entitlement or permission check.
- Do not imply that website builds, hosting, or ongoing management are free. The public audit may be free; the managed product is paid.
- Do not expose repository structure, agents, data models, governance internals, or a generic dashboard as the user's main product.
- Avoid raw black or white when a product token exists, one-off status hues, gradient text, generic AI gradients, hero-stat templates, repeated icon-card grids and colored side stripes. Use glass and restrained spring motion through the atmospheric and motion contracts. Ordinary controls retain the shared geometry; the recorded business-composer exception does not make all large controls pills.

### Business Home direction — September 9, 2026

Historical decision: the palette below was superseded by the September 15 dark
Home direction and the [September 16 visual references](./docs/design/strelva-visual-direction.md).
Retain this record for the local preview's history, not as the palette for new work.

Jacob selected a warm ivory, ink-teal and muted-sage business interface with a
persistent text navigation rail, a central request composer and recent work,
and a business context panel. The business implementation is scoped to the
local `/preview/strelva/client` route; it does not replace the personal workspace
or agency composition. `src/experience/delivery/BusinessHome.tsx` and
`business.module.css` own the business composition and use the shared request
session and AppFrame. `delivery.module.css` scopes its shell refinements under
`businessTheme`.

Use the existing cairn mark, `font-display` for editorial headings, soft outlined
controls, restrained surface depth, and purposeful work thumbnails. The Buffalo
waterfront is a faint supporting detail, never a backdrop beneath essential work.
The business panel moves after the main work on narrower screens. Recent work
comes from request records; unsupported integrations remain explicitly unconnected.
Do not reproduce the concept image's illustrative live statuses as product facts.

The selected pill-shaped business composer is an explicit exception to the older
restriction on full pills for large controls. Ordinary controls retain 12px radii.

### Internal R&D identity — September 9, 2026

Jacob selected the three-ribbon spiral around a sage dot as the Strelva team's
internal R&D mark. The ribbons derive from the three pills in the main logo.
The standalone asset is [strelva-rd.svg](./output/brand-motion/rd/strelva-rd.svg);
its motion reference is the [20-second reveal](./output/brand-motion/v3/strelva-field-20s.mp4).
Use this mark for internal R&D materials. The existing three-stone logo remains
the main Strelva identity. This decision does not establish a public R&D product,
division, or commercial offering.

## September 17 homepage replacement

Jacob selected the session-led landing as the replacement public homepage. The
marketing repository owns `/`: one request composer, proposed change, business
context and the next useful action. Agency scope emerges through business context.
Earlier architectural and intent studies do not remain competing homepages.
The existing business explorer is retained at `/explore`, including legacy links.
This is a local implementation decision, not deployment authority or evidence
that arbitrary requests can execute. The [current handoff](../strelva-marketing/docs/design/session-landing.md)
and [public checklist](./todo.md#2-public-discovery-and-first-value) track proof and gaps.


## September 22 self-service workspace

The customer web application uses the persistent StrelvaShell/AppFrame across Home, New, native work and account/managed surfaces. BusinessHome is now a request-first working surface, not the illustrated scene. New, Search and Apps & templates are stable destinations. Native editors remain usable directly; conversation is an input, not a replacement for forms, records or previews. Agency website delivery remains distinct from a self-service website draft.

WorkspaceComposer owns the shared request editor. Actor/business-scoped session drafts retain words, not permission. Editing a request invalidates its previous proposal. Native products receive explicit continuation properties from experience adapters; they must not import experience state. Search displays every matching authorized item supplied to the shell and preserves its scoped query. This is not a new server-wide search index.

The template library contains curated native application schemas. Preview uses the actual recipient renderer with local-only test data. A private app is created through the existing native API; publication, access, stored records and version compatibility remain native responsibilities. Previewing does not publish, grant access, invoke a model or save test records. An unconfirmed create is never automatically retried. Desktop packaging remains future work; this change does not add a native desktop runtime.
