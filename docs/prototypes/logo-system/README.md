# Logo-derived design options

Local comparison prototype. Run `python3 -m http.server 4319 --bind 127.0.0.1 --directory docs/prototypes/logo-system` from the repository root, then open http://127.0.0.1:4319.

Three proposals: solid shapes, contours, and layers. The original mark is copied from [Logo.tsx](../../../src/components/Logo.tsx); the larger drawings are interpretations, not replacement logos. Shared constraints come from [DESIGN.md](../../../DESIGN.md) and the global design instructions. Fraunces and Inter load from Google Fonts with local fallbacks.

The comparison has selectable directions, light/dark specimen backgrounds, and an explicit sample-only empty → review → saved → reset flow. It makes no provider requests, performs no assessment, and stores no account data. Nothing has been adopted into the production system.

Recommendation for review: solid shapes for sparse expressive surfaces; layers for tasks with known stages. Contours are an alternative for quieter report artwork, with weaker brand recognition. Selection belongs to Jacob.

Research: [21st Empty State](https://21st.dev/@serafimcloud/components/empty-state) and [Interactive Empty State](https://21st.dev/@remcostoeten/components/interactive-empty-state) were discovery candidates; no registry code was retrieved or installed. The [Mobbin empty-state reference](https://mobbin.com/screens/ab5556c1-f9bd-4e69-92fb-2c9e0b2edda3) was inspected for illustration/message/action hierarchy. All artwork here is drawn from the Strelva mark.

Local verification: T3 browser desktop rendering and direction/background/sample-state interactions. T3 stalled on viewport resizing; Playwright provided the mobile rendered inspection and checks at 320, 360, 768, 1280, and 1600 CSS px, with no horizontal overflow or JavaScript errors. Keyboard focus and sample save/reset passed. Repository typecheck passed. This is prototype verification, not production verification or a complete accessibility audit.
