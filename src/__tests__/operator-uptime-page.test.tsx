import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/domain-monitor-store", () => ({ getDomainHealth: read }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: async () => undefined }));
import Page from "@/app/admin/uptime/page";
beforeEach(() => { vi.resetAllMocks(); });
it.each([null, "rejected"])("keeps missing or unreadable stored checks unavailable: %s", async value => {
  if (value === "rejected") read.mockRejectedValue(new Error("private details")); else read.mockResolvedValue(null);
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("Checks unavailable");
  expect(html).not.toContain("No active client sites");
  expect(html).not.toContain("0 failing");
  expect(html).not.toContain("private details");
});
it("preserves a successful empty snapshot and its time", async () => {
  read.mockResolvedValue({ results: [], scannedAt: new Date().toISOString() });
  const html = renderToStaticMarkup(await Page());
  expect(html).toContain("No active client sites in the last check");
  expect(html).not.toContain("Checks unavailable");
});
