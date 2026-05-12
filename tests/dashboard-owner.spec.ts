import { expect, test } from "@playwright/test";

test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Owner dashboard smoke requires REB_DEV_UNGATED_ACCESS=1 for local signed-in-style coverage.",
);

test("owner dashboard surfaces are reachable and product-complete enough to orient", async ({ page }) => {
  await page.goto("/dashboard/chat");
  const dashboardNav = page.getByRole("navigation", { name: "Dashboard" });

  await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening), great lakes dried fruit/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /what should i improve next/i })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /tell me what you need/i })).toBeVisible();
  await expect(dashboardNav.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("href", "/dashboard");
  await expect(dashboardNav.getByRole("link", { name: "Ask AI", exact: true })).toHaveAttribute("href", "/dashboard/chat");
  await expect(dashboardNav.getByRole("link", { name: "Site", exact: true })).toHaveAttribute("href", "/dashboard/site");
  await expect(dashboardNav.getByRole("link", { name: "Sources", exact: true })).toHaveAttribute("href", "/dashboard/sources");

  await page.goto("/dashboard/reports");
  await expect(page.getByRole("heading", { name: /your first weekly report is still warming up|your weekly report/i })).toBeVisible();
  await expect(page.getByText(/The Today view already shows the short version|Plain-English performance/i).first()).toBeVisible();

  await page.goto("/dashboard/site");
  await expect(page.getByRole("button", { name: "Content" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Layout" })).toBeVisible();

  await page.goto("/dashboard/sources");
  await expect(page.getByRole("heading", { name: "What the AI should trust" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Review setup/i })).toBeVisible();

  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Settings with real ownership impact" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ownership" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Billing" })).toBeVisible();

  await page.goto("/dashboard/assets");
  await expect(page.getByRole("heading", { name: "Photo library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload photos" })).toBeVisible();
});

test("site editor saves a draft into the admin preview and can discard it", async ({ page }) => {
  await page.goto("/dashboard/site");
  await page.evaluate(async () => {
    await fetch("/api/publish", { method: "DELETE", credentials: "same-origin" }).catch(() => null);
  });
  await page.reload({ waitUntil: "networkidle" });

  const headline = page.getByLabel("Headline").first();
  await expect(headline).toBeVisible();
  const testValue = `Great Lakes Dried Fruit QA ${Date.now()}`;

  await headline.fill(testValue);
  await page.getByRole("button", { name: /Save Draft|Save/i }).click();
  await expect(page.getByText("Draft preview active")).toBeVisible();
  await expect(page.getByText("Ready to publish")).toBeVisible();
  await expect(page.getByText(/Hero \/ Headline|Headline/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish live" })).toBeVisible();

  await expect
    .poll(async () => {
      for (const frame of page.frames()) {
        const text = await frame.locator("body").innerText({ timeout: 500 }).catch(() => "");
        if (text.includes(testValue)) return true;
      }
      return false;
    })
    .toBe(true);

  await page.evaluate(async () => {
    await fetch("/api/publish", { method: "DELETE", credentials: "same-origin" });
  });
  await page.reload({ waitUntil: "networkidle" });

  await expect
    .poll(async () => {
      for (const frame of page.frames()) {
        const text = await frame.locator("body").innerText({ timeout: 500 }).catch(() => "");
        if (text.includes(testValue)) return true;
      }
      return false;
    })
    .toBe(false);
});
