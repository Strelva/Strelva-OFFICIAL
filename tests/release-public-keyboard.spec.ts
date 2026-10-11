import { expect, test } from "@playwright/test";

for (const website of [false, true]) test(`${website ? "website" : "visibility"} audit gives keyboard focus to the pending and completed result`, async ({ page }, info) => {
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route(website ? "**/api/audit/scan" : "**/api/ai-visibility", async route => {
    await pending;
    const result = website
      ? { reportId: `audit_${"a".repeat(32)}`, url: "https://bakery.example", scannedAt: "2026-09-08T12:00:00Z", overallScore: 80, grade: "B", categories: [{ name: "SEO", slug: "seo", weight: 20, score: 80, checks: [{ name: "Page title", status: "pass", score: 100, message: "Fictional title evidence." }] }] }
      : { business: "Fictional Bakery", url: "https://bakery.example", score: 70, grade: "C", verdict: "Fictional local result.", signals: [{ id: "identity", label: "Business identity", pass: true, detail: "Fictional evidence.", weight: 20 }], citation: { probed: false, mentioned: false, recommended: false, note: "No live probe." }, topFix: "Explain the business clearly.", measurementStatus: "partial", readinessMeasured: true, scanId: "scan_fixture", shareUrl: null };
    await route.fulfill({ json: result });
  });
  await page.goto(website ? "/audit" : "/ai-visibility");
  if (website) await page.getByLabel("Website address", { exact: true }).fill("bakery.example");
  else await page.getByLabel("Business name", { exact: true }).fill("Fictional Bakery");
  const submit = page.getByRole("button", { name: website ? "Scan My Site" : "Run my AI audit", exact: true });
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main").getByRole("status")).toBeVisible();
  await expect(page.getByRole("heading", { name: website ? "Analyzing your site..." : "Checking AI visibility for Fictional Bakery...", exact: true })).toBeFocused();
  const pendingFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.getAttribute("aria-label"), inMain: Boolean(document.querySelector("main")?.contains(document.activeElement)) }));
  expect.soft(pendingFocus.inMain, "The removed submit must hand focus into the pending result").toBe(true);
  release();
  if (website) await expect(page.getByText("Your site scored 80/100.", { exact: true })).toBeVisible();
  else await expect(page.getByRole("heading", { name: "Fictional Bakery", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: website ? "Site Health Report" : "Fictional Bakery", exact: true })).toBeFocused();
  const completedFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.getAttribute("aria-label"), inMain: Boolean(document.querySelector("main")?.contains(document.activeElement)) }));
  await info.attach("keyboard-focus-evidence", { body: JSON.stringify({ pendingFocus, completedFocus }, null, 2), contentType: "application/json" });
  expect.soft(completedFocus.inMain, "The completed result must stay reachable from the keyboard context").toBe(true);
  await page.keyboard.press("Tab");
  if (website) await expect(page.getByRole("button", { name: /SEO/ })).toBeFocused();
  else await expect(page.getByRole("button", { name: "Share scorecard", exact: true })).toBeFocused();
  const reset = page.getByRole("button", { name: website ? "Scan another site" : "Audit another business", exact: true });
  await reset.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel(website ? "Website address" : "Business name", { exact: true })).toBeFocused();
});
