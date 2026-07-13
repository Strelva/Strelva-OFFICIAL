import { afterEach, describe, expect, it, vi } from "vitest";
import { requireCronRequest, validateCronRequest } from "@/lib/cron-auth";

describe("cron authorization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = requireCronRequest(new Request("https://app.strelva.com/api/cron/test"));

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toEqual({ error: "CRON_SECRET not configured" });
  });

  it("rejects malformed and incorrect bearer credentials", () => {
    expect(validateCronRequest("secret", "secret").allowed).toBe(false);
    expect(validateCronRequest("secret", "Bearer wrong").allowed).toBe(false);
  });

  it("allows the configured bearer credential at the handler boundary", () => {
    vi.stubEnv("CRON_SECRET", "secret");
    const request = new Request("https://app.strelva.com/api/cron/test", {
      headers: { authorization: "Bearer secret" },
    });

    expect(requireCronRequest(request)).toBeNull();
  });
});
