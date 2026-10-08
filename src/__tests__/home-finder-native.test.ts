import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHomeFinderRuntimeAdapter } from "@/products/home-finder/runtime-adapter";
import { parseHomeFinderEntry, sealHomeFinderEntry } from "@/products/home-finder/entry";
import { isHomeFinderPublicPath } from "@/proxy";
import { installHomeFinder, readHomeFinderBindings, readHomeFinderReceipt, submitHomeFinder } from "@/products/home-finder/runtime-server";
import type { HomeFinderBinding } from "@/products/home-finder/runtime-contracts";
import type { EnterpriseDb } from "@/platform/enterprise/server";
const NOW = "2026-10-08T12:00:00.000Z", id = "27400000-0000-4000-8000-000000000061", workspaceId = "27400000-0000-4000-8000-000000000041", requestId = "27400000-0000-4000-8000-000000000062";
const binding: HomeFinderBinding = { id, workspaceId, agencyId: "27400000-0000-4000-8000-000000000045", systemId: "27400000-0000-4000-8000-000000000060", externalInstallationId: "licensed-test", brokerageName: "Fictional Brokerage", approvedOrigin: "https://brokerage.example.test", sourceName: "Licensed Test Source", licenseReference: "fixture-license", licenseExpiresAt: "2026-10-09T00:00:00Z", revision: 1, lifecycle: "live", status: "active", readiness: null, qualifiedAt: NOW, runtimeAllowed: true };
const actor = { userId: "27400000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const input = { submissionId: requestId, listing: { id: "listing", address: "[address]", inquiryToken: "signed-provider-listing-token" }, buyer: { name: "Buyer", email: "buyer@example.test" }, consent: true as const };
const source = { id: "trestle", name: binding.sourceName, mode: "live", isLive: true, description: "Permitted source", freshnessWindowMinutes: 15 };
const queryResult = { source, fetchedAt: NOW, sourceCheckedAt: NOW, count: 0, listings: [] };
const key = "fictional-home-finder-signing-key-1234567890";
const runtime = (fetchImpl: typeof fetch) => createHomeFinderRuntimeAdapter({ baseUrl: "https://idx.example.test", signingKey: key, fetchImpl, now: () => new Date(NOW) });
const readiness = ["participating brokerage", "provider/MLS authorization", "approved attribution, display, filter, and freshness rules", "exact HTTPS embedding origin", "verified brokerage inquiry destination", "verified agency receipt destination", "server credentials/configuration", "persistent store/backup/worker readiness", "consented end-to-end delivery proof"].map(requirement => ({ requirement, state: "confirmed" as const, source: "Fictional signed evidence", observedAt: NOW, responsibleParty: "Fixture only" }));
const management = () => ({ readInstallationSummary: vi.fn().mockResolvedValue({ schemaVersion: "1", id: binding.externalInstallationId, brokerageName: binding.brokerageName, mode: "live", approvedOrigin: binding.approvedOrigin, previewHref: "https://idx.example.test/embed/licensed-test", observedAt: NOW, readiness }), readReadiness: vi.fn(), listDeliveryReceipts: vi.fn(), readDeliveryReceipt: vi.fn() });
beforeEach(() => { vi.stubEnv("HOME_FINDER_MANAGEMENT_SIGNING_KEY", key); vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("Home Finder native licensed transport", () => {
  it("calls the real scoped IDX search protocol and excludes unknown response fields", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...queryResult, privateMailbox: "must-not-project" })));
    const result = await runtime(transport).search(binding, { city: "Buffalo", limit: 20 });
    expect(String(transport.mock.calls[0]?.[0])).toBe("https://idx.example.test/api/listings?installationId=licensed-test&city=Buffalo&limit=20");
    expect(result).not.toHaveProperty("privateMailbox");
  });
  it("fails closed on demo, wrong source, missing freshness and stale feed", async () => {
    for (const value of [{ ...queryResult, source: { ...source, mode: "demo" } }, { ...queryResult, source: { ...source, name: "Other source" } }, { ...queryResult, sourceCheckedAt: null }, { ...queryResult, sourceCheckedAt: "2026-10-07T12:00:00.000Z" }]) await expect(runtime(vi.fn().mockResolvedValue(new Response(JSON.stringify(value)))).search(binding, { limit: 20 })).rejects.toThrow();
  });
  it("does not claim delivery from HTTP acceptance and preserves the exact submission ID", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "pending", requestId, message: "Queued" }), { status: 202 }));
    expect((await runtime(transport).submit(binding, input)).status).toBe("pending");
    const body = JSON.parse(transport.mock.calls[0]?.[1]?.body as string);
    expect(body.installationId).toBe(binding.externalInstallationId); expect(body.submissionId).toBe(requestId); expect(body).not.toHaveProperty("destination");
  });
  it("timeout is authoritative even when transport ignores abort", async () => {
    const adapter = createHomeFinderRuntimeAdapter({ baseUrl: "https://idx.example.test", signingKey: key, fetchImpl: vi.fn().mockImplementation(() => new Promise(() => undefined)), timeoutMs: 10 });
    const promise = adapter.submit(binding, input); const check = expect(promise).rejects.toMatchObject({ code: "timeout", retryable: true }); await vi.advanceTimersByTimeAsync(10); await check;
  });
  it("entry capabilities reject tampering, another binding, expiry and future issuance", () => {
    const token = sealHomeFinderEntry({ bindingId: id, approvedOrigin: binding.approvedOrigin, revision: 1 });
    expect(parseHomeFinderEntry(token, id).approvedOrigin).toBe(binding.approvedOrigin);
    expect(() => parseHomeFinderEntry(token + "x", id)).toThrow(); expect(() => parseHomeFinderEntry(token, requestId)).toThrow();
    vi.advanceTimersByTime(300_000); expect(() => parseHomeFinderEntry(token, id)).toThrow(); expect(parseHomeFinderEntry(token, id, true).bindingId).toBe(id);
    vi.advanceTimersByTime(1_800_000); expect(() => parseHomeFinderEntry(token, id, true)).toThrow();
  });
  it("opens only the exact public protocol, keeping sibling and configuration routes protected", () => {
    expect(isHomeFinderPublicPath(`/api/home-finder/${id}`)).toBe(true);
    for (const path of [`/api/home-finder/${id}/config`, "/api/home-finder/install", "/api/workspace/home-finder", `/api/home-finder/${id}extra`]) expect(isHomeFinderPublicPath(path)).toBe(false);
  });
  it("native storage never accepts a foreign binding as installation evidence", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ error: null, data: [{ ...binding, workspaceId: requestId }] }) };
    await expect(readHomeFinderBindings(actor, workspaceId, db)).rejects.toThrow("scope");
    await expect(installHomeFinder(actor, { workspaceId, agencyId: binding.agencyId, commandId: id, name: "Home Finder", externalInstallationId: binding.externalInstallationId, brokerageName: binding.brokerageName, approvedOrigin: binding.approvedOrigin, sourceName: binding.sourceName, licenseReference: "fixture", licenseExpiresAt: binding.licenseExpiresAt }, { rpc: vi.fn().mockResolvedValue({ error: null, data: { ...binding, id: requestId } }) })).rejects.toThrow("receipt");
  });
  it("unknown effect is durably recorded after a timeout, with no PII in RPC arguments", async () => {
    const rpc = vi.fn().mockImplementation(async (name: string) => ({ error: null, data: name === "begin_home_finder_intake" ? { status: "started", reference: null } : name === "refresh_home_finder_probe" || name === "finish_home_finder_intake" ? null : binding }));
    const adapter = runtime(vi.fn().mockRejectedValue(new Error("transport uncertain")));
    await expect(submitHomeFinder(id, input, { rpc }, adapter, management())).rejects.toThrow("confirm");
    expect(rpc).toHaveBeenCalledWith("finish_home_finder_intake", expect.objectContaining({ p_status: "unknown", p_submission_id: requestId }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(input.buyer.email); expect(JSON.stringify(rpc.mock.calls)).not.toContain(input.listing.address);
  });
  it("a durable pending acceptance cannot be resubmitted", async () => {
    const rpc: EnterpriseDb["rpc"] = vi.fn().mockImplementation(async (name: string) => ({ error: null, data: name === "begin_home_finder_intake" ? { status: "pending", reference: "receipt" } : name === "refresh_home_finder_probe" ? null : binding }));
    const adapter = { ...runtime(vi.fn()), submit: vi.fn() };
    expect((await submitHomeFinder(id, input, { rpc }, adapter, management())).status).toBe("pending"); expect(adapter.submit).not.toHaveBeenCalled();
  });
  it("receipt capability retains existing obligations after revocation and refuses another reference", async () => {
    const adapter = runtime(vi.fn()), reference = adapter.receiptReference(binding, requestId), provider = management();
    provider.readDeliveryReceipt.mockResolvedValue({ installationId: binding.externalInstallationId, reference, state: "pending" });
    const db = { rpc: vi.fn().mockResolvedValue({ error: null, data: { binding: { ...binding, status: "revoked" }, status: "pending", reference } }) };
    expect((await readHomeFinderReceipt(id, requestId, reference, db, adapter, provider)).state).toBe("pending");
    await expect(readHomeFinderReceipt(id, requestId, "another-reference", db, adapter, provider)).rejects.toThrow("unavailable");
  });
});
