# Typography options for frosted cards

September 17, 2026. Prior proposed treatments, not a selected replacement for the product typography. Jacob subsequently selected the [character/atmosphere reference](./character-atmosphere-direction.md) to guide the next refinement.

[Live comparison source](../prototypes/atmospheric-launch/typography-options.html) keeps the smoked material, white surrounding page and copy constant. Actual project Inter and Fraunces files are loaded. Original `typography.html` is an older study with superseded layout and sample context rows; do not use it as the current implementation reference.

## Visual evidence inspected through Mobbin

- [Linear project overview](https://mobbin.com/screens/344cad59-d4a8-421a-9c2f-14b3c977e82d): compact sans headings, restrained weight changes, small metadata. Supports a precise product hierarchy; not a glass reference.
- [Craft style gallery](https://mobbin.com/screens/1476bad6-e33a-43bc-8b8b-b96491e4c1df): expressive serif titles on material previews, with sans-serif UI around them. Supports limiting expressive type to a title role.
- [Craft frosted onboarding](https://mobbin.com/screens/8905c3cd-79d8-42a7-9f72-1abf0da18920): simple dark sans labels remain distinct from a soft glass surface. Supports legibility through weight and separation instead of decorative text effects.

These are visual observations. Exact reference font families and computed measurements were not available; the following values are proposals using Strelva's existing fonts.

| Option | Proposed type | Tradeoff |
| --- | --- | --- |
| Precise sans | Inter 600 at 24/32 for headings; Inter 400 at 14/20 for body | Clear hierarchy in repeated work cards; less expressive. |
| Editorial serif | Fraunces 400 at 28/36 for headings; Inter 400 at 14/20 for body | More distinctive featured cards; not intended for every row or control. |
| Open sans | Inter 500 at 24/32 for headings; Inter 400 at 16/24 for body | More room for reading; lower density. |

All controls remain Inter. Do not blur text with the glass, use hairline body weights, or compensate for an unreadable surface using text glow. Keep the Fraunces brand wordmark independent of any card-heading choice. In product code use `font-display` for the display face as required by the project compiler constraint.

Local inspection: compared at desktop size and checked containment at 320/360/768/1280/1600 px. No type option has been selected or applied to the production component system.
