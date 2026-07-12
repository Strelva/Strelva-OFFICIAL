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
