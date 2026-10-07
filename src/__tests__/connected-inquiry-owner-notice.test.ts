import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectedOwnerNoticeGates, notifyDurableConnectedInquiryOwner, reconcileConnectedInquiryOwnerNotice, type ConnectedOwnerNoticeDependencies } from "@/products/connected-sites/inquiry-owner-notice";
import { readInquiryOwnerNoticeIssues } from "@/platform/operator-queue/inquiry-owner-notices";

const rowId = "c1800000-0000-4000-8000-000000000001";
const workspaceId = "c1800000-0000-4000-8000-000000000010";
const siteId = "c1800000-0000-4000-8000-000000000020";
const input = { rowId, siteId, workspaceId, subject: "New inquiry from fixture.example", options: { heading: "New inquiry", paragraphs: ["Dana asked about a party."] } };
const claim = { acquired: true, status: "sending", recipient: "owner@example.test", tenantId: null };
function dependencies(patch: Partial<ConnectedOwnerNoticeDependencies> = {}): ConnectedOwnerNoticeDependencies {
  return { rpc: vi.fn(async name => name.startsWith("claim") ? claim : true), gates: vi.fn(async () => true),
    send: vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-one", acceptedAt: "2026-10-06T12:00:00Z" })), ...patch };
}
beforeEach(() => { vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1"); vi.stubEnv("DUAL_WRITE_PG", "1"); });
afterEach(() => vi.unstubAllEnvs());
describe("connected inquiry owner notice receipts", () => {
  it("default gates keep durable notices silent until connected-site email is armed", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
    vi.stubEnv("STRELVA_CONNECTED_SITE_EMAIL_ENABLED", "");
    expect(await connectedOwnerNoticeGates(null)).toBe(false);
    vi.stubEnv("STRELVA_CONNECTED_SITE_EMAIL_ENABLED", "1");
    expect(await connectedOwnerNoticeGates(null)).toBe(true);
  });
  it("records the provider acceptance under the exact source-aware claim", async () => {
    const d = dependencies();
    expect(await notifyDurableConnectedInquiryOwner(input, d)).toBe("sent");
    expect(d.rpc).toHaveBeenNthCalledWith(1, "claim_connected_inquiry_owner_notice", { p_lead_row_id: rowId, p_site_id: siteId, p_workspace_id: workspaceId, p_subject: input.subject });
    expect(d.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "client", to: claim.recipient,
      idempotencyKey: `connected-inquiry:${rowId}`, tags: { strelva_connected_notice_id: rowId, strelva_workspace_id: workspaceId } }));
    expect(d.rpc).toHaveBeenLastCalledWith("finish_connected_inquiry_owner_notice", expect.objectContaining({ p_status: "accepted", p_provider_message_id: "provider-one" }));
  });
  it("records suppression while gates are closed, unavailable or the recipient is missing", async () => {
    for (const d of [dependencies({ gates: async () => false }), dependencies({ gates: async () => { throw new Error("gate offline"); } }),
      dependencies({ rpc: vi.fn(async name => name.startsWith("claim") ? { ...claim, recipient: null } : true) })]) {
      expect(await notifyDurableConnectedInquiryOwner(input, d)).not.toBe("sent");
      expect(d.send).not.toHaveBeenCalled();
      expect(d.rpc).toHaveBeenLastCalledWith("finish_connected_inquiry_owner_notice", expect.objectContaining({ p_status: "suppressed" }));
    }
  });
  it("never resends an accepted, bounced, failed, in-flight or unknown purpose", async () => {
    for (const status of ["accepted", "bounced", "failed", "sending", "unknown"]) {
      const d = dependencies({ rpc: vi.fn(async () => ({ ...claim, acquired: false, status })) });
      await notifyDurableConnectedInquiryOwner(input, d);
      expect(d.send).not.toHaveBeenCalled(); expect(d.rpc).toHaveBeenCalledTimes(1);
    }
  });
  it("keeps unknown acceptance closed and retains provider acceptance when its checkpoint fails", async () => {
    const unknown = dependencies({ send: async () => { throw new Error("timeout"); } });
    expect(await notifyDurableConnectedInquiryOwner(input, unknown)).toBe("paused");
    expect(unknown.rpc).toHaveBeenLastCalledWith("finish_connected_inquiry_owner_notice", expect.objectContaining({ p_status: "unknown" }));
    const accepted = dependencies({ rpc: vi.fn(async name => { if (name.startsWith("claim")) return claim; throw new Error("database down"); }) });
    expect(await notifyDurableConnectedInquiryOwner(input, accepted)).toBe("sent");
    expect(accepted.send).toHaveBeenCalledOnce();
  });
});

describe("connected notice provider and operator evidence", () => {
  const event = { type: "email.bounced", created_at: "2026-10-06T12:05:00Z", data: { email_id: "provider-one", created_at: "2026-10-06T12:00:00Z", to: ["owner@example.test"], subject: input.subject,
    tags: [{ name: "strelva_connected_notice_id", value: rowId }, { name: "strelva_workspace_id", value: workspaceId }] } };
  it("accepts a signed-host delivery outcome and keeps receipt outages retryable", async () => {
    const rpc = vi.fn(async () => ({ status: "recorded" }));
    expect(await reconcileConnectedInquiryOwnerNotice({ event, eventId: "bounce-one" }, rpc)).toEqual({ status: "recorded" });
    expect(rpc).toHaveBeenCalledWith("record_connected_inquiry_owner_notice_event", expect.objectContaining({ p_lead_row_id: rowId, p_workspace_id: workspaceId, p_status: "bounced", p_recipients: ["owner@example.test"] }));
    expect((await reconcileConnectedInquiryOwnerNotice({ event, eventId: "bounce-one" }, async () => { throw new Error("offline"); })).status).toBe("unavailable");
  });
  it("does no receipt I/O while disabled or for unrelated/malformed events", async () => {
    const rpc = vi.fn();
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "0");
    expect((await reconcileConnectedInquiryOwnerNotice({ event, eventId: "one" }, rpc)).status).toBe("ignored");
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1");
    expect((await reconcileConnectedInquiryOwnerNotice({ event: { ...event, data: { ...event.data, tags: {} } }, eventId: "one" }, rpc)).status).toBe("ignored");
    expect((await reconcileConnectedInquiryOwnerNotice({ event: { ...event, data: { ...event.data, to: ["invalid"] } }, eventId: "one" }, rpc)).status).toBe("unmatched");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("shows standalone connected owner failures without fabricating a tenant or exposing lead contents", async () => {
    const read = vi.fn(async name => name.startsWith("list_connected") ? [{ tenantId: null, workspaceId, connectedSiteId: siteId, inquiryId: rowId, at: "2026-10-06T12:05:00Z", status: "bounced" }] : []);
    const result = await readInquiryOwnerNoticeIssues([], read);
    expect(result).toMatchObject({ ok: true, rows: [{ tenantId: null, workspaceId, title: "Owner not told: email bounced or failed", sourceRef: `inquiry-owner:${siteId}:${rowId}` }] });
    expect(JSON.stringify(result)).not.toContain("owner@example.test");
    expect((await readInquiryOwnerNoticeIssues([], async () => { throw new Error("offline"); })).ok).toBe(false);
  });
});
