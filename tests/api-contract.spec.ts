import { expect, test } from "@playwright/test";

// Public API contract + input-boundary guards. Every case hits a PUBLIC endpoint
// via `request` (no auth, no dev bypass, so it runs in the normal CI smoke), and
// every write case sends an INVALID payload that is rejected at validation BEFORE
// any store write — so these never pollute a tenant's data. A regression that
// weakens the boundary (accepts junk, exposes a write, drops slug validation)
// fails the build.

test("v1 leads intake rejects an empty body before writing", async ({ request }) => {
  // Missing the required `name` (or an unresolvable tenant) — either way the
  // request is rejected at 400 and no lead is created.
  const res = await request.post("/api/v1/leads/gldf", { data: {} });
  expect(res.status()).toBe(400);
});

test("v1 leads intake rejects a non-JSON body", async ({ request }) => {
  const res = await request.post("/api/v1/leads/gldf", {
    headers: { "content-type": "text/plain" },
    data: "this is not json",
  });
  expect([400, 415], `got ${res.status()}`).toContain(res.status());
});

test("v1 track beacon rejects an invalid event", async ({ request }) => {
  const res = await request.post("/api/v1/track/gldf", { data: { event: "definitely-not-a-real-event" } });
  expect(res.status()).toBe(400);
});

test("v1 track beacon rejects an empty body", async ({ request }) => {
  const res = await request.post("/api/v1/track/gldf", { data: {} });
  expect(res.status()).toBe(400);
});

test("v1 content route is read-only — no public writes", async ({ request }) => {
  // The public contract is read-only; writes go through the authed /api/content.
  const put = await request.put("/api/v1/content/gldf/hero", { data: { headline: "x" } });
  expect(put.status(), "PUT should not be allowed").toBe(405);
  const post = await request.post("/api/v1/content/gldf/hero", { data: {} });
  expect(post.status(), "POST should not be allowed").toBe(405);
});

test("v1 write routes reject GET (POST-only surfaces)", async ({ request }) => {
  for (const path of ["/api/v1/leads/gldf", "/api/v1/track/gldf"]) {
    const res = await request.get(path);
    expect(res.status(), `${path} GET`).toBe(405);
  }
});

test("v1 read routes reject tenant-slug traversal", async ({ request }) => {
  for (const path of [
    "/api/v1/page-config/..%2f..%2fsecret",
    "/api/v1/content/..%2f..%2fetc/hero",
    "/api/v1/site-capabilities/..%2fadmin",
  ]) {
    const res = await request.get(path);
    expect([400, 404], `${path} -> ${res.status()}`).toContain(res.status());
  }
});

test("cron routes are not publicly triggerable", async ({ request }) => {
  // A public GET must never run a cron job. On an external base URL the platform
  // returns 401; against the local dev webServer a missing CRON_SECRET can 500 —
  // both are non-executing, which is the guarantee that matters.
  for (const path of ["/api/cron/portfolio-scan", "/api/cron/weekly-report", "/api/cron/staleness"]) {
    const res = await request.get(path);
    if (process.env.PLAYWRIGHT_BASE_URL) {
      expect(res.status(), path).toBe(401);
    } else {
      expect([401, 500], path).toContain(res.status());
    }
    expect(res.status(), `${path} must not run`).not.toBe(200);
  }
});
