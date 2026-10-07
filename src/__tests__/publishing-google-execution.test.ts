import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/platform/infra/event-contract";
import type { GoogleListingClient, GoogleLocationState } from "@/products/google-listing/client";
import { createMemoryReceiptStore } from "@/products/google-listing/receipts";

const m = vi.hoisted(() => ({
  deps: vi.fn(), record: vi.fn(), add: vi.fn(), mark: vi.fn(), unconfirmed: vi.fn(), mirror: vi.fn(),
}));
vi.mock("@/products/google-listing/tenant-replies", () => ({ defaultTenantReplyDeps: m.deps }));
vi.mock("@/products/publishing/server", () => ({
  publishingEnabledForWorkspace: async () => true,
  authorizePublishingEvent: async () => ({ allowed: true }),
  readPublishingSnapshot: async () => ({ bindings: [{ originTenantId: "fixture", locations: [{ locationId: "location" }] }] }),
}));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: m.record }));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ readLinkedSite: async () => ({ tenantId: "fixture" }) }));
vi.mock("@/platform/infra/auth", () => ({ hasTenantPermission: async () => true }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: async () => ({ data: true, error: null }) }) }));
vi.mock("@/platform/infra/tenant-publishing", () => ({ tenantPublishingPorts: async () => ({ addEvent: m.add, markExecutionExternalAccepted: m.mark, markExecutionExternalUnconfirmed: m.unconfirmed, mirrorPublishedReviewReply: m.mirror }) }));
vi.mock("@/platform/account-bindings/store", () => ({ readGoogleBindingForTenant: async () => ({ workspaceId: "5e000000-0000-4000-8000-000000000010", locations: [{ accountId: "account", locationId: "location" }] }) }));
vi.mock("@/products/google-listing/controls", () => ({ readListingControl: async () => ({ paused: false }), noteListingAccess: async () => undefined, setListingPaused: vi.fn() }));
vi.mock("@/products/google-listing/pacing", () => ({ paceGoogleWrites: (client: GoogleListingClient) => client }));

import { changeWorkspaceGoogleReply, executeGoogleListingEvent, prepareGoogleListingDraft } from "@/products/google-listing/workspace";
const workspaceId = "5e000000-0000-4000-8000-000000000010";
const actor = { userId: "5e000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const location = { accountId: "account", locationId: "location" };
const event: UnifiedEvent = { id: "google-approval", tenantId: "fixture", source: "google", type: "content_update", title: "Post", body: "Holiday hours", status: "pending", createdAt: "2026-10-07T14:00:00Z", metadata: { kind: "workspace_google_listing_draft", workspaceId, locationId: location.locationId, draft: { action: "post", post: { topicType: "STANDARD", summary: "Holiday hours" } } } };
let client: GoogleListingClient;
beforeEach(() => {
  vi.resetAllMocks();
  let reply: string | null = null;
  client = {
    createPost: vi.fn(async () => ({ ok: true as const, data: { name: "accounts/account/locations/location/localPosts/post" } })),
    getPost: vi.fn(async () => ({ ok: true as const, data: { name: "accounts/account/locations/location/localPosts/post", summary: "Holiday hours", state: "LIVE" as const } })),
    getReview: vi.fn(async () => ({ ok: true as const, data: { reviewId: "review", ...(reply ? { reviewReply: { comment: reply } } : {}) } })),
    updateReply: vi.fn(async (_loc: unknown, _review: string, text: string) => { reply = text; return { ok: true as const, data: { comment: text } }; }),
    deleteReply: vi.fn(async () => { reply = null; return { ok: true as const, data: null }; }),
    getLocation: vi.fn(async () => ({ ok: true as const, data: {} as GoogleLocationState })),
    patchLocation: vi.fn(), listReviews: vi.fn(), deletePost: vi.fn(),
  };
  const receipts = createMemoryReceiptStore();
  m.deps.mockResolvedValue({ bindingTarget: async () => ({ workspaceId }), grant: async () => ({ status: "connected", bindingId: null }), accessToken: async () => "fictional", client: () => client, receipts: () => receipts });
  m.record.mockResolvedValue({ access: "owner", revision: 2, facts: {} });
  m.add.mockImplementation(async value => ({ ...value, id: "draft", createdAt: "2026-10-07T14:00:00Z" }));
});
const execute = (attemptId: string) => executeGoogleListingEvent({ tenantId: "fixture", event, actorId: actor.userId, attemptId });

describe("Google approval recovery", () => {
  it("never recreates a post on a new attempt after the acceptance marker fails", async () => {
    m.mark.mockRejectedValue(new Error("Marker store unavailable"));
    expect(await execute("first")).toMatchObject({ accepted: true, verified: false });
    expect(await execute("second")).toMatchObject({ accepted: false, reason: "google_write_unconfirmed" });
    expect(client.createPost).toHaveBeenCalledTimes(1);
  });
  it("never repeats an uncertain dispatch even when saving its uncertainty fails", async () => {
    vi.mocked(client.createPost).mockRejectedValue(new Error("Response lost"));
    m.unconfirmed.mockRejectedValue(new Error("Marker store unavailable"));
    await expect(execute("first")).rejects.toThrow("Marker store unavailable");
    expect(await execute("second")).toMatchObject({ accepted: false, reason: "google_write_unconfirmed" });
    expect(client.createPost).toHaveBeenCalledTimes(1);
  });
  it("replays an accepted post without sending again", async () => {
    expect(await execute("first")).toMatchObject({ accepted: true, verified: true });
    expect(await execute("second")).toMatchObject({ accepted: true, verified: true });
    expect(client.createPost).toHaveBeenCalledTimes(1);
  });
  it("retries a definitive rejection but never repeats its accepted retry", async () => {
    vi.mocked(client.createPost).mockResolvedValueOnce({ ok: false, kind: "auth", status: 403, detail: "Permission denied" });
    expect(await execute("first")).toMatchObject({ accepted: false });
    expect(await execute("second")).toMatchObject({ accepted: true });
    expect(await execute("third")).toMatchObject({ accepted: true });
    expect(client.createPost).toHaveBeenCalledTimes(2);
  });
  it("does not dispatch again when the accepted retry loses its marker", async () => {
    vi.mocked(client.createPost).mockResolvedValueOnce({ ok: false, kind: "auth", status: 403, detail: "Permission denied" });
    expect(await execute("first")).toMatchObject({ accepted: false });
    m.mark.mockRejectedValue(new Error("Marker store unavailable"));
    expect(await execute("second")).toMatchObject({ accepted: true, verified: false });
    expect(await execute("third")).toMatchObject({ accepted: false, reason: "google_write_unconfirmed" });
    expect(client.createPost).toHaveBeenCalledTimes(2);
  });
  it("prepares a revision-bound hours clear, while manual absent-hours preparation refuses", async () => {
    const draft = await prepareGoogleListingDraft(actor, { workspaceId, tenantId: "fixture", locationId: "location", kind: "hours", expectedRecordRevision: 2 });
    expect(draft.metadata?.draft).toEqual({ action: "hours", hours: null });
    await expect(prepareGoogleListingDraft(actor, { workspaceId, tenantId: "fixture", locationId: "location", kind: "hours" })).rejects.toThrow();
  });
  it("lets a new owner command restore the same reply after withdrawal", async () => {
    const input = { workspaceId, tenantId: "fixture", locationId: "location", reviewId: "review", text: "Thank you.", withdraw: false, commandId: "5e000000-0000-4000-8000-000000000011" };
    expect((await changeWorkspaceGoogleReply(actor, input)).status).toBe("posted");
    await changeWorkspaceGoogleReply(actor, { ...input, withdraw: true, commandId: "5e000000-0000-4000-8000-000000000012" });
    expect((await changeWorkspaceGoogleReply(actor, { ...input, commandId: "5e000000-0000-4000-8000-000000000013" })).status).toBe("posted");
    expect(client.updateReply).toHaveBeenCalledTimes(2);
    expect(client.deleteReply).toHaveBeenCalledTimes(1);
  });
});
