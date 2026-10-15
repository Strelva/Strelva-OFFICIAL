import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enabled = vi.fn();
vi.mock("@/platform/release-flags/store", () => ({ workspaceReleaseFlagEnabled: (...args: unknown[]) => enabled(...args) }));

import { sitesByCodeMayBeOn, sitesByCodeReleased } from "@/products/websites/sites-by-code-release";

const WS = "10000000-0000-4000-8000-000000000001";

describe("sites_by_code release", () => {
  beforeEach(() => {
    enabled.mockReset();
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "");
    vi.stubEnv("STRELVA_SITES_BY_CODE_RELEASE", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("is off everywhere without reading rows when the env is unset", async () => {
    expect(sitesByCodeMayBeOn()).toBe(false);
    await expect(sitesByCodeReleased(WS)).resolves.toBe(false);
    expect(enabled).not.toHaveBeenCalled();
  });

  it("follows the business's row under workspace mode", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_SITES_BY_CODE_RELEASE", "workspace");
    enabled.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(sitesByCodeMayBeOn()).toBe(true);
    await expect(sitesByCodeReleased(WS)).resolves.toBe(true);
    await expect(sitesByCodeReleased(WS)).resolves.toBe(false);
    expect(enabled).toHaveBeenCalledWith("sites_by_code", WS, expect.anything());
  });

  it("fails closed when the row read throws", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_SITES_BY_CODE_RELEASE", "1");
    enabled.mockRejectedValueOnce(new Error("down"));
    await expect(sitesByCodeReleased(WS)).resolves.toBe(false);
  });
});
