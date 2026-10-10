# Outcome components and their motion

Draft, October 6. Source design: `design/pencil/1.0/strelva-1-0.pen`, rows
"07 · ICP components v2" (layout) and "08 · Motion" (choreography). This file is
the contract both the Pen board and the code follow. Numbers in fixtures are
illustrative until the outcome loop (site → inquiry → reply → booking → review)
is joined; components must render honestly from whatever real data exists and
never invent a value.

## Why these components

The Sept 24 ICP research says owners are chosen by AI answers, win on reply
speed, are judged against a 4.5 rating, and often never log in. Each component
answers one owner question with a verdict first and one signature visual.

| Component | Owner question | Signature visual | Lives on |
| --- | --- | --- | --- |
| Loop ribbon | Did Strelva bring me business this week? | Tapering ribbon found → asked → answered → booked → earned | Home |
| AI mirror | What does AI say when people ask for a business like mine? | Real answer with my name highlighted and citations; queries × assistants dots | Website |
| Reply pattern | Are leads answered fast? | Week strip; each lead a pin whose height is minutes to reply | Inquiries |
| Rating trend | Am I above the line people filter on? | Line against a dashed 4.5 cutoff with the crossing annotated | Publishing |
| Sunday picture text | (owner never logs in) | Story-style picture message in the text thread | Phone, weekly report |
| Price sheet | What exactly am I saying yes to? | Bottom sheet over a preview of the thing being bought | Possibility, Make real |
| Location heatmap | Which location is slipping? | Locations × days tiles colored by reply time, verdict headline, one action | Agency home, multi-location Home |

## Honesty rules (from existing code)

- AI mirror follows `src/lib/ai-visibility-scorecard.ts`: only probed answers
  count; unprobed queries are never "not mentioned"; queries without a mention
  are omitted, never shown as missing. Today one assistant is probed (Gemini
  probe); the component renders one column per assistant that actually has
  data, so it works with 1 today and 4 later.
- Loop ribbon: a stage with no source renders "Not measured yet", not zero.
  "Found" is the only estimated stage and says so.
- Every number that comes from a receipt links to it when a link exists.

## Motion roles

Existing roles stay as defined in `src/lib/motion.ts` and `motion.css`. Three
roles are added for data surfaces. All share the rules: interaction or entry
motion explains, never loops, never delays meaningful content (the final value
is in the DOM from the first frame for assistive tech), and reduced motion
renders the end state immediately.

| Role | Use | Timing |
| --- | --- | --- |
| feedback | hover/press on tiles, pins, chips | 120 ms; tile lift y −2, pin r 5→7 |
| gooey | small pops: dots, pins, chips, sheet entry | spring 0.36 s, bounce 0.16 |
| settle | slide-to-confirm return, sheet rest | spring 0.28 s, bounce 0.08 |
| exit | dismiss | 220 ms, cubic-bezier(.2,.8,.2,1) |
| **reveal** (new) | entry of text blocks, cards, rows | opacity 0→1, y 8→0, 280 ms, cubic-bezier(.2,.8,.2,1); stagger 40 ms; at most 6 staggered items per group, the rest appear with the 6th |
| **draw** (new) | ribbon, line, stems, highlight sweep | 600 ms, cubic-bezier(.65,0,.35,1) |
| **count** (new) | headline numerals | 600 ms tween from 0 (or last shown value), cubic-bezier(.2,.8,.2,1); animated digits are aria-hidden, the final value is in an sr-only sibling; integers only; currency formats every frame |
| reduced | everything | 0 ms, end state |

Trigger: first time the component is 30% in view (`useInView`, once). Data
changes re-run only the affected part (count from the old value, redraw the
line). Hidden tabs and reduced motion snap to the end state.

## Choreography (t = 0 when in view)

1. **Loop ribbon:** header reveal 0 · five numerals count 0–600 ms, staggered 60 ms · ribbon draw as a left-to-right clip 120–720 ms · chips gooey pop at 600 and 760 ms · footer reveal 760 ms. Hover a stage: feedback, ribbon segment brightens.
2. **AI mirror:** header reveal 0 · answer card reveal 80 ms · highlight behind the business name draws left→right 360–720 ms · citation chips reveal from 720 ms, 60 ms apart · query rows reveal from 400 ms, 40 ms apart · dots gooey pop 30 ms apart by column.
3. **Reply pattern:** day bands reveal 0 · stems draw (scaleY from baseline) in arrival order, 20 ms apart, 200–900 ms · each pin gooey pops as its stem lands · callout reveal after the last pin (≈950 ms). Hover/focus a pin: feedback, tooltip with name, time, minutes to reply.
4. **Rating trend:** cutoff line and labels static · line draw 0–600 ms · area fades in 300–700 ms · points gooey pop following the draw, 60 ms apart · crossing callout reveal 700 ms.
5. **Sunday picture text (preview):** messages arrive in order: picture card at 0, each bubble 450 ms later; arrival = reveal with y 12 and gooey scale 0.96→1 · numeral on the picture counts during the picture's arrival · no autoplaying story progress.
6. **Price sheet:** sheet enters from y 100% with gooey · rows reveal 40 ms apart · slide-to-confirm: drag the knob; release past 85% settles to the end and commits; otherwise settle springs back. Keyboard and desktop use an equivalent button ("Build it for $120"); the slider is an enhancement, never the only path.
7. **Location heatmap:** headline reveal 0 · tiles fade from neutral to their color row by row, 15 ms apart (28 tiles ≈ 420 ms) · worst row's status dot gooey pops last · hover/focus a tile: feedback lift and tooltip with the day's reply time and receipts link.

## Color and type

Linen canvas `#F7F4EE`, ink `#121A16`, moss action `#3F5E43`, live `#5E8C55`,
aurora on ink `#A9C49A`, clay needs-you `#B4693F`, ink-moss panels
(`ink-moss.jpg` under `#0B110F` at 73–85%). Heat scale fast→slow:
`#3F5E43 #7FA374 #C9D6C3 #F1DCC9 #E3A983 #B4693F`. Numerals DM Sans weight 300
with tight tracking; verdict headlines weight 500.

## Implementation (October 6, local preview only)

Code: `src/experience/workspace/outcomes/`; motion primitives:
`src/components/ui/motion/Entrance.tsx`, `CountUp.tsx`. Inventory and
verification: [component-system.md](./component-system.md#outcome-components-october-6-local-preview-only);
motion details: [motion.md](./motion.md#data-surface-entrance-reveal-draw-count).

Where the boards and the rails disagree, the rails win:

- The AI mirror board draws hollow "not yet · possibility" dots. Those cells
  render empty and the legend has no such key, per the honesty rules above.
- The boards use DM Sans while the app's selected interface font is Geist.
  DM Sans is loaded for outcome components only; Geist stays global.
- "Wrong info · fixed" has no data source yet (the scorecard records mentions
  only), so the adapter never produces it; the fixture shows it.
