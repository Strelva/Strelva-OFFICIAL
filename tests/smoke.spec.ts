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

test("sign-up page renders the current create-account surface", async ({ request }) => {
  const response = await request.get("/sign-up");
  expect(response.status()).toBeLessThan(400);
  const html = await response.text();
  expect(html).toContain("Dashboards are created from your build");
  expect(html).not.toContain("Dashboard signup is paused");
});
