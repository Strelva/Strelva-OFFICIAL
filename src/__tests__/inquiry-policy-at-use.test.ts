import { afterEach, describe, expect, it, vi } from "vitest";
import { inquiryMessageRouteAtUse } from "@/products/inquiries/inquiry-policy-at-use";
import { setInquiryRecordsDb } from "@/platform/infra/inquiry-records";
import { systemOriginId } from "@/platform/systems/invariants";
import { createMemoryInquiryDeliveryStore, deliverInquiryAction } from "@/products/inquiries/delivery";
import type { ResponsibilityEvaluation } from "@/products/inquiries/contracts";

vi.mock("@/lib/tenant-crm", () => ({ addTenantActivity: vi.fn(async () => undefined) }));
const workspaceId = "f6350000-0000-4000-8000-000000000001";
const inquiryWorkspaceId = "f6350000-0000-4000-8000-000000000002";
const evaluation: ResponsibilityEvaluation = { decision: "allow", action: "reply", reason: "Current trusted policy", clause: null, disclosedAs: "Strelva" };
function enable() { vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "1"); vi.stubEnv("STRELVA_INQUIRY_RECORDS", "1"); vi.stubEnv("DUAL_WRITE_PG", "1"); }
function storage(data: unknown) { const rpc = vi.fn(async () => ({ data, error: null })); setInquiryRecordsDb({ rpc }); return rpc; }
afterEach(() => { setInquiryRecordsDb(undefined); vi.unstubAllEnvs(); });

describe("current inquiry policy at send", () => {
  it("uses current matching owner routes; another System cannot restrict or grant this one", async () => {
    enable();
    const ownSystem = systemOriginId(workspaceId, { kind: "inquiry_workspace", ref: inquiryWorkspaceId });
    const rpc = storage({ workspaceId, inquiryWorkspaceId, policies: [{ systemId: ownSystem, route: "owner_decides" }] });
    expect(await inquiryMessageRouteAtUse("fixture", evaluation, "Hello from Strelva", workspaceId)).toBe("owner_decides");
    expect(rpc).toHaveBeenCalledWith("read_inquiry_message_owner_policy", { p_tenant_id: "fixture", p_business_id: workspaceId });
    storage({ workspaceId, inquiryWorkspaceId, policies: [{ systemId: "f6350000-0000-4000-8000-000000000003", route: "owner_decides" }] });
    expect(await inquiryMessageRouteAtUse("fixture", evaluation, "Hello from Strelva", workspaceId)).toBe("handle");
    storage({ workspaceId, inquiryWorkspaceId, policies: [{ systemId: null, route: "strelva_reviews" }] });
    expect(await inquiryMessageRouteAtUse("fixture", evaluation, "Hello from Strelva", workspaceId)).toBe("strelva_reviews");
  });
  it("commitments never inherit trust; policy outages close automatic sending; gates off make no read", async () => {
    enable(); const rpc = storage({ malformed: true });
    expect(await inquiryMessageRouteAtUse("fixture", evaluation, "The price is $40.", workspaceId)).toBe("owner_decides");
    expect(rpc).not.toHaveBeenCalled();
    expect(await inquiryMessageRouteAtUse("fixture", evaluation, "Hello from Strelva", workspaceId)).toBe("owner_decides");
    vi.stubEnv("STRELVA_INQUIRY_OWNER_NOTICES", "0"); rpc.mockClear();
    expect(await inquiryMessageRouteAtUse("fixture", evaluation, "Hello from Strelva", workspaceId)).toBe("handle");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("a stricter current owner route prevents a previously trusted automatic reply from reaching transport", async () => {
    enable(); const now = new Date("2026-10-10T12:00:00Z");
    const inquiry = { id: "lead_fixture", tenantId: "fixture", businessId: workspaceId, name: "Dana", email: "dana@example.test", receivedAt: "2026-10-10T11:00:00Z" };
    const transport = { send: vi.fn(), verify: vi.fn() };
    const store = createMemoryInquiryDeliveryStore(); const messageRoute = vi.fn(async () => "owner_decides" as const);
    const result = await deliverInquiryAction(inquiry, "reply", {
      policy: { version: "current", autoReply: { mode: "auto", enabled: true } },
      responsibilityGate: { allowed: true, action: "reply", evaluation, budget: { limit: 5, timezone: "UTC", policyVersion: "current", now: now.toISOString() } },
      deps: { store, transport, now: () => now, isWorkspaceExited: async () => false, messageRoute,
        resolveRoute: async () => ({ tenantId: "fixture", businessName: "Fixture", customerEmail: inquiry.email, ownerEmail: "owner@example.test", customerReplyTo: "owner@example.test", ownerNotification: "legacy" }) },
    });
    expect(result).toMatchObject({ status: "awaiting_approval", reason: "approval_required" });
    expect(messageRoute).toHaveBeenCalledWith("fixture", evaluation, expect.stringContaining("Strelva"), workspaceId);
    expect(transport.send).not.toHaveBeenCalled();
    expect(await store.getCheckpoint({ tenantId: "fixture", inquiryId: inquiry.id, action: "reply" })).toBeNull();
  });
});
