# Color system

Part of the [Strelva foundation](./component-system.md#start-with-tokens-and-atoms).
This document owns color scope and usage; the linked CSS owns runtime values.

The control plane has a default light foundation and a dark dashboard scope.
`[data-dashboard]` selects the dashboard palette. These are explicit surface
contracts, not a user-facing light/dark preference or an OS theme switch.

## Sources of truth

| Scope | Definition | Consumers |
| --- | --- | --- |
| Shared foundation | [globals.css](../../src/app/globals.css), `:root` and `[data-dashboard]` | Shared UI, owner dashboard, operator console, workspace |
| Illustrated workspace | [workspace-colors.css](../../src/app/styles/workspace-colors.css), imported by globals | Home, navigation, offering summaries, allowance panels |
| Atmospheric cards | [atmospheric-card.module.css](../../src/components/ui/atmosphere/atmospheric-card.module.css), card-local light/dark roles | AtmosphericCard and composed parts |
| Status meanings | [status-colors.ts](../../src/lib/status-colors.ts) | Positive, warning, critical, informational, neutral states |
| Retained marketing | `.marketing-root` in globals | Retained marketing surfaces in this repository |
| Client sites | [design-tokens.ts](../../src/lib/design-tokens.ts), template scopes and each client repository | Client-specific branding |

The production marketing repository and client repositories own their own
palettes. Do not apply dashboard color changes to them. The historical delivery
previews (`src/experience/delivery`) were deleted on October 6, 2026.

## Choose the role

Use semantic CSS variables or their `@theme inline` Tailwind aliases. Shared
surface roles are `surface-base`, `surface`, `surface-raised`, and `surface-inset`.
Use `warm-black` for primary theme-aware text and `gray-muted`, `gray-subtle`, or
`gray-faint` for supporting text. Those legacy names remain compatibility aliases;
`warm-black` becomes light text in the dashboard.

Filled controls need paired foregrounds:

| Fill | Foreground |
| --- | --- |
| `accent` | `on-accent` |
| `positive` or `success` | `on-positive` |
| `action-danger` | `on-action-danger` |
| `warm-white` | `on-warm-white` |
| `surface-popover` | `text-popover` |
| `surface-tooltip` | `text-tooltip` |

`critical` is a status/text role. `action-danger` is a filled destructive action.
Their values can differ so both jobs remain readable. Information labels use
`accent-text`, not the lighter solid accent. `control-thumb` supplies an unchecked
switch thumb; checked switches pair `accent` with `on-accent`.

Workspace `home-*` and `navigation-*` roles carry the October 6, 2026 workspace
(see below). Category colors distinguish work types; they do not
encode success or permission. Their definitions live together, while components
consume the role variables. Avoid copying raw values into another panel.

## October 6, 2026: linen workspace and ink rail

Jacob approved the Strelva 1.0 workspace direction on October 6, 2026 (design
references in `../.scratch/1.0/ref/`; Home is `TskaH`, the Needs you deck
`bWUbc`). It replaces the dark workspace content of September 15–17 inside
the customer workspace only. The tenant dashboard, operator console, client
sites and marketing keep their palettes.

StrelvaShell sets `data-workspace-theme="linen"` (the default `theme`). Inside
it the shared foundation roles resolve to linen, so components keep consuming
`warm-black`, `gray-*`, `surface-*`, `accent` and the status roles:

| Role | Linen value | Was (dark dashboard) |
| --- | --- | --- |
| `surface-base` (canvas) | linen `#F7F4EE` | `#0B0B0C` |
| `surface` (cards) | `#FFFFFF`, hairline `gray-border` `#121A1612` | `#151515` |
| `warm-black` (primary text) | ink `#121A16` | `#F4F4F5` |
| `gray-muted` / `gray-subtle` | `#666E64` / `#6A7268` | `#858585` / `#999999` |
| `accent` + `on-accent` (primary action) | moss `#3F5E43` with white (7.3:1) | light sage with dark ink |
| `critical` | `#A3341F` | terra red |

The ink rail (`navigation-*`): ground `#0F1714`, selected row `#1C2723`, ivory
text `#ECE6D8`, headings `#8A9187`, count badge clay. Inside the linen scope the
sidebar maps the shared tokens to these roles, so nested controls render on ink.

`home-*` adds the 1.0 roles: moss and pale moss (`#EDF1EA`, `#ECE7DC` on linen),
live `#5E8C55` (dots and bars; `home-live-text` `#4F7A47` for text), clay
`#B4693F` for needs-you marks with pale `#F6EBE2` (`home-clay-text` `#9A5530`
for text), aurora `#A9C49A` on ink, the ink-moss panel (`home-ink-overlay`
`#0B110F` at 82% over `public/images/workspace/ink-moss.webp`, ivory text,
glass chips `#FFFFFF14` with `#FFFFFF2E` edges and backdrop blur) and the dusk
band (`public/images/workspace/dusk.webp` under a left-weighted ink scrim). The
older `home-*` roles are remapped to their linen equivalents.

Two values differ from the design file on purpose. The design's muted
`#7D857A` and subtle `#9AA096` measure 3.5:1 and 2.4:1 on linen, so text uses
`#666E64`/`#6A7268` (4.8:1 and 4.5:1); the design values remain as
`home-subtle` and `home-faint` for marks that are not text. White on the clay
badge is 4.2:1, so the badge fill is the darker `#A95F37`.

The dusk band is only for Home's first screen. Ink-moss is only for what
Strelva is doing or did. The workspace face is DM Sans, scoped by the same
attribute; the rest of the app keeps Geist.

## Verification

Start the local fixture server with `STRELVA_UI_PREVIEW=1 pnpm dev` and open
`/preview/strelva/colors`. The page uses the real Button, Toggle, and status styles.
It is gated to local development by the same check as the other interface
previews. The page makes no provider calls or saved-work mutations.

Run:

```sh
pnpm exec vitest run src/__tests__/color-system.test.ts
STRELVA_UI_PREVIEW=1 pnpm exec playwright test tests/color-system.spec.ts tests/illustrated-home.spec.ts
pnpm typecheck
```

The source check catches undeclared CSS variable references and literal palette
values reintroduced into the current Home, sidebar, offerings, and allowance
styles. Explicit fallbacks and documented runtime variables remain supported.
It checks declaration presence, not every possible inheritance scope.

The browser check resolves the actual CSS colors and measures normal-text pairs
against the four supported opaque surfaces in both foundation scopes. It also
checks actual primary, contrast, and danger buttons at rest and on hover, plus
status pills including their translucent background composition. The minimum is
4.5:1. Disabled controls are excluded from that text gate.

These checks do not establish complete accessibility conformance, every gradient
or image-backed text region, every legacy preview, or any production result.
Changes to translucent panels still require rendered inspection with realistic
content underneath them. Client palettes need their own checks.

Card material themes do not change the surrounding page theme. Use `--atmosphere-text`, `--atmosphere-muted`, `--atmosphere-inner`, `--atmosphere-glass`, `--atmosphere-border` and `--atmosphere-focus` inside atmospheric cards. The pure-white comparison canvas is specific to the comparison page. See the [component system](./component-system.md) for implemented components and unselected material prototypes.
