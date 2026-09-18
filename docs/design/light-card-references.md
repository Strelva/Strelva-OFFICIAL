# Light-card references, September 17

Scope: card backgrounds only. Jacob rejected both the bright pastel material and changing the surrounding screen to compensate. The existing page canvas is restored in product and study.

## References inspected

- [Craft panel on Mobbin](https://mobbin.com/screens/0670d603-b651-426e-b757-0f35de0ac97c): actual screenshot inspected. Color behind the glass is subdued and the reading area is mostly neutral. Useful for separating the material from text; its bright overall screen is not a palette target.
- [MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter), retrieved through Context7 `/mdn/content`: translucent fill exposes the backdrop; ancestor backdrop roots bound the effect. Keep tint on the decorative layer rather than setting opacity on the text container.
- [MDN reduced transparency](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency), retrieved through Context7: use an opaque fallback for the preference. Existing product fallback is retained.
- [Radix color roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale): distinguish canvas, component surfaces, borders and text. This supports independent card tokens; it does not prescribe the chosen palette or establish viewing comfort.
- [21st Frosted Card](https://21st.dev/@ravikatiyar162/components/frosted-card): public usage code inspected. Full component implementation was not exposed by the fetched page, so no claim of source adoption. Its advertised tilt is not appropriate to this correction. The previously inspected public Aceternity source remains the study's attributed CSS-motion source.

## Applied boundary

The card owns its muted material ground, subdued color variation, grain, tint and edge reflection. The page keeps its original theme background. Contrast samples check readability only; they do not prove the material is comfortable for Jacob. No new dependency, pointer-following effect or external asset was added.
