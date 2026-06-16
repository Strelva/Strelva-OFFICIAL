import { expect, test } from "@playwright/test";

test("health endpoint works", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
});

test("public v1 GLDF content route is unauthenticated", async ({ request }) => {
  const res = await request.get("/api/v1/content/gldf/hero");
  expect([200, 404]).toContain(res.status());
  expect(res.status()).not.toBe(302);
  expect(res.status()).not.toBe(401);
});

test("public v1 GLDF page config route is unauthenticated", async ({ request }) => {
  const res = await request.get("/api/v1/page-config/gldf");
  expect([200, 404]).toContain(res.status());
  expect(res.status()).not.toBe(302);
  expect(res.status()).not.toBe(401);
});

test("cron maintenance endpoint is not public", async ({ request }) => {
  const res = await request.get("/api/cron/maintenance");

  if (process.env.PLAYWRIGHT_BASE_URL) {
    expect(res.status()).toBe(401);
  } else {
    expect([401, 500]).toContain(res.status());
  }

  expect(res.status()).not.toBe(200);
  expect(res.status()).not.toBe(302);
});

// Skipped: encodes the temporary "Dashboard signup is paused" launch state. The
// app now renders Clerk on the signup surface, so this assertion is stale and
// awaits a deliberate rewrite once the auth launch flow is settled (see the
// matching note in customer-frontend.spec.ts).
test.skip("signup page explains invited email recovery", async ({ page }) => {
  await page.goto("/sign-up");

  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Dashboard signup is paused\. \| Strelva/);
  await expect(page.getByRole("heading", { name: /dashboard signup is paused/i })).toBeVisible();
  await expect(page.getByText("Build requests stay email-first")).toBeVisible();
  await expect(page.getByRole("link", { name: /request your build/i })).toHaveAttribute(
    "href",
    "/access-request",
  );
});
