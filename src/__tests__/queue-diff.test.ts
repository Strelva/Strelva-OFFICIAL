import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { QueuePage } from "@/components/dashboard/QueuePage";
import type { UnifiedEvent } from "@/lib/types";

// The approval queue renders a compact field-level BEFORE→AFTER diff for a
// pending content-change event, so a bulk-approver sees what actually changed
// instead of trusting the label. Covers add / remove / change.

function contentEvent(diffs: unknown[]): UnifiedEvent {
  return {
    id: "evt_diff",
    tenantId: "t1",
    source: "ai",
    type: "content_update",
    title: "AI proposed changes to hero",
    body: "headline changed",
    status: "pending",
    createdAt: new Date().toISOString(),
    metadata: { kind: "agent_preview", section: "hero", diffs },
  };
}

function render(event: UnifiedEvent): string {
  return renderToStaticMarkup(
    createElement(QueuePage, {
      initialPending: [event],
      initialResolved: [],
      pendingCount: 1,
    }),
  );
}

describe("QueuePage approval-with-diff", () => {
  it("renders added, removed, and changed field values", () => {
    const html = render(
      contentEvent([
        { field: "headline", before: "Old headline", after: "New headline", type: "changed" },
        { field: "subheadline", before: "", after: "Fresh subheadline", type: "added" },
        { field: "cta", before: "Book now", after: "", type: "removed" },
      ]),
    );

    expect(html).toContain("What changed");
    // changed → both sides shown
    expect(html).toContain("Old headline");
    expect(html).toContain("New headline");
    // added → the new value
    expect(html).toContain("Fresh subheadline");
    // removed → the old value, struck through
    expect(html).toContain("Book now");
    expect(html).toContain("line-through");
    // field names are surfaced
    expect(html).toContain("headline");
    expect(html).toContain("cta");
  });

  it("does not render a diff block when the event carries no diffs", () => {
    const html = render(contentEvent([]));
    expect(html).not.toContain("What changed");
  });

  it("caps the visible rows and reports the overflow count", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      field: `field${i}`,
      before: `b${i}`,
      after: `a${i}`,
      type: "changed" as const,
    }));
    const html = render(contentEvent(many));
    expect(html).toContain("What changed");
    // 9 changes, 6 shown → "+3 more fields changed"
    expect(html).toContain("more field");
  });
});
