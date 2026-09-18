import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit application-use UI preview flag.");

const WORK_ID = "11111111-1111-4111-8111-111111111111";

const snapshot = {
  workId: WORK_ID,
  title: "Repair requests",
  releaseVersion: 1,
  views: [
    { kind: "form", fields: [{ id: "problem", label: "Problem", type: "text", required: true }] },
    { kind: "list", fields: [{ id: "problem", label: "Problem", type: "text", required: true }] },
  ],
  records: [{ id: "request-1", values: { problem: "Loose front door" } }],
  access: { views: ["form", "list"], recordRead: "all", recordSubmit: true, expiresAt: "2026-09-15T12:00:00.000Z" },
};

async function mockUse(page: Page, options: { revoked?: boolean; documentOnly?: boolean } = {}) {
  let submitted = false;
  const responseSnapshot = options.documentOnly
    ? {
        ...snapshot,
        views: [{ kind: "document", fields: [{ id: "problem", label: "Problem", type: "text", required: true }] }],
        access: { ...snapshot.access, views: ["document"], recordSubmit: false },
      }
    : snapshot;
  await page.route(`**/api/apps/${WORK_ID}`, async route => {
    if (options.revoked) {
      await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "This application link is no longer available." }) });
      return;
    }
    if (route.request().method() === "POST") {
      submitted = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...responseSnapshot, records: [...responseSnapshot.records, { id: "request-2", values: { problem: "Broken gate" } }] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(responseSnapshot) });
  });
  return { wasSubmitted: () => submitted };
}

test("finished application is a focused keyboard usable experience with responsive records", async ({ page }, testInfo) => {
  const use = await mockUse(page);
  const requests: string[] = [];
  page.on("request", request => requests.push(new URL(request.url()).pathname));
  await page.goto(`/apps/${WORK_ID}`);
  await expect(page.getByRole("heading", { name: "Repair requests", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Records", exact: true })).toBeVisible();
  await page.getByLabel("Problem *", { exact: true }).fill("Broken gate");
  await page.getByLabel("Problem *", { exact: true }).press("Tab");
  await expect(page.getByRole("button", { name: "Submit record", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Submit record", exact: true }).press("Enter");
  await expect(page.getByRole("status")).toContainText("Record submitted.");
  expect(use.wasSubmitted()).toBe(true);
  expect(requests.some(path => /chat|agent|generate|workspace/.test(path))).toBe(false);
  await page.screenshot({ path: testInfo.outputPath("application-use-ui-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("article", { name: "Record 1" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("application-use-ui-mobile.png"), fullPage: true });
});

test("finished application shows a revoked error without exposing the saved experience", async ({ page }, testInfo) => {
  await mockUse(page, { revoked: true });
  await page.goto(`/apps/${WORK_ID}`);
  await expect(page.getByRole("heading", { name: "This application link is unavailable", exact: true })).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toContainText("no longer available");
  await expect(page.getByRole("heading", { name: "Repair requests", exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("application-use-ui-revoked.png"), fullPage: true });
});

test("a document-only grant still renders its permitted records", async ({ page }) => {
  await mockUse(page, { documentOnly: true });
  await page.goto(`/apps/${WORK_ID}`);
  await expect(page.getByRole("heading", { name: "Documents", exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: "Record 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submit a record", exact: true })).toHaveCount(0);
});
