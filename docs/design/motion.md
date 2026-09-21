# Motion foundation

Jacob requested gooey motion for the card system. The intended behavior is a soft, cohesive surface response with a short overshoot and a settled endpoint. Text stays sharp and controls remain usable.

## Sources of truth

- [motion.ts](../../src/lib/motion.ts): typed Motion presets for React.
- [motion.css](../../src/app/styles/motion.css): named CSS timings and an elastic easing curve, imported by globals.
- [GooeyDisclosure](../../src/components/ui/motion/GooeyDisclosure.tsx): reusable implementation and reduced-motion boundary.
- [Card comparison](../prototypes/atmospheric-launch/light-options.html): standalone close/restore and material-shape exploration. It mirrors the CSS curve because the docs server does not serve product source; keep those values aligned.

| Role | Behavior |
| --- | --- |
| Feedback | 120 ms; press scale remains 0.96 where enabled. |
| Gooey disclosure | Spring, visual duration 360 ms, bounce 0.16. CSS equivalent has a restrained 3.5% overshoot. |
| Settle | Spring, visual duration 280 ms, bounce 0.08. Available for returning material to rest. |
| Exit | 220 ms, cubic-bezier(.2,.8,.2,1); short opacity/shape withdrawal. |
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
