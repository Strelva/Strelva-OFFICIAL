import { describe, it, expect } from "vitest";
import { isClientVisibleEvent } from "@/lib/needs-you";
import type { UnifiedEvent } from "@/lib/types";

function ev(over: Partial<UnifiedEvent>): UnifiedEvent {
  return {
    id: "e1",
    tenantId: "t1",
    source: "ai",
    type: "content_update",
    title: "Google hours update",
    body: "",
    status: "pending",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe("client queue visibility — operator-approves-first routing", () => {
  it("hides an operator-audience draft from the client (Strelva approves first)", () => {
    expect(isClientVisibleEvent(ev({ metadata: { reviewAudience: "operator" } }))).toBe(false);
  });

  it("shows an owner-audience draft (the owner asked for it, or it was escalated)", () => {
    expect(isClientVisibleEvent(ev({ metadata: { reviewAudience: "owner" } }))).toBe(true);
  });

  it("shows an untagged event — legacy default, nothing silently disappears", () => {
    expect(isClientVisibleEvent(ev({ metadata: {} }))).toBe(true);
    expect(isClientVisibleEvent(ev({ metadata: undefined }))).toBe(true);
  });

  it("still hides operator suggestion cards regardless of audience (Phase 1)", () => {
    expect(
      isClientVisibleEvent(ev({ type: "suggestion", title: "Write your site description", metadata: {} })),
    ).toBe(false);
  });
});
