import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ active: true, actor: { userId: "33333333-3333-4333-8333-333333333333", verifiedEmail: "approver@strelva.example" } }));
const record = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/auth", () => ({
  getAuthenticatedOperatorContext: async () => auth.active ? { actor: auth.actor, email: auth.actor.verifiedEmail, authTime: 1_791_384_000 } : null,
}));
vi.mock("@/platform/workspaces/operator-approvals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/workspaces/operator-approvals")>()),
  recordOperatorActionApproval: record,
}));

import { POST } from "@/app/api/admin/workspaces/[id]/action-approvals/route";

afterEach(() => { auth.active = true; record.mockReset(); });

describe("operator action approval route", () => {
  it("takes the approver from the verified session actor and ignores client approval flags", async () => {
    record.mockResolvedValue({ approvalId: "55555555-5555-4555-8555-555555555555" });
    const response = await POST(new Request("https://app.strelva.com/api/admin/workspaces/11111111-1111-4111-8111-111111111111/action-approvals", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "owner_invitation.issue", recipientEmail: "owner@example.test", sendEmail: false, approvedBy: "attacker", jacobApproved: true }),
    }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(201);
    expect(record).toHaveBeenCalledWith(auth.actor, "11111111-1111-4111-8111-111111111111", {
      kind: "owner_invitation.issue", recipientEmail: "owner@example.test", sendEmail: false,
    });
  });

  it("refuses to create a record without an active authenticated operator", async () => {
    auth.active = false;
    const response = await POST(new Request("https://app.strelva.com/api/admin/workspaces/11111111-1111-4111-8111-111111111111/action-approvals", {
      method: "POST", body: JSON.stringify({ kind: "owner_invitation.issue", recipientEmail: "owner@example.test", sendEmail: false }),
    }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(403);
    expect(record).not.toHaveBeenCalled();
  });

  it("keeps owner invitation email disabled during the silent rollout", async () => {
    const response = await POST(new Request("https://app.strelva.com/api/admin/workspaces/11111111-1111-4111-8111-111111111111/action-approvals", {
      method: "POST", body: JSON.stringify({ kind: "owner_invitation.issue", recipientEmail: "owner@example.test", sendEmail: true }),
    }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });
    expect(response.status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });
});
