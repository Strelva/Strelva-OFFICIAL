import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/revalidate-client", () => ({ revalidateClientSite: revalidate }));

import { refreshLiveSite } from "@/lib/live-site-refresh";

beforeEach(() => {
  revalidate.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("refreshLiveSite", () => {
  it("maps a skipped delivery to not_configured", async () => {
    revalidate.mockResolvedValue({ success: true, skipped: true });
    await expect(refreshLiveSite("t", "all")).resolves.toEqual({ status: "not_configured" });
  });
  it("maps success to revalidated and passes tags through", async () => {
    revalidate.mockResolvedValue({ success: true });
    await expect(refreshLiveSite("t", ["/"], { tags: ["a"] })).resolves.toEqual({ status: "revalidated" });
    expect(revalidate).toHaveBeenCalledWith("t", ["/"], { tags: ["a"] });
  });
  it("maps failure to failed with the error or a default", async () => {
    revalidate.mockResolvedValueOnce({ success: false, error: "HTTP 500" });
    await expect(refreshLiveSite("t", "all")).resolves.toEqual({ status: "failed", error: "HTTP 500" });
    revalidate.mockResolvedValueOnce({ success: false });
    await expect(refreshLiveSite("t", "all")).resolves.toEqual({ status: "failed", error: "Unknown revalidation failure" });
  });
  it("maps a throw to failed", async () => {
    revalidate.mockRejectedValue(new Error("network"));
    await expect(refreshLiveSite("t", "all")).resolves.toEqual({ status: "failed", error: "network" });
  });
});
