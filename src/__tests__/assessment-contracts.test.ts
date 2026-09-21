import { beforeEach, describe, expect, it, vi } from "vitest";

const recoveryMocks = vi.hoisted(() => ({ operation: vi.fn(), run: vi.fn() }));

vi.mock("@/platform/workspaces", async () => {
  const types = await import("@/platform/workspaces/types");
  return { ...types, operationRequest: recoveryMocks.operation };
});
vi.mock("@/products/ai-visibility/server", () => ({ runPrivateAiVisibilityAssessment: recoveryMocks.run }));

import { recoverAssessment } from "@/products/assessment/recovery";
import { assessmentActionsFor, presentAssessmentWork } from "@/products/assessment";

const aiPayload = {
  business: "Harbor Dental",
  url: "https://harbordental.example",
  score: 74,
  grade: "B" as const,
  verdict: "Identity is clear.",
  topFix: "Add service detail.",
  signals: [],
  citation: { probed: false, mentioned: false, recommended: false, note: "Not measured" },
};

const auditPayload = {
  url: "https://harbordental.example",
  scannedAt: "2026-09-08T12:00:00.000Z",
  overallScore: 74,
  grade: "B" as const,
  categories: [],
};

describe("assessment presentation contract", () => {
  it("keeps method, payload and handoff action discriminated", () => {
    const ai = presentAssessmentWork({ id: "ai", workspaceId: "workspace", productId: "ai_visibility", resourceKind: "ai_visibility_assessment", payload: aiPayload, createdAt: "2026-09-08T13:00:00.000Z" });
    const audit = presentAssessmentWork({ id: "audit", workspaceId: "workspace", productId: "website_audit", resourceKind: "website_audit_report", payload: auditPayload, createdAt: "2026-09-08T13:00:00.000Z" });

    expect(ai?.kind).toBe("ai_visibility");
    expect(ai?.payload).toEqual(aiPayload);
    expect(ai?.observedAt).toBeNull();
    expect(ai?.observedAtBasis).toBe("saved");
    expect(ai?.recordedAt).toBe("2026-09-08T13:00:00.000Z");
    expect(ai?.actions.handoff.allowed).toBe(true);
    expect(audit?.kind).toBe("website_audit");
    expect(audit?.payload).toEqual(auditPayload);
    expect(audit?.observedAt).toBe(auditPayload.scannedAt);
    expect(audit?.observedAtBasis).toBe("evidence");
    expect(audit?.actions.handoff.allowed).toBe(false);
  });

  it("does not grant handoff to public or delegated read views", () => {
    expect(assessmentActionsFor("ai_visibility", true, "public").save.allowed).toBe(true);
    expect(assessmentActionsFor("ai_visibility", true, "owned").handoff.allowed).toBe(true);
    expect(assessmentActionsFor("ai_visibility", true, "delegated_read").handoff.allowed).toBe(false);
    expect(assessmentActionsFor("ai_visibility", true, "public").handoff.allowed).toBe(false);
  });

  it("keeps source observation provenance separate from the presentation schema", () => {
    const assessment = presentAssessmentWork({
      id: "source-timestamp",
      workspaceId: "workspace",
      productId: "ai_visibility",
      resourceKind: "ai_visibility_assessment",
      payload: aiPayload,
      createdAt: "2026-09-08T13:00:00.000Z",
      observedAt: "2026-09-08T12:00:00.000Z",
      observedAtBasis: "source",
    });

    expect(assessment?.observedAt).toBe("2026-09-08T12:00:00.000Z");
    expect(assessment?.observedAtBasis).toBe("source");
    expect(assessment?.recordedAt).toBe("2026-09-08T13:00:00.000Z");
    expect(assessment?.presentationVersion).toBe("1");
    expect(assessment?.method.version).toBeUndefined();
  });

  it("returns an explicit unavailable assessment for malformed saved payloads", () => {
    const assessment = presentAssessmentWork({ id: "bad", workspaceId: "workspace", productId: "ai_visibility", resourceKind: "ai_visibility_assessment", payload: { private: "data" }, createdAt: "2026-09-08T13:00:00.000Z" });
    expect(assessment?.kind).toBe("ai_visibility");
    expect(assessment?.payload).toBeNull();
    expect(assessment?.availability).toBe("unavailable");
    expect(assessment?.unavailableReason).toContain("could not be displayed");
  });
});

describe("bounded assessment recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    recoveryMocks.operation.mockResolvedValue({ product_id: "ai_visibility", input: {
      business: "Harbor Dental", url: "https://harbordental.example", category: "Dentist", location: "Buffalo, NY",
    } });
    recoveryMocks.run.mockResolvedValue({ id: "saved", workspaceId: "workspace" });
  });

  it("reconstructs only the durable product input and delegates execution", async () => {
    const actor = { userId: "actor", verifiedEmail: "owner@example.com" };
    await recoverAssessment({ actor, workspaceId: "workspace", operationId: "operation" });
    expect(recoveryMocks.operation).toHaveBeenCalledWith(actor, "workspace", "operation", "read");
    expect(recoveryMocks.run).toHaveBeenCalledWith({
      actor,
      workspaceId: "workspace",
      requestId: "operation",
      input: { business: "Harbor Dental", url: "https://harbordental.example", category: "Dentist", location: "Buffalo, NY" },
    });
  });

  it("rejects a different product or extra reconstructed fields before execution", async () => {
    recoveryMocks.operation.mockResolvedValueOnce({ product_id: "website_audit", input: {} });
    await expect(recoverAssessment({ actor: { userId: "actor", verifiedEmail: "owner@example.com" }, workspaceId: "workspace", operationId: "operation" })).rejects.toMatchObject({ name: "WorkspaceAccessError" });
    expect(recoveryMocks.run).not.toHaveBeenCalled();

    recoveryMocks.operation.mockResolvedValueOnce({ product_id: "ai_visibility", input: { business: "Harbor Dental", secret: "not accepted" } });
    await expect(recoverAssessment({ actor: { userId: "actor", verifiedEmail: "owner@example.com" }, workspaceId: "workspace", operationId: "operation" })).rejects.toThrow();
    expect(recoveryMocks.run).not.toHaveBeenCalled();
  });
});
