import { expect, test } from "@playwright/test";

// Data-independent operator smoke. Every admin LIST / overview surface must
// render its own header on a clean dev-file backend (no DB, no Redis, no seeded
// tenant), so a broken page or import is caught on EVERY push — this is the spec
// CI runs (see .github/workflows/ci.yml "Operator surface smoke").
//
// Deliberately excluded: the tenant-DETAIL cockpit (/admin/clients/[id]) and the
// whole owner dashboard need a seeded tenant + operational data to render, so
// they stay in the local ungated suite (admin-operator / dashboard-owner specs),
// not here. Keep this file free of anything that needs a tenant to exist.
test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Operator surface smoke needs REB_DEV_UNGATED_ACCESS=1 for super-admin dev access.",
);

const SURFACES: Array<[string, RegExp]> = [
  ["/admin", /Overview/],
  ["/admin/work", /Internal work/],
  ["/admin/clients", /Clients/],
  ["/admin/leads", /Leads/],
  ["/admin/analytics", /Search \+ Analytics/],
  ["/admin/audit", /Site audits/],
  ["/admin/actions", /Portfolio actions|Ready to work/],
  ["/admin/onboard", /Onboard a client/],
  ["/admin/pay-links", /Pay links/],
  ["/admin/ops", /Operational health/],
  ["/admin/digests", /Maintenance digests/],
  ["/admin/drafts", /Pending drafts/],
];

for (const [path, heading] of SURFACES) {
  test(`operator surface renders on a clean backend: ${path}`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} status`).toBeLessThan(500);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  });
}

test("internal navigation remains usable on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/admin/work", { waitUntil: "domcontentloaded" });
  const desktopNav = page.locator("aside").filter({ has: page.getByRole("navigation") }).first();
  await expect(desktopNav.getByRole("link", { name: "Internal work" })).toHaveAttribute("aria-current", "page");
  await expect(desktopNav.getByText("Delivery", { exact: true })).toBeVisible();
  await expect(desktopNav.getByText("Support", { exact: true })).toBeVisible();
  await expect(desktopNav.getByText("System administration", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer.getByRole("link", { name: "Internal work" })).toHaveAttribute("aria-current", "page");
  await expect(drawer.getByText("Delivery", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Support", { exact: true })).toBeVisible();
  await expect(drawer.getByText("System administration", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
