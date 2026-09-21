import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The copied route resolves this import to `src/lib` in a client repository.
// `vitest.config.ts` supplies that template-only alias for this test. Keep the
// import runtime-only so the copied template remains excluded from the
// control-plane TypeScript program.
const routeModulePath = "../form-route.template";
const { POST } = await import(/* @vite-ignore */ routeModulePath);

describe("standalone form route", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SCAFFOLD_FORM_FROM", "");
    vi.stubEnv("SCAFFOLD_FORM_TO", "");
    vi.stubEnv("SCAFFOLD_SITE_NAME", "Avery's Studio");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns setup error without acknowledging or logging visitor data when delivery is unconfigured", async () => {
    const resend = vi.fn();
    vi.stubGlobal("fetch", resend);
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      new Request("http://client.example/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.47" },
        body: JSON.stringify({
          formName: "Contact",
          name: "Avery Buyer",
          email: "avery@example.test",
          message: "Please call me about the listing.",
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "This form is not configured for delivery. Please contact the business directly.",
    });
    expect(resend).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalledWith("[form] standalone delivery is not configured");
    expect(JSON.stringify(errors.mock.calls)).not.toContain("Avery Buyer");
    expect(JSON.stringify(errors.mock.calls)).not.toContain("avery@example.test");
    expect(JSON.stringify(errors.mock.calls)).not.toContain("Please call me about the listing.");
  });
});
