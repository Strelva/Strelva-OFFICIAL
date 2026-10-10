// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { presentWorkspaceWork, normalizeWorkspaceWork } from "@/experience/workspace/result";
import { websiteWorkDocumentVersion } from "@/experience/websites/contracts";
import { WebsiteExperience } from "@/experience/websites/WebsiteExperience";
import type { SavedWork } from "@/platform/workspaces/types";

const rebuild = vi.hoisted(() => vi.fn());
vi.mock("@/experience/websites/RebuildExperience", () => ({ RebuildExperience: (props: unknown) => { rebuild(props); return "Native website reader"; } }));
const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
function saved(payload: unknown, resourceKind = "website"): SavedWork {
  return { id: workId, workspaceId, productId: "websites", resourceKind, title: "Customer website Version", payload, input: { privatePrompt: "private input" }, createdBy: "owner", createdAt: "today", updatedAt: "today", sourceWorkId: "source" };
}
afterEach(() => vi.clearAllMocks());

describe("website workspace reader identity", () => {
  it.each(["owned", "member", "delegated_read", "addressed"] as const)("carries only v2 reader identity for %s", access => {
    const presented = presentWorkspaceWork(saved({ version: 2, candidate: { document: { secret: "private site content" } }, agencyGrant: "private grant" }), { access });
    expect(presented.website).toEqual({ version: 2 });
    expect(presented.payload).toBeNull();
    expect(presented.input).toEqual({});
    expect(presented.sourceWorkId).toBe("source");
    expect(presented.unavailableReason).toBeUndefined();
    expect(JSON.stringify(presented)).not.toMatch(/private site content|private grant|private input/);
    expect(websiteWorkDocumentVersion(normalizeWorkspaceWork(presented))).toBe(2);
  });
  it("preserves v1 routing and does not infer a native reader from a rollout flag", () => {
    const presented = presentWorkspaceWork(saved({ version: 1 }));
    expect(presented.website).toEqual({ version: 1 });
    expect(websiteWorkDocumentVersion(presented)).toBeUndefined();
  });
  it.each([null, [], { version: "2" }, { version: 3 }, { rebuild: { version: 2 } }])("keeps unsupported stored payload %j unavailable", payload => {
    const presented = presentWorkspaceWork(saved(payload));
    expect(presented.website).toBeUndefined();
    expect(presented.unavailableReason).toContain("unsupported");
    expect(presented.payload).toBeNull();
  });
  it("does not let another resource use website routing metadata", () => {
    const presented = presentWorkspaceWork(saved({ version: 2 }, "other"));
    expect(presented.website).toBeUndefined();
    expect(websiteWorkDocumentVersion({ ...presented, website: { version: 2 } })).toBeUndefined();
  });
  it("retains older same-origin v2 snapshots without widening a v1 projection", () => {
    expect(websiteWorkDocumentVersion({ productId: "websites", resourceKind: "website", payload: { version: 2 } })).toBe(2);
    expect(websiteWorkDocumentVersion({ productId: "websites", resourceKind: "website", website: { version: 1 }, payload: { version: 2 } })).toBeUndefined();
  });
  it("opens an agency's presented native Version through the native reader even with rollout off, preserving authority props", async () => {
    const presented = presentWorkspaceWork(saved({ version: 2, candidate: { private: "hidden" } }), { access: "delegated_read" });
    const node = document.createElement("div"); document.body.append(node); const root = createRoot(node);
    const legacyRead = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Legacy reader must not be called"));
    try {
      await act(async () => root.render(createElement(WebsiteExperience, { workspaceId: presented.workspaceId, workId: presented.id, rebuildVersion: websiteWorkDocumentVersion(presented), rebuildEnabled: false, readOnly: true, agency: true, canPublish: false })));
      expect(node.textContent).toContain("Native website reader");
      expect(rebuild).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, workId, readOnly: true, agency: true, canPublish: false }));
      expect(legacyRead).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); node.remove(); legacyRead.mockRestore(); }
  });
});
