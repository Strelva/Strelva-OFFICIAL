# Strelva moving cloud materials

Local, executable visual study. Not a shipped product feature or an approved rebrand.

Read the [durable component contract and audit findings](../../design/atmospheric-component-contract.md) before extending this study.

Run from the repository root:

```sh
python3 -m http.server 4322 --bind 127.0.0.1 --directory docs
```

Open `http://127.0.0.1:4322/prototypes/atmospheric-launch/`.

## Current direction

The user's indigo/sage cloud crop is the material reference. The first geometric beam/ring studies and generated launch board were rejected. This version replaces them with moving, irregular cloud structure behind actual translucent panels. The old painting is not loaded as an image and the surrounding page remains neutral.

Six parameterized compositions: Sage rift, Cloud banks, Mineral veil, Undercurrent, The opening, Silver mist. Each has separately defined dark and light pigment values. These are options for judgment, not six approved brand treatments.

The original cairn geometry is copied unchanged from `src/components/Logo.tsx`. The study loads the project's existing Inter Latin font asset locally. The wordmark is a temporary sans-serif treatment, not a replacement wordmark specification.

## What is built

- `cloud-material.js`: original WebGL cloud material using multiscale, domain-warped noise, irregular openings and static fine grain. It renders behind the DOM interface, not into a mockup screenshot.
- `cloud-cards.css`: moving radial-gradient layer adapted from the MIT Aceternity Background Gradient Animation listed on 21st.dev. Changed colors, sizing, opacity and containment. Added independent pause and reduced-motion handling; removed pointer following and global body mutations.
- The glass really uses `backdrop-filter`; the blur slider changes it from 0 to 40 px. Remove glass reveals the underlying material while retaining sharp content.
- Neutral outer canvas; 24 px padding and corners on material containers. Frost covers the entire card; the content wrapper has no extra padding or background. Eight-pixel spacing system, with small optical icon and border exceptions.
- Sample context data only. Inspect opens a native dialog describing each material. Theme, blur and the open material are recorded in the URL, so a shared link restores the same comparison. The recipe shows the current blur value and names both the shader and CSS motion.
- Content grows with long names or enlarged text. Outer cards retain 24 px padding and radii. The glass has its own text, edge, action and shadow tokens for each theme.
- A keyboard skip link, visible hover/focus/pressed states, contained dialog scrolling and focus restoration support inspection without a pointer.
- Capped canvas resolution, 24 fps target, offscreen suspension, document visibility pause, manual pause, reduced-motion static rendering and CSS fallback if WebGL is unavailable. ResizeObserver caches dimensions outside the frame loop. A persisted pagehide pauses rendering without destroying the resources needed on pageshow. Every material has an initial static frame before offscreen motion is suspended. No FPS or battery claim has been established on physical mobile devices.

## References and source decisions

1. [21st.dev: Background Gradient Animation by Manu Arora / Aceternity](https://21st.dev/@manuarora700/components/background-gradient-animation). Actual implementation read at its [public upstream source](https://ui.aceternity.com/components/background-gradient-animation). The 21st registry source is membership-gated; no gated source was accessed. Adapted the public MIT moving radial layers and keyframes, not a screenshot or an AI-generated 21st component.
2. [21st.dev: animated pattern cloud](https://21st.dev/@ashishrajwaniai01/components/animated-pattern-cloud). Inspected its public code. Despite the name, it draws neon topographic terrain, not the desired cloud material. Its license field was empty, so its implementation was not copied.
3. [tw-easing-gradients](https://github.com/enisbu/tw-easing-gradients), supplied by the user. Reviewed its eased-stop and OKLCH approach. This standalone study uses an eased multi-stop CSS scrim; the Tailwind plugin is not installed. It can replace that scrim in a Tailwind integration, but it is not a cloud generator.
4. Motion's [performance](https://motion.dev/docs/performance) and [accessibility](https://motion.dev/docs/react-accessibility) docs, retrieved through Context7. Used to inform restrained motion and reduced-motion handling; no Motion runtime is needed for this standalone study.

## Local verification, September 17, 2026

The focused Chromium check passes nine behavior groups: keyboard skip and dialog focus, URL restoration, both themes at 320/360/768/1280/1600 px, long strings and doubled text, Inspect hover and adjustable backdrop filtering, pause/offscreen/cached-dimension behavior, simulated persisted page lifecycle, emulated reduced motion, and a forced no-WebGL fallback. Outer cards measured 24 px padding and radius. No document overflow, clipped glass panels or page JavaScript errors were observed. Dark desktop and light mobile screenshots were inspected.

Run the checks against the local server:

```sh
node docs/prototypes/atmospheric-launch/check-study.cjs http://127.0.0.1:4322/prototypes/atmospheric-launch/
node docs/prototypes/atmospheric-launch/check-contrast.cjs http://127.0.0.1:4322/prototypes/atmospheric-launch/
```

The contrast check samples screenshot pixels beneath the text with glyphs hidden, across all six materials, both themes, and blur settings 0/24/40 px. The latest six-composition study run sampled 144 text boxes with no failures; the lowest measured ratio was 5.92:1. Earlier 396-box results include the removed context rows. It checks paused compositions against 4.5:1; it does not prove every animation frame. Results and screenshots are saved under `output/atmospheric-study/`.

`node --check` passed for both application scripts and both check scripts. `git diff --check` passed. The parent product task owns the repository typecheck.

Not verified: physical-device performance, operating-system reduced-motion behavior, actual browser-managed back/forward-cache restoration, screen-reader output, native browser zoom, forced-colors rendering, the no-backdrop-filter fallback in an engine without that feature, and exhaustive contrast across animation frames. Doubled text and 320 px reflow were tested separately from browser zoom. Persisted lifecycle behavior was tested using PageTransitionEvent, not a claim of bfcache eligibility. No production deployment was performed.

## Source license

The moving radial-gradient layer and its three keyframes are adapted from Background Gradient Animation by Manu Arora / Aceternity UI, identified as MIT on its 21st.dev listing.

MIT License

Copyright (c) Manu Arora / Aceternity UI

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The People / Decisions / Commitments inset was removed at Jacob’s request. Cards now show the material name and description directly on the frost, with no sample context panel. Earlier contrast counts belong to their respective revisions.

Layout correction: each card now uses a full-width header, one heading/description group and a separate footer action row. Duplicate captions are removed. Asset URLs share a layout revision to avoid mixing cached scripts with newer CSS on reload. The revised layout passed the nine behavior groups and 144 contrast samples (minimum 5.92:1) in Chromium.

## Component-system handoff

See [component system](../../component-system.md) and [motion foundation](../../design/motion.md). `light-options.html?variant=all` compares three unselected material options on a pure-white page. Each supports gooey collapse/expand, rounded close, restore and reduced motion. It is a standalone prototype, not the React AtmosphericCard API. The product gallery now exercises a reusable GooeyDisclosure. No choice among the three materials has been recorded.

Current typography comparison: `typography-options.html`, with identical smoked material and three type treatments. See [proposal and Mobbin sources](../../design/frosted-typography-options.md). Older `typography.html` retains superseded layout and placeholder context and is historical. No type selection is recorded.
