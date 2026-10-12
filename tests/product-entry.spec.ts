import { expect, test } from "@playwright/test";
const result = { business: "Fictional Bakery", url: "https://bakery.example", score: 70, grade: "C", verdict: "Fictional test result. No provider was queried.", signals: [{ id: "identity", label: "Business identity", pass: true, detail: "Fictional evidence.", weight: 20 }], citation: { probed: false, mentioned: false, recommended: false, note: "No live probe in this test." }, topFix: "Explain the business clearly.", measurementStatus: "partial", readinessMeasured: true };
const workspaceReleaseEnabled = process.env.STRELVA_WORKSPACE_RELEASE === "1";

test("public assessment stays in the product, preserves input on failure, and offers private continuation", async ({ page }) => {
  let failed = false;
  await page.route("**/api/ai-visibility", route => {
    if (!failed) { failed = true; return route.fulfill({ status: 503, json: { error: "Assessment unavailable. Try again." } }); }
    return route.fulfill({ json: { ...result, scanId: "scan_fixture", shareUrl: null } });
  });
  await page.goto("/ai-visibility");
  await expect(page.getByRole("navigation", { name: "Public navigation", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request your build" })).toHaveCount(0);
  await page.getByLabel("Business name", { exact: true }).fill("Fictional Bakery");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Assessment unavailable. Try again.");
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("Fictional Bakery");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fictional Bakery" })).toBeVisible();
  await expect(page).toHaveURL(url => url.pathname === "/ai-visibility/scan_fixture");
  await page.waitForTimeout(5_000);
  expect(new URL(page.url()).pathname).toBe("/ai-visibility/scan_fixture");
  if (workspaceReleaseEnabled) {
    await expect(page.getByRole("link", { name: /Save a copy/ })).toHaveAttribute("href", "/workspace?save=scan_fixture");
  } else {
    await expect(page.getByRole("link", { name: /Save a copy/ })).toHaveCount(0);
  }
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Check another business", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/ai-visibility");
});

test("website audit supports legacy URL input and keeps result actions in the product", async ({ page }) => {
  await page.route("**/api/audit/scan", route => route.fulfill({ json: { reportId: `audit_${"a".repeat(32)}`, url: "https://bakery.example", scannedAt: "2026-09-08T12:00:00Z", overallScore: 80, grade: "B", categories: [{ name: "SEO", slug: "seo", weight: 20, score: 80, checks: [{ name: "Page title", status: "pass", score: 100, message: "Fictional title evidence." }] }] } }));
  await page.goto("/audit?url=bakery.example&tool=seo-audit");
  await expect(page.getByLabel("Website address")).toHaveValue("bakery.example");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your website check", exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("80/100").first()).toBeVisible();
  await expect(page).toHaveURL(url => url.searchParams.get("report") === `audit_${"a".repeat(32)}`);
  await page.waitForTimeout(5_000);
  expect(new URL(page.url()).searchParams.get("report")).toBe(`audit_${"a".repeat(32)}`);
  if (workspaceReleaseEnabled) {
    await expect(page.getByRole("link", { name: "Save to my work" })).toHaveAttribute("href", `/workspace?save=audit_${"a".repeat(32)}`);
  } else {
    await expect(page.getByRole("link", { name: "Save to my work" })).toHaveCount(0);
  }
  await expect(page.getByRole("link", { name: "Check what Gemini says about your business", exact: true })).toHaveAttribute("href", "/ai-visibility");
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeVisible();
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Check another site", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.has("report")).toBe(false);
  await page.waitForTimeout(5_000);
  expect(new URL(page.url()).searchParams.has("report")).toBe(false);
});


test("mobile public navigation stays inline and the form remains reachable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/ai-visibility");
  // The public header is two inline links, not a drawer; it never covers the work.
  const nav = page.getByRole("navigation", { name: "Public navigation", exact: true });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  const header = await page.getByRole("banner").boundingBox();
  const main = await page.getByRole("main").boundingBox();
  expect(header && main && main.y >= header.y + header.height - 1).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const submit = page.getByRole("button", { name: "Check", exact: true });
  await submit.scrollIntoViewIfNeeded();
  const button = await submit.boundingBox();
  expect(button && button.y >= 0 && button.y + button.height <= 800).toBeTruthy();
  await page.getByLabel("Business name", { exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(submit).toBeFocused();
});


test("expired public reports preserve a route back to useful work", async ({ page }) => {
  await page.goto(`/audit?report=audit_${"b".repeat(32)}`);
  await expect(page.locator("main").getByRole("alert")).toContainText("expired or is unavailable");
  await expect(page.getByRole("button", { name: "Check", exact: true })).toBeVisible();
});
