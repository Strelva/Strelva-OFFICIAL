import { describe, expect, it, vi } from "vitest";
import { noteTenantListingRead } from "@/products/google-listing/poll-policy";
import { classifyGoogleFailure, createHttpGoogleListingClient } from "@/products/google-listing/client";

const workspaceId = "7f000000-0000-4000-8000-000000000010";
function deps() {
  return { release: vi.fn(() => true), enabled: vi.fn(async () => true), target: vi.fn(async () => ({ workspaceId } as never)), note: vi.fn(async () => ({ workspaceId, locationId: "location", paused: false, accessPending: true, updatedAt: null })) };
}
describe("polling Google access health", () => {
  it("flags off preserves the poller without touching workspace storage", async () => {
    const d = deps(); d.release.mockReturnValue(false);
    await noteTenantListingRead("fixture", "location", { status: 429, detail: "Quota limit: 0" }, d);
    expect(d.enabled).not.toHaveBeenCalled(); expect(d.target).not.toHaveBeenCalled(); expect(d.note).not.toHaveBeenCalled();
    d.release.mockReturnValue(true); d.enabled.mockResolvedValue(false);
    await noteTenantListingRead("fixture", "location", { status: 429, detail: "Quota limit: 0" }, d);
    expect(d.target).not.toHaveBeenCalled();
  });
  it("a Google quota-zero double persists waiting without changing lifecycle; a successful poll clears it", async () => {
    const d = deps();
    await noteTenantListingRead("fixture", "locations/location", { status: 403, detail: "SERVICE_DISABLED" }, d);
    expect(d.note).toHaveBeenLastCalledWith(workspaceId, "location", true);
    await noteTenantListingRead("fixture", "location", { status: 200 }, d);
    expect(d.note).toHaveBeenLastCalledWith(workspaceId, "location", false);
    d.note.mockClear();
    await noteTenantListingRead("fixture", "location", { status: 429, detail: "Quota exceeded" }, d);
    await noteTenantListingRead("fixture", "location", { status: 500 }, d);
    expect(d.note).not.toHaveBeenCalled();
  });
  it("classifies Google's structured quota metadata before truncating the safe diagnostic", async () => {
    const body = JSON.stringify({ error: { message: "Quota exceeded. " + "x".repeat(350), details: [{ metadata: { quota_limit_value: "0" } }] } });
    const fetcher = vi.fn(async () => new Response(body, { status: 429 }));
    const client = createHttpGoogleListingClient("fixture-token", fetcher);
    expect(await client.getReview({ accountId: "accounts/one", locationId: "location" }, "review")).toMatchObject({ ok: false, kind: "setup_pending", status: 429, detail: body.slice(0, 300) });
    expect(classifyGoogleFailure(429, body.replace('"0"', '"300"'))).toBe("rate_limited");
  });
});
