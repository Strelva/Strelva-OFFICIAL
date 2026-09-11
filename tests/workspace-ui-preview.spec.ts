import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires the explicit development-only interface preview.");

const EDITOR_HERO = {
  headline: "A fictional headline",
  subheadline: "Synthetic studio",
  tagline: "Content stays inside this local fixture.",
  ctaText: "See the work",
  ctaLink: "#products",
  backgroundImageUrl: "/images/product-bag.jpg",
};

async function mockEditorApi(page: Page, options: { denyDrafts?: boolean } = {}) {
  let draft = { ...EDITOR_HERO };
  const draftBodies: Record<string, unknown>[] = [];
  const apiRequests: { method: string; path: string }[] = [];

  await page.route("**/preview/strelva/website/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    apiRequests.push({ method: request.method(), path });

    if (path.endsWith("/publish")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ contentDrafts: {}, pageConfigDraft: false }) });
    }
    if (path.endsWith("/page-config")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(null) });
    }
    if (path.endsWith("/content/hero")) {
      if (request.method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.searchParams.get("draft") === "true" ? draft : EDITOR_HERO) });
      }
      if (request.method() === "PUT") {
        const body = request.postDataJSON() as Record<string, unknown>;
        draftBodies.push(body);
        if (options.denyDrafts) {
          return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Content permission is required." }) });
        }
        draft = body as typeof EDITOR_HERO;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, draft: true }) });
      }
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Fixture route not provided." }) });
  });

  return { draftBodies, apiRequests };
}

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
  await expect(page.getByText("Preview · early access", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("link", { name: /Try Home Finder/ })).toHaveAttribute("href", /127\.0\.0\.1:3213\/embed\/agency-preview/);
  await page.getByRole("button", { name: "Ask about early access" }).click();
  await expect(page.getByLabel("What are you trying to do?")).toHaveValue(/enabling a live brokerage installation/);
  await page.getByLabel("What are you trying to do?").fill("Bring my existing WordPress website.");
  await expect(page.getByRole("link", { name: "Open email" })).toHaveAttribute("href", /Bring%20my%20existing%20WordPress/);
  await expect(page.getByText(/Nothing is sent until you send it/)).toBeVisible();
});

test("shared workspace resumes inquiry work inside the one Strelva frame", async ({ page }) => {
  await page.goto("/preview/strelva?scenario=managed");
  await page.getByRole("button", { name: /Handle customer inquiries/ }).click();
  await expect(page.getByRole("heading", { name: "What should Strelva handle?" })).toBeVisible();
  await expect(page.getByLabel("Strelva navigation", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Inquiry navigation", exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "Inquiry work", exact: true }).getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("What should Strelva handle?").fill("Collect quote requests and route them to the recorded inbox.");
  await page.getByRole("button", { name: "Shape this request" }).click();
  await expect(page.getByRole("heading", { name: "What this work touches" })).toBeVisible();
  await expect(page).toHaveURL(/view=inquiries/);
  await expect(page).toHaveURL(/inquiryView=shape/);
  await expect(page).toHaveURL(/inquiryRequest=fixture_request_/);
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

test("isolated Website editor accepts structured text and image draft controls", async ({ page }) => {
  const fixture = await mockEditorApi(page);
  await page.goto("/preview/strelva/website/dashboard/site?editor=1", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Local Website editor · fictional content · no live actions")).toBeVisible();
  await page.getByRole("button", { name: "Edit site" }).click();
  await expect(page.getByLabel("Headline").first()).toBeVisible();
  await expect(page.getByText("Background image", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove image" })).toBeVisible();

  await page.getByLabel("Headline").first().fill("A changed fictional headline");
  await expect(page.getByText("Draft saved - preview updated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove image" }).click();
  await expect.poll(() => fixture.draftBodies.some((body) => body.headline === "A changed fictional headline" && body.backgroundImageUrl === "")).toBe(true);

  expect(fixture.apiRequests.some((request) => request.method === "PUT" && request.path.endsWith("/content/hero"))).toBe(true);
  expect(fixture.apiRequests.some((request) => request.method === "POST" && request.path.endsWith("/publish"))).toBe(false);
  expect(fixture.apiRequests.some((request) => request.method === "DELETE" && request.path.endsWith("/publish"))).toBe(false);
});

test("isolated Website editor surfaces a permission failure without accepting the draft", async ({ page }) => {
  const fixture = await mockEditorApi(page, { denyDrafts: true });
  await page.goto("/preview/strelva/website/dashboard/site?editor=1", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Edit site" }).click();
  await page.getByLabel("Headline").first().fill("A denied fictional headline");
  await expect(page.getByText("Couldn't save. Try again", { exact: false })).toBeVisible();
  expect(fixture.draftBodies.some((body) => body.headline === "A denied fictional headline")).toBe(true);
  expect(fixture.apiRequests.some((request) => request.method === "POST" && request.path.endsWith("/publish"))).toBe(false);
  expect(fixture.apiRequests.some((request) => request.method === "DELETE" && request.path.endsWith("/publish"))).toBe(false);
});
