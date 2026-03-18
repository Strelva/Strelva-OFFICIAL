# REB Design System

Two visual contexts: **Public site** (wellness, warm) and **Dashboard** (tech, Vercel-grade).

## Dashboard Design Language (Vercel-inspired)

### Colors
- **bg-page**: `#0a0a0a` (zinc-950, NOT pure black — has warmth)
- **bg-surface**: `#141414` (slightly lighter, for cards/panels)
- **bg-surface-2**: `#1c1c1c` (hover states, input backgrounds)
- **border**: `#262626` (zinc-800, subtle not heavy)
- **border-focus**: `#7c3aed` (violet-600, accent for active states)
- **text-primary**: `#fafafa` (near-white)
- **text-secondary**: `#a1a1aa` (zinc-400)
- **text-muted**: `#71717a` (zinc-500)
- **accent**: `#7c3aed` (violet-600 — used sparingly: active nav, CTAs, status)
- **success**: `#22c55e` (green-500, status dots)
- **warning**: `#eab308` (amber, rarely)
- **danger**: `#ef4444` (red, errors only)

### Typography
- **Headings**: system sans, font-semibold, tracking-tight
- **Body**: system sans, text-sm (14px base), text-zinc-200
- **Data values**: `font-mono` — metrics, timestamps, counts, status codes
- **Labels**: text-xs, uppercase, tracking-wider, text-zinc-500
- **Section headers**: text-sm, font-semibold, text-white

### Spacing
- **Page padding**: p-6 mobile, p-10 desktop
- **Card padding**: p-5 (tight, Vercel-density)
- **Gap between cards**: gap-3 (not gap-4 — tighter)
- **Section gap**: mb-6 (not mb-8)
- **Grid**: 4-col on desktop, 2-col on tablet, 1-col on mobile

### Radius
- **Cards**: rounded-lg (8px) — NOT rounded-xl (too soft)
- **Buttons**: rounded-md (6px) — sharp and precise
- **Inputs**: rounded-md
- **Chat bubbles**: rounded-2xl (exception — chat should feel organic)
- **Status dots**: rounded-full
- **RULE**: No rounded-xl on cards. Vercel uses rounded-lg max.

### Shadows
- **None on cards** — use border instead. Vercel doesn't use shadows on dark surfaces.
- **Focus rings**: ring-1 ring-violet-600/50

### Transitions
- **All hovers**: transition-colors duration-150 (FAST, not 300ms)
- **Status changes**: transition-all duration-200
- **No transition on click** — instant feedback

### Component Patterns

**Metric card (Vercel-style)**:
```
bg-[#141414] border border-[#262626] rounded-lg p-5
  <label>  text-xs uppercase tracking-wider text-zinc-500 font-mono
  <value>  text-2xl font-semibold font-mono text-white tabular-nums
  <change> text-xs font-mono text-emerald-400 (or text-red-400)
```

**Nav item (active)**:
```
bg-[#1c1c1c] text-white border-l-2 border-violet-600
  (inactive: text-zinc-400 hover:text-white hover:bg-[#141414])
```

**Status indicator**:
```
inline-flex items-center gap-1.5
  <dot>   w-1.5 h-1.5 rounded-full bg-emerald-500 (or bg-amber-500, bg-red-500)
  <label> text-xs font-mono text-zinc-400
```

**Data table row**:
```
border-b border-[#1c1c1c] px-4 py-3 text-sm font-mono
  hover:bg-[#141414] transition-colors duration-150
```

**Chat bubble (user)**:
```
bg-violet-600 text-white rounded-2xl px-4 py-3 text-sm max-w-[80%]
```

**Chat bubble (assistant)**:
```
bg-[#141414] border border-[#262626] text-zinc-200 rounded-2xl px-4 py-3 text-sm
```

### Anti-Slop Rules
1. NO rounded-xl on cards (use rounded-lg)
2. NO blue buttons (violet or monochrome only)
3. NO generic 4-card metric grids with icons — each metric gets its own layout
4. Data values ALWAYS font-mono
5. Labels ALWAYS uppercase + tracking-wider + text-xs
6. NO 300ms transitions — 150ms max
7. NO shadows on dark surfaces — borders only
8. Status dots, not badges (minimal, precise)
9. Border weight: 1px (border, not border-2)
10. Hover reveals info, doesn't change color dramatically

## Public Site Design Language (Wellness)

### Colors
- **cream** (#faf9f7), **sage** (#7c9a8e), **bark** (#2a2520)
- **blush** (#d4a89a), **terra** (#b5634b)
- Warm, organic, natural materials

### Typography
- Display: serif (Georgia fallback)
- Body: system sans
- Buttons: uppercase, tracked, sage bg

### Radius
- 0px on buttons (sharp, architectural)
- Reveal animations (translateY 24px, cubic-bezier)

## Framework
- Next.js 15 App Router
- Tailwind 4 (inline @theme)
- lucide-react for icons
- No component library — all custom
