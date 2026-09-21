import { expect, test } from "@playwright/test";

const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || "3100"}`);
const tenantOrigin = process.env.PLAYWRIGHT_TENANT_ORIGIN || `http://gldf.localhost:${baseUrl.port || "80"}`;
const tenantUrl = new URL(tenantOrigin);
const tenantHost = tenantUrl.host;
const externalBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL);

test("marketing homepage gives a customer clear starting points", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();

  await expect(page.getByRole("heading", { name: /a site that keeps up/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /request your build/i }).first()).toHaveAttribute(
    "href",
    /\/access-request/,
  );
  await expect(page.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
});

test("legacy onboard route redirects to the access request", async ({ page }) => {
  const response = await page.goto("/onboard?ref=home-proof-loop", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page).toHaveURL(/\/access-request\?ref=home-proof-loop/);
  await expect(page.getByRole("heading", { name: /request your build/i }).first()).toBeVisible();
});

test("access request returns a no-login delivery status handoff", async ({ page }) => {
  await page.route("**/api/access-request/intake", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        emailSent: true,
        statusUrl: "/delivery/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    });
  });

  const response = await page.goto("/access-request?ref=test", { waitUntil: "domcontentloaded" });
  expect(response?.ok()).toBeTruthy();

  await page.getByLabel("Business").fill("Demo Studio");
  await page.getByLabel("City").fill("Buffalo, NY");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByLabel("Site request").fill("I need a cleaner site and easier updates.");
  await expect(page.getByLabel("Business")).toHaveValue("Demo Studio");

  // Wait for the intake round-trip to complete before asserting the success
  // state — under full-suite load the click could otherwise fire before the
  // client submit handler hydrated, and the success heading never rendered.
  const submit = page.getByRole("button", { name: /request your build/i });
  await expect(submit).toBeEnabled();
  await Promise.all([
    page.waitForResponse("**/api/access-request/intake"),
    submit.click(),
  ]);

  await expect(page.getByRole("heading", { name: /request received/i })).toBeVisible();
  await expect(page.getByText(/we emailed your delivery-status link/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /track delivery status/i })).toHaveAttribute(
    "href",
    "/delivery/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
});

test("tenant public pages render without server errors", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  const paths = externalBaseUrl ? ["/"] : ["/", "/services", "/contact"];
  for (const path of paths) {
    const response = await page.goto(`${tenantOrigin}${path}`, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${path} should not fail`).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main").first()).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
});

test("core customer pages fit mobile viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const url of ["/", `${tenantOrigin}/`]) {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    expect(response?.status(), `${url} should not fail`).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 1;
    });
    expect(hasHorizontalOverflow, `${url} should not overflow horizontally`).toBe(false);
  }
});

test("tenant preview pages can be embedded by the dashboard", async ({ request }) => {
  const response = externalBaseUrl
    ? await request.get(`${baseUrl.origin}/?preview=true`)
    : await request.get(`${baseUrl.origin}/?preview=true`, {
        headers: { Host: tenantHost },
      });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  if (externalBaseUrl) {
    expect(response.headers()["content-security-policy"]).toContain("https://admin.strelva.com");
  } else {
    expect(response.headers()["content-security-policy"]).toContain("http://admin.gldf.localhost");
  }
  expect(response.headers()["x-frame-options"]).toBeUndefined();
});

test("normal tenant pages keep anti-framing protections", async ({ request }) => {
  const response = externalBaseUrl
    ? await request.get(`${baseUrl.origin}/`)
    : await request.get(`${baseUrl.origin}/`, {
        headers: { Host: tenantHost },
      });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});

// The current Supabase sign-in/sign-up + signed-out auth-gate surfaces. These
// replace the old "no-Clerk / sign-in paused" smoke tests, which asserted a
// launch-state page that has since been removed. The signed-out REDIRECT tests
// only hold with the dev bypass OFF — the mode CI's public smoke runs in — so
// they skip under the local ungated harness (REB_DEV_UNGATED_ACCESS=1), where the
// bypass grants the dashboard and no redirect fires. (The old admin-host + invited-
// email variants were dropped: they need a seeded invite + tenant-host resolution
// to assert anything meaningful, which the public smoke harness doesn't provide.)

test("signed-out dashboard visitors are sent to sign-in, never shown the dashboard", async ({ page }) => {
  test.skip(process.env.REB_DEV_UNGATED_ACCESS === "1", "the auth-gate redirect only fires with the dev bypass OFF");
  const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: /sign in to/i })).toBeVisible();
});

test("signed-out account access is sent to sign-in", async ({ page }) => {
  test.skip(process.env.REB_DEV_UNGATED_ACCESS === "1", "the auth-gate redirect only fires with the dev bypass OFF");
  const response = await page.goto("/account", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: /sign in to/i })).toBeVisible();
});

test("the sign-in page renders the current Supabase sign-in surface", async ({ request }) => {
  const response = await request.get("/sign-in");
  expect(response.status()).toBeLessThan(400);
  const html = await response.text();
  expect(html).toContain("Sign in to your work.");
  expect(html).not.toContain("Dashboard sign-in is paused");
});

test("signed-out no-access recovery is sent to sign-in", async ({ page }) => {
  // The no-access page renders its recovery UI only for a SIGNED-IN user without a
  // membership; a signed-out visitor is redirected to sign-in (page-level redirect).
  // The dev bypass counts as signed-in, so this only holds with the bypass OFF.
  test.skip(process.env.REB_DEV_UNGATED_ACCESS === "1", "no-access renders the recovery page under the dev bypass; the redirect only fires signed-out");
  const response = await page.goto("/no-access", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: /sign in to/i })).toBeVisible();
});
