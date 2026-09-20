import { describe, expect, it } from "vitest";
import { selectWebsiteRequestHistory } from "@/lib/website-history";
import type { UnifiedEvent } from "@/lib/types";

const base = {
  tenantId: "tenant-a",
  body: "",
  createdAt: "2026-09-20T12:00:00.000Z",
} satisfies Pick<UnifiedEvent, "tenantId" | "body" | "createdAt">;

describe("website request history", () => {
  it("keeps one custom request identity through proposal stages and shipping", () => {
    const request: UnifiedEvent = {
      ...base,
      id: "evt_request_1",
      source: "website",
      type: "change_request",
      title: "Requested template change: Saturday hours",
      status: "approved",
      resolvedAt: "2026-09-20T15:00:00.000Z",
      metadata: {
        kind: "custom_code_or_design_request",
        workflowStatus: "shipped",
        workflowHistory: [
          { status: "requested", actor: "customer", at: base.createdAt },
          { status: "quoted", actor: "operator-1", at: "2026-09-20T13:00:00.000Z" },
          { status: "shipped", actor: "operator-1", at: "2026-09-20T15:00:00.000Z" },
        ],
      },
    };

    const [item] = selectWebsiteRequestHistory([request]);
    expect(item).toMatchObject({
      requestId: "evt_request_1",
      kind: "custom_request",
      status: "shipped",
      stages: [
        { status: "requested" },
        { status: "quoted" },
        { status: "shipped" },
      ],
    });
  });

  it("shows a governed content proposal as review, then published under the same event id", () => {
    const pending: UnifiedEvent = {
      ...base,
      id: "evt_content_1",
      source: "ai",
      type: "content_update",
      title: "AI drafted changes to hero",
      status: "pending",
      metadata: { kind: "agent_preview", section: "hero" },
    };
    const published: UnifiedEvent = {
      ...pending,
      status: "approved",
      resolvedAt: "2026-09-20T14:00:00.000Z",
    };

    expect(selectWebsiteRequestHistory([pending])[0]).toMatchObject({
      requestId: "evt_content_1",
      status: "review",
      stages: [{ status: "proposed" }],
    });
    expect(selectWebsiteRequestHistory([published])[0]).toMatchObject({
      requestId: "evt_content_1",
      status: "published",
      stages: [{ status: "proposed" }, { status: "published" }],
    });
  });
});
