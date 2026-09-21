# Selected character typography and atmosphere

September 17, 2026. Jacob supplied this image in response to the typography comparison and said “this and the background vibes.” It is the selected visual reference, not proof of a final font or implemented pixels.

Later decision, reconciled September 18: Geist Sans is selected for interface
and display text, with custom Strelva lettering for the logo. The image remains
an atmosphere and lettering reference; identifying its source font is not a
prerequisite for the foundation. See [current direction](../../DESIGN.md#latest-foundation-decisions).

![Selected Strelva typography and atmosphere](./references/strelva-character-atmosphere-2026-09-17.png)

## What the reference establishes

- Large, characterful display lettering with warm ivory color and distinctive proportions. The image labels the direction “Character Grotesk” and “Founders Grotesk-like”; those labels do not identify a verified font file.
- Very dark ink and blue-green depth, with irregular moss/olive light. Large quiet dark areas balance concentrated pigment, rather than an evenly illuminated pastel wash.
- Fine mineral grain, diffuse cloud edges and restrained points of light. The orbital lines are visible in the reference but are not automatically required product decoration.
- A soft atmospheric setting with sharp, legible lettering. Product labels, controls and detailed text remain crisp semantic DOM content.

## Application boundaries

Use this direction to refine the card's own material and selected display moments. Preserve the pure-white comparison surround and original cairn. This does not authorize a whole-page wallpaper, a new logo asset, or replacing every UI label with a display face.

Keep the supplied image as reference evidence. Do not crop its wordmark and orbital diagram into a repeating card background. Recreate material behavior through the existing bounded renderer; preserve pause, reduced-motion, fallback and contrast requirements.

Inter/Fraunces remain legacy implementation until the scoped Geist migration is
verified. Do not describe the custom wordmark as a working font for other text.

## Remaining decisions

Geist weights and hierarchy in actual specimens; final pigment density and grain;
whether any orbital detail belongs in a launch composition. The three earlier
material prototypes remain useful comparison evidence, not selected final
implementations. A new display family would be a new proposal, not an unresolved
requirement of the current system.

## Working remake

[reference-material.html](../prototypes/atmospheric-launch/reference-material.html) now renders an original ink/mineral shader composition beside a frosted card using the same material. Lettering and orbital guides are independently toggleable. The large wordmark now uses a hand-drawn [SVG reconstruction](../prototypes/atmospheric-launch/strelva-reference-wordmark.svg) of the seven reference letters, replacing the visibly different Fraunces placeholder. It is custom lettering, not a verified font or a full alphabet. Lettering is visible by default. The card heading still uses Fraunces; product typography and the original cairn are unchanged. The source image is not used as wallpaper. This is a local study; product AtmosphericCard remains unchanged. The extra shader composition is standalone variant 6, outside the product's 0–5 API.

## Integrated lockup and entrance

The reference study now combines the original cairn with the custom lettering.
The large lockup plays a single staggered entrance and exposes replay; the card
uses the same geometry statically. Pause applies to both shader and lettering.
Reduced motion displays the settled state. A reusable `StrelvaLockup` component
and a demonstration in `/preview/strelva/components` carry the same behavior.
This is local implementation, not a deployed branding change or a new font.
