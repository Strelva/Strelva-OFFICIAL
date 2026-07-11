import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockCookieStore = vi.hoisted(() => new Map<string, string>());

vi.mock("@/lib/auth", () => ({ isSuperAdmin: mockIsSuperAdmin }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: (name: string) =>
        mockCookieStore.has(name) ? { value: mockCookieStore.get(name) } : undefined,
    }),
  ),
}));

import { isInspecting } from "@/lib/inspect-mode";

describe("isInspecting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieStore.clear();
    mockIsSuperAdmin.mockResolvedValue(true);
  });

  it("returns true when the cookie is set AND the caller is a super-admin", async () => {
    mockCookieStore.set("strelva_inspect", "1");
    mockIsSuperAdmin.mockResolvedValue(true);
    expect(await isInspecting()).toBe(true);
  });

  it("returns false when the cookie is set but the caller is NOT a super-admin", async () => {
    mockCookieStore.set("strelva_inspect", "1");
    mockIsSuperAdmin.mockResolvedValue(false);
    expect(await isInspecting()).toBe(false);
    // isSuperAdmin is the real gate — the cookie alone grants nothing.
    expect(mockIsSuperAdmin).toHaveBeenCalled();
  });

  it("returns false when there is no cookie (even for a super-admin)", async () => {
    mockIsSuperAdmin.mockResolvedValue(true);
    expect(await isInspecting()).toBe(false);
    // Short-circuits before checking super-admin when the intent cookie is absent.
    expect(mockIsSuperAdmin).not.toHaveBeenCalled();
  });

  it("returns false when the cookie has a non-\"1\" value", async () => {
    mockCookieStore.set("strelva_inspect", "0");
    expect(await isInspecting()).toBe(false);
  });

  it("fails closed (false) if isSuperAdmin throws", async () => {
    mockCookieStore.set("strelva_inspect", "1");
    mockIsSuperAdmin.mockRejectedValue(new Error("auth backend down"));
    expect(await isInspecting()).toBe(false);
  });
});
