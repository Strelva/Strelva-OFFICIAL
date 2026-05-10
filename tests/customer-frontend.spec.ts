import { expect, test } from "@playwright/test";

const baseUrl = new URL(process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT || "3100"}`);
const tenantOrigin = process.env.PLAYWRIGHT_TENANT_ORIGIN || `http://gldf.localhost:${baseUrl.port || "80"}`;
const tenantUrl = new URL(tenantOrigin);
const tenantHost = tenantUrl.host;
const externalBaseUrl = Boolean(process.env.PLAYWRIGHT_BASE_URL);

test("marketing homepage gives a customer clear starting points", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();

  await expect(page.getByRole("heading", { name: /your business runs itself/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /get started/i }).first()).toHaveAttribute("href", "/onboard");
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toHaveAttribute("href", "/sign-in");
});

test("tenant public pages render without server errors", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  const paths = externalBaseUrl ? ["/"] : ["/", "/services", "/contact"];
  for (const path of paths) {
    const response = await page.goto(`${tenantOrigin}${path}`);
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
    expect(response.headers()["content-security-policy"]).toContain("https://admin.scaffoldweb.com");
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
  const response = await page.goto("/dashboard");
  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Sign in to Scaffold Web \| Scaffold Web/);
  await expect(page.getByRole("heading", { name: /sign in to scaffold web/i })).toBeVisible();
  await expect(page.getByText("Use the exact email address that received your invite")).toBeVisible();
  await expect(page.getByText(/sign-in form is not loading/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "jacob@scaffoldweb.com" })).toHaveAttribute(
    "href",
    "mailto:jacob@scaffoldweb.com",
  );
});

test("signed-out account handoff returns users to sign-in", async ({ page }) => {
  const response = await page.goto("/account");

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Sign in to Scaffold Web \| Scaffold Web/);
  await expect(page.getByText("Use the exact email address that received your invite")).toBeVisible();
});

test("admin tenant host starts at the dashboard sign-in flow", async ({ page }) => {
  const adminOrigin = `${tenantUrl.protocol}//admin.${tenantHost}`;
  const response = await page.goto(adminOrigin);

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Sign in to Great Lakes Dried Fruit \| Scaffold Web/);
  await expect(page.getByRole("heading", { name: /sign in to great lakes dried fruit/i })).toBeVisible();
  await expect(page.getByText("Use the exact email address that received your invite")).toBeVisible();
});

test("admin tenant host sign-in keeps the invited email context", async ({ page }) => {
  const adminOrigin = `${tenantUrl.protocol}//admin.${tenantHost}`;
  const response = await page.goto(`${adminOrigin}/sign-in?email=owner%40example.com`);

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in\?email=owner%40example\.com/);
  await expect(page).toHaveTitle(/Sign in to Great Lakes Dried Fruit \| Scaffold Web/);
  await expect(page.getByText("Invited email:")).toBeVisible();
  await expect(page.getByText("owner@example.com")).toBeVisible();
  await expect(page.getByText("Use the exact email address that received your invite")).toBeVisible();
});

test("admin tenant host sign-up uses the tenant invite context", async ({ page }) => {
  const adminOrigin = `${tenantUrl.protocol}//admin.${tenantHost}`;
  const response = await page.goto(`${adminOrigin}/sign-up?email=owner%40example.com`);

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-up/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Create your Great Lakes Dried Fruit dashboard account \| Scaffold Web/);
  await expect(
    page.getByRole("heading", { name: /create your great lakes dried fruit dashboard account/i }),
  ).toBeVisible();
  await expect(page.getByText("Use the exact email address that received your invite")).toBeVisible();
  await expect(page.getByText("Invited email:")).toBeVisible();
  await expect(page.getByText("owner@example.com")).toBeVisible();
  await expect(page.getByText(/signup form is not loading/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "jacob@scaffoldweb.com" })).toHaveAttribute(
    "href",
    "mailto:jacob@scaffoldweb.com",
  );
});

test("signed-out no-access recovery returns users to sign-in", async ({ page }) => {
  const response = await page.goto("/no-access");

  expect(response?.status()).toBeLessThan(500);
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page).not.toHaveURL(/\/app/);
  await expect(page).toHaveTitle(/Sign in to Scaffold Web \| Scaffold Web/);
  await expect(page.getByText("Use the exact email address that received your invite")).toBeVisible();
});

test("sign-in page allows Clerk JS to load", async ({ request }) => {
  const response = await request.get("/sign-in");
  expect(response.status()).toBeLessThan(400);

  const csp = response.headers()["content-security-policy"] || "";
  expect(csp).toContain("script-src");
  expect(csp).toContain("https://*.clerk.accounts.dev");
  expect(csp).toContain("https://*.clerk.com");
  expect(csp).toContain("https://clerk.scaffoldweb.com");
});
