import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated native UI fixtures.");

for (const width of [1440, 390]) test(`template customization and native app creation at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 960 });
  await page.goto("/preview/strelva?scenario=business&view=products");
  await expect(page.getByRole("heading", { name: "Make it yours.", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`template-library-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Preview Staff requests", exact: true }).click();
  await page.getByLabel("App name", { exact: true }).fill("Studio requests");
  await page.getByLabel("Field 2 name", { exact: true }).fill("What do you need?");
  if (width < 1100) await page.getByRole("button", { name: "Try preview", exact: true }).click();
  const preview = page.getByRole("region", { name: "Interactive app preview", exact: true });
  await expect(preview.getByRole("heading", { name: "Studio requests", exact: true })).toBeVisible();
  await preview.getByLabel("Name", { exact: true }).fill("Test person");
  await preview.getByLabel("What do you need?", { exact: true }).fill("Preview-only equipment request");
  await preview.getByLabel("Urgency", { exact: true }).selectOption("Normal");
  await preview.getByRole("button", { name: "Submit record", exact: true }).click();
  await expect(preview.getByText("Test record added. Nothing was saved or shared.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`template-customize-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Create private tool", exact: true }).click();
  await expect(page.getByText("Your private tool is ready.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open it", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Studio requests", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Preview-only equipment request", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Edit", exact: true }).click();
  await expect(page.getByText("Review changes", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Check proposed change", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("tab", { name: "Use", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save record", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`native-app-${width}.png`), fullPage: true });
});

test("custom template drafts survive reload without creating an app", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=business&view=products&template=inventory");
  await page.getByLabel("App name", { exact: true }).fill("Workshop stock");
  await page.getByLabel("Field 1 name", { exact: true }).fill("Part number");
  await page.reload();
  await expect(page.getByLabel("App name", { exact: true })).toHaveValue("Workshop stock");
  await expect(page.getByLabel("Field 1 name", { exact: true })).toHaveValue("Part number");
  await expect(page.getByRole("button", { name: "Create private tool", exact: true })).toBeEnabled();
  await expect(page.getByText("Your private tool is ready.", { exact: true })).toHaveCount(0);
});

test("selected template URL survives delayed router updates and reload", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=business&systems=on&view=products");
  await page.getByRole("button", { name: "Preview Staff requests", exact: true }).click();
  await expect(page).toHaveURL(/template=staff-requests/);
  await page.waitForTimeout(5_000);

  const settledUrl = new URL(page.url());
  expect(settledUrl.searchParams.get("scenario")).toBe("business");
  expect(settledUrl.searchParams.get("systems")).toBe("on");
  expect(settledUrl.searchParams.get("view")).toBe("products");
  expect(settledUrl.searchParams.get("template")).toBe("staff-requests");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Staff requests", level: 2 })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("template")).toBe("staff-requests");
});

test("read-only users can inspect templates without creating apps", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=read-only&view=products&template=staff-requests");
  await expect(page.getByRole("button", { name: "Create private tool", exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Interactive app preview", exact: true })).toBeVisible();
  await expect(page.getByLabel("App name", { exact: true })).toBeDisabled();
});

test("an agency's maker permission does not enable creation in a shared client", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=agency&workspaceId=33333333-3333-4333-8333-333333333333&view=products&template=staff-requests");
  await expect(page.getByRole("button", { name: "Create private tool", exact: true })).toBeDisabled();
  await expect(page.getByLabel("App name", { exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Interactive app preview", exact: true })).toBeVisible();
});

test("a visible request edit replaces the previously submitted request across tools", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=business");
  const composer = page.getByLabel("What do you want to accomplish?", { exact: true });
  await composer.fill("Organize customer onboarding.");
  await page.getByRole("button", { name: "Continue with this ask", exact: true }).click();
  const edited = "Organize supplier onboarding.\n- Insurance certificate\n- Signed agreement";
  await page.getByLabel("What do you want to accomplish?", { exact: true }).fill(edited);
  await page.getByRole("button", { name: "Get or build an app", exact: true }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await page.getByRole("button", { name: "Onboarding: Start", exact: true }).click();
  await page.getByRole("button", { name: "Get started", exact: true }).click();
  await expect(page.getByText(edited, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("supplier");
  await expect(page.getByLabel("Requirements", { exact: true })).toHaveValue("Insurance certificate\nSigned agreement");
});

test("supplier onboarding keeps the original request and explicit checklist", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=business");
  const request = "Organize supplier onboarding.\n- Insurance certificate\n- Signed agreement";
  await page.getByLabel("What do you want to accomplish?", { exact: true }).fill(request);
  await page.getByRole("button", { name: "Continue with this ask", exact: true }).click();
  await page.getByRole("region", { name: "Onboarding requirements", exact: true }).getByRole("button", { name: "Organize onboarding", exact: true }).click();
  await expect(page.getByText(request, { exact: true })).toBeVisible();
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue("supplier");
  await expect(page.getByLabel("Requirements", { exact: true })).toHaveValue("Insurance certificate\nSigned agreement");
});
