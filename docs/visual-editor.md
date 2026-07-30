# Visual Editor (Design Mode)

## Overview

The visual editor is an iframe-based interface inside the Strelva dashboard that lets tenants preview and edit their live site without leaving the admin panel. It renders the client site inside an iframe and communicates with it via `postMessage` to enable section selection, hover highlights, inline text editing, and AI-powered content changes.

The editor is composed of three panels inside `ContentWorkspace`:

1. **SectionsRail** (left sidebar, `SectionsRail` function in `src/components/dashboard/ContentWorkspace.tsx`) -- list of the current page's sections; selecting one sends the highlight to the iframe and switches the right panel to the properties tab.
2. **SitePreview** (center, `src/components/dashboard/SitePreview.tsx`) -- the iframe preview with breakpoint controls (Mobile/Tablet/Desktop/Fluid), live/editable source toggle, and selection/hover overlays.
3. **PropertiesEditor** (right panel, `src/components/dashboard/PropertiesEditor.tsx`) -- two tabs: Edit (field-level content edit + asset picker + version history toggle) and an AI shortcut that opens the chat tab with a pre-filled prompt. Right panel tab state (`"properties" | "chat" | "layout" | "request"`) lives in `DashboardContext`.
4. **PublishBar** (bottom bar, `src/components/dashboard/design/PublishBar.tsx`) -- draft status indicator and publish/discard controls.

Entry points: `src/components/dashboard/ContentWorkspace.tsx` (the outer shell) and `src/components/dashboard/SitePreview.tsx` (the iframe host). The iframe loads `EditModeOverlay` on the client site side (`src/components/public/EditModeOverlay.tsx`).

## Architecture

```
Dashboard (ContentWorkspace.tsx)               Client site (EditModeOverlay.tsx)
+------------------------------------------+   +----------------------------------+
| SectionsRail | SitePreview [iframe -----]-|-->| EditModeOverlay                  |
|              |   hover overlay            |   |   data-reb-section elements      |
|              |   selection overlay        |   |   data-reb-field elements        |
|              | PropertiesEditor           |   |   contenteditable text fields    |
|              |   Edit | Versions          |   +----------------------------------+
+------------------------------------------+
                   ^            |
                   |  postMessage (both directions)
                   +------------+
```

The iframe URL is the tenant's editable site URL (derived from `previewUrl` or `siteUrl` in tenant config). When edit mode activates, the dashboard sends a `reb-edit-mode` message to the iframe. The client site uses `data-reb-section` and `data-reb-field` HTML attributes to identify interactive regions.

### Key data flow

1. `DashboardContext` owns shared state: `activeSection`, `activePage`, `rightTab`, `selectedNode`.
2. Selecting a section in `SectionsRail` sets `activeSection` and sends `reb-highlight-section` to the iframe via `SitePreview`.
3. Clicking/hovering in the iframe sends `reb-node-selected` / `reb-section-hovered` back; `SitePreview` updates `activeSection` + `selectedNode` and switches `rightTab` to `"properties"`.
4. Content edits go through `handleInlineEdit` in `SitePreview.tsx` (inline iframe edits via `reb-inline-edit`) or through field saves in `PropertiesEditor.tsx` (right panel). Both paths PUT to `/api/content/{section}?draft=true`.
5. Page sections list comes from `getDefaultPageConfig(siteModel)` in `ContentWorkspace` (not fetched from `/api/page-config` at dashboard level — the page config fetch is done by `PropertiesEditor` for field defaults).

## PostMessage Protocol

Every message is a plain object with a `type` string field. Origin validation is applied on both sides (see Origin Validation below).

### iframe -> dashboard (client site to parent)

| Type | When | Payload | Purpose |
|------|------|---------|---------|
| `reb-node-selected` | User clicks a `[data-reb-section]` element or a `[data-reb-field]` element | `{ section: string, field?: string, label?: string, nodeType: "section"\|"text"\|"image"\|"link"\|"button", rect: NodeRect }` | Primary selection message. Sets the active node in the dashboard, updates the selection overlay, and populates the properties panel. |
| `reb-section-clicked` | Immediately after `reb-node-selected` on section click | `{ section: string }` | Legacy compatibility. Sent alongside `reb-node-selected` for older code paths. |
| `reb-section-hovered` | Mouse enters/leaves a `[data-reb-section]` element | `{ section: string\|null, rect?: NodeRect }` | Drives the hover highlight overlay in `SitePreview`. `section: null` clears the hover. |
| `reb-node-rect` | In response to `reb-request-rect` | `{ section: string, rect: NodeRect }` | Returns the bounding rect of a section element, adjusted for scroll offset (`rect.top` includes `window.scrollY`). |
| `reb-inline-edit` | User blurs a `contenteditable` field inside the iframe | `{ section: string, field: string, value: string }` | Sends the edited text content back to the dashboard for persistence. Only fires for text elements (not links, buttons, or images). |
| `reb-context-menu` | User right-clicks a section | `{ section: string, label?: string, x: number, y: number }` | Coordinates are `clientX`/`clientY` relative to the iframe viewport. Dashboard can use these to position a context menu. |

### dashboard -> iframe (parent to client site)

| Type | When | Payload | Purpose |
|------|------|---------|---------|
| `reb-edit-mode` | iframe loads, or mode toggles | `{ enabled: boolean }` | Activates or deactivates the EditModeOverlay. When enabled, the overlay attaches event listeners to all `[data-reb-section]` and `[data-reb-field]` elements. |
| `reb-request-rect` | User selects a section in `SectionsRail` | `{ section: string }` | Asks the iframe to measure and return the bounding rect of the given section. The iframe responds with `reb-node-rect`. |
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

### Dashboard side (SitePreview.tsx)

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
4. The dashboard's `handleInlineEdit` listener in `SitePreview.tsx` receives the message and writes the updated field to the content API.

### Properties panel editing (dashboard path)

1. User edits content in `PropertiesEditor.tsx` fields or picks an asset from `AssetPickerModal`.
2. The field save calls the content API (`PUT /api/content/{section}?draft=true`) directly from `PropertiesEditor`.
3. Both inline-edit and properties-panel paths result in a draft being written; the `PublishBar` reflects the draft state.

### handleInlineEdit flow (SitePreview.tsx)

```
handleInlineEdit(section, field, value)
  1. GET /api/content/{section}         -- fetch current content JSON
  2. Parse nested field path             -- via getEditablePathValue/setEditablePathValue (src/lib/editable-path.ts)
  3. Deep-set the value on the object
  4. PUT /api/content/{section}?draft=true  -- save as draft
  5. Mark section as having a draft
```

Field paths support dot notation and bracket array indexing (e.g., `services[0].name`). Path parsing lives in `src/lib/editable-path.ts` (`getEditablePathValue` / `setEditablePathValue`).

### Publishing

When the user clicks "Publish" in the `PublishBar` (`src/components/dashboard/design/PublishBar.tsx`):

1. `POST /api/publish` is called.
2. On success, all draft flags are cleared.
3. The iframe reloads to show published content.
4. The `PublishBar` displays outcome status: `"revalidated"` (live site refreshed), `"not_configured"`, or `"failed"`.

## Section Labels

All section display names come from a single shared map in `src/components/ui/section-labels.ts`. This is the canonical source — do not duplicate section names elsewhere.

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

Imported by: `SitePreview.tsx`, `ContentWorkspace.tsx`, `PropertiesEditor.tsx`, and other dashboard components that reference section labels or types.

## UI Features

### Hover highlights

When the user hovers over a section in the iframe, `EditModeOverlay` sends `reb-section-hovered` with the element's bounding rect. `SitePreview` renders a translucent overlay with a label tooltip above the section. The hover overlay is suppressed for the currently selected section to avoid visual clutter.

### Selection overlay

On click, a `reb-node-selected` message carries the section rect. `SitePreview` draws a selection overlay with a label badge. If no rect is available, a fallback label is shown.

### Breakpoint controls

`SitePreview` provides Mobile (375px) / Tablet (768px) / Desktop (1280px) / Fluid controls that set the iframe container width. There is no zoom percentage slider — the iframe fills its container. A live/editable source toggle switches between the tenant's live site URL and the editable (control-plane preview) URL.

### Context menus

Right-clicking a section in the iframe fires `reb-context-menu` with viewport-relative coordinates. The dashboard can position a floating menu at those coordinates (handler exists in protocol; menu UI is not yet implemented in the read code).

### Inline text editing

Text elements with `[data-reb-field]` inside `[data-reb-section]` become `contenteditable` when edit mode is active. Enter (without Shift) commits the edit by blurring the element. Escape also blurs. On blur, the new text content is sent via `reb-inline-edit`.

### AI access from the editor

There is no standalone "AI tab" in `PropertiesEditor`. The right panel has `"properties"` and `"chat"` tabs (state in `DashboardContext` → `rightTab`). AI actions in `PropertiesEditor` are shortcut buttons that open the chat tab (`setRightTab("chat")`) with a pre-filled prompt for the selected section (e.g., "Update my comparison table"). The chat experience itself is `ChatPanel` — the same panel used from the Ask Strelva nav surface. `AgentTrace` streams tool call steps while the AI is working. `AgentPreview` shows proposed diffs for approve/reject.

## Known Limitations

1. **`AgentPreview` approve does not persist changes.** Approving an AI preview in `AgentPreview` clears the preview UI but does not call the content API — changes are not saved. Marked TODO in the code.

2. **No undo/redo.** Content edits (inline or via properties panel) are immediately sent to the API. There is no client-side undo stack. The governed `undo_last_change` agent tool restores the previous section version through the approval queue, but that is an AI tool, not a client-side undo.

3. **No drag-and-drop section reordering.** `SectionsRail` has up/down reorder controls; no drag-and-drop.

4. **iframe origin fallback.** `EditModeOverlay` uses a first-message handshake to establish the trusted parent origin (the first `reb-edit-mode` message origin is captured as `trustedOriginRef`). If the referrer is unavailable before the first message, the origin is `"*"` as fallback on outgoing replies. (This is a code-comment note in `EditModeOverlay.tsx`.)

5. **iframe does not validate incoming message origins before handshake.** Before the first `reb-edit-mode` message is received, `EditModeOverlay` trusts messages from any origin. After handshake, it validates against `trustedOriginRef`. The pre-handshake window is small.

6. **Context menu UI not implemented.** `reb-context-menu` is sent from the iframe; no floating menu is rendered in the dashboard.

7. **Page paths list is code-defined.** `SitePreview.tsx` exports a `PAGE_PATHS` constant (`home`, `services`, `about`, `contact`, `events`, `faq`, `providers`, `shop`). It is not derived from the live site's actual routing — pages outside this list require a manual URL entry.

8. **Rect measurements and iframe scale.** `SitePreview` supports zoom via breakpoint width controls (Mobile/Tablet/Desktop/Fluid). Overlay measurements from the iframe use the iframe's coordinate space; when the iframe is scaled by CSS the overlay positions may drift.
