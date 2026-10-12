vi.mock("@/platform/infra/email/business-context", () => ({ resolveEmailBusinessContext: async ({ tenantId }: { tenantId?: string }) => tenantId ? ({ workspaceId: null, tenantIds: [tenantId], ownerAuthorship: null, businessName: null, replyTo: null, timeZone: null }) : null }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: async () => "inherit" }));
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/agency-brand/server", () => ({
  resolveTenantBrand: async () => ({ agencyId: "agency-fixture", name: "North Studio", logoUrl: "https://example.test/logo.png", accentColor: "#447a4f", replyTo: "team@north.example", credit: "runs_on_strelva" }),
  resolveOwnerBrand: async () => ({ agencyId: "agency-fixture", name: "North Studio", logoUrl: "https://example.test/logo.png", accentColor: "#447a4f", replyTo: "team@north.example", credit: "runs_on_strelva" }),
  resolveAgencyEmailIdentity: async () => ({ name: "North Studio", replyTo: "team@north.example" }),
}));

const mockSendEmail = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return {
      emails: {
        send: mockSendEmail,
      },
    };
  }),
}));

describe("sendUpdateLiveEmail rollingOut soft variant", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = {
      ...originalEnv,
      RESEND_API_KEY: "re_test",
      RESEND_DOMAIN: "updates.strelva.com",
    };
    mockSendEmail.mockResolvedValue({ data: { id: "email_123" }, error: null, headers: null });
  });

  it("claims the change is LIVE when revalidation confirmed (rollingOut unset)", async () => {
    const { sendUpdateLiveEmail } = await import("@/lib/delivery-email");

    const ok = await sendUpdateLiveEmail({
      email: "owner@example.com",
      tenantId: "rohlax",
      siteName: "Rohlax Wellness",
      whatChanged: "your hours",
      siteUrl: "https://rohlaxwellness.com",
    });

    expect(ok).toBe(true);
    const sent = mockSendEmail.mock.calls[0]![0];
    expect(sent.subject).toBe("Your update to Rohlax Wellness is live");
    expect(sent.html).toContain("Your update is live.");
    expect(sent.html).toContain("live for visitors right now");
    expect(sent.text).toContain("Your update is live.");
    expect(sent.text).toContain("live for visitors right now");
  });

  it("softens the claim to ROLLING OUT when revalidation did not confirm", async () => {
    const { sendUpdateLiveEmail } = await import("@/lib/delivery-email");

    const ok = await sendUpdateLiveEmail({
      email: "owner@example.com",
      tenantId: "rohlax",
      siteName: "Rohlax Wellness",
      whatChanged: "your hours",
      siteUrl: "https://rohlaxwellness.com",
      rollingOut: true,
    });

    expect(ok).toBe(true);
    const sent = mockSendEmail.mock.calls[0]![0];
    expect(sent.subject).toBe("Your update to Rohlax Wellness is rolling out");
    expect(sent.html).toContain("Your update is approved.");
    expect(sent.html).toContain("It can take a few minutes to appear");
    // Must NOT promise it's live when it might not be.
    expect(sent.html).not.toContain("live for visitors right now");
    expect(sent.text).toContain("It can take a few minutes to appear");
    expect(sent.text).not.toContain("live for visitors right now");
  });
});

describe("retired operator content approval", () => {
  it("contains no content write or owner-live notification after an operator decision", async () => {
    const { readFileSync } = await import("node:fs"); const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "src/app/api/admin/drafts/route.ts"), "utf8");
    expect(source).toContain("client_content_decision_required");
    expect(source).not.toContain("setContent"); expect(source).not.toContain("sendUpdateLiveEmail");
  });
});
