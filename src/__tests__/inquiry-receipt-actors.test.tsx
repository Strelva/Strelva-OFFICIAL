import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InquiryContextValue } from "@/experience/inquiries/context";
import type { InquirySurfaceSnapshot } from "@/experience/inquiries/contracts";
import { createPreviewInquiryAdapter } from "@/experience/inquiries/preview-fixture";
import { inquiryChangeActorLabels } from "@/experience/inquiries/recorded-actors";

const mocked = vi.hoisted(() => ({ context: null as InquiryContextValue | null }));
vi.mock("@/experience/inquiries/context", () => ({ useInquiry: () => mocked.context }));
import { ViewRouter } from "@/experience/inquiries/views";

async function prepared() {
  const adapter = createPreviewInquiryAdapter();
  const requestId = adapter.getSnapshot().state.requests[0]!.id;
  await adapter.execute({ kind: "accept-shape", requestId, input: { actorId: "private-owner-id" } });
  const snapshot = adapter.getSnapshot();
  const receipt = snapshot.state.changes[0]!;
  receipt.actorIds = ["private-owner-id"];
  const action = snapshot.state.actionReceipts.find(event => event.requestId === requestId && event.capabilityId === receipt.capabilityId)!;
  action.actor = { kind: "person", id: "private-owner-id", label: "Recorded owner" };
  return { snapshot, receipt, action };
}

function render(snapshot: InquirySurfaceSnapshot, view: "receipt" | "work" = "receipt") {
  const work = snapshot.state.requests[0]!;
  mocked.context = { snapshot, view, requestId: work.id, inquiryId: null, initialRequestText: "", basePath: "/workspace", pending: false, message: "", error: "", selectedWork: work, selectedRecord: undefined, selectedCapability: snapshot.capabilities[0], selectedWhy: undefined, can: () => false, navigate: vi.fn(), perform: vi.fn(), clearFeedback: vi.fn() };
  return renderToStaticMarkup(createElement(ViewRouter));
}

describe("recorded inquiry receipt identities", () => {
  it("shows retained scoped actor names instead of receipt IDs", async () => {
    const { snapshot, receipt } = await prepared();
    expect(inquiryChangeActorLabels(snapshot, receipt)).toBe("Recorded owner");
    const html = render(snapshot);
    expect(html).toContain("Recorded owner");
    expect(html).not.toContain("private-owner-id");
  });

  it("does not infer identity from another request or the current viewer", async () => {
    const { snapshot, receipt, action } = await prepared();
    action.requestId = "another-request";
    snapshot.account = { name: "Current viewer", email: "private@example.invalid", memberships: [] };
    expect(inquiryChangeActorLabels(snapshot, receipt)).toBe("Actor not recorded");
    const html = render(snapshot);
    expect(html).toContain("Actor not recorded");
    expect(html).not.toContain("private-owner-id");
    expect(html).not.toContain("Current viewer");
    expect(html).not.toContain("private@example.invalid");
  });

  it("preserves unknown actors and refuses conflicting historical names", async () => {
    const { snapshot, receipt, action } = await prepared();
    receipt.actorIds.push("unnamed-actor");
    expect(inquiryChangeActorLabels(snapshot, receipt)).toBe("Recorded owner · Actor not recorded");
    snapshot.state.actionReceipts.push({ ...action, id: "conflicting-receipt", actor: { kind: "person", id: action.actor.id, label: "A different name" } });
    expect(inquiryChangeActorLabels(snapshot, receipt)).toBe("Actor not recorded");
    receipt.actorIds = [];
    expect(inquiryChangeActorLabels(snapshot, receipt)).toBe("Actor not recorded");
  });

  it("does not borrow a later or earlier actor snapshot from another Change in the same request", async () => {
    const { snapshot, receipt, action } = await prepared();
    action.createdAt = new Date(Date.parse(receipt.updatedAt) + 1000).toISOString();
    expect(inquiryChangeActorLabels(snapshot, receipt)).toBe("Actor not recorded");
    action.createdAt = new Date(Date.parse(receipt.createdAt) - 1000).toISOString();
    expect(inquiryChangeActorLabels(snapshot, receipt)).toBe("Actor not recorded");
    action.createdAt = "invalid";
    expect(inquiryChangeActorLabels(snapshot, receipt)).toBe("Actor not recorded");
    receipt.createdAt = "invalid";
    expect(inquiryChangeActorLabels(snapshot, receipt)).toBe("Actor not recorded");
  });

  it("names the form and business in the Request inspector", async () => {
    const { snapshot } = await prepared();
    const html = render(snapshot, "work");
    expect(html).toContain(`<dt>Business</dt><dd>${snapshot.business.name}</dd>`);
    expect(html).toContain(`<dt>Form</dt><dd>${snapshot.state.requests[0]!.draft!.name}</dd>`);
    expect(html).not.toContain("<dt>Capability</dt>");
    expect(html).not.toContain(">Work<");
    expect(html).toContain("Try the form with a made-up customer before it can go live.");
    expect(html).not.toContain("through the capability");
  });
});
