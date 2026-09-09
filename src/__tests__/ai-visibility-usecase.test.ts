import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  listWork: vi.fn(),
  assertCanSaveWork: vi.fn(),
  saveWork: vi.fn(),
  operation: vi.fn(),
  rate: vi.fn(),
  score: vi.fn(),
  getPublicResult: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate }));
vi.mock("@/products/ai-visibility/score", () => ({ scoreAiVisibility: mocks.score }));
vi.mock("@/products/ai-visibility/results", () => ({ getAiVisibilityResult: mocks.getPublicResult }));
vi.mock("@/platform/workspaces", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/platform/workspaces")>();
  return {
    ...actual,
    listWorkspaces: mocks.listWorkspaces,
    listWork: mocks.listWork,
    assertCanSaveWork: mocks.assertCanSaveWork,
    saveWork: mocks.saveWork,
    runWorkspaceOperation: mocks.operation,
  };
});

import {
  PrivateAiVisibilityAssessmentRateLimitError,
  PublicAiVisibilityImportRateLimitError,
  PublicAiVisibilityResultUnavailableError,
  runPrivateAiVisibilityAssessment,
} from "@/products/ai-visibility/usecase";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces";

const actor = { userId: "actor", verifiedEmail: "owner@example.com" };
const workspace = { id: "workspace", kind: "personal" as const, name: "My work", access: "member" as const };
const input = { business: "Example", url: "https://example.com", category: "service", location: "Buffalo" };
const scored = {
  business: "Example", score: 70, grade: "C" as const, verdict: "Readiness signals found", topFix: "Add business schema",
  signals: [], citation: { probed: false, mentioned: false, recommended: false, note: "Not measured" },
};
const saved = {
  id: "saved", workspaceId: workspace.id, productId: "ai_visibility", resourceKind: "private_ai_visibility_work",
  payload: scored, title: "Example", input, createdBy: actor.userId, createdAt: "today", updatedAt: "today",
};
const publicResult = {
  id: "scan_public123",
  result: { ...scored, url: "https://example.com", privateSecret: "do not copy" },
  input: { category: "service", location: "Buffalo", privateInput: "do not copy" },
  createdAt: "today",
};

describe("private AI Visibility workspace use case", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listWorkspaces.mockResolvedValue([workspace]);
    mocks.listWork.mockResolvedValue([]);
    mocks.assertCanSaveWork.mockResolvedValue(undefined);
    mocks.rate.mockResolvedValue(false);
    mocks.score.mockResolvedValue(scored);
    mocks.saveWork.mockResolvedValue(saved);
    mocks.getPublicResult.mockResolvedValue(publicResult);
    mocks.operation.mockImplementation(async ({ actor, workspaceId, work, run }) => {
      await mocks.assertCanSaveWork(actor, workspaceId);
      return mocks.saveWork(actor, workspaceId, { ...work, payload: await run() });
    });
  });

  it("checks direct workspace membership before any capacity, rate, or provider work", async () => {
    mocks.listWorkspaces.mockResolvedValue([{ ...workspace, access: "delegated_read" }]);

    await expect(runPrivateAiVisibilityAssessment({ actor, workspaceId: workspace.id, input }))
      .rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(mocks.assertCanSaveWork).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.score).not.toHaveBeenCalled();
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("checks persistence capacity before incurring provider spend", async () => {
    const conflict = new WorkspaceConflictError();
    mocks.assertCanSaveWork.mockRejectedValue(conflict);

    await expect(runPrivateAiVisibilityAssessment({ actor, workspaceId: workspace.id, input }))
      .rejects.toBe(conflict);
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.score).not.toHaveBeenCalled();
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("enforces the per-person daily budget before scoring", async () => {
    mocks.rate.mockResolvedValue(true);

    await expect(runPrivateAiVisibilityAssessment({ actor, workspaceId: workspace.id, input }))
      .rejects.toBeInstanceOf(PrivateAiVisibilityAssessmentRateLimitError);
    expect(mocks.rate).toHaveBeenCalledWith("workspace:assessment:actor", 10, 86_400_000);
    expect(mocks.score).not.toHaveBeenCalled();
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("saves only the server-produced private workspace record", async () => {
    await expect(runPrivateAiVisibilityAssessment({ actor, workspaceId: workspace.id, input }))
      .resolves.toBe(saved);
    expect(mocks.score).toHaveBeenCalledWith(input);
    expect(mocks.saveWork).toHaveBeenCalledWith(actor, workspace.id, {
      productId: "ai_visibility",
      resourceKind: "private_ai_visibility_work",
      title: "Example",
      payload: scored,
      input,
    });
  });

  it("imports an explicit public result as a sanitized private copy with provenance", async () => {
    const { savePublicAiVisibilityResult } = await import("@/products/ai-visibility/usecase");

    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .resolves.toMatchObject({ work: saved, created: true });
    expect(mocks.score).not.toHaveBeenCalled();
    expect(mocks.saveWork).toHaveBeenCalledWith(actor, workspace.id, {
      productId: "ai_visibility",
      resourceKind: "private_ai_visibility_work",
      title: "Example",
      payload: { ...scored, url: "https://example.com" },
      input: {
        business: "Example",
        url: "https://example.com",
        category: "service",
        location: "Buffalo",
        sourcePublicResultId: "scan_public123",
      },
    });
  });

  it("returns an existing import on retry without spending another rate or capacity check", async () => {
    const { savePublicAiVisibilityResult } = await import("@/products/ai-visibility/usecase");
    const imported = { ...saved, input: { ...saved.input, sourcePublicResultId: publicResult.id } };
    mocks.listWork.mockResolvedValue([imported]);

    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .resolves.toEqual({ work: imported, created: false });
    expect(mocks.assertCanSaveWork).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("does not read or copy a public result for delegated-only workspaces", async () => {
    const { savePublicAiVisibilityResult } = await import("@/products/ai-visibility/usecase");
    mocks.listWorkspaces.mockResolvedValue([{ ...workspace, access: "delegated_read" }]);

    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(mocks.getPublicResult).not.toHaveBeenCalled();
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("does not read a public result for an unlisted workspace", async () => {
    const { savePublicAiVisibilityResult } = await import("@/products/ai-visibility/usecase");
    mocks.listWorkspaces.mockResolvedValue([]);

    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(mocks.getPublicResult).not.toHaveBeenCalled();
  });

  it("rejects an unavailable or malformed retained result without creating work", async () => {
    const { savePublicAiVisibilityResult } = await import("@/products/ai-visibility/usecase");
    mocks.getPublicResult.mockResolvedValue({
      ...publicResult,
      result: { ...publicResult.result, signals: "not-an-array" },
    });

    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .rejects.toBeInstanceOf(PublicAiVisibilityResultUnavailableError);
    expect(mocks.saveWork).not.toHaveBeenCalled();

    mocks.getPublicResult.mockResolvedValue(null);
    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .rejects.toBeInstanceOf(PublicAiVisibilityResultUnavailableError);
    expect(mocks.saveWork).not.toHaveBeenCalled();

    mocks.getPublicResult.mockResolvedValue({ ...publicResult, id: 42 });
    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .rejects.toBeInstanceOf(PublicAiVisibilityResultUnavailableError);
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("requires the retained record id to match the requested public id", async () => {
    const { savePublicAiVisibilityResult } = await import("@/products/ai-visibility/usecase");
    mocks.getPublicResult.mockResolvedValue({ ...publicResult, id: "scan_other123" });

    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .rejects.toBeInstanceOf(PublicAiVisibilityResultUnavailableError);
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("enforces the separate daily import budget before writing a private copy", async () => {
    const { savePublicAiVisibilityResult } = await import("@/products/ai-visibility/usecase");
    mocks.rate.mockResolvedValue(true);

    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .rejects.toBeInstanceOf(PublicAiVisibilityImportRateLimitError);
    expect(mocks.rate).toHaveBeenCalledWith("workspace:public-import:actor", 10, 86_400_000);
    expect(mocks.saveWork).not.toHaveBeenCalled();
  });

  it("does not treat a marker on another product as an imported AI Visibility copy", async () => {
    const { savePublicAiVisibilityResult } = await import("@/products/ai-visibility/usecase");
    mocks.listWork.mockResolvedValue([{
      ...saved,
      productId: "managed_presence",
      input: { ...saved.input, sourcePublicResultId: publicResult.id },
    }]);

    await expect(savePublicAiVisibilityResult({ actor, workspaceId: workspace.id, resultId: publicResult.id }))
      .resolves.toMatchObject({ created: true });
    expect(mocks.saveWork).toHaveBeenCalledTimes(1);
  });
});
