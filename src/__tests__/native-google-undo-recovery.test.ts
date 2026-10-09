import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListingReceipt } from "@/products/google-listing/contracts";

const mocks = vi.hoisted(() => ({
  access: vi.fn(), grant: vi.fn(), snapshot: vi.fn(), context: vi.fn(),
  event: vi.fn(), rpc: vi.fn(), settle: vi.fn(), get: vi.fn(),
  getPost: vi.fn(), getReview: vi.fn(), getLocation: vi.fn(), write: vi.fn(),
}));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: mocks.access }));
vi.mock("@/products/google-listing/native/contracts", () => ({ assertCurrentNativeGoogleGrant: mocks.grant }));
vi.mock("@/products/publishing/server", () => ({ readPublishingSnapshot: mocks.snapshot }));
vi.mock("@/platform/infra/tenant-publishing", () => ({ tenantPublishingPorts: async () => ({ getEventRaw: mocks.event, resolveEventAction: mocks.write }) }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/products/google-listing/workspace", () => ({ googleTargetAllowed: async () => true, tenantListingContext: mocks.context, undoWorkspaceGoogleChange: mocks.write }));
vi.mock("@/products/google-listing/controls", () => ({ readListingControl: async () => ({ paused: false, accessPending: false }) }));
import { googleMakeRealDraftDigest, googleMakeRealPorts } from "@/products/google-listing/make-real";
import { googleReceiptIntentDigest } from "@/products/google-listing/receipts";

const workspaceId = "b3000000-0000-4000-8000-000000000001";
const bindingId = "b3000000-0000-4000-8000-000000000002";
const originalId = "b3000000-0000-4000-8000-000000000003";
const inverseId = "b3000000-0000-4000-8000-000000000004";
const actor = { userId: "b3000000-0000-4000-8000-000000000005", verifiedEmail: "owner@example.test" };
const nativeGrant = { bindingId, accountId: "accounts/exact", grantGeneration: "a".repeat(64) };
const postName = "accounts/exact/locations/exact/localPosts/approved";
const metadata = { kind: "workspace_google_listing_draft", workspaceId, locationId: "exact", draft: { action: "post", post: { summary: "Approved exact post" } }, nativeGrant };
const request = { tenantId: `workspace-${workspaceId}`, eventId: "exact-event", locationId: "exact", draftDigest: googleMakeRealDraftDigest(metadata), nativeGrant };
const at = "2026-10-09T00:00:00.000Z";
let original: ListingReceipt;
let inverse: ListingReceipt;
let durableLink = true;

function originalReceipt(): ListingReceipt {
  const receipt: ListingReceipt = { id: originalId, workspaceId, bindingId, locationId: "exact", action: "post_create", targetRef: "exact", status: "undone", authority: { kind: "owner_approval", actor: actor.userId, approvalRef: request.eventId }, before: null, after: { summary: "Approved exact post" }, readback: "matched", providerRef: postName, undo: { kind: "delete_post", postName }, undoesReceiptId: null, undoneByReceiptId: inverseId, idempotencyKey: `google-draft:${request.eventId}`, providerPayloadExpired: false, error: null, createdAt: at, updatedAt: at, completedAt: at };
  receipt.intentDigest = googleReceiptIntentDigest(receipt);
  return receipt;
}
function inverseReceipt(): ListingReceipt {
  const receipt: ListingReceipt = { ...originalReceipt(), id: inverseId, action: "post_delete", status: "posted_unverified", authority: { kind: "owner_undo", actor: actor.userId }, before: { summary: "Approved exact post" }, after: null, readback: "failed", undo: null, undoesReceiptId: originalId, undoneByReceiptId: null, idempotencyKey: `undo:${originalId}` };
  receipt.intentDigest = googleReceiptIntentDigest(receipt);
  return receipt;
}
const recover = () => googleMakeRealPorts.verifyUndo!(actor, workspaceId, request, originalId);
function noProviderWrite() { expect(mocks.write).not.toHaveBeenCalled(); }

beforeEach(() => {
  vi.resetAllMocks(); original = originalReceipt(); inverse = inverseReceipt(); durableLink = true;
  mocks.access.mockResolvedValue({ access: "owner" }); mocks.grant.mockResolvedValue({ id: bindingId });
  mocks.snapshot.mockResolvedValue({ bindings: [{ id: bindingId, status: "connected", originTenantId: null, locations: [{ locationId: "exact", accountId: nativeGrant.accountId }] }] });
  mocks.event.mockResolvedValue({ id: request.eventId, tenantId: request.tenantId, status: "approved", metadata });
  mocks.rpc.mockImplementation(async (_name: string, args: { p_workspace_id: string; p_idempotency_key: string }) => ({ data: args.p_workspace_id !== workspaceId ? null : args.p_idempotency_key === original.idempotencyKey ? structuredClone(original) : args.p_idempotency_key === inverse.idempotencyKey ? structuredClone(inverse) : null, error: null }));
  mocks.get.mockImplementation(async (id: string, scope: string) => scope !== workspaceId ? null : id === originalId ? structuredClone(original) : id === inverseId ? structuredClone(inverse) : null);
  mocks.settle.mockImplementation(async (id: string, scope: string, result: { status: ListingReceipt["status"]; readback: ListingReceipt["readback"] }) => {
    if (id !== inverseId || scope !== workspaceId) throw new Error("Fixture refused foreign settlement");
    inverse = { ...inverse, ...result };
    if (durableLink) original = { ...original, status: "undone", undoneByReceiptId: inverseId };
    return structuredClone(inverse);
  });
  mocks.getPost.mockResolvedValue({ ok: false, kind: "not_found" });
  mocks.context.mockResolvedValue({ workspaceId, bindingId, location: { accountId: nativeGrant.accountId, locationId: "exact" }, receipts: { get: mocks.get, settle: mocks.settle }, client: { getPost: mocks.getPost, getReview: mocks.getReview, getLocation: mocks.getLocation, deletePost: mocks.write, patchLocation: mocks.write, updateReply: mocks.write, deleteReply: mocks.write } });
});

describe("native Google current inverse readback recovery", () => {
  it.each(["posted_unverified", "held_by_google"] as const)("recovers accepted %s undo using fresh readback and durable receipt settlement", async status => {
    inverse.status = status;
    expect(await recover()).toMatchObject({ ok: true });
    expect(mocks.getPost).toHaveBeenCalledWith(postName);
    expect(mocks.settle).toHaveBeenCalledWith(inverseId, workspaceId, { status: "posted", readback: "matched" });
    expect(mocks.get).toHaveBeenLastCalledWith(originalId, workspaceId);
    noProviderWrite();
  });

  it("recovers a lost inverse settlement from the exact durable undo claim, without dispatch", async () => {
    original.status = "posted"; original.undoneByReceiptId = null; inverse.status = "posting"; inverse.readback = null;
    expect(await recover()).toMatchObject({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("read_google_listing_receipt_by_key", { p_workspace_id: workspaceId, p_idempotency_key: `undo:${originalId}` });
    expect(mocks.settle).toHaveBeenCalledTimes(1);
    expect(original.undoneByReceiptId).toBe(inverseId);
    noProviderWrite();
  });

  it.each([{ ok: true, data: { summary: "Still live" } }, { ok: false, kind: "network" }])("does not checkpoint an inverse that Google cannot confirm: %j", async readback => {
    mocks.getPost.mockResolvedValue(readback);
    expect(await recover()).toMatchObject({ ok: false });
    expect(mocks.settle).not.toHaveBeenCalled(); noProviderWrite();
  });

  it("requires the original receipt to be durably linked after settlement", async () => {
    original.status = "posted"; original.undoneByReceiptId = null; inverse.status = "posting"; durableLink = false;
    expect(await recover()).toMatchObject({ ok: false });
    expect(mocks.settle).toHaveBeenCalledTimes(1); noProviderWrite();
  });

  it.each(["binding", "place", "original_link", "expired_original", "expired_inverse"])("refuses changed %s before provider reads or settlement", async invalid => {
    if (invalid === "binding") inverse.bindingId = "foreign-binding";
    if (invalid === "place") inverse.locationId = "foreign-place";
    if (invalid === "original_link") inverse.undoesReceiptId = "foreign-original";
    if (invalid === "expired_original") original.providerPayloadExpired = true;
    if (invalid === "expired_inverse") inverse.providerPayloadExpired = true;
    expect(await recover()).toMatchObject({ ok: false });
    expect(mocks.getPost).not.toHaveBeenCalled(); expect(mocks.settle).not.toHaveBeenCalled(); noProviderWrite();
  });

  it.each(["owner", "grant", "draft"])("refuses ended %s authority before inverse provider reads", async invalid => {
    if (invalid === "owner") mocks.access.mockResolvedValue({ access: "provider_read" });
    if (invalid === "grant") mocks.grant.mockRejectedValue(new Error("Grant revoked"));
    if (invalid === "draft") mocks.event.mockResolvedValue({ tenantId: request.tenantId, status: "approved", metadata: { ...metadata, draft: { action: "post", post: { summary: "Changed draft" } } } });
    await expect(recover()).rejects.toThrow();
    expect(mocks.getPost).not.toHaveBeenCalled(); expect(mocks.settle).not.toHaveBeenCalled(); noProviderWrite();
  });

  it.each(["approval", "inverse_authority", "inverse_action", "inverse_actor", "inverse_target", "inverse_digest", "original_digest_missing", "inverse_before_drift"])("refuses foreign %s receipt intent before readback or settlement", async invalid => {
    if (invalid === "approval") original.authority = { kind: "owner_approval", actor: actor.userId, approvalRef: "foreign-event" };
    if (invalid === "inverse_authority") inverse.authority = { kind: "owner_approval", actor: actor.userId, approvalRef: request.eventId };
    if (invalid === "inverse_action") inverse.action = "post_create";
    if (invalid === "inverse_actor") inverse.authority = { kind: "owner_undo", actor: "foreign-owner" };
    if (invalid === "inverse_target") inverse.targetRef = "foreign-target";
    if (invalid === "inverse_digest") inverse.intentDigest = "d".repeat(64);
    if (invalid === "original_digest_missing") original.intentDigest = null;
    if (invalid === "inverse_before_drift") { inverse.before = { summary: "Unapproved different post" }; inverse.intentDigest = googleReceiptIntentDigest(inverse); }
    expect(await recover()).toMatchObject({ ok: false });
    expect(mocks.getPost).not.toHaveBeenCalled(); expect(mocks.settle).not.toHaveBeenCalled(); noProviderWrite();
  });
});
