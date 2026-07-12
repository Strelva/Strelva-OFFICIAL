import { expect, test } from "@playwright/test";

// Owner-side counterpart to operator-surfaces.spec.ts. Unlike the admin list
// surfaces, the owner dashboard + the client cockpit need a tenant to resolve,
// so CI seeds a synthetic gldf fixture (tests/fixtures/tenants.fixture.json ->
// ./dev-tenants.json) before running this — see the "Surface smoke" CI step.
//
// Assertions here are data-INDEPENDENT: they anchor on chrome that renders with
// the feature on but the operational stores empty (no orders/reviews/analytics),
// so the spec passes both in CI (empty dev-file) and locally (real prod data).
// Data-specific numbers/verdicts stay in the dashboard-owner spec (local only).
test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Owner surface smoke needs REB_DEV_UNGATED_ACCESS=1 for the dev super-admin view.",
);

test("client cockpit renders for a resolvable tenant", async ({ page }) => {
  const res = await page.goto("/admin/clients/gldf", { waitUntil: "domcontentloaded" });
  expect(res?.status(), "cockpit status").toBeLessThan(500);
  await expect(page.getByRole("heading", { name: "Great Lakes Dried Fruit" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "SEO + site health" }).first()).toBeVisible();
});

test("owner Today surface renders without crashing", async ({ page }) => {
  // Today is the most backend-dependent surface (its verdict + activity feed read
  // metrics/events), so assert only that it renders with a heading — not any
  // specific copy, which varies with whether Redis/metrics are present (they are
  // not in CI). The static presence surfaces below carry the content assertions.
  const res = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(res?.status(), "/dashboard status").toBeLessThan(500);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

// These surfaces anchor on static component copy that renders from the tenant
// config + content defaults (not the operational stores), so they hold in CI
// where Redis/metrics are absent.
const OWNER_SURFACES: Array<[string, RegExp]> = [
  ["/dashboard/settings", /How much Strelva handles on its own/],
  ["/dashboard/store", /Products/],
  ["/dashboard/history", /History & safety/],
  ["/dashboard/analytics", /How people find you on Google/],
  ["/dashboard/google", /Connect your Google listing/],
];

for (const [path, needle] of OWNER_SURFACES) {
  test(`owner surface renders for a resolvable tenant: ${path}`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} status`).toBeLessThan(500);
    await expect(page.getByText(needle).first()).toBeVisible();
  });
}
