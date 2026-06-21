import { expect, test } from "@playwright/test";

test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Admin operator smoke requires REB_DEV_UNGATED_ACCESS=1 for local operator coverage.",
);

test("admin operator surfaces show client readiness and draft review paths", async ({ page }) => {
  await page.goto("/admin");

  await expect(page.getByRole("navigation").getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/admin");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Drafts" })).toHaveAttribute("href", "/admin/drafts");
  await expect(page.getByRole("heading", { name: "Client Overview" })).toBeVisible();
  await expect(page.getByText(/active clients across your portfolio/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Controlled platform launch proof loop" })).toBeVisible();
  await expect(page.getByText("Launch command center")).toBeVisible();
  await expect(page.getByText(/custom-repo delivery, trustworthy AI action receipts/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /New Client/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Site" }).first()).toBeVisible();

  await page.goto("/admin/drafts");
  await expect(page.getByRole("heading", { name: "Pending Drafts" })).toBeVisible();
  await expect(page.getByText("Review AI-generated content changes before they go live")).toBeVisible();
});
