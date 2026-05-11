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
  await expect(dashboardNav.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("href", "/dashboard/reports");
  await expect(dashboardNav.getByRole("link", { name: "Approvals", exact: true })).toHaveAttribute("href", "/dashboard/review");
  await expect(dashboardNav.getByRole("link", { name: "Site", exact: true })).toHaveAttribute("href", "/dashboard/site");
  await expect(dashboardNav.getByRole("link", { name: "Connections", exact: true })).toHaveAttribute("href", "/dashboard/sources");

  await page.goto("/dashboard/reports");
  await expect(page.getByRole("heading", { name: /your site is ready to manage|your weekly report/i })).toBeVisible();
  await expect(page.getByText(/Scaffold Web watches how people find you|Plain-English performance/i)).toBeVisible();

  await page.goto("/dashboard/review");
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await expect(page.getByText("Nothing is waiting on approval")).toBeVisible();

  await page.goto("/dashboard/site");
  await expect(page.getByRole("button", { name: "Content" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Layout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI Chat" })).toBeVisible();

  await page.goto("/dashboard/sources");
  await expect(page.getByRole("heading", { name: "Sources the AI can actually use" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Next setup/i })).toBeVisible();

  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Settings with real ownership impact" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ownership" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Billing" })).toBeVisible();

  await page.goto("/dashboard/assets");
  await expect(page.getByRole("heading", { name: "Photo library" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload photos" })).toBeVisible();
});
