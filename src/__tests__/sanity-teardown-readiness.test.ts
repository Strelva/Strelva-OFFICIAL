import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateClient = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

vi.mock("@sanity/client", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/logger", () => ({ logger: { warn: mockLoggerWarn } }));
vi.mock("@sanity/image-url", () => ({ default: vi.fn() }));

describe("Sanity teardown readiness", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SANITY_PROJECT_ID", "project");
    vi.stubEnv("NEXT_PUBLIC_SANITY_DATASET", "production");
    vi.stubEnv("SANITY_API_TOKEN", "read-token");
    mockCreateClient.mockImplementation(() => ({ fetch: vi.fn().mockResolvedValue([]) }));
  });

  it("uses authenticated uncached reads and records every legacy fetch", async () => {
    const { getSanityReadClient } = await import("@/lib/sanity");
    const client = getSanityReadClient();
    await client.fetch('*[_type == "tenant"]');

    expect(mockCreateClient).toHaveBeenCalledWith(
      expect.objectContaining({ token: "read-token", useCdn: false })
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "[legacy-read] Sanity fetch",
      expect.objectContaining({
        event: "legacy_data_source_read",
        source: "sanity",
        clientKind: "read",
        documentType: "tenant",
      })
    );
  });
});
