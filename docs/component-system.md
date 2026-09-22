# Strelva foundations and component system

Implementation checkpoint: September 17, 2026. Ownership and extension structure
reviewed September 18. This does not establish deployment or final visual approval.

The [visual direction map](../DESIGN.md#visual-direction-and-extension-map) owns
how identity, imagery, composition and component treatment fit together. This
file owns component contracts, extension and adoption, including gaps in source.

## Start with tokens and atoms

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
| Geometry | Substantial surface 24px padding / 24px radius; controls 12px radius; utility surfaces 8px. Compact surfaces may use 16px padding. | [Primitive geometry](../src/components/ui/primitives.module.css) implements button, card and toggle sizes. Atmospheric cards enforce 24/24 independently. These rules do not imply every region needs a card. |
| Color | Semantic surface, text, action and status roles; pair each fill with its foreground. | [Color system](./color-system.md) owns scopes and source links. Light foundation, dark dashboard, workspace and card palettes are different contracts. Marketing and client palettes remain separately owned. |
| Typography | Legible UI type; expressive display moments; shared hierarchy. Characterful ivory lettering is a selected reference, not a licensed typeface selection. | REB now binds Geist Sans once as `--font-body` and aliases `--font-display` to it in [layout.tsx](../src/app/layout.tsx) and `globals.css`. Marketing remains separately owned and is not changed by this slice. Custom logo lettering remains separate. |
| Type sizes | Global starting roles: metadata 12/16, compact 14/20, body 16/24, introduction 20/28, component 24/32, section 32/40, page 40/48, display 64/72. At most three sizes and weights per authored component. | These are font-size/line-height standards, not a complete implemented token API. Older dashboard CSS comments describe a denser hierarchy. Do not silently treat those comments or a generated image as a new global decision. Expressive type may exceed the scale through a deliberate role. |
| Icons | One family and consistent stroke; 16px small, 20px default, 24px prominent. | Shared examples use Lucide. `IconButton` requires an accessible label. Icon-only affordances still need usable hit areas. |
| Focus and targets | Visible 2px outline, 2px offset; 44px touch target preferred. | Shared controls implement focus geometry and coarse-pointer target expansion. This does not certify older fields, tabs or every consumer. |
| Motion | Gooey disclosure, restrained overshoot, sharp text, interruptible state changes, reduced-motion alternative. | [Motion contract](./design/motion.md), [CSS roles](../src/app/styles/motion.css), [React presets](../src/lib/motion.ts), and `GooeyDisclosure` own this. Do not substitute page-specific timing recipes. |
| Materials | Real bounded material beneath a continuous frosted surface; sharp content and fine highlights. | [Atmospheric contract](./design/atmospheric-component-contract.md) owns construction. `AtmosphericCard` provides six compositions. The newest ink/mineral study and smoked/clear/matte comparisons are not all product APIs or final selected materials. |
| Identity | Original cairn; preserve the established identity. | [StrelvaLockup](../src/components/brand/StrelvaLockup.tsx) and the letter-morph implementation exist. Custom seven-letter artwork is not a font for headings. App-wide adoption remains incomplete. |

The [global design standard](/Users/jacobrhinehart/.codex/DESIGN.md) owns the
starting measurement and accessibility rules. The source files linked here own
runtime values. This inventory does not create another token file.

### Atoms to inspect before composing a page

| Atom | Actual implementation | Status and use |
| --- | --- | --- |
| Button | [Button.tsx](../src/components/ui/Button.tsx) | Shared primary, secondary, ghost, danger and contrast variants; sm/md/lg; loading, disabled, focus, press feedback and static option. Sage is primary; contrast is an exceptional emphasis, not another default primary. |
| IconButton | [Button.tsx](../src/components/ui/Button.tsx) | Required `label`; sm/md/lg; default/ghost/danger; loading and disabled. |
| Toggle | [Toggle.tsx](../src/components/ui/Toggle.tsx) | Controlled switch, accessible label, on/off, disabled, sm/md, 44px minimum target. |
| Surface | [Card.tsx](../src/components/ui/Card.tsx) | Solid by default; padding none/sm/md/lg. Interactive styling alone does not supply link or button semantics. |
| Field family | [TextInput.tsx](../src/components/ui/TextInput.tsx) | TextInput, TextArea, SelectInput and FieldLabel now use 12px corners, compact 14px/20px type (16px on narrow inputs), 12px/16px labels and named color/focus roles. Helper/error content receives generated IDs, merges caller descriptions, and exposes `aria-invalid`; disabled/read-only native behavior is preserved. Consumer journeys remain only partly verified. |
| Tabs | [Tabs.tsx](../src/components/ui/Tabs.tsx) | Underline/pill/segment variants now share 14px/20px control type, a 40px minimum, roving tab stops, orientation-aware arrows, Home/End, disabled skipping, explicit automatic/manual activation, and optional tab/panel IDs. `TabsPanel` hides inactive content and removes it from the tab order. Existing consumers without local panels retain the API and need follow-up journey review. |

AtmosphericCard and its content slots compose these foundations. GooeyDisclosure
provides reusable disclosure behavior. Neither should replace the review of
basic text, fields, buttons, selection, focus and state.

### Inspect the existing rendered references

With the local preview flag enabled:

- [Color roles and controls](http://127.0.0.1:3299/preview/strelva/colors): light/dark surfaces, paired actions, supporting text, statuses, popover and tooltip examples.
- [Component gallery](http://127.0.0.1:3299/preview/strelva/components): materials, logo, disclosure and control states.

Port 3299 is the current local server, not a deployment contract. Source for the
[color reference](../src/app/preview/strelva/colors/ColorReference.tsx) and
[component reference](../src/app/preview/strelva/components/ComponentReference.tsx)
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
See the [marketing component audit](../../strelva-marketing/docs/design/component-system-audit-2026-09-17.md).

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
| Workspace shell stop state | [StrelvaShell](../src/experience/app-frame/StrelvaShell.tsx) and [StrelvaSidebar](../src/experience/app-frame/StrelvaSidebar.tsx) expose the optional `startDisabled` API. [WorkspaceLayout](../src/experience/workspace/WorkspaceLayout.tsx) uses it for an exited or unconfirmed workspace while keeping saved work and export links available. | September 20, 2026: `workspace-exit-ui.test.tsx` verifies the stopped banner, disabled New control, retained-work link and export link. The authenticated desktop/mobile reopening journey remains the product proof for this consumer. |
| Managed website editor fields and recovery | [ContentWorkspace](../src/components/dashboard/ContentWorkspace.tsx) composes [SitePreview](../src/components/dashboard/SitePreview.tsx), [PropertiesEditor](../src/components/dashboard/PropertiesEditor.tsx), [VersionHistory](../src/components/dashboard/VersionHistory.tsx), [PublishBar](../src/components/dashboard/design/PublishBar.tsx), and the shared [field family](../src/components/ui/TextInput.tsx). History recovery uses the draft boundary; mobile editing uses the same preview, fields and publish controls in a stacked layout. | September 20, 2026: `content-versioning.test.ts` and `site-editor-publish.test.ts` pass 23/23; `owner-journey-copy.test.ts`, `website-history.test.ts`, and `website-history-page.test.tsx` pass 19/19; isolated `workspace-ui-preview.spec.ts` passes desktop history recovery, 390px draft editing and 390px permission recovery 3/3 on port 3249. The focused browser check verified keyboard focus on the mobile field, the PublishBar and Save changes button within the 390px viewport, and a disabled publish control after a denied draft save. Screenshots: `/tmp/strelva-website-history-desktop.png`, `/tmp/strelva-website-editor-mobile.png`, `/tmp/strelva-website-editor-mobile-permission.png`. The browser fixture has no authenticated provider or live publish, and the preview iframe emitted a synthetic image warning; physical-device, screen-reader and production verification remain open. |
| Self-service website brief and artifact review | [WebsiteExperience](../src/experience/websites/WebsiteExperience.tsx) and its [visitor form selector](../src/experience/websites/WebsiteConnections.tsx) use the shared [field family](../src/components/ui/TextInput.tsx) and [Button](../src/components/ui/Button.tsx). The product-owned `WebsiteRecord` and `WebsiteArtifact` remain the lifecycle and preview authority; the customer component renders `candidate.preview.href` in an iframe and carries the candidate hash through approval and launch preparation. | September 20, 2026: `website-experience.test.tsx` passes 9/9 and `website-connections.test.tsx` passes 4/4. Coverage includes explicit source selection, connection failure/retry, empty/read-only states, response ownership, and saved-artifact reopen, exact candidate hash/revision actions, conflict-preserved brief, artifact failure recovery, permission state, late-response ownership and `/api/websites/{workId}` transport paths. Local authenticated desktop/mobile artifact proof is recorded separately; no provider launch or production publication is implied. |
| Generated client visitor forms | The starter [renderer](../custom-repo-starter/website-generation/renderer.ts) and exported [runtime](../custom-repo-starter/website-generation/renderer.mjs) own capability form layout and styling using the generated site's existing theme variables. This is a client-site renderer, not a replacement for REB field components. | September 20, 2026: the native booking Auth journey exports and builds the selected project, submits inquiries and confirms bookings on desktop, then changes and cancels at 390px. Rendered controls use full-width fields, visible focus and 44px minimum targets. Exact local captures and provider-fixture limits are in the horizontal acceptance ledger. |
| Tabs | REB Tabs.tsx. Shared variants implement a roving tab stop, orientation-aware keyboard navigation, disabled handling and optional panel relationships; the component reference uses actual tabs and `TabsPanel`. | Verify automatic/manual activation, selected tab stop, arrow/Home/End handling, panel relationships and visible focus in affected consumers; current local browser coverage is the component specimen, while route-like consumer semantics remain open. |
| Marketing primitives and composition | Marketing owns its components and CSS. Earlier audit findings must be rechecked against current code. | Adopt the agreed measurements and semantic roles at primitive owners; migrate page controls without breaking brief persistence, dialogs, keyboard or recovery. |
| Materials | REB owns AtmosphericCard; marketing has a separate implementation. Latest study variant 6 is not in the product API. | Choose any new material explicitly; record its implementation and consumers, and verify readability, pause, reduced motion and fallback. Similar-looking blur is not parity. |
| Font and identity adoption | REB now loads Geist Sans for interface and display roles through one Next font binding; the original vector lettering remains separate. The component reference renders the actual family in both theme modes. | Verify computed family after fonts load and review 400/500/600 weights on the actual materials. Marketing and client repositories retain their own adoption rows. |
| Rendered foundation reference | Existing colors/components previews cover only part of the system. | Show spacing/type roles and actual atoms with relevant states, not inline lookalikes. Verify desktop/mobile, keyboard, reflow and enlarged content. |

Keep completion scoped to named consumers. A repaired Button does not migrate all
native buttons, and passing component tests does not prove an entire page journey.
Record local checks with their revision and limitations in the existing
[verification record](./design/atmospheric-components-verification.md) or owning
feature handoff. Human acceptance and production release remain separate.

## Extending the foundation

Use the existing source owners and references. Keep changes small enough to
compare and reverse; an experiment should not silently redefine every consumer.

| Change | Extend here | Demonstrate here |
| --- | --- | --- |
| Semantic color or theme role | [Color contract](./color-system.md) and its linked scoped CSS | [Color reference](../src/app/preview/strelva/colors/ColorReference.tsx), including paired foregrounds and nested scopes |
| Shared spacing, type or geometry | [Token contract](#token-implementation-contract), then the scoped foundation implementation described there | Existing component reference with resolved values, long content and enlarged text; mark unimplemented roles as proposed |
| Control appearance or behavior | Existing [atom owner](#atoms-to-inspect-before-composing-a-page); preserve or explicitly migrate its public API | [Component reference](../src/app/preview/strelva/components/ComponentReference.tsx) using the actual component, plus affected consumer checks |
| Material | [Atmospheric contract](./design/atmospheric-component-contract.md) and its renderer/CSS; keep composition separate from material style | Existing material comparison first, then the real component in both themes, with fallback and reduced motion |
| Identity or motion | [Brand components](../src/components/brand/StrelvaLockup.tsx), [motion contract](./design/motion.md) and their source owners | Static and motion specimens at real sizes, interruption, focus and reduced motion |
| Imagery or composition | [Visual record](./design/strelva-visual-direction.md#visual-review-and-extension); the owning surface's design record | Relevant study or authorized surface with realistic content; component changes still go through their primitive owners |

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
  in the [existing verification record](./design/atmospheric-components-verification.md).
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
  [color-system.md](./color-system.md), motion in [motion.md](./design/motion.md),
  and material construction in the [atmospheric contract](./design/atmospheric-component-contract.md).

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

[DESIGN.md](../DESIGN.md) owns product direction. [Color system](./color-system.md) owns palette roles; [motion](./design/motion.md) owns animation behavior; the [atmospheric contract](./design/atmospheric-component-contract.md) records material decisions and rejections. Source code owns the implemented API.

| Component | Source | Contract |
| --- | --- | --- |
| Button / IconButton | [Button.tsx](../src/components/ui/Button.tsx) | Button variants primary, secondary, ghost, danger, contrast; sizes sm/md/lg; loading disables and sets aria-busy; `static` disables press scale. IconButton requires `label`. |
| Card | [Card.tsx](../src/components/ui/Card.tsx) | Default solid surface; padding none/sm/md/lg. md is 24 px padding/radius; sm is 16/16; lg is 32/24. `interactive` changes hover styling only, not semantics. |
| Toggle | [Toggle.tsx](../src/components/ui/Toggle.tsx) | Controlled checked/onChange, required accessible label, optional disabled, 44 px minimum hit height. |
| AtmosphericCard | [AtmosphericCard.tsx](../src/components/ui/atmosphere/AtmosphericCard.tsx) | Semantic section, ref forwarding, theme light/dark, numeric composition variant 0–5, contentClassName, optional controlled paused/onPausedChange. |
| AtmosphericCardHeader / Detail / Footer | [AtmosphericCardParts.tsx](../src/components/ui/atmosphere/AtmosphericCardParts.tsx) | Content slots inheriting card roles. Header accepts an optional decorative icon; caller supplies heading semantics. Detail is optional, never automatic filler. |
| GooeyDisclosure | [GooeyDisclosure.tsx](../src/components/ui/motion/GooeyDisclosure.tsx) | Controlled `open`, required `id`, children and optional className. Spring height, sharp content, inert when closed, reduced-motion support. |

Button minimum heights are 32/40/48 px with 24 px label line boxes and 12 px corners. Increase small controls to 44 px for touch. Shared geometry lives in [primitives.module.css](../src/components/ui/primitives.module.css). A visual Card does not turn a div into a link or button.

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
- Three material alternatives: smoked glass, clear glass and matte mineral exist in [light-options.html](./prototypes/atmospheric-launch/light-options.html). All remain candidates. Comparison uses a pure-white page at Jacob's request.
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

This adoption does not certify every legacy page control. The library supports four curated form/list templates, not arbitrary generated application code. Search is complete over supplied authorized items, not every provider's records. Session storage is continuity only and is cleared on sign-out. Request approval, budgets, external actions and publication remain server-enforced. The implementation and rendered evidence are recorded in [current component context](./design/current-component-context.md).
