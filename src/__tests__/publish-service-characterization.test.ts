import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterization of the three paths that write a tenant section live, so the
// one publish service (src/products/websites/publish) is a refactor, not a
// behavior change: the content API PUT, an approved content_update event and
// the agent's auto-published update. Each records the exact order of storage,
// audit, revalidation and read-back calls and the response it returns.

const log = vi.hoisted(() => ({ calls: [] as string[], args: {} as Record<string, unknown[]> }));
const note = (name: string, ...args: unknown[]) => { log.calls.push(name); (log.args[name] ??= []).push(args); };

const store = vi.hoisted(() => ({
  fail: { appendVersion: false, recordSectionUpdate: false, clearDraft: false, logActivity: false, setContent: false },
}));
const mockHeaders = vi.hoisted(() => ({ get: (key: string) => (key === "x-tenant" ? "tenant-a" : null) }));
const observe = vi.hoisted(() => vi.fn());
const getEvent = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ headers: () => Promise.resolve(mockHeaders) }));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => note("revalidatePath", ...a) }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: vi.fn(async () => undefined), authorizeTenantOperatorRead: vi.fn(async () => undefined) }));
vi.mock("@/lib/tenant", () => ({ requireTenantFromHeaders: async () => "tenant-a", getTenantFromHeaders: async () => "tenant-a" }));
vi.mock("@/platform/infra/auth", () => ({
  requireTenantAccess: async () => null, requireTenantPermission: async () => null, verifyAuth: async () => true,
  getActorContext: async () => ({ email: "owner@example.com", isImpersonating: false }), isSuperAdmin: async () => false,
}));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/template-manifests", () => ({ getTemplateManifestForTenant: async () => ({ contentSections: ["hero"] }) }));
vi.mock("@/lib/schemas", () => ({
  sectionSchemas: new Proxy({}, { get: () => ({ safeParse: (data: unknown) => ({ success: true, data }) }) }),
}));
vi.mock("@/lib/storage", () => ({
  getContent: async (...a: unknown[]) => { note("getContent", ...a); return { title: "Old" }; },
  getDraftContent: async (...a: unknown[]) => { note("getDraftContent", ...a); return { title: "New" }; },
  getSectionTimestamps: async () => ({}),
  setContent: async (...a: unknown[]) => { note("setContent", ...a); if (store.fail.setContent) throw new Error("write error"); },
  appendVersion: async (...a: unknown[]) => { note("appendVersion", ...a); if (store.fail.appendVersion) throw new Error("version error"); },
  recordSectionUpdate: async (...a: unknown[]) => { note("recordSectionUpdate", ...a); if (store.fail.recordSectionUpdate) throw new Error("timestamp error"); },
  logActivity: async (...a: unknown[]) => { note("logActivity", ...a); if (store.fail.logActivity) throw new Error("activity error"); },
  logAuditEvent: async (...a: unknown[]) => { note("logAuditEvent", ...a); },
  clearDraft: async (...a: unknown[]) => { note("clearDraft", ...a); if (store.fail.clearDraft) throw new Error("clear error"); },
  setDraftContent: async (...a: unknown[]) => { note("setDraftContent", ...a); },
}));
vi.mock("@/lib/revalidate-client", () => ({ revalidateClientSite: (...a: unknown[]) => { note("revalidateClientSite", ...a); return Promise.resolve(); } }));
vi.mock("@/lib/content-revalidation", () => ({ clientRevalidationTargetForSections: (sections: string[]) => ({ paths: sections }) }));
vi.mock("@/lib/verify-live", () => ({ scheduleVerification: (...a: unknown[]) => note("scheduleVerification", ...a) }));
vi.mock("@/app/api/publish/native-readback", () => ({ observeAcceptedNativePublish: (...a: unknown[]) => { note("observeAcceptedNativePublish"); return observe(...a); } }));
vi.mock("@/lib/events", () => ({
  getEvent: (...a: unknown[]) => getEvent(...a), getEventRaw: (...a: unknown[]) => getEvent(...a),
  resolveEvent: async (...a: unknown[]) => { note("resolveEvent", ...a); return { changed: true }; },
  claimEventAction: async () => ({ acquired: true, attemptId: "a1" }), finishEventAction: async () => undefined,
  markExecutionExternalAccepted: async () => undefined, markExecutionExternalUnconfirmed: async () => undefined,
}));
vi.mock("@/lib/ai-auto-approve", () => ({
  recordApproval: (...a: unknown[]) => { note("recordApproval", ...a); return Promise.resolve(0); },
  recordRejection: async () => undefined,
  maybeAutoApprove: async (_cfg: unknown, _section: unknown, governance: unknown) => governance,
}));
vi.mock("@/lib/agent-risk", () => ({
  classifyOperation: () => ({ type: "update" }), assessRisk: () => ({ level: "low", autoApply: true, reason: "ok", requiresPreview: false }),
  generatePreviewDiffs: () => [],
}));
vi.mock("@/lib/ai-governance", () => ({ decideAiContentGovernance: () => ({ action: "publish", reason: "decided" }) }));
vi.mock("@/lib/ai-review-queue", () => ({ queueAiContentReview: vi.fn() }));
vi.mock("@/lib/site-capabilities", () => ({ manifestAllowsAction: () => true }));

// The first import of the event executor loads a large graph.
vi.setConfig({ testTimeout: 30_000 });

const PUBLISH_FLOW = ["setContent", "appendVersion", "recordSectionUpdate"];
const order = () => [...log.calls];

beforeEach(() => {
  vi.clearAllMocks();
  log.calls.length = 0;
  for (const key of Object.keys(log.args)) delete log.args[key];
  for (const key of Object.keys(store.fail)) (store.fail as Record<string, boolean>)[key] = false;
  observe.mockResolvedValue(undefined);
  process.env.APPROVE_LINK_SECRET = "characterization-secret";
});
afterEach(() => vi.resetModules());

describe("content API PUT (live save)", () => {
  async function put() {
    const { PUT } = await import("@/app/api/content/[section]/route");
    return PUT(new Request("http://localhost/api/content/hero", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "New" }) }), { params: Promise.resolve({ section: "hero" }) });
  }

  it("writes, versions, logs, audits, clears the draft, revalidates and schedules verification in this order", async () => {
    const response = await put();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(order()).toEqual(["getContent", ...PUBLISH_FLOW, "logActivity", "logAuditEvent", "clearDraft", "revalidatePath", "revalidateClientSite", "scheduleVerification"]);
    expect(log.args.setContent![0]).toEqual(["hero", { title: "New" }, "tenant-a"]);
    expect(log.args.appendVersion![0]).toEqual(["hero", { title: "New" }, "user", "tenant-a", [{ field: "title", before: "Old", after: "New" }]]);
    expect(log.args.recordSectionUpdate![0]).toEqual(["hero", "tenant-a"]);
    expect(log.args.logActivity![0]).toEqual([expect.objectContaining({ text: "Updated hero via admin", type: "admin", section: "hero", actor: "user", snapshot: { title: "Old" } }), "tenant-a"]);
    expect(log.args.logAuditEvent![0]).toEqual([expect.objectContaining({ tenant: "tenant-a", action: "content.published", targetType: "content_section", targetId: "hero", metadata: { section: "hero", changeCount: 1 } })]);
    expect(log.args.clearDraft![0]).toEqual(["hero", "tenant-a"]);
    expect(log.args.revalidatePath![0]).toEqual(["/"]);
    expect(log.args.revalidateClientSite![0]).toEqual(["tenant-a", { paths: ["hero"] }]);
    expect(log.args.scheduleVerification![0]).toEqual(["tenant-a", "hero", { title: "New" }]);
  });

  it("a failed version or timestamp write is bookkeeping: still saved, still 200, and the timestamp is skipped", async () => {
    store.fail.appendVersion = true;
    const response = await put();
    expect(response.status).toBe(200);
    expect(order()).toEqual(["getContent", "setContent", "appendVersion", "logActivity", "logAuditEvent", "clearDraft", "revalidatePath", "revalidateClientSite", "scheduleVerification"]);
  });

  it("a failed draft clear is logged and does not change the response", async () => {
    store.fail.clearDraft = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await put();
    expect(response.status).toBe(200);
    expect(order()).toContain("revalidateClientSite");
    expect(spy.mock.calls.some(call => String(call[0]).includes("[content PUT] failed to clear draft after publish:"))).toBe(true);
    spy.mockRestore();
  });

  it("a failed activity log is not caught: the save answers 500 after the content was written", async () => {
    store.fail.logActivity = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await put();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to save content" });
    expect(order()).toEqual(["getContent", ...PUBLISH_FLOW, "logActivity"]);
    spy.mockRestore();
  });

  it("a failed write answers 500 and does nothing after it", async () => {
    store.fail.setContent = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await put()).status).toBe(500);
    expect(order()).toEqual(["getContent", "setContent"]);
    spy.mockRestore();
  });
});

describe("approved content_update event", () => {
  const event = { id: "evt_1", tenantId: "tenant-a", type: "content_update", source: "ai", status: "pending", createdAt: "2026-10-01T00:00:00.000Z", metadata: { kind: "agent_preview", section: "hero", proposedData: { title: "New" } } };
  async function approve(actorId = "user-1") {
    const { resolveEventAction } = await import("@/lib/event-actions");
    return resolveEventAction("tenant-a", "evt_1", "approved", actorId);
  }
  beforeEach(() => { getEvent.mockResolvedValue(event); });

  it("writes, resolves, versions, revalidates, clears the draft, records the approval and reads back, in this order", async () => {
    expect(await approve()).toEqual({ changed: true });
    expect(order()).toEqual(["getDraftContent", "getContent", "setContent", "resolveEvent", "appendVersion", "recordSectionUpdate", "revalidatePath", "revalidateClientSite", "clearDraft", "recordApproval", "observeAcceptedNativePublish"]);
    expect(log.args.appendVersion![0]).toEqual(["hero", { title: "New" }, "user", "tenant-a", [{ field: "title", before: "Old", after: "New" }], "evt_1"]);
    expect(log.args.revalidateClientSite![0]).toEqual(["tenant-a", { paths: ["hero"] }]);
  });

  it("an operator or agency approval is versioned as admin and earns no trust streak", async () => {
    const { operatorActorId } = await import("@/lib/event-actions");
    expect(await approve(operatorActorId("11111111-1111-4111-8111-111111111111"))).toEqual({ changed: true });
    expect(log.args.appendVersion![0]![2]).toBe("admin");
    expect(order()).not.toContain("recordApproval");
  });

  it("a failed write leaves the event pending: nothing resolves, versions or revalidates", async () => {
    store.fail.setContent = true;
    await expect(approve()).rejects.toThrow("write error");
    expect(order()).toEqual(["getDraftContent", "getContent", "setContent"]);
  });

  it("a failed version write after the claim is not swallowed here", async () => {
    store.fail.appendVersion = true;
    await expect(approve()).rejects.toThrow("version error");
    expect(order()).toEqual(["getDraftContent", "getContent", "setContent", "resolveEvent", "appendVersion"]);
  });

  it("a failed read-back never changes the accepted result", async () => {
    observe.mockRejectedValue(new Error("read-back down"));
    expect(await approve()).toEqual({ changed: true });
  });
});

describe("agent auto-published update", () => {
  async function apply(requestId?: string) {
    const { applySectionUpdate } = await import("@/lib/apply-section-update");
    return applySectionUpdate({ tenantId: "tenant-a", section: "hero", data: { title: "New" }, tenantConfig: { id: "tenant-a", siteName: "A" } as never, ...(requestId ? { requestId } : {}) });
  }

  it("writes, versions, revalidates, reads back, then logs the activity and stamps the section, in this order", async () => {
    const result = await apply("step-1");
    expect(result).toMatchObject({ status: "published", section: "hero" });
    expect(order()).toEqual(["getContent", "setContent", "appendVersion", "revalidatePath", "revalidateClientSite", "observeAcceptedNativePublish", "logActivity", "recordSectionUpdate"]);
    expect(log.args.appendVersion![0]).toEqual(["hero", { title: "New" }, "ai", "tenant-a", [{ field: "title", before: "Old", after: "New" }], "step-1"]);
    expect(log.args.logActivity![0]![0]).toMatchObject({ text: "AI updated hero", actor: "ai", eventStatus: "auto_approved", suppressEvent: false });
  });

  it("without a request id the version call carries no request id", async () => {
    await apply();
    expect(log.args.appendVersion![0]).toHaveLength(5);
  });

  it("a failed version write is bookkeeping and the update still publishes", async () => {
    store.fail.appendVersion = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await apply()).toMatchObject({ status: "published" });
    expect(order()).toContain("observeAcceptedNativePublish");
    spy.mockRestore();
  });

  it("a failed write comes back as a failed result and does nothing after it", async () => {
    store.fail.setContent = true;
    expect(await apply()).toMatchObject({ status: "failed", section: "hero", error: "Failed to save hero: write error" });
    expect(order()).toEqual(["getContent", "setContent"]);
  });
});
