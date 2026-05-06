import { expect, test } from "@playwright/test";

const tenantHost = "gldf.localhost:3000";

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

  for (const path of ["/", "/services", "/contact"]) {
    const response = await page.goto(`http://${tenantHost}${path}`);
    expect(response?.status(), `${path} should not fail`).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main").first()).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
});

test("core customer pages fit mobile viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const url of ["/", `http://${tenantHost}/`]) {
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
  const response = await request.get("http://127.0.0.1:3000/?preview=true", {
    headers: { Host: tenantHost },
  });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  expect(response.headers()["content-security-policy"]).toContain("http://admin.gldf.localhost");
  expect(response.headers()["x-frame-options"]).toBeUndefined();
});

test("normal tenant pages keep anti-framing protections", async ({ request }) => {
  const response = await request.get("http://127.0.0.1:3000/", {
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
