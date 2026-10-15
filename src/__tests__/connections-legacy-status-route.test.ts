import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getConnections: vi.fn() }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "acme" }));
vi.mock("@/platform/infra/auth", () => ({ requireTenantAccess: async () => null }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeTenantOperatorRead: async () => undefined }));
vi.mock("@/lib/connections", () => ({ getConnections: mocks.getConnections }));

import { GET } from "@/app/api/connections/route";
import { resetProviderKeyWarningsForTests } from "@/platform/connections/provider-keys";

beforeEach(() => { mocks.getConnections.mockResolvedValue([]); vi.spyOn(console, "warn").mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); resetProviderKeyWarningsForTests(); });

const byProvider = async () => Object.fromEntries((await (await GET()).json()).connections.map((c: { provider: string; platformReady: boolean }) => [c.provider, c.platformReady]));

describe("GET /api/connections platformReady", () => {
  it("is false for OAuth providers Strelva has no keys for, and always true for Yelp", async () => {
    expect(await byProvider()).toEqual({ google: false, yelp: true, calendly: false, instagram: false });
  });

  it("turns true provider by provider as keys are added", async () => {
    vi.stubEnv("CALENDLY_CLIENT_ID", "id"); vi.stubEnv("CALENDLY_CLIENT_SECRET", "s"); vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    expect(await byProvider()).toMatchObject({ calendly: true, instagram: false });
  });

  it("never carries a key name or value", async () => {
    vi.stubEnv("CALENDLY_CLIENT_SECRET", "fictional-secret-value");
    const text = JSON.stringify(await (await GET()).json());
    expect(text).not.toContain("fictional-secret-value");
    expect(text).not.toContain("CALENDLY_CLIENT");
  });
});
