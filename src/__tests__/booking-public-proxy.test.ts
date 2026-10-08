import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/platform/infra/db/server-client", () => ({ isSupabaseAuthConfigured: () => false }));
import proxy from "@/proxy";

const request = (path: string, method = "GET") => new NextRequest(`https://studio.strelva.com${path}`, {
  method, headers: { host: "studio.strelva.com", "x-tenant": "attacker" },
});
beforeEach(() => {
  vi.stubEnv("REB_DEV_UNGATED_ACCESS", "0");
  vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "0");
});
afterEach(() => vi.unstubAllEnvs());

describe("anonymous tenant booking entry", () => {
  it.each([["/api/booking", "POST"], ["/api/booking/availability?date=2026-10-18&serviceId=consultation", "GET"]])(
    "lets %s reach its public booking handler without sign-in", async (path, method) => {
      const response = await proxy(request(path!, method!));
      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-request-x-tenant")).toBe("studio");
    },
  );
  it.each(["/api/bookings", "/api/booking/admin", "/api/workspace/bookings", "/api/booking-extra"])(
    "keeps %s outside the anonymous booking exception", async path => {
      const response = await proxy(request(path));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/sign-in");
    },
  );
});
