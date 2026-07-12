import { expect, test } from "@playwright/test";

test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Admin operator smoke requires REB_DEV_UNGATED_ACCESS=1 for local operator coverage.",
);

test("admin operator surfaces: overview feed, client cockpit, drafts", async ({ page }) => {
  await page.goto("/admin");

  // Grouped console nav (post-redesign).
  await expect(page.getByRole("navigation").getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/admin");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Clients" })).toHaveAttribute("href", "/admin/clients");
  await expect(page.getByRole("navigation").getByRole("link", { name: "Drafts" })).toHaveAttribute("href", "/admin/drafts");

  // The overview is now the "Needs you" attention feed, not the old client table.
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  await expect(page.getByText("Needs you").first()).toBeVisible();

  // Client cockpit: the invite flow moved here, and the Start-plan control lives here.
  await page.goto("/admin/clients/gldf");
  await expect(page.getByRole("button", { name: /Invite/i }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start a plan" })).toBeVisible();

  // Drafts surface.
  await page.goto("/admin/drafts");
  await expect(page.getByRole("heading", { name: /Pending drafts/i })).toBeVisible();
});
