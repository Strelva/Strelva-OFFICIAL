import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);
const fail = vi.hoisted(() => ({ appendVersion: false, clearDraft: false, setContent: false, setPageConfig: false }));
const revalidateClientSite = vi.hoisted(() => vi.fn());
const scheduleVerification = vi.hoisted(() => vi.fn());
const observe = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: () => calls.push("revalidatePath") }));
vi.mock("@/lib/storage", () => ({
  getContent: async (section: string) => { calls.push(`getContent:${section}`); return { title: "Old" }; },
  setContent: async (section: string) => { calls.push(`setContent:${section}`); if (fail.setContent) throw new Error("write error"); },
  setPageConfig: async () => { calls.push("setPageConfig"); if (fail.setPageConfig) throw new Error("layout error"); },
  appendVersion: async (section: string, ...rest: unknown[]) => { calls.push(`appendVersion:${section}:${rest.length}`); if (fail.appendVersion) throw new Error("version error"); },
  recordSectionUpdate: async (section: string) => { calls.push(`recordSectionUpdate:${section}`); },
  logActivity: async () => { calls.push("logActivity"); },
  logAuditEvent: async (entry: { action: string }) => { calls.push(`audit:${entry.action}`); },
  clearDraft: async (section: string) => { calls.push(`clearDraft:${section}`); if (fail.clearDraft) throw new Error("clear error"); },
  clearDraftPageConfig: async () => { calls.push("clearDraftPageConfig"); },
}));
vi.mock("@/lib/revalidate-client", () => ({ revalidateClientSite: (...a: unknown[]) => { calls.push("revalidateClientSite"); return revalidateClientSite(...a); } }));
vi.mock("@/lib/content-revalidation", () => ({ clientRevalidationTargetForSections: (sections: string[], options: unknown) => ({ sections, options }) }));
vi.mock("@/lib/verify-live", () => ({ scheduleVerification }));
vi.mock("@/lib/workspace-ports", () => ({ workspacePorts: () => ({ websitePublicationReadback: async () => ({ observeAcceptedNativePublish: observe }) }) }));

import { isSectionWriteFailure, publishTenantSections, writeTenantSections } from "@/lib/publish-tenant-sections";

const hero = { section: "hero" as const, data: { title: "New" } as never };
const services = { section: "services" as const, data: { items: [] } as never };

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  for (const key of Object.keys(fail)) (fail as Record<string, boolean>)[key] = false;
  revalidateClientSite.mockResolvedValue(undefined);
});

describe("publishTenantSections", () => {
  it("afterWrite false stops after the write: no version, no draft cleanup, no revalidation", async () => {
    const receipt = await publishTenantSections({ tenantId: "t", writes: [hero], author: "user", versions: "strict", clearDrafts: "strict", afterWrite: async () => false });
    expect(receipt).toEqual({ status: "already_resolved" });
    expect(calls).toEqual(["getContent:hero", "setContent:hero"]);
  });

  it("best-effort steps are logged and swallowed, and strict steps are not", async () => {
    fail.appendVersion = true; fail.clearDraft = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const receipt = await publishTenantSections({ tenantId: "t", writes: [{ ...hero, prior: { title: "Old" } }], author: "user", versions: "best_effort", clearDrafts: "best_effort", messages: { versions: s => ["versions failed", s], clearDraft: s => ["clear failed", s] } });
    expect(receipt.status).toBe("published");
    expect(spy).toHaveBeenCalledWith("versions failed", "hero", expect.any(Error));
    expect(spy).toHaveBeenCalledWith("clear failed", ["hero"], expect.any(Error));
    spy.mockRestore();
    calls.length = 0;
    await expect(publishTenantSections({ tenantId: "t", writes: [hero], author: "user", versions: "strict", clearDrafts: "strict" })).rejects.toThrow("version error");
    expect(calls).toEqual(["getContent:hero", "setContent:hero", "appendVersion:hero:4"]);
  });

  it("revalidates the client site once per call, however many sections are written", async () => {
    await publishTenantSections({ tenantId: "t", writes: [hero, services], author: "admin", versions: "strict", clearDrafts: "none" });
    expect(calls.filter(call => call === "revalidateClientSite")).toHaveLength(1);
    expect(calls.filter(call => call === "revalidatePath")).toHaveLength(1);
    expect(revalidateClientSite).toHaveBeenCalledWith("t", { sections: ["hero", "services"], options: { pageConfigChanged: false } });
  });

  it("writes sections in order and the page layout last, and clears both drafts", async () => {
    const receipt = await publishTenantSections({ tenantId: "t", writes: [hero, services], pageConfig: { home: { sections: [] } } as never, author: "user", versions: "strict", clearDrafts: "strict", audit: { actor: { email: "o@example.test" } as never } });
    expect(receipt).toMatchObject({ status: "published", sections: ["hero", "services"], pageConfig: true });
    expect(calls.slice(0, 5)).toEqual(["getContent:hero", "getContent:services", "setContent:hero", "setContent:services", "setPageConfig"]);
    expect(calls).toContain("audit:page_config.published");
    expect(calls).toContain("clearDraftPageConfig");
  });

  it("passes the request id only when there is one, and skips the timestamp when the caller stamps it", async () => {
    await publishTenantSections({ tenantId: "t", writes: [{ ...hero, prior: {} }], author: "ai", requestId: "step-1", versions: "best_effort", sectionTimestamp: false, clearDrafts: "none" });
    expect(calls).toContain("appendVersion:hero:5");
    expect(calls.some(call => call.startsWith("recordSectionUpdate"))).toBe(false);
    calls.length = 0;
    await publishTenantSections({ tenantId: "t", writes: [{ ...hero, prior: {} }], author: "ai", versions: "best_effort", clearDrafts: "none" });
    expect(calls).toContain("appendVersion:hero:4");
  });

  it("a failed live write is marked so a caller can tell it from later bookkeeping", async () => {
    fail.setContent = true;
    const error = await publishTenantSections({ tenantId: "t", writes: [hero], author: "ai", versions: "best_effort", clearDrafts: "none" }).catch(err => err);
    expect(isSectionWriteFailure(error)).toBe(true);
    expect(isSectionWriteFailure(new Error("other"))).toBe(false);
    fail.setContent = false; fail.appendVersion = true;
    const strict = await publishTenantSections({ tenantId: "t", writes: [hero], author: "user", versions: "strict", clearDrafts: "none" }).catch(err => err);
    expect(isSectionWriteFailure(strict)).toBe(false);
  });

  it("a failed revalidation reaches only the caller's handler, and a failed read-back is swallowed", async () => {
    revalidateClientSite.mockRejectedValue(new Error("down"));
    observe.mockRejectedValue(new Error("read-back down"));
    const onRevalidateError = vi.fn();
    const receipt = await publishTenantSections({ tenantId: "t", writes: [{ ...hero, prior: {} }], author: "user", versions: "strict", clearDrafts: "none", onRevalidateError, readBack: { actorId: "u", publicationRef: "evt" }, verify: true });
    if (receipt.status !== "published") throw new Error("expected a published receipt");
    await receipt.revalidation;
    expect(onRevalidateError).toHaveBeenCalledWith(expect.any(Error));
    expect(scheduleVerification).toHaveBeenCalledWith("t", "hero", { title: "New" });
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", section: "hero", actorId: "u", publicationRef: "evt" }));
  });
});

describe("writeTenantSections", () => {
  it("writes each section in order, then the layout", async () => {
    await writeTenantSections("t", [hero, services], { home: { sections: [] } } as never);
    expect(calls).toEqual(["setContent:hero", "setContent:services", "setPageConfig"]);
  });
});
