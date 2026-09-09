import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit development-only interface preview.");

test("shared navigation remains available while opening and finding work", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=free");
  await expect(page.getByRole("heading", { name: "What would you like to work on?" })).toBeVisible();
  await page.getByRole("button", { name: "Open Harbor Dental", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Harbor Dental", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to my work" }).click();
  await page.getByRole("searchbox", { name: "Search saved work" }).fill("nothing matches");
  await expect(page.getByRole("heading", { name: "No matching work" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByRole("button", { name: "Open Harbor Dental", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.getByRole("button", { name: /Home Finder/ }).click();
  await expect(page.getByText("Not available yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ask about Home Finder" }).click();
  await page.getByLabel("What are you trying to do?").fill("Bring my existing WordPress website.");
  await expect(page.getByRole("link", { name: "Open email" })).toHaveAttribute("href", /Bring%20my%20existing%20WordPress/);
  await expect(page.getByText(/Nothing is sent until you send it/)).toBeVisible();
});

test("empty workspace can create an explicitly fictional local assessment", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=empty");
  await expect(page.getByText(/Your saved work will appear here/)).toBeVisible();
  await page.getByRole("button", { name: "Check a business", exact: false }).click();
  await page.getByRole("button", { name: "Check a business", exact: true }).click();
  await page.getByLabel("Business name").fill("Fictional Bakery");
  await page.getByLabel("Website", { exact: true }).fill("bakery.example");
  await page.getByRole("button", { name: "Run assessment" }).click();
  await expect(page.getByRole("heading", { name: "Fictional Bakery", exact: true })).toBeVisible();
  await expect(page.getByText(/These scores are fictional/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "This saved result is unavailable." })).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByText(/Your saved work will appear here/)).toBeVisible();
});

test("mobile navigation traps focus, closes on selection, and does not overflow", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=agency");
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  const navigation = page.getByRole("dialog", { name: "Strelva navigation", exact: true });
  await expect(navigation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await navigation.getByRole("button", { name: "Explore", exact: true }).click();
  await expect(navigation).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "More you can do." })).toBeVisible();
});

test("shared read-only work cannot start an assessment", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=read-only");
  await expect(page.getByRole("heading", { name: "Take a closer look." })).toBeVisible();
  await page.getByRole("button", { name: "Check a business", exact: false }).click();
  await expect(page.getByRole("button", { name: "Check a business", exact: true })).toBeDisabled();
  await expect(page.getByText("Switch to a workspace you own to create an assessment.")).toBeVisible();
});

test("preview account navigation remains local and exposes no real sign-out", async ({ page }) => {
  const liveApiRequests: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) liveApiRequests.push(path);
  });
  await page.goto("/preview/strelva?scenario=managed");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  const account = page.getByRole("link", { name: /alex.*alex@example.com/i });
  await expect(account).toHaveAttribute("href", "/preview/strelva/workspace/account");
  await account.click();
  await expect(page).toHaveURL(/\/preview\/strelva\/workspace\/account/);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  expect(liveApiRequests).toEqual([]);
});

test("preview controls reserve viewport space so the account stays visible", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=enterprise");
  for (const width of [320, 360, 768, 1280, 1600]) {
    await page.setViewportSize({ width, height: 720 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    if (width < 1024) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const account = page.getByRole("link", { name: /alex.*alex@example.com/i });
    await expect(account).toBeInViewport({ ratio: 1 });
    if (width < 1024) await page.keyboard.press("Escape");
  }
});
