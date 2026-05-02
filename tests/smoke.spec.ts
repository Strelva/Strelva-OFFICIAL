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
