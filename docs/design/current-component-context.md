# Strelva UI and UX system handoff

For token roles, atom contracts, recorded decisions and unresolved gaps, start
with the [foundation inventory](../component-system.md#start-with-tokens-and-atoms).
This handoff records component implementation; it is not a substitute for that
foundation or evidence of final visual acceptance.

Updated September 17, 2026. This is the implementation and evidence checkpoint for the card, color, typography, logo and motion work. Start with the foundation inventory when continuing it. It covers this design assignment, not the repository's unrelated product or release changes.

**Status:** shared foundations and documentation are updated locally. The newest background and logo interaction work in the study; the logo interaction also has a reusable React implementation. They have not been rolled out across the product or deployed. A working study is not final visual approval.

## Later foundation clarification

Jacob subsequently selected Geist Sans, custom logo lettering, prominent gloss,
selective atmosphere and both light/dark treatments. Current work is component
foundations only, with no page design. The
[completion specification](../component-system.md#foundation-completion-specification)
records proposed implementation and acceptance criteria. The source and tests
summarized below predate that migration; their Inter/Fraunces references describe
implementation history, not the newly selected typography.

## Direction and decisions

Scope includes shared product components, Home cards and the standalone study. Preserve the existing Strelva cairn and build around it.

The selected reference combines warm ivory lettering with deep ink, blue-green clouds, irregular moss light, fine grain and quiet dark areas. The source image's “Founders Grotesk-like” label does not establish an exact font. See the [reference and its interpretation](./character-atmosphere-direction.md).

The atmospheric material belongs to the card's own background. Use one continuous frosted, glossy surface, with sharp text and usable controls. Card content must not look like a second opaque card pasted onto a decorative poster. Default substantial cards have 24 px outer padding and 24 px corners; align header, description and footer to the same edges.

Light-mode cards need their own palette. Adjust the card, rather than changing the whole page to compensate for excessive brightness. Jacob explicitly requested pure white around the comparison cards; that choice is local to the comparison, not a product-wide canvas change.

Motion should feel gooey, with restrained overshoot and a stable endpoint. Preserve object identity, allow interruption, and respect reduced motion. For the latest logo request, the actual letter shapes must turn into one another. A font swap or crossfade does not meet that request.

### Rejected or superseded

- People / Decisions / Commitments filler as a default inset panel. It was removed from the active material study; details must serve actual content.
- Bright pastel light cards that were uncomfortable to view.
- Changing the entire screen to fix the cards.
- Treating Fraunces as an exact match for the supplied wordmark.
- Crossfading the old and new lettering. The current implementation changes vector outlines.
- Calling custom “Strelva” lettering a complete new font family.

Smoked glass, clear glass and matte mineral remain useful alternatives. The later atmospheric reference guides refinement but does not select every property of one earlier implementation.

## Implementation map

| Area | Current implementation | Adoption boundary |
| --- | --- | --- |
| Colors | Theme-aware foundation, paired foreground roles, workspace palette, status roles, card-local palettes | Shared code updated; client and marketing palettes remain separately owned |
| Button, IconButton, Card, Toggle | Shared geometry, states and semantic color roles | Available in product code |
| AtmosphericCard and content parts | Six cloud compositions, light/dark card palettes, pause and renderer lifecycle | Used by the workspace Home attention card and component preview |
| GooeyDisclosure | Controlled spring disclosure, inert closed content, reduced motion | Reusable React component and preview |
| Three card materials | Smoked, clear and matte alternatives on white | Standalone comparison; no selected material-style API |
| Card collapse, close and restore | Working comparison interactions | Close/restore is not an AtmosphericCard API |
| New ink/mineral background | Original animated shader, fine grain, optional orbital lines | Standalone variant 6; product API remains 0–5 |
| Cairn and custom lettering | Static lockup and optional one-time entrance | Reusable React component and study; existing app-wide logo callers unchanged |
| Old-to-new letter morph | Real outline interpolation, hover/focus reversal and touch toggle | Reusable React component, component preview and background study |
| Typography | Inter for UI; Fraunces remains the existing display face | Custom vector wordmark is not a replacement font for arbitrary headings |

The Home integration is [workspace/BusinessHome.tsx](../../src/experience/workspace/BusinessHome.tsx), not the older delivery Home study. Do not confuse historical delivery previews with current workspace ownership.

## Colors and surfaces

Use semantic variables rather than copied palette values. The default light foundation and `[data-dashboard]` dark foundation are surface contracts, not a newly implemented user theme preference. Card-local `theme` is independent of the surrounding page.

| Concern | Source |
| --- | --- |
| Shared foundation and aliases | [globals.css](../../src/app/globals.css) |
| Home and navigation palette | [workspace-colors.css](../../src/app/styles/workspace-colors.css) |
| Positive, warning, critical, informational and neutral meanings | [status-colors.ts](../../src/lib/status-colors.ts) |
| Atmospheric fill, text, border and focus roles | [atmospheric-card.module.css](../../src/components/ui/atmosphere/atmospheric-card.module.css) |
| Usage and foreground pairings | [Color system](../color-system.md) |

Use paired roles such as `accent` / `on-accent` and `action-danger` / `on-action-danger`. `critical` is not automatically a destructive button fill. Category colors do not indicate permission or success. Atmospheric content consumes its own `--atmosphere-*` roles.

The renderer must retain pause, offscreen/hidden suspension, reduced motion and fallback behavior. Keep expensive decorative work bounded. A blur or transparent fill still needs readable content over realistic backgrounds; token contrast alone cannot prove that.

## Components and geometry

The [component system](../component-system.md) owns the atom inventory, APIs,
geometry, examples and outstanding migration work. Inspect those contracts and
the actual source before composing a surface. This checkpoint does not duplicate
their measurements or certify that every existing primitive conforms.

## Logo and typography

The new wordmark is custom SVG lettering reconstructed from the supplied image. It contains seven letters, not a complete typeface. Inter and Fraunces remain the installed product typography. No font purchase or exact font identification has occurred.

| Artifact | Purpose |
| --- | --- |
| [StrelvaLockup.tsx](../../src/components/brand/StrelvaLockup.tsx) | Cairn plus lettering; static default; optional entrance and pause; compare mode supplies morphable paths |
| [StrelvaLogoSwitch.tsx](../../src/components/brand/StrelvaLogoSwitch.tsx) | Accessible old/new interaction and lifecycle |
| [StrelvaLockup.module.css](../../src/components/brand/StrelvaLockup.module.css) | Geometry, focus and entrance animation |
| [lettering-morph.ts](../../src/components/brand/lettering-morph.ts) | Shared spring engine and path interpolation |
| [lettering-morph.json](../../src/components/brand/lettering-morph.json) | Matched old/new contour coordinates |
| [Static lockup export](../prototypes/atmospheric-launch/strelva-lockup.svg) | Cairn and new lettering together |
| [Wordmark export](../prototypes/atmospheric-launch/strelva-reference-wordmark.svg) | Custom lettering without cairn |

`StrelvaLockup` inherits color; `--lockup-accent` sets the sage pebble. Static is the default for repeated cards and navigation. Existing `LogoMark` and `LogoFull` callers have not been globally replaced.

### Actual letter transformation

Fraunces appears at rest. Mouse hover or keyboard focus changes it into the custom lettering. Mouse leave and blur restore Fraunces. Touch and keyboard activation toggle the choice. The accessible button exposes its state through `aria-pressed`.

Seven opaque SVG paths change geometry, including their inner counters. The old outlines come from the bundled Fraunces at weight 400; overlapping contours were united before matching them to the new outlines. Each contour has 200 corresponding points. The serif tips retract, curves reshape and the “e” crossbar changes angle. The cairn and outer layout stay fixed.

The spring uses stiffness 170, damping 22 and unit mass, with a 24 ms letter stagger. Reversal keeps the current shape and velocity. The loop stops when settled; reduced motion and hidden documents snap to the requested endpoint. Cleanup removes animation frames and listeners. This explicit interaction is separate from pausing ambient motion.

Regenerate the study's JavaScript and initial SVG paths after changing the shared engine or endpoint data:

```sh
node scripts/design/build-lettering-morph.cjs
```

The generator also preserves visible initial lettering before JavaScript loads. The standalone CSS and static lockup export still mirror the React geometry and must be kept aligned when those change.

## Motion and UX behavior

[Motion foundation](./motion.md) owns the detailed contract. [motion.ts](../../src/lib/motion.ts) and [motion.css](../../src/app/styles/motion.css) define shared roles.

| Role | Behavior |
| --- | --- |
| Feedback | 120 ms; optional button press scale 0.96 |
| Gooey disclosure | 360 ms visual spring, bounce 0.16; CSS curve has restrained overshoot |
| Settle | 280 ms visual spring, bounce 0.08 |
| Exit | 220 ms withdrawal |
| Logo entrance | Single staggered sequence up to 750 ms; cairn bottom-to-top, then lettering in the ordinary lockup |
| Letter morph | Geometry spring described above; no opacity swap |
| Reduced motion | Immediate state change |

Spring visual duration is not a guaranteed total settling time. The morphing comparison retains the cairn entrance but replaces the ordinary letter entrance with its interactive outlines.

Keep labels sharp and controls available during animation. Do not apply a goo filter to an entire interactive subtree. A closed disclosure must not leave hidden focus targets. Move focus before removing its current target; close/restore should preserve a usable recovery path. Rapid toggles must retarget the current motion.

The component preview includes ready, empty, loading, unavailable and read-only examples. These are local fixtures, not proof that every product workflow has been reviewed. Existing permissions, publication approval and live-write boundaries are unchanged.

## Preview locations

| Preview | Use |
| --- | --- |
| `/preview/strelva/components` | Real React cards, states, shared controls, disclosure and logo morph |
| `/preview/strelva/colors` | Real color roles and controls |
| [reference-material.html](../prototypes/atmospheric-launch/reference-material.html) | Latest ink/mineral background, interactive logo and frosted card |
| [light-options.html](../prototypes/atmospheric-launch/light-options.html) | Three materials, collapse/close/restore comparison |
| [Material study](../prototypes/atmospheric-launch/index.html) | Six compositions and material controls |
| [Typography comparison](../prototypes/atmospheric-launch/typography-options.html) | Earlier type alternatives, retained as evidence |

Product previews require `STRELVA_UI_PREVIEW=1`. Serve `docs` for standalone pages. Session servers used ports 3299 for product and 4332 for docs; these are conveniences, not durable production URLs.

## Verification and its limits

Checks completed locally during this work:

- Foundation: TypeScript, targeted lint, two color unit tests and six atmospheric browser tests passed. The standalone material study passed nine behavior groups.
- Card comparison: collapse/expand/close/restore, interrupted motion, keyboard focus and narrow containment were exercised.
- Latest logo: both study and React preview were checked for changed path geometry, opaque intermediate shapes, settled endpoints, mid-motion reversal and reduced motion. Hover/leave, focus/blur, touch toggling and mobile containment also passed. TypeScript and targeted lint passed after the morph implementation.
- A persistent regression test now exists at [lettering-morph.spec.ts](../../tests/lettering-morph.spec.ts). Equivalent ad hoc browser checks were run; do not report that new test file as executed without running it.

Earlier contrast evidence is revision-specific: 60 product text boxes had a minimum 4.77:1 ratio; 144 standalone study text boxes had a minimum 5.92:1. An older 396-box measurement included the removed filler rows. These results do not certify the new ink/mineral shader, every animation frame, or visual comfort.

Physical-device GPU/battery behavior, screen-reader output, complete browser-engine coverage, full product journeys and final human acceptance remain unverified. No production result, deployment or live-data change is established by this work.

## Remaining integration and choices

1. Decide where the new logo interaction belongs beyond the study and component preview. Keep ordinary navigation static unless its behavior is deliberately changed.
2. Bring the selected ink/mineral material into the product renderer if chosen. Standalone variant 6 is not currently a valid product variant.
3. Choose final light-card treatment and measure its actual rendered text/control contrast.
4. Add product close/restore behavior only with explicit state, persistence and focus rules. The prototype is not that product API.
5. Apply the later Geist selection through the foundation's weight and legibility specimens. The custom lettering cannot typeset other words; searching for another display family is no longer a prerequisite.
6. Inspect affected product journeys and realistic states after adoption; obtain production authority separately before deployment.

## Supporting evidence

The September 18 [visual direction map](../../DESIGN.md#visual-direction-and-extension-map)
and [extension contract](../component-system.md#extending-the-foundation) connect
these studies to their owners and future adoption. They reconcile historical
font guidance without claiming the Geist or full component migration has run.

The governing direction is [DESIGN.md](../../DESIGN.md), with release and product context in [CONTEXT.md](../../CONTEXT.md). Supporting records include the [atmospheric contract](./atmospheric-component-contract.md), [verification record](./atmospheric-components-verification.md), [material references](./light-card-references.md) and [typography references](./frosted-typography-options.md).

Mobbin supplied inspected Craft and Linear examples; Context7 supplied Motion and MDN implementation guidance; component-source research informed earlier material work. The supplied image remains the visual reference for this revision. Reference evidence and technical feasibility do not substitute for Jacob's design choices.

## New landing-page application

A new intent-led landing study lives in the marketing repository at
`/preview/intent`, development only. It brings the atmospheric material and logo
morph into a user/agency audience switch, interactive intention-to-result
examples, and an agency client view. The existing homepage is unchanged. See the
[landing implementation and verification](../../../strelva-marketing/docs/design/intent-landing.md).

The subsequent `/preview/session` is Jacob's current landing direction: a sparse
charcoal composer, request-to-proposed-change flow and separate local business
briefs. It reuses the material and outline morph, with Mobbin composer evidence
and inspected 21st input source. The earlier intent study remains available.
See the [session landing handoff](../../../strelva-marketing/docs/design/session-landing.md)
for behavior, references, verification and the execution/account boundaries.

Jacob subsequently confirmed the session direction replaces the homepage. It now
owns `/` in marketing; the preview route is only an alias. Public routing, local
brief recovery and the retained `/explore` journey are recorded in the session
handoff. Deployment and signup-to-work continuity remain separate unfinished work.
