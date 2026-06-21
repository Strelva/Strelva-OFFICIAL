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
  await expect(page.getByRole("textbox", { name: /message the ai about your site/i })).toBeVisible();
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
  await page.reload({ waitUntil: "domcontentloaded" });

  const headline = page.getByLabel("Headline").first();
  await expect(headline).toBeVisible();
  const testValue = `Great Lakes Dried Fruit QA ${Date.now()}`;

  await headline.fill(testValue);
  await page.getByRole("button", { name: /Save Draft|Save/i }).click();
  await expect(page.getByText("Draft preview active")).toBeVisible();
  await expect(page.getByText("Ready to publish")).toBeVisible();
  await expect(page.getByText(/Hero \/ Headline|Headline/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish live|Publish to Scaffold/ })).toBeVisible();

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
  await page.reload({ waitUntil: "domcontentloaded" });

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

test("client fallback site editor separates the active site from the editable draft preview", async ({ page, request }) => {
  test.setTimeout(120_000);

  const normalizePreviewText = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const previewFrameContains = async (value: string) => {
    const needle = normalizePreviewText(value);
    const frames = page.frames().filter((frame) =>
      frame.parentFrame() && (frame.url().includes("preview=true") || frame.url().includes("/api/edit-preview"))
    );
    for (const frame of frames) {
      const text = await frame.locator("body").innerText({ timeout: 500 }).catch(() => "");
      if (normalizePreviewText(text).includes(needle)) return true;
    }
    return false;
  };

  await page.goto("/client/gldf/dashboard/site", { waitUntil: "domcontentloaded" });
  await request.delete("/client/gldf/api/publish");

  const originalRes = await request.get("/client/gldf/api/content/hero");
  const original = await originalRes.json();
  const testValue = `Published GLDF QA ${Date.now()}`;

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    const headline = page.getByLabel("Headline").first();
    await expect(headline).toBeVisible();
    await expect(page.getByText("Active site", { exact: true })).toBeVisible();
    await expect
      .poll(() => page.frames().some((frame) => frame.parentFrame() && frame.url().includes("/api/live-preview")))
      .toBe(true);

    await headline.fill(testValue);
    await page.getByRole("button", { name: /Save Draft|Save/i }).click();
    await expect(page.getByText("Ready to publish")).toBeVisible();
    await expect(page.getByText("Draft preview", { exact: true })).toBeVisible();
    await expect.poll(() => previewFrameContains(testValue)).toBe(true);

    await page.getByRole("button", { name: /Publish live|Publish to Scaffold/ }).click();
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const res = await fetch("/client/gldf/api/content/hero", { credentials: "same-origin" });
          return (await res.json()).headline;
        })
      )
      .toBe(testValue);
    await expect(page.getByText("Active site", { exact: true })).toBeVisible();
  } finally {
    await request.put("/client/gldf/api/content/hero", { data: original });
    await request.delete("/client/gldf/api/publish");
  }
});
