# Strelva image briefs: foundations and product experience

Prepared September 18, 2026. Status: ready-to-use exploratory prompts; no images
generated from these briefs yet. The [work index](../../todo.md#image-generation-ready-to-prepare-not-yet-generated)
tracks the next comparison. These briefs apply the existing direction; they are
not a new product specification or a selected page design.

## Inputs and fixed direction

Read the [visual direction map](../../DESIGN.md#visual-direction-and-extension-map)
and [visual review criteria](./strelva-visual-direction.md#visual-review-and-extension).
Use the original references below, with their distinct roles. Absolute paths
can be obtained by resolving these links from this file. Inspect the attached
images before asking the generation tool to use or edit them.

| Input | Use | Do not infer |
| --- | --- | --- |
| [Character and atmosphere](./references/strelva-character-atmosphere-2026-09-17.png) | Ink depth, irregular moss/blue-green pigment, warm light and fine grain | A new font selection, orbital decoration requirement or page wallpaper |
| [Frosted card](./references/strelva-frosted-cards-2026-09-17.png) | Fine reflected edges and continuous frost | Mandatory nested opaque cards or accepted final palette |
| [World board](./references/strelva-world-2026-09-16.png) | Human work, materials and range of scale, if imagery is needed | Actual customers, production assets or a required green object |
| [Architectural illustration](./references/strelva-watercolor-architecture-2026-09-16.png) | Optional illustration technique for X2 | A required Buffalo building or background behind controls |
| [Original cairn](../../src/components/Logo.tsx) and [custom lockup export](../prototypes/atmospheric-launch/strelva-lockup.svg) | Identity source | Permission to redraw the logo from memory |

Use an inspected raster export of the exact lockup if the tool requires a raster
reference. Otherwise leave the logo position empty and composite the owned vector
during implementation. A generated approximation never replaces the source logo.

Geist Sans is selected for UI and display text. Raster text is an approximation;
font loading, measurements and accessibility must be verified in real code.
Use fictional sample content and label every product image “Concept · sample data.”
No live-provider connection, payment, accepted service or completed work should
be invented to make a screen look populated.

## F1: foundation comparison

**Question:** Can the same real component content feel distinctly Strelva and
remain clear in independently finished light and dark treatments?

Attach the character/atmosphere and frosted-card references. Use the exact logo
reference only if a verified raster/export is available. Generate one comparison
at a time; keep content and geometry constant when varying material.

```text
Create one high-resolution, straight-on component design comparison for Strelva.
This is a visual proposal, not a website, dashboard, device mockup or shipped UI.
Use two equal columns showing the same components in independently designed
light and dark treatments. Label them Light and Dark. Quiet white surround on
the light side; quiet graphite surround on the dark side.

Typography should approximate Geist Sans, with clear body/label/heading hierarchy.
Keep text sharp. Show one substantial card, one text field with its label and
helper, one primary action, one secondary action, a switch and a small status.
Use these exact short labels: Staff requests; Review a proposed change;
Request name; Add a short name; Review change; Keep editing; Notifications;
Draft saved. These are component specimens, not claims about real activity.

Use an 8px primary grid with 4px subdivisions. Substantial card padding and
corners are 24px; ordinary control corners are 12px. Generous readable control
text. Aligned content edges and plausible touch targets. These are visual
targets to verify later, not measurement claims about this image.

Prominent gloss is visible at rest through tint, depth, fine edges and soft
reflections. Atmosphere is selective and confined to the substantial card:
irregular ink/slate/blue-green depth and muted moss openings behind continuous
frost. Light material is independently tuned, quiet and comfortable; avoid
bright pastel glare. Content is on the same continuous surface, without a
second decorative card pasted inside. Smaller controls use quieter fills and
edges. Use sage for the primary action. Clear distinction between focus,
disabled and selected states if shown. No full-board wallpaper, invented logo,
serif UI font, neon gradients, cosmic rings, fake charts or decorative metrics.
Reserve a small blank identity area if an exact logo reference is unavailable.
Include a discreet label: Concept · sample data.
```

Compare a quiet glossy treatment and one with more visible bounded atmosphere
before increasing decorative detail. Review readability, light comfort, hierarchy
and relationship between controls and card. Motion must be judged later in code.

## X1: use a live application and review a change

**Question:** Can an owner keep using the delivered thing while understanding
and reviewing a proposed change? This studies an already selected product
principle; exact composition remains a proposal.

Use one fixed fictional business, **Alder Workshop**, and one app, **Staff
requests**, across all variants. The existing app has the fields Name, Request
and Needed by. Sample rows: “Maya / Replace workbench light / Friday” and
“Jon / Order gloves / Monday.” The owner requests “Add an urgency field.”
The candidate adds an optional Urgency choice. It has not been published.

Attach character/atmosphere only for material guidance. Where available, attach
a fresh screenshot of the real owner app as implementation evidence, clearly
separated from the visual reference. Do not use the employee view as owner UI.

```text
Design a straight-on desktop product-experience concept for Strelva, using the
fictional Alder Workshop business and its Staff requests application. The live
application is the main working area. Current fields: Name, Request, Needed by.
Sample rows: Maya / Replace workbench light / Friday; Jon / Order gloves / Monday.
The owner has asked: Add an urgency field.
The proposed change is optional Urgency; existing fields and sample rows stay.

Show a visible Live version and a separate Proposed change state. Review text:
Add optional Urgency. Existing fields unchanged. Keep the existing records visible.
Actions: Try with sample data; Keep editing; Review and publish. Nothing in the
image says the change has already been published or verified by a real provider.
Show a route to history and a clear way to leave review without losing the draft.

Use a quiet dark Strelva workspace, Geist-like typography, sage primary action,
clear text hierarchy and shared control geometry. Gloss is visible but restrained
in the working area. A single bounded atmospheric region may distinguish the
review area; keep dense records easy to scan. Preserve compact navigation:
Home, Work, Ongoing, People & access, Settings; New and Search as utilities.
Do not turn the screen into an analytics dashboard or require a chat transcript
to understand the result. No photography behind controls, invented pricing,
provider-connected badges, fake success metrics or new logo. Label the image
Concept · sample data. Apply exactly one comparison option below.
```

Generate separate images for a consequential comparison, rather than five tiny
screens in a collage. Append one option to the prompt:

| Option | Append to prompt | What Jacob can judge |
| --- | --- | --- |
| A: changes beside use | Keep the live app usable on the left; use a review panel on the right for the proposed field and its consequences. | Persistent use versus narrower working space |
| B: exact comparison | Open a focused review view with Current and Proposed app content side by side, followed by one action area. | Comparison clarity versus leaving the working view |
| C: rehearsal first | Show the proposed form with clearly labeled sample input and sample outcome; retain a compact list of exact changes beside it. | Learning by trying versus additional steps before release |
| D: changes on the result | Place the proposed field directly in an explicitly labeled draft preview; mark changed areas and provide a concise review summary below. | Direct understanding versus confusing live and draft states |
| E: version-led review | Show the current release and pending candidate in a short version rail; selecting the candidate opens its exact change and preview in the main area. | History and recovery visibility versus more visible version concepts |

After choosing a promising desktop composition, generate its narrow-screen
continuation as a separate image. Preserve the live/draft distinction and review
actions; do not merely shrink the desktop. A failure-state study should show
“Could not save your change” with the entered change retained and Retry available.

## X2: business Home

**Question:** Can an owner see what needs judgment and return to useful work
without learning Strelva's internal structure?

Use Alder Workshop again. Fixed content: one “Review urgency field” decision,
the live Staff requests app, a private “Opening checklist” document, and an
explicit empty ongoing-work state. Do not invent a recurring service or a
connection. This scene is a proposal based on current Home responsibilities.

```text
Create a straight-on Strelva business Home concept for the fictional Alder
Workshop. Show the business identity, one clear item needing the owner's decision
with action Review change, then direct entry to Staff requests and Opening
checklist. State No ongoing work yet. Provide a clear New action. Navigation:
Home, Work, Ongoing, People & access, Settings; New and Search as utilities.
Use Geist-like typography, sage actions, visible fine-edge gloss and selective
ink/blue-green/moss atmosphere confined to a card. Substantial cards have 24px
padding and corners; controls have 12px corners. Keep the main workspace quiet
and text sharp. Make actual work and its next action easiest to
find. Calm supporting chrome; no revenue chart, invented savings, decorative
activity feed or pile of identical cards. If a business illustration is included,
keep it separate from text and controls and subordinate to useful actions.
Keep an exact-logo area empty unless the owned mark is supplied. Use realistic
readable text and label Concept · sample data. Do not show a website installation
as mandatory for this business.
```

The current illustrated Home is the baseline. A quieter alternative may be
compared without declaring the illustration rejected. Judge the first action,
return to work, genuine empty state and narrow-screen reading order.

## Generation and review handoff

1. Choose F1, X1 plus its comparison option(s), or X2. Inspect and attach only the
   references relevant to that brief; retain their roles with the prompt.
2. Generate with the image tool and show every result inline in chat. A file path
   alone does not satisfy delivery. No images were generated during preparation.
3. Retain the exact prompt, reference paths and outputs in a dated study under
   the existing `docs/prototypes/` area. Keep original reference assets unchanged.
4. Record what Jacob selected, rejected or wants to combine in the appropriate
   [design owner](../../DESIGN.md#visual-direction-and-extension-map). No implicit
   choice of a new font, token, permission model or service promise.
5. Rebuild the selected treatment with real owned components, then verify
   behavior and accessibility. Images do not close the product checklist.

The earlier [brandkit v2 prompt](./references/strelva-atmospheric-brandkit-v2-prompt.md)
is historical: its Fraunces/Inter typography and default inset content do not
represent the current contract. These new briefs preserve the later decisions.
