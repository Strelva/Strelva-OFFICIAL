import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyConnectedSiteInquiry } from "@/products/connected-sites/notify";

const site = { id: "77000000-0000-4000-8000-000000000003", workspaceId: "77000000-0000-4000-8000-000000000002", siteHost: "bakery.example", siteUrl: "https://bakery.example/", allowedOrigins: ["https://bakery.example"], captureForms: true, injectSchema: true, verified: true };
const inquiry = { id: "77000000-0000-4000-8000-000000000004", name: "Pat", email: "pat@example.test", message: "A cake?" };
const owner = { email: "owner@example.test", name: null, from: "record" as const, source: "owner" as const, verified: true, tenantId: "bakery" };

beforeEach(() => {
  vi.stubEnv("STRELVA_CONNECTED_SITE_EMAIL_ENABLED", "1");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
  vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

function ports() {
  return { recipient: vi.fn(async () => owner), clientOverride: vi.fn(async () => "inherit" as const), send: vi.fn(async () => true) };
}

describe("silent connected-site rollout email policy", () => {
  for (const [flag, value] of [
    ["STRELVA_CONNECTED_SITE_EMAIL_ENABLED", ""],
    ["STRELVA_CONNECTED_SITE_EMAIL_ENABLED", "true"],
    ["EMAIL_SENDING_ENABLED", "false"],
    ["CUSTOMER_EMAIL_ENABLED", "false"],
  ]) {
    it(`sends nothing and reads no recipient with ${flag}=${value || "unset"}`, async () => {
      const deps = ports();
      vi.stubEnv(flag!, value!);
      expect(await notifyConnectedSiteInquiry({ site, inquiry }, deps)).toBe("paused");
      expect(deps.recipient).not.toHaveBeenCalled();
      expect(deps.clientOverride).not.toHaveBeenCalled();
      expect(deps.send).not.toHaveBeenCalled();
    });
  }

  it("respects the per-tenant off override with all global gates enabled", async () => {
    const deps = { ...ports(), clientOverride: vi.fn(async () => "off" as const) };
    expect(await notifyConnectedSiteInquiry({ site, inquiry }, deps)).toBe("paused");
    expect(deps.clientOverride).toHaveBeenCalledWith("bakery");
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("never sends for a business-only site without a tenant email policy", async () => {
    const deps = { ...ports(), recipient: vi.fn(async () => ({ ...owner, tenantId: null })) };
    expect(await notifyConnectedSiteInquiry({ site, inquiry }, deps)).toBe("no_tenant");
    expect(deps.clientOverride).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it("passes the tenant into the shared transport when all gates allow sending", async () => {
    const deps = ports();
    expect(await notifyConnectedSiteInquiry({ site, inquiry }, deps)).toBe("sent");
    expect(deps.send).toHaveBeenCalledWith(expect.objectContaining({ audience: "client", tenantId: "bakery", to: owner.email }));
  });

  it("does not report a suppressed shared-transport send as sent", async () => {
    const deps = { ...ports(), send: vi.fn(async () => false) };
    expect(await notifyConnectedSiteInquiry({ site, inquiry }, deps)).toBe("paused");
  });
});
