# Visual Editor (Design Mode)

## Overview

The visual editor is a Figma-inspired interface inside the Strelva dashboard that lets tenants see and edit their live site without leaving the admin panel. It renders the client site inside an iframe and communicates with it via `postMessage` to enable section selection, hover highlights, inline text editing, and AI-powered content changes.

The editor is composed of four panels arranged left-to-right:

1. **LayersPanel** (left sidebar) -- tree view of page sections; supports expand/collapse, visibility toggle, and reorder.
2. **DesignCanvas** (center) -- the iframe preview with zoom controls and selection/hover overlays drawn on top.
3. **DesignPropertiesPanel** (right sidebar) -- three tabs: Design (variant + spacing), Content (inline edit + asset picker), AI (quick actions + custom prompt).
4. **PublishBar** (bottom bar) -- draft status indicator and publish/discard controls.

Entry point: `src/components/dashboard/DesignMode.tsx`. The iframe loads `EditModeOverlay` on the client site side.

## Architecture

```
Dashboard (DesignMode.tsx)                    Client site (EditModeOverlay.tsx)
+-----------------------------------------+   +----------------------------------+
| LayersPanel | DesignCanvas [iframe ----]-|-->| EditModeOverlay                  |
|             |   hover overlay           |   |   data-reb-section elements      |
|             |   selection overlay       |   |   data-reb-field elements        |
|             | DesignPropertiesPanel     |   |   contenteditable text fields    |
|             |   Design | Content | AI   |   +----------------------------------+
+-----------------------------------------+
                  ^            |
                  |  postMessage (both directions)
                  +------------+
```

The iframe is loaded with `?edit=true` in the query string. On load, the dashboard also sends a `reb-edit-mode` message to activate the overlay. The client site uses `data-reb-section` and `data-reb-field` HTML attributes to identify interactive regions.

### Key data flow

1. Dashboard fetches page config (`/api/page-config?draft=true`) and builds a `DesignNode[]` tree from it.
2. The tree drives the LayersPanel. Selecting a node in the layers panel sends `reb-request-rect` to the iframe and updates the properties panel.
3. Clicking/hovering in the iframe sends messages back to the dashboard, which updates overlays and selection state.
4. Content edits (from properties panel or inline editing in the iframe) go through `handleContentUpdate`, which fetches current content from `/api/content/{section}`, patches the field, and PUTs it back.

## PostMessage Protocol

Every message is a plain object with a `type` string field. Origin validation is applied on both sides (see Origin Validation below).

### iframe -> dashboard (client site to parent)

| Type | When | Payload | Purpose |
|------|------|---------|---------|
| `reb-node-selected` | User clicks a `[data-reb-section]` element or a `[data-reb-field]` element | `{ section: string, field?: string, label?: string, nodeType: "section"\|"text"\|"image"\|"link"\|"button", rect: NodeRect }` | Primary selection message. Sets the active node in the dashboard, updates the selection overlay, and populates the properties panel. |
| `reb-section-clicked` | Immediately after `reb-node-selected` on section click | `{ section: string }` | Legacy compatibility. Sent alongside `reb-node-selected` for older code paths. |
| `reb-section-hovered` | Mouse enters/leaves a `[data-reb-section]` element | `{ section: string\|null, rect?: NodeRect }` | Drives the hover highlight overlay in DesignCanvas. `section: null` clears the hover. |
| `reb-node-rect` | In response to `reb-request-rect` | `{ section: string, rect: NodeRect }` | Returns the bounding rect of a section element, adjusted for scroll offset (`rect.top` includes `window.scrollY`). |
| `reb-inline-edit` | User blurs a `contenteditable` field inside the iframe | `{ section: string, field: string, value: string }` | Sends the edited text content back to the dashboard for persistence. Only fires for text elements (not links, buttons, or images). |
| `reb-context-menu` | User right-clicks a section | `{ section: string, label?: string, x: number, y: number }` | Coordinates are `clientX`/`clientY` relative to the iframe viewport. Dashboard can use these to position a context menu. |

### dashboard -> iframe (parent to client site)

| Type | When | Payload | Purpose |
|------|------|---------|---------|
| `reb-edit-mode` | iframe loads, or mode toggles | `{ enabled: boolean }` | Activates or deactivates the EditModeOverlay. When enabled, the overlay attaches event listeners to all `[data-reb-section]` and `[data-reb-field]` elements. |
| `reb-request-rect` | User selects a section in the LayersPanel | `{ section: string }` | Asks the iframe to measure and return the bounding rect of the given section. The iframe responds with `reb-node-rect`. |
| `reb-highlight-section` | Dashboard wants to scroll-to and highlight a section | `{ section: string\|null }` | Adds a `reb-highlighted` CSS class to the target element and scrolls it into view. Passing `null` or omitting `section` clears the highlight. |

### NodeRect shape

```typescript
type NodeRect = {
  top: number;    // pixels from top of document (includes scrollY)
  left: number;   // pixels from left edge
  width: number;  // element width
  height: number; // element height
};
```

## Origin Validation

Both sides validate `postMessage` origins to prevent cross-origin injection.

### Dashboard side (DesignMode.tsx, DesignCanvas.tsx)

```typescript
const previewOrigin = new URL(previewUrl || siteUrl).origin;

function handleMessage(event: MessageEvent) {
  if (!event.origin || event.origin === 'null') return;
  const allowedOrigins = [window.location.origin];
  if (previewOrigin) allowedOrigins.push(previewOrigin);
  if (!allowedOrigins.includes(event.origin)) return;
  // ... process message
}
```

`previewOrigin` is derived from the tenant's `previewUrl` or `siteUrl`. Messages are accepted only from the dashboard's own origin or the tenant's site origin.

### iframe side (EditModeOverlay.tsx)

```typescript
function getParentOrigin(): string {
  try {
    return document.referrer ? new URL(document.referrer).origin : "*";
  } catch {
    return "*";
  }
}
```

The iframe uses `document.referrer` to determine the parent dashboard origin. All `postMessage` calls from the iframe use `getParentOrigin()` as the target origin. If the referrer is unavailable, it falls back to `"*"`.

Note: The iframe does NOT validate the origin of incoming messages from the dashboard. It trusts `reb-edit-mode`, `reb-request-rect`, and `reb-highlight-section` from any origin. This is acceptable because the iframe is loaded in a controlled context (`?edit=true`), but worth noting for security audits.

## Content Pipeline

### Inline text editing (iframe path)

1. `EditModeOverlay` finds all `[data-reb-field]` elements nested under `[data-reb-section]` elements.
2. Text elements (not links, buttons, or images) get `contenteditable="true"` and `spellcheck="false"`.
3. On focus, a sage-colored outline appears. On blur, the overlay reads `el.textContent` and sends a `reb-inline-edit` message to the parent.
4. The dashboard's `handleInlineEdit` listener in `DesignMode.tsx` receives the message and delegates to `handleContentUpdate`.

### Properties panel editing (dashboard path)

1. User edits content in the ContentTab textarea or picks an asset from the AssetPickerModal.
2. The `handleSave` callback calls `onContentUpdate(section, field, value)`.
3. Both paths converge in `handleContentUpdate` in `DesignMode.tsx`.

### handleContentUpdate flow

```
handleContentUpdate(section, field, value)
  1. GET /api/content/{section}         -- fetch current content JSON
  2. Parse nested field path             -- e.g. "services[0].name" -> ["services", "0", "name"]
  3. Deep-set the value on the object
  4. PUT /api/content/{section}?draft=true  -- save (if draft mode)
  5. If draft mode: mark section as having a draft via setHasDraft
  6. If live mode: call triggerRefresh() to reload the iframe
```

Field paths support dot notation and bracket array indexing (e.g., `services[0].name`). The path is split on `.` after converting `[n]` to `.n`.

### Publishing

When the user clicks "Publish" in the PublishBar:

1. `POST /api/publish` is called.
2. On success, all draft flags are cleared (`setHasDraft({})`).
3. `triggerRefresh()` reloads the iframe to show published content.
4. The PublishBar displays outcome status: "revalidated" (live site refreshed), "not_configured", or "failed".

## Section Labels

All section display names come from a single shared map in `src/components/ui/section-labels.ts`.

### SECTION_LABELS

Maps internal section type IDs to customer-friendly names:

| Key | Label |
|-----|-------|
| `hero` | First Impression |
| `services` | What You Offer |
| `story` | About You |
| `testimonials` | What Customers Say |
| `events` | Upcoming Events |
| `providers` | Your Network |
| `contact` | How to Reach You |
| `settings` | Site Settings |
| `faq` | Common Questions |
| `shop` | Your Shop |
| `trust-strip` | Trust Strip |
| `testimonial-quote` | Featured Quote |
| `cta` | Call to Action |
| `page-header` | Page Header |
| `booking-widget` | Booking Widget |
| `instagram-feed` | Instagram Feed |
| `vagaro-booking` | Vagaro Booking |
| `products` | Your Products |
| `comparison` | Why You're Different |
| `notify` | Email Signup |
| `email-popup` | Email Popup |
| `typographic-break` | Divider |
| `newsletter` | Newsletter |
| `theme` | Brand Theme |
| `rewardsConfig` | Rewards |
| `navigation` | Navigation |
| `footer` | Footer |

The file also exports:

- `SECTION_ICONS` -- Lucide icon component per section type.
- `COMPOSITE_SECTIONS` -- Set of section types that pull content from other sections and are not directly editable (e.g., `trust-strip`, `cta`, `booking-widget`).
- `ALL_SECTION_TYPES` -- Ordered array of all section types for the add-section menu.

Imported by: `DesignMode.tsx`, `DesignCanvas.tsx`, and likely the layers panel and other dashboard components.

## UI Features

### Hover highlights

When the user hovers over a section in the iframe, `EditModeOverlay` sends `reb-section-hovered` with the element's bounding rect. `DesignCanvas` renders a translucent blue overlay with a label tooltip above the section. The hover overlay is suppressed for the currently selected section to avoid visual clutter.

### Selection overlay

On click, a `reb-node-selected` message carries the section rect. `DesignCanvas` draws a 2px accent-colored border with corner handles (styled like Figma selection handles) and a label badge. If no rect is available, a fallback label is shown in the top-left.

### Scroll-to-zoom

`DesignCanvas` listens for `Cmd/Ctrl + scroll wheel` on the `[data-canvas-viewport]` element. Zoom range is 25%--200%, in increments of 10 per scroll tick. A bottom toolbar also provides +/- buttons and a reset-to-100% button.

### Context menus

Right-clicking a section in the iframe fires `reb-context-menu` with viewport-relative coordinates. The dashboard can position a floating menu at those coordinates (handler exists in protocol; menu UI is not yet implemented in the read code).

### Inline text editing

Text elements with `[data-reb-field]` inside `[data-reb-section]` become `contenteditable` when edit mode is active. Enter (without Shift) commits the edit by blurring the element. Escape also blurs. On blur, the new text content is sent via `reb-inline-edit`.

### AI actions in properties panel

The AI tab provides:

- **Quick actions** -- contextual buttons based on section type (e.g., "Better headline" for hero, "Add benefits" for services, "Suggest questions" for FAQ). Each triggers a pre-written prompt.
- **Custom prompt** -- freeform textarea where the user describes changes. Cmd+Enter submits.
- **Agent trace** -- while the AI is working, tool call steps are streamed and displayed via `AgentTrace`.
- **Agent preview** -- when the agent produces diffs with a risk assessment, an `AgentPreview` component shows them for approve/reject (see Known Limitations).

## Known Limitations

1. **`handlePreviewApprove` does not persist changes.** The function is marked with a TODO: "Actually apply the pending diffs to the content via onContentUpdate. Currently this only clears the preview state without persisting changes." Approving an AI preview clears the UI but does not save anything.

2. **No undo/redo.** Content edits (inline or via properties panel) are immediately sent to the API. There is no client-side undo stack.

3. **No drag-and-drop section reordering.** Sections can be reordered via up/down chevron buttons in the LayersPanel, but there is no drag-and-drop support.

4. **iframe origin fallback.** `EditModeOverlay.getParentOrigin()` falls back to `"*"` when `document.referrer` is unavailable. This means in some edge cases (e.g., direct navigation to `?edit=true`), messages are sent to any listening window.

5. **iframe does not validate incoming message origins.** The `EditModeOverlay` processes `reb-edit-mode`, `reb-request-rect`, and `reb-highlight-section` from any origin without checking `event.origin`.

6. **Context menu UI not implemented.** The `reb-context-menu` message is sent from the iframe but no menu component is rendered in the dashboard code reviewed here.

7. **Page selector is hardcoded.** `PageSelector.tsx` has a fixed list of pages (`home`, `about`, `services`, `contact`) rather than deriving from the site's actual page config.

8. **Rect measurements do not account for iframe zoom.** The selection and hover overlays use raw `getBoundingClientRect()` values from the iframe. When the canvas is zoomed (scaled via CSS transform), the overlay positions may not align perfectly since the rects are in the iframe's unscaled coordinate space while the overlay div is in the scaled container.
