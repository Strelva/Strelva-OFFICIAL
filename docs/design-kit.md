# Strelva Design Kit

This kit is the source of truth for Strelva product surfaces and tenant storefront direction. It is intentionally practical: ship clear, accessible, fast interfaces first, then add expressive details where they help the business feel specific.

## 2026 Design Position

Strelva should feel like a calm operating system for local businesses, not a generic AI landing page.

- Product UI is quiet, dense, dark, and operational. It should support repeated daily use, scanning, queue review, content editing, and owner approvals.
- Tenant storefronts are warm, visual, and brand-led. The first viewport should show the real business, product, place, result, or owner whenever content is available.
- AI should appear as transparent assistance: visible suggestions, receipts, provenance, change history, and clear owner approval states.
- Performance and accessibility are design requirements, not late QA. Target WCAG 2.2 AA and Core Web Vitals pass rates at the 75th percentile on mobile and desktop.
- Avoid trend-chasing. Use 2026 patterns only when they serve the product: adaptive layouts, restrained glass on overlays, bento-like information grouping for dashboards, CSS-first motion, explicit AI trust signals, and human brand texture in storefront imagery.

## Brand System

### Strelva Control Plane

- Mood: precise, restrained, capable, no-hype.
- Background: near-black product canvas with neutral raised surfaces.
- Accent: blue for system action and intelligence, green for verified success, red for destructive/risk states.
- Shape: compact radii, mostly `6px` to `8px`; full pills only for small controls, tabs, status indicators, and avatar-like elements.
- Typography: Inter for product UI. Use tabular or mono treatments for IDs, timestamps, metrics, and receipts.

### Tenant Storefronts

- Mood: premium small-business craft, not template SaaS.
- Background: tenant-specific tokens from the active template.
- Imagery: real services, people, place, menu/product, process, or customer result. Avoid vague atmospheric imagery when the business needs trust.
- Typography: template-defined pairing. Current default uses Instrument Serif for editorial display and Inter for body.
- Layout: strong first-viewport signal, visible next-section hint, mobile-first content order, and full-width sections rather than stacked decorative cards.

## Template Expansion Rules

- A Site Archetype supplies starting content and layout defaults; it is not the
  live Site Capability contract and must not be used as a permission gate.
- Reusable storefront behavior lands in `custom-repo-starter` first, then moves
  into client repositories. Client-specific integrations stay local to that
  Site Property.
- A fetched capability manifest is authoritative and subtractive. Do not expose
  an editor or agent action for a section the deployed repository omits.
- Add an archetype only after repeated delivery work proves stable structural
  reuse. Add a Feature Set only for a coherent capability bundle; do not create
  one as a visual theme or Commercial Plan alias.
- New Vertical operating depth is validation-gated. Wellness remains
  operational-lite until paid workflows prove a deeper class/member model.
- Preserve the additive `/api/v1` contract and legacy wire identifiers until a
  coordinated versioned rollout changes every consumer.

## Token Inventory

Tokens are defined in `src/app/globals.css`.

### Base Storefront Tokens

- `--cream`, `--cream-dark`, `--cream-mid`: warm page backgrounds and subtle section contrast.
- `--sage`, `--sage-light`, `--sage-dark`, `--sage-wash`: primary storefront action, focus, and soft tint.
- `--bark`, `--bark-light`, `--bark-faded`: body text, supporting text, and muted labels.
- `--blush`, `--blush-light`, `--terra`, `--terra-light`: warmth, warning, editorial accent, and destructive states.
- `--surface`, `--surface-base`, `--surface-raised`, `--surface-inset`: shared component surfaces.
- `--warm-white`: tinted high-contrast text/control fill, used where pure white would feel harsh.
- `--on-warm-white`: dark foreground for filled `--warm-white` controls.
- `--overlay-scrim`: tinted modal and drawer backdrop color.

### Dashboard Tokens

Apply inside `[data-dashboard]`.

- `--surface-base`: app background.
- `--surface`: primary panel background.
- `--surface-raised`: controls, popovers, cards, and elevated rows.
- `--surface-inset`: fields, wells, and preview containers.
- `--glass`, `--glass-border`: overlays and floating controls only.
- `--glass-active`: selected, pressed, or inline code/action backgrounds inside glass or raised surfaces.
- `--overlay-scrim`: modal, drawer, and mobile navigation backdrop.
- `--accent`, `--accent-dim`, `--accent-text`: primary product action and AI/system emphasis.
- `--success`, `--success-dim`: completed checks, healthy sources, and publish success.
- `--gray-*`: borders, muted text, separators, and inactive controls.

## Typography

- Product body: `Inter`, with compact sizes from `11px` to `15px` for dashboards.
- Storefront display: `Instrument Serif`, used for hero headlines, owner names, editorial breaks, and brand moments.
- Storefront body: `Inter`, used for navigation, body copy, controls, and form UI.
- Do not use viewport-width font scaling. Use fixed responsive steps, `clamp()` for true heroes only, and keep letter spacing at `0` except uppercase labels.
- Button and control labels must fit on mobile without horizontal scroll.

## Components

### Buttons

- Primary product actions use filled high-contrast buttons.
- Secondary actions use bordered or raised neutral surfaces.
- Destructive actions must be visually distinct and include confirmation for irreversible operations.
- Icon-only buttons require `aria-label`; use lucide icons where available.
- Minimum target size: `24px` absolute minimum, `44px` preferred for mobile or primary touch targets.

### Cards And Panels

- Cards are for repeated items, modals, receipts, queue entries, and framed tools.
- Do not nest cards inside cards.
- Dashboard panels should use compact density, visible separators, predictable headers, and stable dimensions.
- Storefront sections should generally be full-width bands or unframed constrained layouts.

### Forms

- Labels are always visible.
- Errors must be text, not color-only.
- Inputs need clear focus states and visible disabled/loading states.
- Avoid requiring users to re-enter information already known by the system.

### Navigation

- Dashboard navigation surfaces (from `getDashboardSurfaces` in `src/lib/dashboard-surfaces.ts`): Today, Ask Strelva, Website, Google Business, Analytics, Reports, Reviews, Settings. Conditional by tenant feature/connection state. Do not add new top-level surfaces without a matching entry in `DashboardSurface`.
- Tenant storefront navigation stays short. If a template needs more than five links, use grouped menus on desktop and a full-screen or sheet-style menu on mobile.
- Admin domains should route owners to dashboard surfaces, not public storefronts.

### AI Surfaces

- Every AI-generated change should show source/provenance, proposed diff or summary, risk level, and owner action.
- Auto-publish must remain off for first production tenants unless explicitly approved.
- Keep receipts and history accessible after an action completes.

## Motion

- Motion should clarify continuity: route entry, queue state changes, save confirmation, preview highlights, and drawer/menu entrance.
- Prefer CSS transitions and transforms. Avoid JS motion where CSS is enough.
- Always honor `prefers-reduced-motion`.
- Keep animation durations short: `150ms` to `300ms` for controls, up to `700ms` for storefront reveal effects.

## Accessibility Standard

Launch target is WCAG 2.2 AA.

- No mobile zoom lock.
- Visible focus states for all interactive controls.
- Text contrast should meet AA in normal, muted, disabled, and hover states.
- Do not rely on color alone for status.
- Interactive elements must be reachable and operable by keyboard.
- Images need useful alt text unless decorative.
- Dynamic status changes should be announced where they affect task completion.
- Authentication, access-request, and checkout flows must avoid cognitive-function tests unless an accessible alternative exists.

## Performance Standard

Core Web Vitals targets:

- LCP: `<= 2.5s`
- INP: `<= 200ms`
- CLS: `<= 0.1`

Implementation rules:

- Prioritize hero imagery with `next/image` and stable dimensions.
- Keep third-party scripts out of the critical path.
- Use server components by default; push client components down to the interactive leaf.
- Avoid layout shifts from late-loading media, banners, and embedded widgets.
- Use skeletons only where they preserve layout and task context.

## Per-Site Build Requirements

**Delivery model: every client site is a separate hand-built custom repo** (see `AGENTS.md` — `DEFAULT_DELIVERY_MODEL = custom_repo`; each paid client gets its own repo in `~/websites/`). This kit is the **craft standard each custom site is built against** — it is **not** a spec for the legacy platform-template system in `src/components/templates/`, which is **deferred** and must not be used as the model for new client work.

Every custom client site should cover:

- Header, footer, hero, trust/proof, service/product, story/about, contact, and final CTA patterns.
- A full color set with accessible text/background pairs.
- Strong first-viewport signal showing the real business, with a visible next-section hint.
- Mobile-first behavior for hero, navigation, forms, and booking/contact flows.
- A visual asset strategy grounded in the real business (see "Tenant Storefronts" above).

Business-type design references (starting points for a custom build, **not** platform templates):

- wellness / service: calm editorial, booking-led, owner-forward.
- food / DTC: product-led commerce, packaging, social proof.
- restaurant: menu, location, events, reservations.
- trades: urgent conversion, service areas, proof, contact.
- professional: trust, credentials, cases, consultation.

## Launch Acceptance

Before launch:

- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm audit`, `pnpm build`, `pnpm check:prod`, and `pnpm smoke` (smoke runs Playwright against the built Next app with `PLAYWRIGHT_BUILT_APP=1 REB_DEV_UNGATED_ACCESS=0` already baked into the `check:launch` script).
- Or run `pnpm check:release` for the same gate in one command (`lint + typecheck + test + audit + build + check:prod + smoke`, with `PLAYWRIGHT_BUILT_APP=1 REB_DEV_UNGATED_ACCESS=0` enforced).
- Verify dashboard desktop and mobile views manually.
- Verify at least one tenant storefront on mobile and desktop.
- Confirm marketing `/home`, `/access-request`, `/sign-in`, `/privacy`, and `/terms` are live.
- Confirm webhooks, cron auth, domain routing, preview framing, and tenant revalidation.
- Confirm this design kit and `docs/production-readiness.md` are updated with any launch-specific deviations.
