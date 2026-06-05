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
  await expect(page.getByRole("link", { name: /request free site/i }).first()).toHaveAttribute("href", "/access-request");
  await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
});

test("legacy onboard route redirects to the access request", async ({ page }) => {
  const response = await page.goto("/onboard?ref=home-proof-loop", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);

  await expect(page).toHaveURL(/\/access-request\?ref=home-proof-loop/);
  await expect(page.getByRole("heading", { name: /request your free site/i })).toBeVisible();
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
  await page.getByRole("button", { name: /request free site/i }).click();

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

test("signed-out dashboard customers get the sign-in flow instead of a broken page", async ({ page }) => {
  const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Dashboard sign-in is paused\. \| Strelva/);
  await expect(page.getByRole("heading", { name: /dashboard sign-in is paused/i })).toBeVisible();
  await expect(page.getByText("Temporary access handoff")).toBeVisible();
  await expect(page.getByText(/we are not using clerk sign-in right now/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /email jacob/i })).toHaveAttribute(
    "href",
    /mailto:jacob@strelva\.com/,
  );
});

test("signed-out account handoff returns users to sign-in", async ({ page }) => {
  const response = await page.goto("/account", { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Dashboard sign-in is paused\. \| Strelva/);
  await expect(page.getByText(/we are not using clerk sign-in right now/i)).toBeVisible();
});

test("admin tenant host starts at the dashboard sign-in flow", async ({ page }) => {
  const adminOrigin = `${tenantUrl.protocol}//admin.${tenantHost}`;
  const response = await page.goto(adminOrigin, { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Dashboard sign-in is paused\. \| Strelva/);
  await expect(page.getByRole("heading", { name: /dashboard sign-in is paused/i })).toBeVisible();
  await expect(page.getByText("Temporary access handoff")).toBeVisible();
});

test("admin tenant host sign-in keeps the invited email context", async ({ page }) => {
  const adminOrigin = `${tenantUrl.protocol}//admin.${tenantHost}`;
  const response = await page.goto(`${adminOrigin}/sign-in?email=owner%40example.com`, { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in\?email=owner%40example\.com/);
  await expect(page).toHaveTitle(/Dashboard sign-in is paused\. \| Strelva/);
  await expect(page.getByText(/we are not using clerk sign-in right now/i)).toBeVisible();
});

test("admin tenant host sign-up uses the tenant invite context", async ({ page }) => {
  const adminOrigin = `${tenantUrl.protocol}//admin.${tenantHost}`;
  const response = await page.goto(`${adminOrigin}/sign-up?email=owner%40example.com`, { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-up/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Dashboard signup is paused\. \| Strelva/);
  await expect(page.getByRole("heading", { name: /dashboard signup is paused/i })).toBeVisible();
  await expect(page.getByText("Free-site requests stay email-first")).toBeVisible();
  await expect(page.getByRole("link", { name: /request free site/i })).toHaveAttribute(
    "href",
    "/access-request",
  );
});

test("signed-out no-access recovery returns users to sign-in", async ({ page }) => {
  const response = await page.goto("/no-access", { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Dashboard sign-in is paused\. \| Strelva/);
  await expect(page.getByText(/we are not using clerk sign-in right now/i)).toBeVisible();
});

test("sign-in page uses the temporary no-Clerk handoff", async ({ request }) => {
  const response = await request.get("/sign-in");
  expect(response.status()).toBeLessThan(400);

  const html = await response.text();
  expect(html).toContain("Dashboard sign-in is paused.");
  expect(html).toContain("We are not using Clerk sign-in right now.");
  expect(html).not.toContain("Loading secure sign-in");
});
