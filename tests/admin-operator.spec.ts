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

test("admin operator surfaces render across the console", async ({ page }) => {
  // Every operator surface in the grouped rail loads and shows its own header,
  // so a broken import / server error on any one of them fails loudly here.
  const surfaces: Array<[string, RegExp]> = [
    ["/admin/leads", /Leads/],
    ["/admin/analytics", /Search \+ Analytics/],
    ["/admin/audit", /Site audits/],
    ["/admin/actions", /Ready to work|Portfolio actions/],
    ["/admin/onboard", /Onboard a client/],
    ["/admin/pay-links", /Pay links/],
    ["/admin/ops", /Operational health/],
    ["/admin/digests", /Maintenance digests/],
  ];
  for (const [path, heading] of surfaces) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} status`).toBeLessThan(400);
    await expect(page.getByRole("heading", { name: heading }).first(), path).toBeVisible();
  }
});

test("admin client cockpit renders the operator panels", async ({ page }) => {
  // The merged /admin/clients/[id] cockpit stacks every operator panel for one
  // client. Assert the key panels render so a broken panel import is caught.
  await page.goto("/admin/clients/gldf", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Great Lakes Dried Fruit" }).first()).toBeVisible();
  for (const panel of [
    "SEO + site health",
    "Reviews: operator view",
    "AI-search visibility",
    "Start a plan",
    "Domains",
    "Tenant config",
    "Client relationship",
  ]) {
    await expect(page.getByRole("heading", { name: panel, exact: true }).first(), panel).toBeVisible();
  }
});

test("legacy tenant routes redirect into the clients console", async ({ page }) => {
  // The old /admin/tenants list + detail collapsed into /admin/clients; the old
  // paths must keep working as thin redirects so bookmarks/links don't 404.
  await page.goto("/admin/tenants", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/clients$/);

  await page.goto("/admin/tenants/gldf", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/clients\/gldf$/);
});
