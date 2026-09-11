import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the isolated local interface preview.");

test("local tracker uses the same import and edit flow without sending CSV to an API", async ({ page }) => {
  const apiRequests: string[] = [];
  await page.route("**/api/tracker*", async (route) => {
    apiRequests.push(route.request().url());
    await route.abort();
  });
  await page.goto("/preview/strelva?scenario=managed&view=tracker");
  await expect(page.getByText("Local rehearsal. Your CSV stays in this browser view.", { exact: false })).toBeVisible();
  await page.getByLabel("Choose a CSV file").setInputFiles({ name: "requests.csv", mimeType: "text/csv", buffer: Buffer.from("Name,Status\nFirst request,Waiting\nSecond request,Done") });
  await expect(page.getByRole("heading", { name: "Preview imported rows" })).toBeVisible();
  await page.getByRole("button", { name: "Create preview tracker" }).click();
  await expect(page.getByText("Tracker saved in this preview only.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Edit Status, source row 2", exact: true }).click();
  await page.getByLabel("New cell value").fill("Assigned");
  await page.getByRole("button", { name: "Save edit", exact: true }).click();
  await expect(page.getByRole("list", { name: "Tracker edit history" })).toContainText("Assigned");
  await page.getByRole("checkbox", { name: "Select source row 2", exact: true }).check();
  await page.getByRole("checkbox", { name: "Select source row 3", exact: true }).check();
  await page.getByRole("combobox", { name: "Field to change", exact: true }).selectOption({ label: "Status" });
  await page.getByLabel("Value for selected rows").fill("Reviewed");
  await page.getByRole("button", { name: "Review selected changes", exact: true }).click();
  await expect(page.getByRole("region", { name: "Proposed change" })).toContainText("Assigned → Reviewed");
  await expect(page.locator("#tracker-rows")).not.toContainText("Reviewed");
  await page.getByRole("button", { name: "Apply selected changes", exact: true }).click();
  await expect(page.getByRole("list", { name: "Tracker edit history" })).toContainText("Changed 2 fields together");
  await page.getByRole("button", { name: "Undo change 2", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo change 2", exact: true })).toBeDisabled();
  await expect(page.locator("#tracker-rows")).toContainText("Assigned");
  await expect(page.locator("#tracker-rows")).toContainText("Done");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Filter rows").fill("Assigned");
  await expect(page.locator("#tracker-rows tbody tr")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect.poll(async () => (await page.getByRole("main").boundingBox())?.width ?? 0).toBeGreaterThan(350);
  await page.screenshot({ path: "output/tracker-local-mobile.png", fullPage: true });
  await page.reload();
  await expect(page.getByLabel("Choose a CSV file")).toBeVisible();
  expect(apiRequests).toEqual([]);
});
