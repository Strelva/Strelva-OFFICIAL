import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ config: null as null | { emailAllowed: (row: { sourceLifecycle: string; workspaceId: string; sourceId: string }) => Promise<boolean> } }));
vi.mock("@/platform/needs-you/service", () => ({ createNeedsYouService: (config: never) => { captured.config = config; return {}; } }));

import { needsYouService } from "@/server/needs-you/server";

const row = { sourceLifecycle: "connected_site_change", workspaceId: "aaaaaaaa-0000-4000-8000-000000000001", sourceId: "aaaaaaaa-0000-4000-8000-0000000000c1" };
afterEach(() => vi.unstubAllEnvs());

describe("Needs you email for a planned connected-site change", () => {
  it("is not sent unless EMAIL_SENDING_ENABLED is true and the change switch is 1", async () => {
    needsYouService();
    const allowed = () => captured.config!.emailAllowed(row);
    expect(await allowed()).toBe(false);
    vi.stubEnv("STRELVA_CONNECTED_SITE_CHANGE_OWNER_EMAIL", "1");
    expect(await allowed()).toBe(false);
    vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
    expect(await allowed()).toBe(true);
    vi.stubEnv("STRELVA_CONNECTED_SITE_CHANGE_OWNER_EMAIL", "");
    expect(await allowed()).toBe(false);
  });
  it("leaves other sources as they were", async () => {
    needsYouService();
    expect(await captured.config!.emailAllowed({ ...row, sourceLifecycle: "service_request" })).toBe(true);
  });
});
