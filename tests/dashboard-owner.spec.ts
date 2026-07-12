import { expect, test } from "@playwright/test";

test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Owner dashboard smoke requires REB_DEV_UNGATED_ACCESS=1 for local signed-in-style coverage.",
);

test("owner dashboard surfaces are reachable and product-complete enough to orient", async ({ page }) => {
  await page.goto("/dashboard/chat");
  const dashboardNav = page.getByRole("navigation", { name: "Dashboard" });

  await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening),/i })).toBeVisible();
  await expect(page.getByRole("textbox").first()).toBeVisible();
  // Current IA: Today / Ask Strelva / Website / Analytics / Reports (Sources removed;
  // Site relabelled Website in the console redesign).
  await expect(dashboardNav.getByRole("link", { name: "Today", exact: true })).toHaveAttribute("href", "/dashboard");
  await expect(dashboardNav.getByRole("link", { name: "Ask Strelva", exact: true })).toHaveAttribute("href", "/dashboard/chat");
  await expect(dashboardNav.getByRole("link", { name: "Website", exact: true })).toHaveAttribute("href", "/dashboard/site");
  await expect(dashboardNav.getByRole("link", { name: "Analytics", exact: true })).toHaveAttribute("href", "/dashboard/analytics");
  await expect(dashboardNav.getByRole("link", { name: "Reports", exact: true })).toHaveAttribute("href", "/dashboard/reports");

  await page.goto("/dashboard/reports");
  await expect(page.getByRole("heading").first()).toBeVisible();

  await page.goto("/dashboard/site");
  // The Website sub-nav is now accent pills (links): Preview / Content / Media / Brand Kit / History.
  await expect(page.getByRole("link", { name: "Content", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Media", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Brand Kit", exact: true })).toBeVisible();

  await page.goto("/dashboard/analytics");
  await expect(page.getByRole("heading").first()).toBeVisible();

  await page.goto("/dashboard/settings");
  // Settings is consolidated into Business / Account / Domains / Plan; Business is the default section.
  await expect(page.getByRole("heading", { name: "Business", exact: true })).toBeVisible();
});

test("site editor surfaces the draft state and can discard it without publishing", async ({ page, request }) => {
  // Seed a draft deterministically through the same endpoint the inline editor
  // auto-saves to (driving the debounced canvas edit directly is flaky), then
  // verify the editor surface reflects the draft and the Discard control clears it.
  // We never publish — the draft layer is isolated and fully reversible.
  await request.delete("/api/publish").catch(() => null);
  const activeRes = await request.get("/api/content/hero");
  const active = await activeRes.json();
  const testValue = `Great Lakes Dried Fruit QA ${Date.now()}`;
  const putRes = await request.put("/api/content/hero?draft=true", {
    data: { ...active, headline: testValue },
  });
  expect(putRes.ok()).toBeTruthy();

  await page.goto("/dashboard/site", { waitUntil: "domcontentloaded" });

  // Opening the inline editor confirms the surface renders (hero auto-selects, so
  // its Headline field is live) and the PublishBar reflects the pending draft.
  await page.getByRole("button", { name: "Edit site" }).click();
  await expect(page.getByLabel("Headline").first()).toBeVisible();
  await expect(page.getByText("Draft preview active", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish live|Publish to Strelva/ })).toBeEnabled();

  // Discard clears the draft; nothing is ever published to the live site.
  await page.getByRole("button", { name: /Discard draft/ }).click();
  await expect(page.getByText(/No draft changes|Live sync ready/)).toBeVisible();
});

test("client fallback editor keeps drafts isolated from the active site", async ({ page, request }) => {
  test.setTimeout(60_000);

  // Load the client-path editor to confirm the fallback route renders, then
  // assert the draft-isolation invariant through the same content API the editor
  // auto-saves to. We deliberately never publish: gldf is a live client site, so
  // a publish would trigger a real revalidation \u2014 the draft layer is enough to
  // prove isolation and is fully reversible.
  await page.goto("/client/gldf/dashboard/site", { waitUntil: "domcontentloaded" });
  await request.delete("/client/gldf/api/publish");

  const activeRes = await request.get("/client/gldf/api/content/hero");
  const active = await activeRes.json();
  const testValue = `Isolated GLDF draft ${Date.now()}`;

  try {
    // Write a draft through the editor's own draft endpoint.
    const putRes = await request.put("/client/gldf/api/content/hero?draft=true", {
      data: { ...active, headline: testValue },
    });
    expect(putRes.ok()).toBeTruthy();

    // The draft layer carries the edit...
    const draftRes = await request.get("/client/gldf/api/content/hero?draft=true");
    expect((await draftRes.json()).headline).toBe(testValue);

    // ...but the ACTIVE site content is untouched \u2014 no leak, nothing published.
    const stillActiveRes = await request.get("/client/gldf/api/content/hero");
    expect((await stillActiveRes.json()).headline).toBe(active.headline);
  } finally {
    // Drop the draft; never promote it to the real client's live site.
    await request.delete("/client/gldf/api/publish");
  }
});

test("client presence surfaces render their real content", async ({ page }) => {
  // Walk the owner-facing presence set and assert each surface shows its own
  // stable copy (not just a 200), so a regression on any one fails loudly.
  // Numbers are dynamic, so these anchor on fixed section titles / verdicts.
  const surfaces: Array<[string, RegExp]> = [
    ["/dashboard", /What Strelva did for you/],
    ["/dashboard/analytics", /How people find you on Google/],
    ["/dashboard/reviews", /How Strelva answers your reviews/],
    ["/dashboard/google", /Connect your Google listing/],
    ["/dashboard/health", /Site [Hh]ealth/],
    ["/dashboard/history", /History & safety/],
    ["/dashboard/store", /Best sellers/],
  ];
  for (const [path, needle] of surfaces) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} status`).toBeLessThan(400);
    await expect(page.getByText(needle).first(), path).toBeVisible();
  }
});

test("settings sections and report views switch on interaction", async ({ page }) => {
  // Settings consolidated to Business / Account / Domains / Plan — switching
  // sections must swap the in-page content, not just the active pill.
  await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Business", exact: true })).toBeVisible();
  // Business is the default section: the autonomy panel is shown.
  await expect(page.getByText("How much Strelva handles on its own")).toBeVisible();

  await page.getByRole("button", { name: "Domains", exact: true }).click();
  await expect(page.getByText("Production Domain").first()).toBeVisible();

  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByText(/Manage billing|Current plan|Billing/i).first()).toBeVisible();

  // Reports: the Weekly/Monthly recap toggle drives the view via the query param.
  await page.goto("/dashboard/reports", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Weekly", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Monthly", exact: true }).click();
  await expect(page).toHaveURL(/view=monthly/);
});

test("analytics range selector drives the reporting window", async ({ page }) => {
  // Every number on Analytics is computed for the selected window; the range
  // selector must move that window and reflect it in the URL (?range=).
  await page.goto("/dashboard/analytics", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "This week", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "This month", exact: true }).click();
  await expect(page).toHaveURL(/range=month/);

  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect(page).toHaveURL(/range=live/);
  // The verdict/section chrome still renders after a window switch.
  await expect(page.getByText("How people find you on Google").first()).toBeVisible();
});
