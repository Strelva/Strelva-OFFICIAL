# Motion foundation

One motion system for all of Strelva. Motion explains cause and effect; it
never decorates. Every movement answers: what changed, and where did it go?

Unified October 11, 2026. Before this, the board's F · Motion tokens (Oct 9)
and this file's roles (Oct 6) disagreed, and the code carried about 30
different durations, 6 curves, 3 spinners and 4 pulse styles. The ladder below
replaces all of them. The board (`F · Motion`, `lutct`, in
`design/Strelva-Reborn-UI-UX-2026-10-08.pen`) and this file now say the same
thing.

## Sources of truth

- [motion.css](../../src/app/styles/motion.css): the ladder, curves, distances,
  shared keyframes and the reduced-motion override. The only CSS file allowed
  to write a duration or curve.
- [motion.ts](../../src/platform/infra/motion.ts): the same ladder in seconds
  (`strelvaDuration`, `strelvaEase`) and the Motion presets built from it
  (`strelvaMotion`).
- [globals.css](../../src/app/globals.css) `@theme`: bare Tailwind
  `transition-*` utilities default to Fast + settle; `animate-spin` and
  `animate-pulse` use the shared loops.
- [check-motion](../../scripts/check-motion.mjs) (`pnpm check:motion`, in CI):
  fails on raw durations, curves, `duration-N`, `ease-*` or `transition-all`
  in product CSS and TSX, and on drift between motion.css and motion.ts.
  Delays are free (choreography offsets). Exempt: client website templates
  (`components/templates`, `components/public`, their own brand), legacy
  `/dashboard` (being removed) and `/pay` (live Stripe).
- [GooeyDisclosure](../../src/components/ui/motion/GooeyDisclosure.tsx),
  [Entrance](../../src/components/ui/motion/Entrance.tsx) and
  [CountUp](../../src/components/ui/motion/CountUp.tsx): the JS components.
- [Card comparison](../prototypes/atmospheric-launch/light-options.html):
  standalone study; it mirrors the gooey curve.

## The ladder

| Step | Time | Curve | Use |
| --- | --- | --- | --- |
| Press | 80 ms | settle | Buttons, keys, chips: scale to 0.98 while pressed |
| Fast | 140 ms | settle | Hover, focus, color, toggles, a 2 px card lift. Tailwind's default |
| Base | 220 ms | settle | Entrances (8 px rise), content swaps, panels, toasts (12 px rise), exits |
| Slow | 360 ms | settle or gooey | Sheets, disclosure, page-to-page, lines drawn on the map |
| Long | 600 ms | draw | Data ribbons, stems, counted numerals, marketing hero entrances |
| Hold | 800 ms | linear | Hold to accept; release drains the fill on Base |
| Stagger | 40 ms | | Between items in one group; items after the 6th arrive with the 6th |

Loops are only for state that is genuinely ongoing: 1200 ms (spinners, typing,
Down beacon), 1600 ms (skeletons, active step), 2400 ms (Live beacon halo,
gentle pulses), 4800 ms (decorative sweeps on marketing surfaces). Loops use
`--ease-breathe`; spinners use linear.

Curves: `--ease-settle` cubic-bezier(.2,.8,.2,1) for everything that moves
once; `--ease-draw` cubic-bezier(.65,0,.35,1) for marks drawing in;
`--ease-breathe` cubic-bezier(.45,0,.55,1) for loops; `--ease-gooey` (a
`linear()` with a 3.5% overshoot) for material shape only, never text.

Reduced motion: nothing travels, scales or loops. Every step becomes a 120 ms
crossfade (Press becomes 0), rise distances become 0 and press scale becomes 1,
so state changes stay visible. Decorative loops stop. Progress spinners keep
turning because they carry meaning. JS-driven motion (Motion, CountUp) snaps.

## Using it

- CSS: `transition: background-color var(--motion-fast) var(--ease-settle)`.
- CSS Modules hash bare animation names, so modules reference shared keyframes
  through name tokens: `animation: var(--kf-enter) var(--motion-base)
  var(--ease-settle) both`. Available: `--kf-enter`, `--kf-enter-float`,
  `--kf-enter-start`, `--kf-fade-in`, `--kf-breathe`, `--kf-halo`, `--kf-spin`.
  Stagger with `animation-delay: calc(min(var(--i, 0), 5) * var(--motion-stagger))`
  and set `--i` per item.
- Tailwind: a bare `transition-colors` (or `transition`) is already Fast;
  other steps are `duration-(--motion-base)`. Name the properties instead of
  `transition-all`. Global utilities `.st-enter` and `.st-fade-in` exist for TSX.
- Motion (React): `strelvaMotion.reveal`, `.draw`, `.drawShort`, `.count`,
  `.gooey`, `.settle`, `.exit`, `.press`, `.hold`; durations from
  `strelvaDuration`. No literal `duration:` numbers.

## Component choreography (kit)

| Component | Motion |
| --- | --- |
| Beacon | Halo scales 1 → 1.6 and fades; the core never moves. Live breathes every 2400 ms, Down every 1200 ms, Needs you pulses once on arrival (repeats with `pulse`), Draft never moves |
| Pill, segment, text button, row, send | Color and background on Fast; pressed scale 0.98 on Press |
| Step rail | Steps enter in order (Base, 40 ms stagger); the active mark spins on the 1200 ms loop; marks and the connecting line change color on Fast/Base |
| Change ledger | Header first, then lines enter in order (Base, 40 ms stagger) |
| Hold to accept | Fill grows linearly over 800 ms while held; release drains it on Base |
| Undo toast | Rises 12 px and fades in on Base |
| Composer | Edge and shadow respond to focus on Fast; the scope token slides in from the start edge on Base |
| Toggle | Track color and thumb travel on Fast |
| Skeleton | Breathes on the 1600 ms loop; still under reduced motion |

Not built yet (spec on the board): the hold label turning into a check, the
toast's 5 s countdown bar, the Before/After thumb, and the map storyboard
(line draws solid, draft ring becomes a live beacon).

## Roles kept from the October 6 contract

| Role | Behavior |
| --- | --- |
| Feedback | Fast (was 120 ms). Press scale is 0.98 (was 0.96). |
| Gooey disclosure | Spring, visual duration Slow (360 ms), bounce 0.16. CSS equivalent uses `--ease-gooey`. |
| Settle | Spring, visual duration Base (220 ms, was 280), bounce 0.08. |
| Exit | Base, settle. |
| Reveal | Opacity 0→1, y 8→0, Base (was 280 ms), settle, 40 ms stagger, cap 6. |
| Draw | Long, draw curve. `drawShort` is Slow for small marks inside a larger entry. |
| Count | Long tween from 0 or the last shown value, settle. Integers only; currency formats every frame. |
| Reduced | CSS: 120 ms crossfade. JS: immediate state. |

CSS and Motion curves share intent and timing, not identical physics. Spring
visual duration is not a fixed total settling time. Gooey is a deliberate
exception to a zero-bounce default, authorized by Jacob's explicit direction.

## Composition rules

Animate disclosure height and the material silhouette. Do not stretch text with scale, blur labels or apply a goo filter to a whole interactive subtree. Reserve expensive filters for bounded decorative layers. Continuous atmosphere keeps its existing pause/offscreen/visibility handling; it is independent of disclosure motion.

Use `initial={false}` to avoid animating initial layout. Keep controlled state as the source of truth. A rapid second click must retarget the current transition. Awaited Web Animations promises must handle cancellation. Closing must provide a restore path where the product allows it, and move focus to an available control before its trigger disappears.

```tsx
const [open, setOpen] = useState(true);
<Button type="button" aria-expanded={open} aria-controls="details" onClick={() => setOpen(value => !value)}>
  {open ? "Collapse details" : "Expand details"}
</Button>
<GooeyDisclosure id="details" open={open}>
  <div className="py-4">Content and actions</div>
</GooeyDisclosure>
```

GooeyDisclosure marks collapsed descendants inert and aria-hidden immediately. If closure can originate elsewhere while focus is inside, the caller must move focus to the disclosure trigger first. It does not own a close button, persist dismissal, or authorize destructive removal.

## Evidence and references

Context7 supplied Motion's [accessibility](https://motion.dev/docs/react-accessibility) and [layout-animation guidance](https://motion.dev/docs/react-layout-animations), plus MDN's [animation cancellation](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel) behavior. These guide the mechanism; they do not certify visual comfort.

Verify expand/collapse, rapid reversal, closing during a transition, restore, focus recovery and reduced motion. Inspect a narrow viewport and enlarged content. Do not call a CSS timing token a complete animation system: the reusable component must enforce semantics and interruption behavior too.

### Data-surface entrance (reveal, draw, count)

Added October 6 for the [outcome components](./outcome-components.md). The
roles live in `strelvaMotion.reveal|draw|count` and `strelvaEntrance` (in-view
amount 0.3, rise 8 px, stagger 40 ms, cap 6) in `motion.ts`, and as
`--motion-reveal`, `--motion-reveal-stagger`, `--motion-draw`,
`--motion-draw-ease` and `--motion-count` in `motion.css`, all zeroed under
reduced motion. `staggerDelay(index)` applies the cap.

- `useEntranceTrigger(ref)` returns `{ started, snap }`. `started` turns true
  the first time the surface is 30% in view and never reverts (no
  IntersectionObserver: next frame). `snap` is true under reduced motion or
  while the document is hidden. Pair it with `EntranceProvider`, or use the
  `Entrance` root. Outside any provider, consumers render their end state.
- `usePrefersReducedMotion()` is false on the server and during hydration, so
  markup matches; it updates right after. Motion's own `useReducedMotion`
  reads the preference on the first client render and caused a hydration
  mismatch in CountUp, so data surfaces use this hook.
- `Reveal` renders a motion `div|p|li|header|footer|span|tr` with the reveal
  role; `index` staggers within a group and `delay` offsets the group.
  `data-*` attributes pass through. Motion writes an inline `transform`, so
  never put CSS centering (`translate(-50%, …)`) on the same element: wrap it.
- `entranceTransition(state, role, delay)` returns the role with a delay, or
  the reduced role when snapping. Use it for draw (`pathLength`, `scaleX`,
  `scaleY`, clip width) and gooey pops.
- `CountUp` renders aria-hidden animated digits and an sr-only final value from
  the first render, so assistive technology never reads an intermediate number.
  It counts from the last shown value when `value` changes, rounds every frame,
  formats each frame (`formatInteger`, `formatDollars`), and snaps when the
  document hides mid-count.

Nothing loops. Content is in the DOM from the first frame; motion only changes
how it arrives. Verified locally on October 6 with Chromium at 1440 and 390 px,
with and without `reducedMotion: "reduce"`: no console or hydration errors on
`/preview/strelva/outcomes` and `/preview/strelva?outcomes=on`. Frame-by-frame
timing and physical devices were not checked.

### Logo entrance

`StrelvaLockup` opts into a single 750 ms sequence through `animated`: four cairn
stones settle from bottom upward at 60 ms intervals, then letters enter at 35 ms
intervals after 180 ms. Each piece lasts 360 ms using the gooey curve. Stone
stretch is restrained; letter geometry stays sharp and unscaled. Static by
default, pausable, replayable by remount, and immediate under reduced motion.
No looping or animated blur. Standalone Replay replaces the SVG node, preserving
CSS ownership of pause rather than overriding it through Web Animations playback.

### Lettering comparison

The logo switch now morphs seven solid SVG paths, replacing the earlier crossfade.
Fraunces weight 400 outlines were extracted from the bundled font, overlapping
contours were united, and outer contours and counters matched to the custom
lettering. Each contour has 200 corresponding points with matching winding and
aligned starting positions. `lettering-morph.json` stores those endpoints.

The engine uses a damped spring (stiffness 170, damping 22, unit mass) with a 24 ms
letter stagger. It preserves position and velocity on reversal, changes path
geometry without opacity tricks, and stops requesting frames after settling.
Reduced motion and hidden documents snap to the requested endpoint. Unmount
removes the frame callback and media/visibility listeners. Interaction motion is
separate from ambient Pause. The cairn remains fixed during the transformation.

`src/components/brand/lettering-morph.ts` is shared implementation; run
`node scripts/design/build-lettering-morph.cjs` after changes to update the
standalone study module. Font extraction used FontTools SVGPathPen and pathops
in isolated tooling, not added runtime dependencies. This animates these seven
letters only; it does not identify or construct a full font.
