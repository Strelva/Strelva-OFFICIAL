# Atmospheric component direction

Recorded September 17, 2026 from Jacob's instructions and the subsequent implementation review. Read this before building Strelva atmospheric components or generating a new brand board.

## Decisions to preserve

- Use the original cairn in `src/components/Logo.tsx`: three unequal, tilted stones and one circle. Do not replace it with the symmetrical mark produced by image generation. Use the existing lockup in production; a generated wordmark is not a new identity asset.
- Latest typography decision: Geist Sans for interface text and the custom Strelva vector lettering for the logo. Earlier Inter/Fraunces studies remain historical evidence; they are not the future font contract. Preserve the original cairn.
- An 8 px base grid. For these atmospheric cards: strict 24 px outer padding and 24 px corner radius. The latest clarification makes frost and clouds one continuous card background, with no second padded glass card inside. This is a card-specific requirement, not an instruction to add padding or 24 px radii to every row, icon or control.
- Indigo and blue-gray depth with irregular moss/sage openings. The supplied watercolor crop guides pigment, layering and uneven edges. Do not use the old architectural painting as page wallpaper or as a literal image behind interface content.
- Build a real material behind the translucent card. Glass must visibly blur that material while text, icons and detailed inner content remain sharp. A gradient border or an opaque panel on a decorative poster does not satisfy the request.
- Keep the surrounding product canvas quiet. Contain atmosphere in the relevant card/material region; do not spread it across every work surface.
- Finish independently tuned dark and light palettes to the same component standard. Gloss is prominent in both; atmosphere is selective. Light mode is not a filter inversion.
- Provide 4–6 working animated options. The current six are explorations, not a final selection.
- Launch art should evoke an unusual phenomenon, anticipation, slight unease and the sense of a consequential arrival. Jacob referred to the earlier K23 direction; its named source was not recovered. Do not invent a claim that a particular board reproduces it.
- Use Context7 for implementation documentation and 21st.dev for actual existing component source. Read and attribute the source; distinguish code adopted from visual references inspected. Do not claim an original shader came from 21st.dev.
- Consider `tw-easing-gradients` for eased color/alpha transitions in Tailwind. It is not a cloud generator. It was reviewed, not installed in the standalone study.

## Rejected or unapproved

The clean diagonal beam, eclipse ring and geometric light studies missed the supplied cloud material. Their generated launch board was rejected. Do not promote those artifacts back to the primary direction.

The replacement cloud study demonstrates a mechanism and six compositions. It does not establish that Jacob approved the final cloud density, palette values, copy, layout or typography. A new brandkit board is a proposal, not proof of implemented pixels or approval.

## Component construction

1. A bounded, clipped material container owns the atmosphere.
2. A moving cloud material and blended light layers provide depth behind the card.
3. A full-card tinted glass layer uses backdrop blur, soft reflection and an edge highlight, with a readable opaque fallback. Content shares the outer 24 px safe space.
4. Detailed content can use a more opaque inner panel without a second backdrop filter.
5. Text and controls remain ordinary semantic DOM elements, not pixels painted into the background.

The study's Remove glass, blur and pause controls expose these layers for inspection. Production controls should serve the product task; do not ship laboratory controls indiscriminately.

Motion must pause manually, offscreen and when the page is hidden. Reduced motion retains a static composition. Cap resolution and frame rate; profile on representative devices before claiming performance. Preserve usable content if WebGL or backdrop filtering fails. Measure contrast across changing frames and both themes, not just one favorable screenshot.

## Audit findings resolved locally

The explicitly invoked Web Interface Guidelines review identified these ten issues. All ten were fixed and checked locally on September 17, 2026; the executable checks and their limits are recorded in the study README. The locations below refer to the original review.

| Location in `docs/prototypes/atmospheric-launch/` | Required follow-up |
| --- | --- |
| `cloud-material.js:69` | Cache dimensions from ResizeObserver; stop measuring layout every rendered frame. |
| `cloud-material.js:85` | Restore renderer resources and observers after back/forward-cache return, or avoid destroying them for persisted pagehide. |
| `cloud-cards.css:4` | Wrap long context strings; browser inspection confirmed overflow. |
| `cloud-cards.css:4` | Give Inspect a visible hover state that survives the component background override. |
| `atmosphere.css:3` | Add link hover feedback and balanced heading wrapping. |
| `atmosphere.css:12` | Contain dialog overscroll. |
| `study.js:13` | Make theme, selected material and blur settings shareable through URL state. |
| `index.html:4` | Preload the critical local font and provide theme-aware browser theme-color metadata. |
| `index.html:16` | Add a skip-to-content link and its destination. |
| `index.html:23` | Correct the recipe: motion includes a shader; displayed blur must match the current setting. |

Review source: [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), fetched September 17, 2026. The review was not a complete WCAG audit.

## Evidence and handoff

- [Executable study](../prototypes/atmospheric-launch/index.html)
- [Implementation, source attribution and local checks](../prototypes/atmospheric-launch/README.md)
- [Brand-system history](./strelva-brand-system-2026-09-17.md)

The study has nine local Chromium behavior groups. Contrast results are revision-specific; the earlier 396-box samples include content that has since been removed. Product integration includes the shared AtmosphericCard and Home attention card. See [product verification](./atmospheric-components-verification.md) for scope, checks and remaining limits. These are local results; no deployment was performed.

## Building new cards

Compose `AtmosphericCard` with `AtmosphericCardHeader`, `AtmosphericCardDetail` and `AtmosphericCardFooter` from `src/components/ui/atmosphere/`. These parts inherit the material palette. Supply semantic headings, content and actions; keep detailed content in the optional opaque detail surface. The component gallery uses all three parts. The frost spans the entire card, including its motion control.

```tsx
<AtmosphericCard theme="dark" aria-labelledby="review-title">
  <AtmosphericCardHeader icon={<FileText size={20} />}>
    <h2 id="review-title">Ready to review</h2>
  </AtmosphericCardHeader>
  <AtmosphericCardDetail>Draft content and supporting detail</AtmosphericCardDetail>
  <AtmosphericCardFooter>
    <span>Nothing published yet</span>
    <Button onClick={openDraft}>Review draft</Button>
  </AtmosphericCardFooter>
</AtmosphericCard>
```

Set content spacing through `contentClassName`. Do not add another translucent background or backdrop filter to the content wrapper. Reuse `--atmosphere-text`, `--atmosphere-muted` and `--atmosphere-inner` for content roles.

## Light-mode iteration history (not a selected palette)

Jacob requested distinct light backgrounds after reviewing the dark-led treatment. Light mode now uses a pale ivory ground, broad low-frequency pigment washes and per-material sage/sky, blue/pearl, lilac/sand, turquoise/sage, cream/gold and silver-blue palettes. It has a separate shader color/composition branch, lighter glass tint, daylight scrim and subtle shadow. Dark materials retain their existing composition. These are implemented alternatives for review, not a recorded final palette selection.

Jacob rejected the bright daylight revision as uncomfortable to view. The subsequent light treatment lowers the canvas and material ground to muted gray-green, reduces the pigment range, removes sharp cloud openings from the light branch, and reduces grain and reflection intensity. At zero backdrop blur the light material still uses broad, soft washes. Do not restore the near-white pastel revision as the default.

Scope correction: Jacob clarified that the brightness complaint concerns the cards, not the surrounding screen. Restore the original page canvas. Further material/color changes must remain inside the card; do not darken the whole page to compensate.

## Current system entry points

The [component system](../component-system.md) distinguishes product APIs from prototypes. The [motion foundation](./motion.md) records Jacob’s gooey-motion direction. The [three-material comparison](../prototypes/atmospheric-launch/light-options.html) keeps smoked glass, clear glass and matte mineral available for selection; no winner is recorded. Its surrounding page is pure white by explicit request. Close/collapse/restore behavior is demonstrated there; only the shared disclosure mechanism is currently available as a React primitive.
