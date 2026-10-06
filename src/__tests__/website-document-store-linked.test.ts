import { describe, expect, it, vi } from "vitest";
import { createWebsiteDocumentStore } from "@/products/websites/document-store";
import { WorkspaceAccessError, WorkspaceConflictError } from "@/platform/workspaces/types";

vi.mock("@/lib/redis", () => ({ getRedis: () => null }));
const actor = { userId: "74000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const key = { workspaceId: "74000000-0000-4000-8000-000000000002", workId: "74000000-0000-4000-8000-000000000003" };
function db(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => result);
  return { rpc, store: createWebsiteDocumentStore({ rpc }) };
}

describe("website document store: linked publication, routing and domain authority", () => {
  it("reads the current tenant from the routing RPC", async () => {
    const { rpc, store } = db({ data: [{ tenant_id: "renamed-site", source: "publication", delivery_model: "platform_template" }], error: null });
    expect(await store.currentTenant!(actor, key)).toEqual({ tenantId: "renamed-site", source: "publication", deliveryModel: "platform_template" });
    expect(rpc).toHaveBeenCalledWith("read_website_current_tenant", expect.objectContaining({ p_workspace_id: key.workspaceId, p_work_id: key.workId, p_user_id: actor.userId }));
    expect(await db({ data: [], error: null }).store.currentTenant!(actor, key)).toBeNull();
  });
  it("returns the scalar domain authority and maps refusals to plain errors", async () => {
    expect(await db({ data: "provider", error: null }).store.authorizeDomain!(actor, { ...key, tenantId: "site", hostname: "www.example.test", action: "attach" })).toBe("provider");
    await expect(db({ data: null, error: { message: "website_domain_owner_approval_required" } }).store.authorizeDomain!(actor, { ...key, tenantId: "site", hostname: "www.example.test", action: "attach" }))
      .rejects.toThrow(/owner hasn't approved this domain/);
    await expect(db({ data: null, error: { message: "website_tenant_access_denied" } }).store.authorizeDomain!(actor, { ...key, tenantId: "site", hostname: "www.example.test", action: "attach" }))
      .rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(db({ data: "something-else", error: null }).store.authorizeDomain!(actor, { ...key, tenantId: "site", hostname: "www.example.test", action: "attach" })).rejects.toThrow(/could not be confirmed/);
  });
  it("refuses an unlinked tenant as an access failure and a stale approval as a conflict", async () => {
    const receipt = { status: "published" as const, provider: "strelva-hosted", providerUrl: "https://site.strelva.com/", receiptId: "fixture-receipt", artifactHash: "a".repeat(64), candidateRevision: 1, publishedAt: "2026-10-08T00:00:00Z", evidence: "Fixture" };
    const input = { ...key, revision: 1, contentHash: "a".repeat(64), tenantId: "site", receipt };
    await expect(db({ data: null, error: { message: "website_tenant_not_linked" } }).store.publishToLinkedTenant!(actor, input)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(db({ data: null, error: { message: "website_approval_required" } }).store.publishToLinkedTenant!(actor, input)).rejects.toBeInstanceOf(WorkspaceConflictError);
    // A receipt for another revision never reaches the database.
    const { rpc, store } = db({ data: null, error: null });
    await expect(store.publishToLinkedTenant!(actor, { ...input, receipt: { ...receipt, candidateRevision: 2 } })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("records an owner's domain approval", async () => {
    const { rpc, store } = db({ data: { id: "x", hostname: "www.example.test", approvedAt: "2026-10-08T00:00:00Z", expiresAt: "2026-10-22T00:00:00Z" }, error: null });
    expect(await store.approveDomain!(actor, { ...key, tenantId: "site", hostname: "www.example.test" })).toEqual({ hostname: "www.example.test", expiresAt: "2026-10-22T00:00:00Z" });
    expect(rpc).toHaveBeenCalledWith("approve_website_domain_change", expect.objectContaining({ p_tenant_id: "site", p_hostname: "www.example.test" }));
  });
});
