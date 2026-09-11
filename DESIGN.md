# Strelva product design

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

The local composition uses Home, My work, and Explore, with Help & service and
Account always reachable. Explore describes supported products and their actual
availability. This composition can change with evidence; the durable decision is
one environment for all customer relationships. Relationship labels do not
produce separate applications or unlock capabilities by themselves.

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
- Respect reduced motion. Motion explains entry, progress, or consequence; it does not loop for decoration or delay meaningful content from becoming visible.

## Product-specific prohibitions

- No drag-and-drop visual editor or client-facing code editor.
- No checkout or payment engine in the control plane. Client repositories or commerce providers own carts and charges; Strelva may surface the resulting commerce evidence.
- No self-serve provisioning unless a new founder decision explicitly reopens it.
- No tiered-pricing UI as a proxy for code feature flags.
- Do not make a workspace, catalog entry, or relationship label stand in for an
  entitlement or permission check.
- Do not imply that website builds, hosting, or ongoing management are free. The public audit may be free; the managed product is paid.
- Do not expose repository structure, agents, data models, governance internals, or a generic dashboard as the user's main product.
- Avoid raw black or white when a product token exists, one-off status hues, gradient text, decorative glass, purple-blue AI gradients, hero-stat templates, repeated icon-card grids, colored side stripes, bounce easing, and full pills on large controls.

### Business Home direction — September 9, 2026

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
