import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/infra/email/business-context", () => ({ resolveEmailBusinessContext: async ({ workspaceId }: { workspaceId?: string }) => workspaceId ? ({ workspaceId, tenantIds: [], ownerAuthorship: "agency", businessName: null, replyTo: null, timeZone: null }) : null }));
vi.mock("@/platform/agency-brand/server", () => ({
  resolveTenantBrand: async () => ({ agencyId: "agency-fixture", name: "North Studio", logoUrl: "https://example.test/logo.png", accentColor: "#447a4f", replyTo: "team@north.example", credit: "runs_on_strelva" }),
  resolveOwnerBrand: async () => ({ agencyId: "agency-fixture", name: "North Studio", logoUrl: "https://example.test/logo.png", accentColor: "#447a4f", replyTo: "team@north.example", credit: "runs_on_strelva" }),
  resolveAgencyEmailIdentity: async () => ({ name: "North Studio", replyTo: "team@north.example" }),
}));

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: vi.fn().mockResolvedValue("inherit") }));
const gate = vi.hoisted(() => vi.fn());
vi.mock("@/platform/infra/email/provider-gate", async importOriginal => ({ ...(await importOriginal<object>()), agencyEmailSendAllowed: gate }));

import { clientEmailPolicyAllows, sendEmailWithReceipt } from "@/platform/infra/email/send";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  for (const key of ["EMAIL_SENDING_ENABLED", "OPERATOR_EMAILS_ENABLED", "PROSPECT_EMAILS_ENABLED", "CUSTOMER_EMAIL_ENABLED"]) vi.stubEnv(key, "");
  vi.stubEnv("RESEND_API_KEY", "re_test");
});
afterEach(() => vi.unstubAllEnvs());

describe("send suppression logging", () => {
  it("logs the provider gate hold without the recipient and keeps the reason", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    gate.mockResolvedValue(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await sendEmailWithReceipt({
      audience: "client", workspaceId: "ws-1", authorship: "agency", provider: "agency-fixture" as never,
      to: "owner@example.com", subject: "Private subject", html: "<p>x</p>", text: "x",
    });
    expect(result).toEqual({ status: "suppressed", reason: "email_suppressed_or_unconfigured" });
    const logged = warn.mock.calls.map(call => call.join(" ")).join("\n");
    expect(logged).toContain("agency_email_gate_closed");
    expect(logged).not.toContain("owner@example.com");
    expect(logged).not.toContain("Private subject");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("clientEmailPolicyAllows", () => {
  it("is false while client email is off and no override exists", async () => {
    expect(await clientEmailPolicyAllows({ tenantId: "tenant-1" })).toBe(false);
    expect(await clientEmailPolicyAllows({})).toBe(false);
  });
});
