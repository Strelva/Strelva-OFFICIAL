import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupRequest } from "@/app/admin/tenant-cleanup/[id]/cleanup-client";
const receipt = { id: "27410000-0000-4000-8000-000000000010", tenantId: "fictional-cleanup", revision: 2, databaseDeleted: true as const, redisComplete: true, providerComplete: false, complete: false };
afterEach(() => vi.unstubAllGlobals());
function respond(status: number, cleanup: unknown) {
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ cleanup, ok: false, databaseDeleted: true }), { status }));
  vi.stubGlobal("fetch", fetch); return fetch;
}
describe("operator receipt recovery transport", () => {
  it("reads the native receipt without any tenant lookup or cached response", async () => {
    const fetch = respond(200, receipt);
    expect(await cleanupRequest(receipt.tenantId)).toEqual(receipt);
    expect(fetch).toHaveBeenCalledWith(`/api/admin/tenants/${receipt.tenantId}/deprovision`, expect.objectContaining({ cache: "no-store" }));
  });
  it("posts only the exact pinned receipt and keeps a 202 result pending", async () => {
    const fetch = respond(202, { ...receipt, revision: 3 });
    expect(await cleanupRequest(receipt.tenantId, receipt)).toMatchObject({ complete: false, revision: 3 });
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ action: "retry-cleanup", confirmSlug: receipt.tenantId, cleanupReceiptId: receipt.id });
  });
  it.each([403, 500, 503])("keeps HTTP %s unknown rather than fabricating completion", async status => {
    respond(status, receipt);
    await expect(cleanupRequest(receipt.tenantId)).rejects.toThrow();
  });
  it.each([{ ...receipt, tenantId: "other" }, { ...receipt, complete: true }, { ...receipt, redisComplete: true, providerComplete: true, complete: true }, { ...receipt, revision: 1 }, { ...receipt, id: "27410000-0000-4000-8000-000000000099" }, null])("refuses inconsistent, stale, other-scope or missing retry receipts", async value => {
    respond(202, value);
    await expect(cleanupRequest(receipt.tenantId, receipt)).rejects.toThrow();
  });
  it("allows confirmed absence only for a read, without treating it as purge evidence", async () => {
    respond(200, null); expect(await cleanupRequest(receipt.tenantId)).toBeNull();
  });
});
