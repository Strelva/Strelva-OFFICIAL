import { expect, it } from "vitest";
import { reportBrowserFixture, reportBrowserOrigin } from "../../tests/support/website-report-browser-fixture";
import { workId } from "../../tests/support/website-routing-browser-fixture";
import { parseWebsiteReportView } from "@/products/websites/report-view";

it.each(["http://localhost:3190", "http://127.0.0.1:3190/", "http://[::1]:3190/"])("admits only the explicit loopback origin %s", base => {
  expect(reportBrowserOrigin(base)).toBe(new URL(base).origin);
});
it.each([undefined, "https://localhost:3190", "http://example.test", "http://user:password@localhost:3190", "http://localhost:3190/preview", "http://localhost:3190/?mode=report", "http://localhost:3190/#report", "file:///tmp/report"])("refuses a non-origin or foreign report browser target %s", base => {
  expect(() => reportBrowserOrigin(base)).toThrow();
});
it("keeps the positive browser fixture valid for the exact work and selected period", () => {
  const value = parseWebsiteReportView(reportBrowserFixture("2026-09"), workId, "2026-09");
  expect(value.inquiries.count).toBe(17);
  expect(value.visibility.note).toContain("no provider measurements");
});
