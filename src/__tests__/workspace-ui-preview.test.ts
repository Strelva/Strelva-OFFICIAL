import { describe, expect, it } from "vitest";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { createPreviewRequest } from "@/experience/workspace/preview/fixture";
import type { WorkspaceSnapshot } from "@/experience/workspace/contracts";

describe("isolated Strelva interface preview", () => {
  it.each([
    ["preview", "1", true], ["production", "1", false],
    ["development", "1", false], [undefined, "1", false], ["preview", "", false],
  ])("only enables hosted fixtures on an opted-in Vercel preview: %s / %s", (target, enabled, expected) => {
    expect(strelvaUiPreviewEnabled({ NODE_ENV: "production", VERCEL_ENV: target, STRELVA_UI_PREVIEW: enabled } as NodeJS.ProcessEnv)).toBe(expected);
  });
  it.each([
    ["production", "1", false], ["test", "1", false], ["development", "", false], ["development", "true", false], ["development", "1", true],
  ])("requires explicit development opt-in: %s / %s", (mode, enabled, expected) => {
    expect(strelvaUiPreviewEnabled({ NODE_ENV: mode, STRELVA_UI_PREVIEW: enabled } as NodeJS.ProcessEnv)).toBe(expected);
  });

  it("never forwards requests outside its synthetic endpoint", async () => {
    const request = createPreviewRequest("free");
    for (const target of ["/api/billing/subscribe", "https://app.strelva.com/api/workspace", "https://provider.example/assess"]) {
      expect((await request(target)).status).toBe(403);
    }
    expect((await request("/api/workspace", { method: "POST", body: JSON.stringify({ action: "handoff", recipientEmail: "person@example.com" }) })).status).toBe(409);
  });

  it("keeps created sample work local and resets with a new preview", async () => {
    const request = createPreviewRequest("empty");
    const initial = await (await request("/api/workspace")).json() as WorkspaceSnapshot;
    expect(initial.work).toEqual([]);
    const response = await request("/api/workspace", { method: "POST", body: JSON.stringify({ action: "assess", workspaceId: initial.workspaceId, business: "Fictional Bakery" }) });
    expect(response.status).toBe(201);
    const updated = await (await request("/api/workspace")).json() as WorkspaceSnapshot;
    expect(updated.work[0]?.title).toBe("Fictional Bakery");
    expect(updated.work[0]?.payload?.measurementNote).toContain("fictional");
    const fresh = await (await createPreviewRequest("empty")("/api/workspace")).json() as WorkspaceSnapshot;
    expect(fresh.work).toEqual([]);
  });

  it("retains the read-only boundary and excludes foreign workspace IDs", async () => {
    const request = createPreviewRequest("read-only");
    const snapshot = await (await request("/api/workspace")).json() as WorkspaceSnapshot;
    const response = await request("/api/workspace", { method: "POST", body: JSON.stringify({ action: "assess", workspaceId: snapshot.workspaceId, business: "Fictional Bakery" }) });
    expect(response.status).toBe(403);
    expect((await request("/api/workspace?workspaceId=foreign")).status).toBe(403);
  });
});
