# Atmospheric components: local verification

## September 18: REB foundation repair

Scope: the REB-owned shared field family, tabs primitive, component specimen and
font binding. Marketing and client repositories were not changed. The selected
Geist Sans direction is now implemented in REB through one Next font binding;
`--font-display` aliases the same family so existing display utility consumers
do not create a second font choice. The original vector logo remains artwork.

`TextInput`, `TextArea` and `SelectInput` now use the foundation's 12px control
corner, compact 14px/20px type role with a 16px narrow-input floor, 12px/16px
labels and explicit color/focus roles. Helper and error messages get generated
IDs, merge caller-provided descriptions, and set `aria-invalid`; error messages
are persistent alert content. Native disabled, read-only, ref and controlled
behavior remain available. `Tabs` now provides a roving tab stop, horizontal or
vertical arrow keys, Home/End, disabled skipping, automatic/manual activation
and optional tab/panel IDs. `TabsPanel` hides inactive content and removes its
focus target. The component reference renders these real atoms with helper,
invalid, read-only, disabled, long-content, keyboard and panel states in both
themes.

Evidence: `src/__tests__/component-foundation.test.ts` passes the server-rendered
field and tab/panel contract checks. The focused Playwright case in
`tests/atmospheric-components.spec.ts` covers generated descriptions, invalid
state, tab/panel relationships, roving focus, arrow navigation, End navigation
and inactive-panel hiding when the local preview flag is enabled. `pnpm
typecheck` passes. Browser evidence remains local Chromium-only and does not
close the broader consumer, screen-reader, exact-weight or Jacob visual-review
gates; the P5 todo remains open.

## September 18: visual direction structure

Scope: documentation and design-tooling source indexes only. The
[direction map](../../DESIGN.md#visual-direction-and-extension-map) now links
identity, typography, themes, geometry, material, imagery, motion, component
states and adoption to their existing owners. The
[extension contract](../component-system.md#extending-the-foundation) records
how a proposal reaches a specimen, implementation, review and named consumers.
The [visual review criteria](./strelva-visual-direction.md#visual-review-and-extension)
connect the imagery references with actual typography, material and composition.

Reconciled historical font guidance in product, marketing and the atmosphere
reference with the later Geist/custom-lettering decision. Refreshed `.21st`
source routing and explicitly labeled its old token extract as historical.
Original reference assets and existing runtime implementations were preserved.

Verification: inspected the complete change against pre-edit working copies,
checked local Markdown targets and new section anchors, parsed the tooling JSON
and checked its source paths, and ran `git diff --check` in both repositories.
Checked edited instructions for active retired-harness references. No runtime
code changed, so no browser, component-test or visual-acceptance result is claimed
for this update. Geist adoption, complete tokens/atoms, both-theme review and
cross-repository parity remain open in the foundation inventory.

## September 17 implementation checkpoint

September 17, 2026. Scope explicitly includes the product and standalone study. The six compositions remain alternatives for Jacob to judge.

## Product changes

The shared `AtmosphericCard` renders the project's original cloud shader behind real backdrop glass. Text and controls remain semantic DOM content. The material and frost cover one card with 24 px outer padding and corners. Content has no second padded glass wrapper. Light and dark palettes are defined separately. The Home attention card uses this material; its surrounding workspace stays quiet.

Shared buttons, icon buttons, cards and toggles now have consistent geometry, visible keyboard focus and reduced-motion handling. Home typography, mobile fields, spacing and adjacent offering/allowance cards were refined. Existing semantic color roles remain the color source of truth.

Local previews:

- `/preview/strelva/components`: six materials, both themes, ready/empty/loading/unavailable/read-only examples and shared controls.
- `/preview/strelva?scenario=business`: Home integration.
- `/preview/strelva/colors`: color roles and interactive states.

These routes require `STRELVA_UI_PREVIEW=1`.

## Evidence

- The atmospheric Playwright suite covers: rendering and pause, offscreen suspension, simulated persisted page lifecycle, context loss and restoration, responsive geometry, state examples, keyboard dialog recovery, reduced motion, no-WebGL fallback, shared control geometry, and live reduced-transparency/forced-colors fallback transitions.
- Both themes fit widths 320, 360, 768, 1280 and 1600 px without document overflow. Desktop and mobile renders were inspected.
- Two color browser tests and seven illustrated Home journey tests pass. Three additional owner preview checks pass, covering offering inspection, editor draft controls and permission failure.
- Nine focused unit tests pass across color-system, app-frame and workspace-home suites. TypeScript and targeted ESLint pass.
- The revised full-card frost was sampled beneath 60 text boxes across all six compositions and both themes, with a minimum measured contrast of 4.77:1 in the muted-light revision. These paused samples do not establish contrast for every animation frame.
- The [standalone study README](../prototypes/atmospheric-launch/README.md) records nine behavior groups and revision-specific contrast samples. Earlier 396-box samples include the removed context rows.

The product renderer caps the longest canvas edge at 640 px and targets at most 24 fps. It stops animation offscreen, while hidden, on manual pause and for reduced motion. Reduced transparency, forced colors, missing backdrop filtering or unavailable WebGL select fallback styling. These implementation bounds are not physical-device performance measurements.

## References and limits

The [Linear screen inspected through Mobbin](https://mobbin.com/screens/e88b6bd7-3d4b-4e1e-8cd7-a9d2a6852795) informed restrained hierarchy, not the cloud material. The [study attribution](../prototypes/atmospheric-launch/README.md#references-and-source-decisions) distinguishes adopted Aceternity gradient layers from the original shader. Motion accessibility and visibility documentation was retrieved through Context7.

Not verified: physical-device GPU/battery performance, actual browser-managed back/forward-cache eligibility, screen-reader output, exhaustive animation-frame contrast or all browser engines. Chromium media emulation does not establish operating-system behavior. No production deployment or live-data change was performed.

The September 17 refinement follows Jacob’s request for the background to be part of the card itself. `AtmosphericCardHeader`, `AtmosphericCardDetail` and `AtmosphericCardFooter` provide reusable content parts. The [Craft glass reference](https://mobbin.com/screens/9699c0b5-7476-4557-854c-ab9716307880) was visually inspected for milky tint and edge light; no Craft code or assets were copied.

The foundation update adds a sixth browser test for the shared gooey disclosure: interrupted collapse/expand, inert closed content, dialog focus recovery and reduced-motion collapse. See [motion.md](./motion.md) for the API and prototype boundary.
