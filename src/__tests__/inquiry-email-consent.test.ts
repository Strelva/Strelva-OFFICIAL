import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const overrides = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/client-email-override", () => ({ getClientEmailOverride: overrides.get }));
import { InquiryEngine } from "@/products/inquiries/inquiry-engine";
import { applyInquiryEmailConsent, inquiryEmailReadiness, projectInquiryEmailConnection } from "@/products/inquiries/email-consent";

describe("explicit inquiry email permission", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "unit-test-provider-key");
    vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    overrides.get.mockResolvedValue("inherit");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("does not treat a configured sender as tenant permission", async () => {
    const engine = new InquiryEngine({ businessId: "example" });
    expect((await projectInquiryEmailConnection(engine, "example")).status).toBe("not_configured");
  });

  it("records a grant separately from readiness and revokes by pausing the standing job", async () => {
    const engine = new InquiryEngine({ businessId: "example" });
    const work = engine.start({ actorId: "owner", intent: "Collect quote requests", destination: "owner@example.invalid" });
    engine.acceptShape(work.id, { actorId: "owner" });
    engine.createResponsibility({ actorId: "owner", capabilityId: work.capabilityId, title: "Handle quotes", scope: "Prepare follow-up replies", allowedActions: ["send_message"], escalation: { primary: "Owner", secondary: null } });
    vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "false");
    const granted = await applyInquiryEmailConsent(engine, { tenantId: "example", requestId: work.id, actorId: "owner", granted: true });
    expect(granted.work.draft!.connections[0]).toMatchObject({ status: "missing", consent: "explicit" });
    expect((await projectInquiryEmailConnection(engine, "example")).status).toBe("unavailable");
    vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
    await applyInquiryEmailConsent(engine, { tenantId: "example", requestId: work.id, actorId: "owner", granted: true });
    expect((await projectInquiryEmailConnection(engine, "example")).status).toBe("connected");
    await applyInquiryEmailConsent(engine, { tenantId: "example", requestId: work.id, actorId: "owner", granted: false });
    expect(engine.snapshot().responsibilities[0]!.status).toBe("paused");
    expect((await projectInquiryEmailConnection(engine, "example")).status).toBe("not_configured");
  });

  it("respects a tenant sending block and the independent customer switch", async () => {
    overrides.get.mockResolvedValue("off");
    expect(await inquiryEmailReadiness("example")).toBe(false);
    overrides.get.mockResolvedValue("on");
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false");
    expect(await inquiryEmailReadiness("example")).toBe(true);
    vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "false");
    expect(await inquiryEmailReadiness("example")).toBe(false);
  });
});
