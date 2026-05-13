# Design

Scaffold Web uses one shared token contract for three surface families: the product dashboard, Scaffold marketing pages, and tenant storefronts.

## Product Dashboard

The dashboard is a restrained dark product UI. It should feel operational, calm, and repeatable: dense enough for review queues, settings, reports, and site editing, without decorative chrome.

- Backgrounds use `--surface-base`, `--surface`, `--surface-raised`, and `--surface-inset`.
- Primary action and AI/system emphasis use `--accent`, `--accent-dim`, and `--accent-text`.
- Success uses `--success` and `--success-dim`.
- High-contrast text and filled controls use `--warm-white`, not raw `white`.
- Filled `--warm-white` controls use `--on-warm-white` for foreground text.
- Floating controls, menus, and overlays may use `--glass`, `--glass-border`, and `--glass-active`.
- Backdrops use `--overlay-scrim`, not raw black utilities.

## Tenant Storefronts

Tenant storefronts are brand-led and visual. They use tenant theme variables from content or template defaults, then render through the shared public section components.

- Base backgrounds use `--cream`, `--cream-dark`, and `--cream-mid`.
- Primary actions and soft accents use `--sage`, `--sage-light`, `--sage-dark`, and `--sage-wash`.
- Text uses `--bark`, `--bark-light`, and `--bark-faded`.
- Warm editorial accents use `--blush`, `--blush-light`, `--terra`, and `--terra-light`.

## Rules

- Do not introduce one-off color utilities when a token exists.
- Do not use raw `bg-black`, `bg-white`, `text-black`, or `text-white` for product surfaces unless the element is rendering third-party or browser-like preview chrome.
- Avoid gradient text, side-stripe card accents, decorative glass, and bounce easing.
- Keep product radii compact, usually `6px` to `8px`; reserve full pills for small controls and status indicators.
- Component primitives in `src/components/ui` are preferred over hand-rolled controls for new dashboard work.

## Scaffold Marketing

The Scaffold Web marketing surface is a restrained technical brand scene, not a generic AI SaaS page. It should feel precise, operational, and trustworthy: dark graphite surfaces, tinted neutrals, a green-cyan system accent, visible proof loops, and direct signup paths.

- Marketing pages use the `--m-*` token family in `src/app/globals.css`.
- Color strategy is restrained technical: graphite base, tinted rules, one green-cyan system accent, and warm-white primary actions.
- Primary CTAs should point to the shortest signup/request path and use the shared `marketing-button-primary` class.
- Secondary CTAs should help invited users reach `/sign-up` without competing with the main path.
- Motion should be purposeful: page-entry choreography, proof-loop scans, progress state, and hover/press feedback. Avoid scattered decorative movement.
- Use `--m-ease-*` and `--m-duration-*` motion tokens. Respect `prefers-reduced-motion` for all marketing animations.
- Do not use purple-blue gradients, gradient text, hero stat templates, repeated icon-card grids, or glassmorphism as decoration.
