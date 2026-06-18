import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Deterministic controls for the decision deps.
const ctl = vi.hoisted(() => ({
  risk: { level: "low", autoApply: true, reason: "ok", requiresPreview: false } as {
    level: string;
    autoApply: boolean;
    reason: string;
    requiresPreview: boolean;
  },
  governanceAction: "publish" as "publish" | "review" | "block",
  manifestAllows: true,
  safeParseOk: true,
}));

const storage = vi.hoisted(() => ({
  getContent: vi.fn(),
  setContent: vi.fn(),
  appendVersion: vi.fn(),
  setDraftContent: vi.fn(),
  logActivity: vi.fn(),
  recordSectionUpdate: vi.fn(),
}));
const queueAiContentReview = vi.hoisted(() => vi.fn());
const revalidateClientSite = vi.hoisted(() => vi.fn(() => Promise.resolve()));

vi.mock("../lib/storage", () => storage);
vi.mock("../lib/schemas", () => ({
  sectionSchemas: new Proxy(
    {},
    {
      get: () => ({
        safeParse: (d: unknown) =>
          ctl.safeParseOk
            ? { success: true, data: d }
            : { success: false, error: { message: "bad data" } },
      }),
    }
  ),
}));
vi.mock("../lib/agent-risk", () => ({
  classifyOperation: () => ({ type: "update" }),
  assessRisk: () => ctl.risk,
  generatePreviewDiffs: () => [{ field: "title", before: "a", after: "b", type: "changed" }],
}));
vi.mock("../lib/ai-governance", () => ({
  decideAiContentGovernance: () => ({ action: ctl.governanceAction, reason: "decided" }),
}));
vi.mock("../lib/ai-auto-approve", () => ({
  // pass governance through unchanged (the route now gets auto-approve too)
  maybeAutoApprove: (_cfg: unknown, _section: unknown, g: unknown) => Promise.resolve(g),
}));
vi.mock("../lib/ai-review-queue", () => ({ queueAiContentReview }));
vi.mock("../lib/site-capabilities", () => ({
  manifestAllowsAction: () => ctl.manifestAllows,
}));
vi.mock("../lib/content-revalidation", () => ({
  clientRevalidationTargetForSections: () => ({ paths: ["/"] }),
}));
vi.mock("../lib/revalidate-client", () => ({ revalidateClientSite }));
vi.mock("../lib/utils", () => ({
  diffFields: () => [{ field: "title", before: "a", after: "b" }],
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applySectionUpdate } from "../lib/apply-section-update";

const baseInput = () => ({
  tenantId: "gldf",
  section: "hero" as const,
  data: { title: "New" },
  tenantConfig: { id: "gldf", siteName: "GLDF" } as never,
});

beforeEach(() => {
  ctl.risk = { level: "low", autoApply: true, reason: "ok", requiresPreview: false };
  ctl.governanceAction = "publish";
  ctl.manifestAllows = true;
  ctl.safeParseOk = true;
  storage.getContent.mockResolvedValue({ title: "Old" });
  storage.setContent.mockResolvedValue(undefined);
  storage.appendVersion.mockResolvedValue(undefined);
  storage.setDraftContent.mockResolvedValue(undefined);
  storage.logActivity.mockResolvedValue(undefined);
  storage.recordSectionUpdate.mockResolvedValue(undefined);
  queueAiContentReview.mockResolvedValue({ id: "evt_1" });
});
afterEach(() => vi.clearAllMocks());

describe("applySectionUpdate", () => {
  it("publishes a low-risk approved change (writes content, no review queued)", async () => {
    const res = await applySectionUpdate(baseInput());
    expect(res.status).toBe("published");
    expect(storage.setContent).toHaveBeenCalledTimes(1);
    expect(storage.recordSectionUpdate).toHaveBeenCalledTimes(1);
    expect(queueAiContentReview).not.toHaveBeenCalled();
    expect(revalidateClientSite).toHaveBeenCalledTimes(1);
  });

  it("routes a HIGH-risk change to review on the executor surface (no manifest)", async () => {
    ctl.risk = { level: "high", autoApply: false, reason: "risky", requiresPreview: true };
    const res = await applySectionUpdate(baseInput());
    expect(res.status).toBe("queued");
    expect(storage.setContent).not.toHaveBeenCalled();
    expect(storage.setDraftContent).toHaveBeenCalledTimes(1);
    expect(queueAiContentReview).toHaveBeenCalledTimes(1);
  });

  it("routes a HIGH-risk change to review on the route surface (with manifest) too", async () => {
    ctl.risk = { level: "high", autoApply: false, reason: "risky", requiresPreview: true };
    const res = await applySectionUpdate({
      ...baseInput(),
      siteManifest: { sections: {} } as never,
    });
    expect(res.status).toBe("queued");
    expect(storage.setContent).not.toHaveBeenCalled();
    expect(queueAiContentReview).toHaveBeenCalledTimes(1);
  });

  it("returns a clean failed result (not a throw) when the store write fails", async () => {
    storage.setContent.mockRejectedValue(new Error("sanity down"));
    const res = await applySectionUpdate(baseInput());
    expect(res.status).toBe("failed");
    if (res.status === "failed") expect(res.error).toMatch(/Failed to save hero/);
    expect(storage.recordSectionUpdate).not.toHaveBeenCalled();
  });

  it("blocks when governance says block", async () => {
    ctl.governanceAction = "block";
    const res = await applySectionUpdate(baseInput());
    expect(res.status).toBe("blocked");
    expect(storage.setContent).not.toHaveBeenCalled();
    expect(queueAiContentReview).not.toHaveBeenCalled();
  });

  it("blocks a manifest-forbidden draft (route surface)", async () => {
    ctl.manifestAllows = false;
    const res = await applySectionUpdate({
      ...baseInput(),
      siteManifest: { sections: {} } as never,
    });
    expect(res.status).toBe("blocked");
    expect(storage.getContent).not.toHaveBeenCalled(); // gated before any read
  });

  it("fails validation cleanly", async () => {
    ctl.safeParseOk = false;
    const res = await applySectionUpdate(baseInput());
    expect(res.status).toBe("failed");
    expect(storage.setContent).not.toHaveBeenCalled();
  });

  it("blocks an array reduction over 50% (confirm-first guard)", async () => {
    storage.getContent.mockResolvedValue({ services: [1, 2, 3, 4] });
    const res = await applySectionUpdate({
      ...baseInput(),
      data: { services: [1] },
    });
    expect(res.status).toBe("blocked");
    if (res.status === "blocked") expect(res.message).toMatch(/remove 3 of 4 services/);
  });

  it("is stateless across calls — two updates each write independently (no double-apply)", async () => {
    await applySectionUpdate(baseInput());
    await applySectionUpdate(baseInput());
    expect(storage.setContent).toHaveBeenCalledTimes(2);
    // each call publishes exactly once; no carried-over state inflates writes
    expect(storage.recordSectionUpdate).toHaveBeenCalledTimes(2);
  });
});
