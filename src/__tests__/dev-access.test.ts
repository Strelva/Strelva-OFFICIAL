import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDevAccessTenant, isDevAccessBypassEnabled } from "../lib/dev-access";

describe("dev access bypass", () => {
  beforeEach(() => {
    vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", undefined);
    vi.stubEnv("SCAFFOLD_DEV_TENANT", undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is enabled only when the local bypass flag is set outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "1");

    expect(isDevAccessBypassEnabled()).toBe(true);
  });

  it("honors an explicit disabled primary flag over an enabled legacy flag", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "0");
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "1");
    expect(isDevAccessBypassEnabled()).toBe(false);
  });

  it("stays disabled in production even when the bypass flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "1");

    expect(isDevAccessBypassEnabled()).toBe(false);
  });

  it("returns a safe tenant slug only when bypass is enabled", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "1");
    vi.stubEnv("REB_DEV_TENANT", "gldf");

    expect(getDevAccessTenant()).toBe("gldf");
  });

  it("rejects invalid tenant slugs", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("REB_DEV_UNGATED_ACCESS", "1");
    vi.stubEnv("REB_DEV_TENANT", "../gldf");

    expect(getDevAccessTenant()).toBeNull();
  });
});
