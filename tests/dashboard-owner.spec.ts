import { expect, test } from "@playwright/test";

test.skip(
  process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Owner dashboard smoke requires REB_DEV_UNGATED_ACCESS=1 for local signed-in-style coverage.",
);

test("owner dashboard surfaces are reachable and product-complete enough to orient", async ({ page }) => {
  await page.goto("/dashboard/chat");
  // XA sidebar (October 16): the business's own name labels it; GLOSSARY words (Home, What changed).
  const dashboardNav = page.getByRole("complementary", { name: /navigation$/ }).first();

  await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening),/i })).toBeVisible();
  await expect(page.getByRole("textbox").first()).toBeVisible();
  await expect(dashboardNav.getByRole("link", { name: "New request", exact: true })).toHaveAttribute("href", "/dashboard/chat");
  await expect(dashboardNav.getByRole("link", { name: "Home", exact: true })).toHaveAttribute("href", "/dashboard");
  await expect(dashboardNav.getByRole("link", { name: "What changed", exact: true })).toHaveAttribute("href", "/dashboard/history");
  await expect(dashboardNav.getByRole("link", { name: "Website", exact: true })).toHaveAttribute("href", "/dashboard/site");
  await expect(dashboardNav.getByRole("link", { name: "Business details", exact: true })).toHaveAttribute("href", "/dashboard/settings");

  await page.goto("/dashboard/reports");
  await expect(page.getByRole("heading").first()).toBeVisible();

  await page.goto("/dashboard/site");
  // The Website sections: Your site / Lists / Photos / Brand (Store when the tenant sells).
  const sections = page.getByRole("navigation", { name: "Website sections" });
  await expect(sections.getByRole("link", { name: "Your site", exact: true })).toBeVisible();
  await expect(sections.getByRole("link", { name: "Lists", exact: true })).toBeVisible();
  await expect(sections.getByRole("link", { name: "Photos", exact: true })).toBeVisible();
  await expect(sections.getByRole("link", { name: "Brand", exact: true })).toBeVisible();

  await page.goto("/dashboard/analytics");
  await expect(page.getByRole("heading").first()).toBeVisible();

  await page.goto("/dashboard/settings");
  // Business details is one page: the facts said once, then who can change the site.
  await expect(page.getByRole("heading", { name: "About the business", exact: true })).toBeVisible();
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
  await expect(page.getByText("Draft, not live yet").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();

  // Discard clears the draft; nothing is ever published to the live site.
  await page.getByRole("button", { name: /Discard draft/ }).click();
  await expect(page.getByText("Draft, not live yet")).toHaveCount(0);
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
    ["/dashboard", /Good (morning|afternoon|evening)/],
    ["/dashboard/analytics", /Visits\./],
    ["/dashboard/reviews", /Connect your Google listing|reviews/i],
    ["/dashboard/google", /Connect your Google listing/],
    ["/dashboard/health", /Site [Hh]ealth/],
    ["/dashboard/history", /What changed/],
    ["/dashboard/store", /Recent orders/],
  ];
  for (const [path, needle] of surfaces) {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res?.status(), `${path} status`).toBeLessThan(400);
    await expect(page.getByText(needle).first(), path).toBeVisible();
  }
});

test("business details and recaps render their own content", async ({ page }) => {
  // Business details is one page now (October 16): facts, who can change the site, how much Strelva does alone.
  await page.goto("/dashboard/settings", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "About the business", exact: true })).toBeVisible();
  await expect(page.getByText("How much Strelva does on its own").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Menu and footer", exact: true })).toBeVisible();

  // Recaps lead with one sentence (no recap has been sent on a clean backend yet).
  await page.goto("/dashboard/reports", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("dashboard surfaces are feature-gated per tenant", async ({ page }) => {
  // A feature the tenant HAS (gldf runs a storefront) renders its surface...
  const store = await page.goto("/dashboard/store", { waitUntil: "domcontentloaded" });
  expect(store?.status(), "store status").toBeLessThan(400);
  await expect(page.getByRole("heading", { name: "Recent orders" }).first()).toBeVisible();

  // ...a feature it LACKS (no booking/scheduling) resolves to the gated
  // not-found, not a crash or a half-rendered surface leaking the wrong set.
  const schedule = await page.goto("/dashboard/schedule", { waitUntil: "domcontentloaded" });
  expect(schedule?.status(), "schedule status").toBeLessThan(500);
  await expect(page.getByText(/404|not found|not available|isn't available|no page here/i).first()).toBeVisible();
});

test("analytics leads with visits and keeps site health on the same page", async ({ page }) => {
  // On a clean backend there is no traffic yet: Visits says so in a sentence and Site health sits below.
  await page.goto("/dashboard/analytics", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Visits.", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Site health", exact: true })).toBeVisible();

  // The old Site health route lands on that section.
  await page.goto("/dashboard/health", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/analytics#site-health/);
});
