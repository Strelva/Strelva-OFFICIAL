import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkspaceWork } from "@/experience/workspace/contracts";
import type { BusinessDeliveryItem } from "@/experience/workspace/business-delivery-summary";
import { WorkspaceRequests, businessRequestRows, finiteJobStage } from "@/experience/workspace/WorkspaceRequests";

function job(id: string, status?: string, extra: Partial<WorkspaceWork> = {}): WorkspaceWork {
  return { id, workspaceId: "business-1", title: id, productId: "operations", resourceKind: "responsibility", payload: null, input: {}, createdAt: "2026-10-01T12:00:00Z", operation: status ? { status } : undefined, ...extra };
}

function delivery(id: string, stage: BusinessDeliveryItem["stage"], extra: Partial<BusinessDeliveryItem> = {}): BusinessDeliveryItem {
  return { id, title: id, detail: "Delivery in progress", href: `/workspace/delivery/${id}`, attention: false, handling: stage === "in_progress", stage, provider: { kind: "strelva" }, dueAt: null, updatedAt: "2026-10-02T09:00:00Z", ...extra };
}

const noop = () => undefined;

describe("requests", () => {
  it.each([
    ["proposed", "needs_you"], ["needs_attention", "needs_you"], ["ready", "in_progress"], ["running", "in_progress"],
    ["waiting", "in_progress"], ["paused", "in_progress"], ["completed", "done"], ["cancelled", "closed"], [undefined, "in_progress"],
  ])("puts a finite job that is %s in %s", (status, stage) => expect(finiteJobStage(status)).toBe(stage));

  it("lists requests to a provider and finite jobs together, newest first, and leaves standing work to Running", () => {
    const rows = businessRequestRows(
      [delivery("Rebuild attymooney.com", "in_progress", { dueAt: "2026-10-09T17:00:00Z" })],
      [job("Draft intake questions", "needs_attention", { operation: { status: "needs_attention", reason: "Approve the question order." } }), job("Saved document", undefined, { productId: "documents", resourceKind: "document" })],
      () => "Strelva",
    );
    expect(rows.map(row => [row.title, row.stage])).toEqual([["Rebuild attymooney.com", "in_progress"], ["Draft intake questions", "needs_you"]]);
    expect(rows[0]!.detail).toMatch(/^Delivery in progress · due .+ · by Strelva$/);
    expect(businessRequestRows([delivery("Holiday hours", "done"), delivery("Spanish pages", "asked")], [], () => "Strelva").map(row => row.detail))
      .toEqual(["Done · by Strelva", "Asked · waiting for Strelva to agree scope and deadline"]);
    expect(rows[0]!.href).toBe("/workspace/delivery/Rebuild attymooney.com");
    expect(rows[1]).toMatchObject({ workId: "Draft intake questions", detail: "Approve the question order." });
  });

  it("tells members whose requests they can't see instead of showing an empty list as the truth", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceRequests, { businessName: "The Mooney Firm", work: [job("Draft intake questions", "running")], agencyNames: new Map(), readOnly: false, busy: false, onOpenWork: noop, onAsk: noop }));
    expect(html).toContain("Requests");
    expect(html).toContain("visible to the owners and admins of The Mooney Firm");
    expect(html).toContain("In progress");
    expect(html).toContain("Draft intake questions");
    expect(html).toContain("Ask Strelva for something</button>");
  });

  it("does not invite asking or claim nothing was asked when the business is read-only", () => {
    const html = renderToStaticMarkup(createElement(WorkspaceRequests, { businessName: "The Mooney Firm", work: [], agencyNames: new Map(), readOnly: true, busy: false, onOpenWork: noop, onAsk: noop }));
    expect(html).toContain("No requests you can see.");
    expect(html).not.toContain("Nothing asked yet.");
    expect(html).toContain("Shared with you");
    expect(html).not.toContain("Ask Strelva for something</button>");
  });
});
