import { expect, test } from "@playwright/test";

// Cross-tenant access denial smoke.
//
// Verifies that the tenant-isolation enforcement at the route level prevents a
// signed-in user scoped to one tenant (gldf, via REB_DEV_UNGATED_ACCESS) from
// reading or writing another tenant's authenticated data.
//
// Anchors on the authenticated content API (/api/content/[section]) which calls
// requireTenantAccess; all these requests target a non-existent tenant slug
// ("other-tenant") so no real data is touched and the test is data-independent.
//
// These run in the "Surface smoke" CI step alongside operator-surfaces and
// owner-surfaces (bypass ON, REB_DEV_TENANT=gldf).
test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Cross-tenant access smoke requires REB_DEV_UNGATED_ACCESS=1 (bypass mode).",
);

test("authenticated content read for a different tenant is denied (403)", async ({
  request,
}) => {
  // The dev bypass scopes the session to gldf. A GET to another tenant's
  // authenticated content endpoint must be rejected before any data is read.
  const res = await request.get("/client/other-tenant/api/content/hero");
  expect(
    [403, 401],
    `expected 403/401 for cross-tenant read, got ${res.status()}`,
  ).toContain(res.status());
});

test("authenticated content write for a different tenant is denied (403)", async ({
  request,
}) => {
  // Same isolation check on the write path. The route calls requireTenantAccess
  // before any Zod validation or store write, so a 403 must arrive before any
  // mutation occurs.
  const res = await request.put("/client/other-tenant/api/content/hero", {
    data: { headline: "cross-tenant injection attempt" },
  });
  expect(
    [403, 401],
    `expected 403/401 for cross-tenant write, got ${res.status()}`,
  ).toContain(res.status());
});

test("tenant dashboard page for a different tenant is gated (redirect or 403)", async ({
  page,
}) => {
  // Navigating to another tenant's dashboard must not render the owner surface.
  // The proxy gates tenantFromClientPath paths; the response should be a redirect
  // to sign-in or a 403, never a 200 rendering the other tenant's data.
  const res = await page.goto("/client/other-tenant/dashboard", {
    waitUntil: "domcontentloaded",
  });
  // A redirect to /sign-in or /no-access is status 200 after following (Playwright
  // follows redirects); accept any non-500 that does not render owner content.
  expect(res?.status(), "cross-tenant dashboard status").toBeLessThan(500);
  // The page must NOT silently render the other tenant's owner dashboard chrome.
  await expect(
    page.getByRole("navigation", { name: "Dashboard" }),
    "other-tenant dashboard nav must not render",
  ).not.toBeVisible();
});
