import * as crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantConfig } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  tenantConfig: {
    id: "gldf",
    revalidateUrl: "https://gldf.example.com/api/revalidate",
    revalidationSecret: "test-secret",
  } as TenantConfig,
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: vi.fn(() => Promise.resolve(mocks.tenantConfig)),
}));

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(() => null),
}));

describe("revalidateClientSite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenantConfig = {
      id: "gldf",
      revalidateUrl: "https://gldf.example.com/api/revalidate",
      revalidationSecret: "test-secret",
    } as TenantConfig;
  });

  it("signs path revalidation requests with GLDF-compatible HMAC headers", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    const { revalidateClientSite } = await import("@/lib/revalidate-client");
    const result = await revalidateClientSite("gldf", ["/", "/shop"]);

    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const body = init.body as string;
    const expectedSignature = crypto
      .createHmac("sha256", "test-secret")
      .update(`${headers["x-reb-timestamp"]}.${body}`)
      .digest("hex");

    expect(url).toBe("https://gldf.example.com/api/revalidate");
    expect(headers["x-reb-signature"]).toBe(expectedSignature);
    expect(JSON.parse(body)).toEqual({ tenant: "gldf", paths: ["/", "/shop"] });
  });

  it("uses all: true for full-site revalidation", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    const { revalidateClientSite } = await import("@/lib/revalidate-client");
    await revalidateClientSite("gldf", "all");

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ tenant: "gldf", all: true });
  });

  it("fails without sending when a revalidate URL has no tenant secret", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.tenantConfig = {
      id: "gldf",
      revalidateUrl: "https://gldf.example.com/api/revalidate",
    } as TenantConfig;

    const { revalidateClientSite } = await import("@/lib/revalidate-client");
    const result = await revalidateClientSite("gldf", ["/"]);

    expect(result).toEqual({
      success: false,
      error: "Missing tenant revalidationSecret",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
