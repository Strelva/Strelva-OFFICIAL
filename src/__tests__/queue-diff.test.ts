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

// A GBP post / hours draft publishes to the owner's live Google listing on
// approval, so the card must show the actual post text / proposed hours — not
// just the "Google post draft" label a bulk-approver would otherwise trust.

function gbpEvent(metadata: Record<string, unknown>, title: string): UnifiedEvent {
  return {
    id: `evt_${title}`,
    tenantId: "t1",
    source: "ai",
    type: "content_update",
    title,
    body: "",
    status: "pending",
    createdAt: new Date().toISOString(),
    metadata,
  };
}

describe("QueuePage approval-with-GBP-content", () => {
  it("renders the drafted Google post text and its CTA link", () => {
    const html = render(
      gbpEvent(
        {
          kind: "gbp_post_draft",
          summary: "Fall sale — 20% off every service through Sunday!",
          ctaUrl: "https://book.example.com/fall",
        },
        "Google post draft",
      ),
    );
    expect(html).toContain("What will be posted to Google");
    expect(html).toContain("Fall sale — 20% off every service through Sunday!");
    expect(html).toContain("https://book.example.com/fall");
  });

  it("renders a Google post with no CTA and omits the button line", () => {
    const html = render(
      gbpEvent(
        { kind: "gbp_post_draft", summary: "We're open Labor Day, come say hi." },
        "Google post draft",
      ),
    );
    expect(html).toContain("What will be posted to Google");
    expect(html).toContain("We&#x27;re open Labor Day, come say hi.");
    expect(html).not.toContain("Button link");
  });

  it("renders the proposed Google hours in owner-friendly 12h time", () => {
    const html = render(
      gbpEvent(
        {
          kind: "gbp_hours_draft",
          hours: [
            { day: "MONDAY", open: "09:00", close: "17:00" },
            { day: "SATURDAY", open: "10:00", close: "14:00" },
          ],
        },
        "Google hours update",
      ),
    );
    expect(html).toContain("New hours for Google");
    expect(html).toContain("Monday");
    expect(html).toContain("9:00 AM");
    expect(html).toContain("5:00 PM");
    expect(html).toContain("Saturday");
    expect(html).toContain("2:00 PM");
  });
});
