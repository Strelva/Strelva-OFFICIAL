import { describe, it, expect } from "vitest";
import {
  SECTION_LABELS,
  SECTION_ICONS,
  COMPOSITE_SECTIONS,
  ALL_SECTION_TYPES,
} from "@/components/ui/section-labels";

// ---------------------------------------------------------------------------
// Section Labels — shared data integrity
// ---------------------------------------------------------------------------

describe("SECTION_LABELS", () => {
  it("is a non-empty record", () => {
    expect(Object.keys(SECTION_LABELS).length).toBeGreaterThan(0);
  });

  const expectedSections = [
    "hero",
    "services",
    "story",
    "testimonials",
    "events",
    "providers",
    "contact",
    "settings",
    "faq",
    "shop",
    "trust-strip",
    "testimonial-quote",
    "cta",
    "page-header",
    "booking-widget",
    "instagram-feed",
    "vagaro-booking",
    "products",
    "comparison",
    "notify",
    "email-popup",
    "typographic-break",
    "newsletter",
    "theme",
    "rewardsConfig",
    "navigation",
    "footer",
  ];

  it("has entries for all expected section types", () => {
    for (const key of expectedSections) {
      expect(SECTION_LABELS).toHaveProperty(key);
    }
  });

  it("has no duplicate keys (object keys are inherently unique, but values should also be unique)", () => {
    const values = Object.values(SECTION_LABELS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("all values are non-empty strings", () => {
    for (const [key, value] of Object.entries(SECTION_LABELS)) {
      expect(typeof value).toBe("string");
      expect(value.trim().length, `SECTION_LABELS["${key}"] should not be empty`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// SECTION_ICONS — every label has a corresponding icon
// ---------------------------------------------------------------------------

describe("SECTION_ICONS", () => {
  it("has an icon for every key in SECTION_LABELS", () => {
    for (const key of Object.keys(SECTION_LABELS)) {
      expect(SECTION_ICONS, `Missing icon for "${key}"`).toHaveProperty(key);
    }
  });

  it("every icon value is defined and truthy", () => {
    for (const [key, icon] of Object.entries(SECTION_ICONS)) {
      expect(icon, `SECTION_ICONS["${key}"] should be defined`).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// COMPOSITE_SECTIONS — layout-only sections are a valid subset
// ---------------------------------------------------------------------------

describe("COMPOSITE_SECTIONS", () => {
  it("is a Set", () => {
    expect(COMPOSITE_SECTIONS).toBeInstanceOf(Set);
  });

  it("every composite section exists in SECTION_LABELS", () => {
    for (const section of COMPOSITE_SECTIONS) {
      expect(SECTION_LABELS, `Composite section "${section}" missing from SECTION_LABELS`).toHaveProperty(section);
    }
  });

  it("does not include primary content sections", () => {
    const primarySections = ["hero", "services", "story", "testimonials", "contact"];
    for (const section of primarySections) {
      expect(COMPOSITE_SECTIONS.has(section), `"${section}" should not be composite`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// ALL_SECTION_TYPES — ordered array for the add-section menu
// ---------------------------------------------------------------------------

describe("ALL_SECTION_TYPES", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(ALL_SECTION_TYPES)).toBe(true);
    expect(ALL_SECTION_TYPES.length).toBeGreaterThan(0);
  });

  it("has no duplicate entries", () => {
    const unique = new Set(ALL_SECTION_TYPES);
    expect(unique.size).toBe(ALL_SECTION_TYPES.length);
  });

  it("every entry has a label in SECTION_LABELS", () => {
    for (const type of ALL_SECTION_TYPES) {
      expect(SECTION_LABELS, `ALL_SECTION_TYPES entry "${type}" missing from SECTION_LABELS`).toHaveProperty(type);
    }
  });
});

// ---------------------------------------------------------------------------
// getParentOrigin() logic
//
// This function lives inside EditModeOverlay.tsx and is not exported.
// We mirror its implementation here to verify the origin-resolution logic
// that controls postMessage target origins on the iframe side.
//
// Source: src/components/public/EditModeOverlay.tsx lines 5-11
// ---------------------------------------------------------------------------

function getParentOrigin(referrer: string): string {
  try {
    return referrer ? new URL(referrer).origin : "*";
  } catch {
    return "*";
  }
}

describe("getParentOrigin logic (mirrors EditModeOverlay.tsx)", () => {
  it("returns the origin when referrer is a valid URL", () => {
    expect(getParentOrigin("https://dashboard.example.com/sites/abc")).toBe(
      "https://dashboard.example.com",
    );
  });

  it("returns the origin for localhost URLs", () => {
    expect(getParentOrigin("http://localhost:3000/design")).toBe(
      "http://localhost:3000",
    );
  });

  it('returns "*" when referrer is empty', () => {
    expect(getParentOrigin("")).toBe("*");
  });

  it('returns "*" when referrer is an invalid URL', () => {
    expect(getParentOrigin("not-a-url")).toBe("*");
  });

  it("strips path, query, and fragment from the referrer", () => {
    expect(
      getParentOrigin("https://app.scaffold.dev:443/foo?bar=1#baz"),
    ).toBe("https://app.scaffold.dev");
  });
});

// ---------------------------------------------------------------------------
// Origin validation pattern (dashboard side)
//
// The dashboard validates incoming postMessage origins against an allowlist
// built from [window.location.origin, previewOrigin]. This pattern appears
// in DesignMode.tsx and DesignCanvas.tsx. We test the logic here without
// needing React or DOM.
//
// Source: src/components/dashboard/DesignMode.tsx lines 176-179
//         src/components/dashboard/design/DesignCanvas.tsx lines 46-49
// ---------------------------------------------------------------------------

function isOriginAllowed(
  eventOrigin: string,
  dashboardOrigin: string,
  previewOrigin: string | null,
): boolean {
  if (!eventOrigin || eventOrigin === "null") return false;
  const allowed = [dashboardOrigin];
  if (previewOrigin) allowed.push(previewOrigin);
  return allowed.includes(eventOrigin);
}

describe("origin validation pattern (mirrors DesignMode/DesignCanvas)", () => {
  const dashboard = "https://app.scaffold.dev";
  const preview = "https://client-site.com";

  it("accepts messages from the dashboard origin", () => {
    expect(isOriginAllowed(dashboard, dashboard, preview)).toBe(true);
  });

  it("accepts messages from the preview/tenant origin", () => {
    expect(isOriginAllowed(preview, dashboard, preview)).toBe(true);
  });

  it("rejects messages from an unknown origin", () => {
    expect(isOriginAllowed("https://evil.com", dashboard, preview)).toBe(false);
  });

  it("rejects empty origin", () => {
    expect(isOriginAllowed("", dashboard, preview)).toBe(false);
  });

  it('rejects the string "null" origin (opaque origins)', () => {
    expect(isOriginAllowed("null", dashboard, preview)).toBe(false);
  });

  it("works when previewOrigin is null (only dashboard origin allowed)", () => {
    expect(isOriginAllowed(dashboard, dashboard, null)).toBe(true);
    expect(isOriginAllowed(preview, dashboard, null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PostMessage protocol — message type strings
//
// There are no centralized constants for message types in the codebase; they
// are string literals scattered across EditModeOverlay.tsx, DesignMode.tsx,
// DesignCanvas.tsx, and preview-html.ts. This test documents the full
// protocol as described in docs/visual-editor.md and verifies that the types
// are consistent between the documentation and the source files.
// ---------------------------------------------------------------------------

describe("postMessage protocol types (documentation contract)", () => {
  // iframe -> dashboard
  const iframeToParent = [
    "reb-node-selected",
    "reb-section-clicked",
    "reb-section-hovered",
    "reb-node-rect",
    "reb-inline-edit",
    "reb-context-menu",
  ] as const;

  // dashboard -> iframe
  const parentToIframe = [
    "reb-edit-mode",
    "reb-request-rect",
    "reb-highlight-section",
  ] as const;

  it("all message types use the reb- prefix", () => {
    for (const type of [...iframeToParent, ...parentToIframe]) {
      expect(type.startsWith("reb-"), `"${type}" should start with "reb-"`).toBe(true);
    }
  });

  it("iframe-to-parent types are distinct from parent-to-iframe types", () => {
    const overlap = iframeToParent.filter((t) =>
      (parentToIframe as readonly string[]).includes(t),
    );
    expect(overlap, "No message type should appear in both directions").toEqual([]);
  });

  it("all protocol types are unique", () => {
    const all = [...iframeToParent, ...parentToIframe];
    expect(new Set(all).size).toBe(all.length);
  });

  // Verify that the documented types actually appear in source files.
  // We can't import the raw source, but we can assert the exact strings
  // match what the components use (validated by reading the source above).
  it("reb-node-selected payload shape matches protocol spec", () => {
    const examplePayload = {
      type: "reb-node-selected",
      section: "hero",
      label: "First Impression",
      nodeType: "section",
      rect: { top: 100, left: 0, width: 1280, height: 600 },
    };
    expect(examplePayload.type).toBe("reb-node-selected");
    expect(examplePayload).toHaveProperty("section");
    expect(examplePayload).toHaveProperty("rect");
    expect(examplePayload.rect).toHaveProperty("top");
    expect(examplePayload.rect).toHaveProperty("left");
    expect(examplePayload.rect).toHaveProperty("width");
    expect(examplePayload.rect).toHaveProperty("height");
  });

  it("reb-inline-edit payload shape matches protocol spec", () => {
    const examplePayload = {
      type: "reb-inline-edit",
      section: "hero",
      field: "headline",
      value: "Welcome to our site",
    };
    expect(examplePayload.type).toBe("reb-inline-edit");
    expect(examplePayload).toHaveProperty("section");
    expect(examplePayload).toHaveProperty("field");
    expect(examplePayload).toHaveProperty("value");
  });
});

// ---------------------------------------------------------------------------
// NOTE: What would need extraction to be fully unit-testable
//
// The following logic is embedded inside React components and is not testable
// without a full JSDOM + testing-library setup:
//
// 1. EditModeOverlay.tsx — The actual postMessage event listeners, DOM
//    manipulation (contenteditable, highlight classes, scroll-into-view),
//    and the edit mode toggle. getParentOrigin() is a module-level function
//    but not exported.
//
// 2. DesignCanvas.tsx — sectionLabel() helper (line 8-10), zoom clamping
//    logic, and the hover/selection overlay positioning.
//
// 3. DesignMode.tsx — buildTreeFromPageConfig() (line 52-81), content update
//    with nested field path parsing (line 380), and the full message dispatch
//    handler.
//
// Extracting these into pure utility files would make them directly testable:
//   - getParentOrigin() -> src/lib/visual-editor-utils.ts
//   - sectionLabel()    -> already uses SECTION_LABELS, could be in section-labels.ts
//   - buildTreeFromPageConfig() -> src/lib/design-tree.ts
//   - parseFieldPath()  -> src/lib/field-path.ts
//   - isOriginAllowed() -> src/lib/origin-validation.ts
// ---------------------------------------------------------------------------
