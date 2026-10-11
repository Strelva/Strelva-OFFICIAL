import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectedSitesStore, type ConnectedSitesStore } from "@/products/connected-sites/store";
import { submitPublicInquiry } from "@/products/connected-sites/server";

const actor = { userId: "c1400000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workspaceId = "c1400000-0000-4000-8000-000000000010";
const lead = { leadId: "lead_example", submissionHash: "abc", name: "Alex", source: "connected-site:strelva-form", fields: {}, capturedAt: "2026-10-06T12:00:00Z" };
afterEach(() => vi.unstubAllEnvs());

describe("connected inquiry records switch", () => {
  it.each([undefined, "0", "true", "1"])("selects only the explicit flag-on RPCs (%s)", async flag => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", flag);
    vi.stubEnv("DUAL_WRITE_PG", "1");
    const rpc = vi.fn(async (name: string) => ({ data: name.startsWith("read_") ? [] : { status: "recorded", id: "lead-row", workspaceId }, error: null }));
    const store = createConnectedSitesStore({ rpc });
    await store.recordInquiry("key", "https://example.test", lead);
    await store.recordSpam("key", "https://example.test", { recordId: "spam", payload: {}, payloadHash: "a".repeat(64), capturedAt: lead.capturedAt });
    await store.inquiries(actor, workspaceId, 50);
    const suffix = flag === "1" ? "_v2" : "";
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([`record_connected_site_inquiry${suffix}`, `record_connected_site_spam${suffix}`, `read_connected_site_inquiries${suffix}`]);
  });

  it("preserves the old calls under the dual-write kill switch", async () => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1");
    vi.stubEnv("DUAL_WRITE_PG", "0");
    const rpc = vi.fn(async () => ({ data: { status: "recorded", id: "lead-row", workspaceId }, error: null }));
    await createConnectedSitesStore({ rpc }).recordInquiry("key", null, lead);
    expect(rpc).toHaveBeenCalledWith("record_connected_site_inquiry", { p_public_key: "key", p_origin: null, p_lead: lead });
  });

  it.each(["0", "1"])("retains honeypot submissions only under records flag %s", async flag => {
    vi.stubEnv("STRELVA_INQUIRY_RECORDS", flag);
    vi.stubEnv("DUAL_WRITE_PG", "1");
    const recordSpam = vi.fn(async () => ({ status: "recorded" as const }));
    const recordInquiry = vi.fn();
    const notify = vi.fn();
    const site = { id: "c1400000-0000-4000-8000-000000000020", workspaceId, siteUrl: "https://example.test/", siteHost: "example.test", allowedOrigins: ["https://example.test"], captureForms: true, injectSchema: true, verified: true };
    const result = await submitPublicInquiry("key", site, "https://example.test", { id: "inq12345678", capture: "strelva-form", _hp: "bot", fields: { name: "Visitor" } }, {
      store: { recordSpam, recordInquiry } as unknown as ConnectedSitesStore,
      notify, now: Date.parse(lead.capturedAt),
    });
    expect(result.status).toBe(flag === "1" ? "held_as_spam" : "ignored");
    if (flag === "1") expect(recordSpam).toHaveBeenCalledWith("key", "https://example.test", expect.objectContaining({ payload: expect.objectContaining({ reason: "honeypot", name: "Visitor" }) }));
    else expect(recordSpam).not.toHaveBeenCalled();
    expect(recordInquiry).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});
