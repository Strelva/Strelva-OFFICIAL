# Motion foundation

Jacob requested gooey motion for the card system. The intended behavior is a soft, cohesive surface response with a short overshoot and a settled endpoint. Text stays sharp and controls remain usable.

## Sources of truth

- [motion.ts](../../src/lib/motion.ts): typed Motion presets for React.
- [motion.css](../../src/app/styles/motion.css): named CSS timings and an elastic easing curve, imported by globals.
- [GooeyDisclosure](../../src/components/ui/motion/GooeyDisclosure.tsx): reusable implementation and reduced-motion boundary.
- [Entrance](../../src/components/ui/motion/Entrance.tsx) and [CountUp](../../src/components/ui/motion/CountUp.tsx): entry choreography for data surfaces (reveal, draw, count).
- [Card comparison](../prototypes/atmospheric-launch/light-options.html): standalone close/restore and material-shape exploration. It mirrors the CSS curve because the docs server does not serve product source; keep those values aligned.

| Role | Behavior |
| --- | --- |
| Feedback | 120 ms; press scale remains 0.96 where enabled. |
| Gooey disclosure | Spring, visual duration 360 ms, bounce 0.16. CSS equivalent has a restrained 3.5% overshoot. |
| Settle | Spring, visual duration 280 ms, bounce 0.08. Available for returning material to rest. |
| Exit | 220 ms, cubic-bezier(.2,.8,.2,1); short opacity/shape withdrawal. |
| Reveal | Data-surface entry of text blocks, cards and rows: opacity 0→1, y 8→0, 280 ms, cubic-bezier(.2,.8,.2,1). Stagger 40 ms; at most 6 staggered items per group, the rest arrive with the 6th. |
| Draw | Ribbons, lines, stems and highlight sweeps: 600 ms, cubic-bezier(.65,0,.35,1). |
| Count | Headline numerals: 600 ms tween from 0 or the last shown value, cubic-bezier(.2,.8,.2,1). Integers only; currency formats every frame. |
| Reduced | Immediate state change; no spring, displacement or elastic shape. |

CSS and Motion curves share intent and timing roles, not identical physics. Spring visual duration is not a fixed total settling time. Gooey is a deliberate exception to the bundled skill's zero-bounce default, authorized by Jacob's explicit direction.

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
