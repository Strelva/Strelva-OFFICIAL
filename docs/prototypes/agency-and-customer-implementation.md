# Agency and customer implementation interfaces

September 9, 2026. Implemented as local, development-only interface previews.
These screens are not production delivery software or an accepted service offer.

Jacob selected separate customer and agency experiences that can share deep
modules. Strelva supplies implementation for both audiences. Agencies maintain
their client relationships and commission work for those clients.

## Inspect

- Entry and links to related interfaces: `/preview/strelva/start`
- Agency: `/preview/strelva/agency`
- Direct customer: `/preview/strelva/client`
- Add `?state=empty`, `?state=read-only`, or `?state=unavailable` to either route.

Both routes require development mode and `STRELVA_UI_PREVIEW=1`. The server used
for this review runs on port 3117. Existing managed website and customer-access
previews remain separate destinations linked from the relevant screens.

The agency experience has Home, Clients, Requests, and Agency. The direct
customer has Home, Your software, Requests, and Your business. The interfaces
support scoped request drafts, request filtering, a sample implementation review,
feedback, and a recorded preview approval. No request, feedback, email, or approval
is sent externally. Saved drafts and reviews persist in browser local storage, separately for each audience and scenario. Drafts can be edited. Browser Back and request URLs restore the selected view; request URLs only resolve in the browser where the sample request is stored. Unsaved form text is not persisted. Storage failures retain the current draft in memory and explain the reload risk.

## Shared module boundary

[`request-session.ts`](../../src/experience/delivery/request-session.ts) accepts
explicit client IDs, read-only standing, and initial requests. Its two operations
are `beginRequestSession` and `applyRequestCommand`. It owns scope consistency,
draft validation, duplicate IDs, review eligibility, feedback validation, and
immutable updates. It does not interpret agency/customer labels, read the browser,
call a provider, or publish an implementation. An approval never changes a
request into a delivered or live resource.

[`preview-fixture.ts`](../../src/experience/delivery/preview-fixture.ts) supplies
sample audience contexts. [`DeliveryExperience.tsx`](../../src/experience/delivery/DeliveryExperience.tsx)
composes audience-specific navigation and content with the existing AppFrame.
The light palette is confined to this interface study; it is a proposed treatment
based on the supplied references, not a global design-system replacement.

This is an interface session module, not a server authorization boundary. A
production adapter must derive scope from authenticated membership and explicit
resource access. Never accept the browser's client-ID list as authority.

## Still required for production

Durable requests and attachments, server-derived permissions, request submission,
operator intake, accepted scope/price/timing, implementation evidence, versioned
review artifacts, governed approval/publication, delivery verification, and
service ownership are not implemented by this preview. Existing billing,
customer access, and website governance remain authoritative. Local URL navigation and reload recovery do not provide cross-device access or authenticated persistence.

The direct preview represents a business customer. Personal/free-user onboarding
and account switching continue to use the existing workspace interface; they are
not demonstrated by these two sample contexts.

## Verification

Eight focused request-session/storage tests, six Playwright journey tests, scoped ESLint,
and TypeScript checks cover the authored changes. The local browser audit checked
both audiences at 320, 360, 768, 1280, and 1600 CSS pixels; creation with a selected
client; filtering; failed feedback validation; recorded changes and approval;
empty, unavailable/retry, and read-only states; mobile navigation and Escape focus
restoration. No page errors occurred in that audit. The initial mobile navigation
visibility defect and inherited dark-theme collision were fixed and rechecked.

The earlier T3 collaborative-browser navigation failed with `chrome-error://chromewebdata/`
and automation errors, although local HTTP requests and local Chromium loaded
both routes. A subsequent T3 audit on September 9 reached the marketing page, entry, agency form, and customer request flow. Founder review remains outstanding. Local screenshots or automated checks do not establish production
behavior or replace that review.

Reproduce the focused journeys against a running preview server:

```sh
STRELVA_UI_PREVIEW=1 PLAYWRIGHT_BASE_URL=http://localhost:3117 pnpm exec playwright test tests/delivery-ui-preview.spec.ts
pnpm exec vitest run src/__tests__/delivery-request-session.test.ts src/__tests__/delivery-local-store.test.ts
pnpm typecheck
```

## Connected local review

Run the control plane with `STRELVA_UI_PREVIEW=1 PLAYWRIGHT_DIST_DIR=.next-local-review pnpm exec next dev --port 3117`.
In the sibling marketing repository, run `NEXT_PUBLIC_PRODUCT_URL=http://localhost:3117 NEXT_PUBLIC_STRELVA_UI_PREVIEW=1 PLAYWRIGHT_DIST_DIR=.next-connected-review npm run dev -- --port 3124`.
Open `http://localhost:3124`. Local marketing account CTAs open the interface chooser; the agency CTA opens the agency interface, and the idea form carries its brief into the corresponding request composer. This bridge requires development mode, an explicit flag, and a loopback product origin. Production account routing is unchanged.

The local store validates record shape, size, unique IDs, and fixture scope on restore. It is not a backend or an authorization mechanism. No migration or production release flag was changed.

## Business Home implementation — September 9

The selected business concept is implemented locally in
[`BusinessHome.tsx`](../../src/experience/delivery/BusinessHome.tsx) and
[`business.module.css`](../../src/experience/delivery/business.module.css).
Home has a typed request composer, suggestion controls, visual saved-work rows,
and a persistent business context panel. The business navigation includes Build,
Requests, Your business, Integrations, Help, and Settings. Existing draft creation,
editing, reload recovery and review rules remain shared with the agency interface.
The integrations surface explains its disconnected state and links to the existing
Google Business example or creates a connection-request draft. No provider connects
or publishes from this view.

The visual samples use copies of existing Strelva marketing artwork in the local
`assets/` directory. No generated full-interface image is used as a product surface.
The sample website remains labelled Example; no extra capabilities are marked Live.
Eight browser journeys (including the marketing handoff), eight focused unit tests,
TypeScript and scoped ESLint pass. Responsive browser checks cover 320, 360, 768,
1280 and 1600 pixels, plus read-only, empty, unavailable and storage-failure states.
The T3 browser audit inspected the implemented desktop and mobile Home and its composer journey;
T3 screenshot/resize intermittency is distinct from the passing Playwright journeys.
Production activation and authenticated implementation intake remain outstanding.

### Depth and interaction refinement

The next local polish pass adds a softly lit composer, larger layered request
thumbnails, an inset business panel, stronger selected navigation, and a distinct
review action. Hover feedback uses short transform transitions; reduced-motion
preferences suppress nonessential movement. Returning between views now resets
the content scroll and focuses the heading without scrolling the business title
beneath the header. Seven application journeys and the focused title-visibility
regression pass; the optional cross-repository marketing journey was not rerun in
this pass. TypeScript and scoped ESLint pass. Production remains unchanged.

### Sidebar and Strelva color treatment

The business sidebar now follows the selected capsule-navigation reference:
232px desktop rail, a translucent selected pill, larger cairn, and a softened
waterfront under the navigation. Pale sage and teal washes continue across the
business canvas with ivory work surfaces. Primary and secondary business actions
use the selected pill geometry. These are static color layers; no perpetual
animation is added. TypeScript, mobile-navigation and 320–1600px reflow checks pass.

The frosted-glass pass adds an inset rounded sidebar, blurred waterfront color,
light edge highlights, and translucent composer and business-panel surfaces.
Work rows retain solid readable fills. Reduced-transparency preferences switch
the glass surfaces to opaque fills. Desktop and mobile were inspected in the T3
browser; composer, navigation, and responsive Playwright checks pass locally.

### Business appearance

The local business interface supports System, Light, and Dark through Appearance
in the sidebar. The choice persists in browser storage; System follows device
appearance changes. Storage restrictions retain an in-memory choice for the
current session. Dark mode uses green-black surfaces, warm white text, pale sage
actions, and the existing waterfront beneath the glass. It covers the business
home, request forms, reviews, and supporting views; agency styling stays separate.
TypeScript, scoped ESLint, and four Playwright journeys pass, including preference
reload, system changes, and mobile access to the control. The T3 browser audit
covers desktop home and request creation plus the mobile drawer.

### Reduced business header

The business interface removes the breadcrumb/tagline bar and the local-review
strip. A compact navigation control remains above the work, including mobile
drawer access and desktop collapse. Business identity stays in the sidebar;
preview disclosure and interface links move to the footer. Eight local browser
journeys pass; the optional marketing journey is skipped. Desktop Requests and
the mobile navigation were inspected in T3.
