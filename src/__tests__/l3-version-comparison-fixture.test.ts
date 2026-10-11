import { describe, expect, it } from "vitest";
import { createVersionComparisonRequest, VERSION_COMPARISON_IDS as ids } from "@/experience/workspace/preview/version-comparison-fixture";
import { connectionDetailData } from "@/experience/systems/ConnectionDetail";

const read = (request: typeof fetch, location: "downtown" | "amherst") => request(`/api/workspace/versions?workspaceId=${ids.workspaceId}&systemId=${ids[location].systemId}`).then(response => response.json());
const post = (request: typeof fetch, path: string, body: Record<string, unknown>) => request(path, { method: "POST", body: JSON.stringify(body) });
const adopt = (location: "downtown" | "amherst") => ({ workspaceId: ids.workspaceId, ...ids[location], rowRevision: 3, revision: 13, action: "adopt", resolutions: location === "amherst" ? [{ path: "reminder", choice: "keep_local" }] : [] });

describe("Fictional Versions comparison isolation", () => {
  it("prepares one Version and approves only its exact owner decision", async () => {
    const request = createVersionComparisonRequest("ready");
    const prepared = await (await post(request, "/api/workspace/versions", adopt("amherst"))).json();
    const changed = await read(request, "amherst");
    expect(changed.pendingRelease.preview.reminder).toBe("Bring your insurance card. Park on Main St.");
    expect(changed.pendingRelease.preview.textMessage).toBe(true);
    expect((await read(request, "downtown")).pendingRelease).toBeNull();
    expect((await post(request, "/api/workspace/needs-you", { workspaceId: ids.workspaceId, itemId: prepared.receipt.decisionId, revision: "9".repeat(64), decision: "approve" })).status).toBe(409);
    const result = await (await post(request, "/api/workspace/needs-you", { workspaceId: ids.workspaceId, itemId: prepared.receipt.decisionId, revision: changed.pendingRelease.decisionRevision, decision: "approve" })).json();
    expect(result.item.receiptRef).toBe(`version_release:${ids.amherst.versionId}:13`);
    expect((await read(request, "downtown")).possibilities).toHaveLength(1);
  });
  it("refuses foreign businesses, foreign Versions and unresolved local conflicts", async () => {
    const request = createVersionComparisonRequest("ready");
    expect((await post(request, "/api/workspace/versions", { ...adopt("amherst"), workspaceId: crypto.randomUUID() })).status).toBe(403);
    expect((await post(request, "/api/workspace/versions", { ...adopt("amherst"), versionId: ids.downtown.versionId })).status).toBe(409);
    expect((await post(request, "/api/workspace/versions", { ...adopt("amherst"), resolutions: [] })).status).toBe(409);
    expect((await read(request, "amherst")).possibilities).toHaveLength(1);
    expect((await read(request, "amherst")).pendingRelease).toBeNull();
  });
  it("fails closed for unsupported routes, denied access and unavailable evidence", async () => {
    for (const [state, status] of [["error", 503], ["permission", 403]] as const) {
      const request = createVersionComparisonRequest(state);
      expect((await post(request, "/api/workspace/versions", adopt("downtown"))).status).toBe(status);
      expect((await post(request, "/api/workspace/needs-you", { workspaceId: ids.workspaceId, itemId: "other", decision: "approve" })).status).toBe(status);
    }
    const request = createVersionComparisonRequest("ready");
    expect((await post(request, "/api/workspace/stripe", { workspaceId: ids.workspaceId })).status).toBe(404);
  });
});

describe("Recorded Connection detail", () => {
  it("does not infer authority, freshness or recent writes from a connected mark", () => {
    const detail = connectionDetailData({ id: "known", kind: "read", target: "Business record", sentence: "Uses confirmed hours.", status: "connected" }, "Website");
    expect(detail.direction).toBe("Website reads Business record. Uses confirmed hours.");
    expect(detail.authority).toBeUndefined();
    expect(detail.freshness).toBeUndefined();
    expect(detail.recent).toBeUndefined();
  });
  it("keeps incoming direction and recorded contract values", () => {
    const contract = { authority: "Allowed by the owner", sourceOfTruth: "Business record", freshness: "At render", failureBehavior: "Keeps approved content" };
    const detail = connectionDetailData({ id: "incoming", kind: "read", target: "Website", sentence: "Uses confirmed hours.", status: "connected", direction: "in", contract }, "Business record");
    expect(detail.direction).toBe("Business record read by Website. Uses confirmed hours.");
    expect(detail.authority).toBe(contract.authority);
    expect(detail.failureBehavior).toBe(contract.failureBehavior);
  });
});
