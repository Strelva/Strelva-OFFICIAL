import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
type Options = NonNullable<Parameters<typeof import("@sentry/nextjs").init>[0]>;

const sdk = vi.hoisted(() => ({ init: vi.fn(), requestDataIntegration: vi.fn(() => ({ name: "RequestData" })), captureRouterTransitionStart: vi.fn() }));
vi.mock("@sentry/nextjs", () => sdk);
vi.mock("../../src/lib/sentry-secret-env", () => ({ SENTRY_SECRET_VALUES: ["fixture-runtime-secret"] }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function options(): Options {
  return sdk.init.mock.calls[0]?.[0] as Options;
}

describe("Sentry runtime configuration", () => {
  it.each(["server", "edge"] as const)("%s retains scrubbed private errors and transactions", async (runtime) => {
    vi.stubEnv("SENTRY_DSN", "https://public@sentry.invalid/1");
    if (runtime === "server") await import("../../sentry.server.config");
    else await import("../../sentry.edge.config");
    const config = options();
    expect(config.enabled).toBe(true);
    expect(config.sendDefaultPii).toBe(false);
    const event = { type: undefined, request: { url: "https://app.strelva.test/business/private-business?token=fixture-runtime-secret" }, message: "Alice's proposal" };
    const error = await config.beforeSend?.(event, {});
    expect(error).toEqual({ request: { url: "/business/[private]" } });
    const transaction = { type: "transaction" as const, transaction: "GET /workspace/private-workspace", message: "Alice" };
    expect(await config.beforeSendTransaction?.(transaction, {})).toEqual({ type: "transaction", transaction: "/workspace/[private]" });
    expect(config.beforeBreadcrumb?.({ category: "fetch", data: { url: "/api/workspace/private-business" } }, {})).toEqual({ category: "fetch" });
    expect(await config.beforeSend?.({ type: undefined, message: "fixture-runtime-secret" }, {})).toEqual({ message: "[Redacted]" });
  });

  it("loads the browser entry with public DSN only and strips private browser text", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@sentry.invalid/2");
    vi.stubEnv("SENTRY_DSN", "https://server@sentry.invalid/1");
    vi.stubGlobal("window", { location: { pathname: "/business/private-business" } });
    const entry = await import("../../instrumentation-client");
    expect(options().dsn).toBe("https://public@sentry.invalid/2");
    expect(options().enabled).toBe(true);
    expect(options().sendDefaultPii).toBe(false);
    expect(await options().beforeSend?.({ type: undefined, message: "Alice's private message" }, {})).toEqual({});
    expect(options().beforeBreadcrumb?.({ category: "console", message: "Alice" }, {})).toEqual({ category: "console" });
    expect(entry.onRouterTransitionStart).toBe(sdk.captureRouterTransitionStart);
  });

  it("keeps browser monitoring disabled when its public DSN is unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    vi.stubEnv("SENTRY_DSN", "https://server@sentry.invalid/1");
    await import("../../instrumentation-client");
    expect(options().enabled).toBe(false);
    expect(options().dsn).toBe("");
  });
});
