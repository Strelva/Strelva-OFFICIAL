import { expect, test } from "@playwright/test";

test("health endpoint is available", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
});

test("marketing surface renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toBeVisible();
});

test("versioned public content API rejects invalid tenant slugs", async ({ request }) => {
  const response = await request.get("/api/v1/content/../hero");
  expect([400, 404]).toContain(response.status());
});
