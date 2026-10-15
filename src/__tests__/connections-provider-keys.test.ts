import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KEYED_INTEGRATIONS, PROVIDER_KEY_REQUIREMENTS, providerKeyStatus, readProviderKeys, resetProviderKeyWarningsForTests,
} from "@/platform/connections/provider-keys";

const SECRET = "fictional-value-9f3a";

function fullEnv(integration: (typeof KEYED_INTEGRATIONS)[number]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const requirement of PROVIDER_KEY_REQUIREMENTS[integration]) env[requirement.anyOf[0]!] = SECRET;
  return env;
}

afterEach(() => resetProviderKeyWarningsForTests());

describe("provider key readiness", () => {
  it.each(KEYED_INTEGRATIONS.filter(item => item !== "connected_site"))("%s is ready with its keys and not without", integration => {
    expect(readProviderKeys(integration, fullEnv(integration))).toEqual({ ready: true });
    const missing = readProviderKeys(integration, {});
    expect(missing.ready).toBe(false);
    expect(JSON.stringify(missing)).not.toContain(SECRET);
  });

  it("names env vars only", () => {
    const status = readProviderKeys("highlevel", { HIGHLEVEL_CLIENT_ID: SECRET });
    expect(status).toEqual({
      ready: false,
      missing: ["HIGHLEVEL_CLIENT_SECRET", "SECRETS_ENC_KEY", "OAUTH_STATE_SECRET or INTERNAL_API_SECRET", "APP_URL or NEXT_PUBLIC_APP_URL"],
    });
    expect(JSON.stringify(status)).not.toContain(SECRET);
  });

  it("accepts either name of an anyOf requirement; whitespace counts as missing", () => {
    const base = { MICROSOFT_CLIENT_ID: "a", MICROSOFT_CLIENT_SECRET: "b", APP_URL: "https://x.test" };
    expect(readProviderKeys("outlook_calendar", { ...base, OAUTH_STATE_SECRET: "s" }).ready).toBe(true);
    expect(readProviderKeys("outlook_calendar", { ...base, INTERNAL_API_SECRET: "s" }).ready).toBe(true);
    expect(readProviderKeys("outlook_calendar", { ...base, OAUTH_STATE_SECRET: "   " }).ready).toBe(false);
  });

  it("treats connected_site as always ready", () => {
    expect(readProviderKeys("connected_site", {})).toEqual({ ready: true });
  });

  it("logs a missing set once, and again when the set changes", () => {
    const log = vi.fn();
    for (let i = 0; i < 3; i++) providerKeyStatus("stripe", {}, log);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe("[connections] stripe not set up yet: missing STRIPE_SECRET_KEY");
    providerKeyStatus("calendly", { CALENDLY_CLIENT_ID: "x" }, log);
    providerKeyStatus("calendly", {}, log);
    expect(log).toHaveBeenCalledTimes(3);
  });
});
