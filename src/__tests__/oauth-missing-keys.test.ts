import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ begin: vi.fn(), context: vi.fn(), eligible: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({
  verifyAuth: async () => true, requireTenantPermission: async () => null,
  getActorContext: async () => ({ userId: "u1", email: "o@example.test", type: "user" }),
}));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "harbor-dental" }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/oauth-state", () => ({ createOAuthState: () => "signed-state" }));
vi.mock("@/app/api/oauth/calendly/connection-holder", () => ({ beginOAuthHolder: mocks.begin }));
vi.mock("@/products/google-listing/server", () => ({ assertTenantGoogleConnectionEligible: mocks.eligible }));

import { GET as calendly } from "@/app/api/oauth/calendly/route";
import { GET as instagram } from "@/app/api/oauth/instagram/route";
import { GET as google } from "@/app/api/oauth/google/route";
import { resetProviderKeyWarningsForTests } from "@/platform/connections/provider-keys";

const warned: string[] = [];
beforeEach(() => { warned.length = 0; vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => { warned.push(args.join(" ")); }); mocks.begin.mockResolvedValue({}); mocks.eligible.mockResolvedValue(undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); resetProviderKeyWarningsForTests(); });

describe.each([
  ["Calendly", calendly, "calendly", "CALENDLY_CLIENT_ID"],
  ["Instagram", instagram, "instagram", "INSTAGRAM_CLIENT_ID"],
  ["Google", google, "google_sign_in_legacy", "GOOGLE_CLIENT_ID"],
] as const)("%s OAuth start without Strelva's keys", (label, start, integration, envName) => {
  it("answers 503 in plain words, not a 500, and logs the missing names once", async () => {
    for (let i = 0; i < 2; i++) {
      const response = await start();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: `${label} isn't set up on Strelva yet.` });
    }
    const lines = warned.filter(line => line.includes(`${integration} not set up yet`));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(envName);
  });

  it("goes on to the provider's consent page once the keys exist", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    for (const name of ["CALENDLY", "INSTAGRAM", "GOOGLE"]) { vi.stubEnv(`${name}_CLIENT_ID`, "fixture-id"); vi.stubEnv(`${name}_CLIENT_SECRET`, "fixture-secret"); }
    expect((await start()).status).toBe(307);
  });
});
