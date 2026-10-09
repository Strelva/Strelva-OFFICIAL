import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import { formsRecord, formOptions, workId, workspaceId } from "./support/website-forms-browser-fixture";

function loopback(info: TestInfo) {
  const base = info.project.use.baseURL;
  if (!base) throw new Error("An explicit loopback baseURL is required.");
  const url = new URL(base);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("A credential-free HTTP loopback origin is required.");
  return url.origin;
}

async function fixture(page: Page, info: TestInfo, version: 1 | 2, width: number, enlarged = false, managed = false) {
  const origin = loopback(info), endpoint = `/api/websites/${workId}`;
  let current = formsRecord(version), failRead = false;
  let held: Route | undefined;
  const posts: string[] = [], reads: string[] = [], blocked: string[] = [];
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { blocked.push(url.origin); return route.abort(); }
    if (url.pathname === `${endpoint}/connections`) {
      if (request.method() === "GET") return route.fulfill({ json: formOptions });
      if (request.method() === "POST") { posts.push(request.postData() ?? ""); held = route; return; }
    }
    if (request.method() === "GET" && url.pathname === (version === 2 ? `${endpoint}/rebuild` : endpoint)) {
      expect(url.searchParams.get("workspaceId")).toBe(workspaceId);
      reads.push(url.pathname + url.search);
      return failRead ? route.fulfill({ status: 503, json: { error: "Fictional current-state read unavailable." } }) : route.fulfill({ json: current });
    }
    if (request.method() === "GET" && url.pathname === `${endpoint}/history`) return route.fulfill({ json: { revisions: [] } });
    if (request.method() === "GET" && url.pathname === `${endpoint}/preview`) {
      const candidate = current.rebuild?.candidate ?? current.website?.candidate;
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="strelva-site-hash" content="${candidate?.contentHash}"></head><body><h1>Fictional private preview</h1><p>No form or provider is invoked.</p></body></html>` });
    }
    if (url.pathname.startsWith("/api/")) { blocked.push(url.pathname); return route.abort(); }
    return route.continue();
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/preview/strelva/website-forms?version=${version}${managed ? "&managed=1" : ""}`);
  if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const forms = page.getByRole("region", { name: "Website visitor forms", exact: true, includeHidden: true });
  await expect(forms).toBeVisible();
  await forms.getByRole("button", { name: "Choose forms", exact: true }).click();
  const source = forms.getByLabel("Connected website", { exact: true });
  await expect(source).toHaveValue("fictional-bakery");
  await expect(source).toBeFocused();
  const inquiry = forms.getByLabel("Inquiry form", { exact: true });
  await inquiry.selectOption("catering");
  const update = forms.getByRole("button", { name: "Update website preview", exact: true });
  return { forms, source, inquiry, update, posts, reads, blocked,
    failRead(value: boolean) { failRead = value; },
    async complete(outcome: "lost" | "malformed" | "valid") {
      await expect.poll(() => Boolean(held)).toBe(true);
      current = formsRecord(version, 2, false);
      if (outcome === "lost") await held!.abort("failed");
      else await held!.fulfill({ json: outcome === "valid" ? current : { workId, workspaceId, [version === 2 ? "rebuild" : "website"]: { committedRevision: 2 } } });
    },
  };
}

test.describe("managed publication permission", () => {
test.use({ hasTouch: true });
test("managed v2 publication permission loss hides pending forms and requires saved-state reconciliation after regain", async ({ page }, info) => {
  const f = await fixture(page, info, 2, 390, false, true);
  await f.update.focus(); await page.keyboard.press("Enter");
  await expect.poll(() => f.posts.length).toBe(1);
  await page.getByRole("button", { name: "Remove fictional publication permission", exact: true }).click();
  await expect(f.forms).toBeHidden();
  await expect(f.inquiry).toHaveValue("catering");
  await expect(f.source).toHaveValue("fictional-bakery");
  await page.getByRole("button", { name: "Restore fictional publication permission", exact: true }).click();
  await expect(f.forms).toBeVisible();
  await expect(f.inquiry).toHaveValue("catering");
  await expect(f.source).toHaveValue("fictional-bakery");
  await expect(f.update).toBeDisabled();
  const outside = page.getByRole("button", { name: "Outside website control", exact: true });
  await outside.focus(); await f.complete("valid");
  const reload = page.getByRole("button", { name: "Reload current state", exact: true });
  await expect(reload).toBeVisible(); await expect(outside).toBeFocused();
  await expect(f.update).toBeDisabled();
  await expect(page.getByRole("button", { name: "Publish approved website", exact: true })).toBeDisabled();
  const previousReads = f.reads.length;
  await reload.focus(); await page.keyboard.press("Enter");
  await expect(reload).toHaveCount(0);
  expect(f.reads).toHaveLength(previousReads + 1);
  await expect(f.forms.getByRole("button", { name: "Choose forms", exact: true })).toBeEnabled();
  await f.forms.getByRole("button", { name: "Choose forms", exact: true }).click();
  await expect(f.inquiry).toHaveValue("catering");
  await expect(page.getByRole("button", { name: "Publish approved website", exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("managed-permission-reconciled.png"), fullPage: true });
  await scope(info, f.blocked, f.posts);
});
});

async function geometry(page: Page, forms: Locator, width: number) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width >= 768) return;
  const boxes = await forms.locator("button:visible, select:visible").evaluateAll(nodes => nodes.map(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    expect(a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5).toBe(true);
  }
}

async function scope(info: TestInfo, blocked: string[], posts: string[]) {
  expect(blocked).toEqual([]);
  expect(posts).toHaveLength(1);
  await info.attach("fictional-ui-scope", { body: JSON.stringify({ blockedRequests: blocked, connectionPosts: posts.length, nativeAuthQualified: false, realPreviewRevisionQualified: false, publicationQualified: false, providerQualified: false }), contentType: "application/json" });
}

for (const version of [1, 2] as const) for (const [width, enlarged] of [[1440, false], [390, false], [320, true]] as const) {
  test.describe(`forms v${version} at ${width}px`, () => {
    test.use({ hasTouch: width < 768 });
    for (const outcome of ["lost", "malformed"] as const) test(`${outcome} acknowledgement requires saved-state reconciliation${enlarged ? " with enlarged text" : ""}`, async ({ page }, info) => {
      const f = await fixture(page, info, version, width, enlarged);
      await geometry(page, f.forms, width);
      await f.update.focus(); await page.keyboard.press("Enter");
      await expect.poll(() => f.posts.length).toBe(1);
      expect(JSON.parse(f.posts[0]!)).toEqual({ expectedRevision: 1, selection: { tenantId: "fictional-bakery", inquiryCapabilityId: "catering" } });
      for (const control of await f.forms.locator("select, button").all()) await expect(control).toBeDisabled();
      for (const name of ["Approve this preview", "Prepare launch", "Publish approved website"]) {
        const action = page.getByRole("button", { name, exact: true });
        if (await action.count()) await expect(action).toBeDisabled();
      }
      await expect(f.inquiry).toHaveValue("catering");
      await expect(f.source).toHaveValue("fictional-bakery");
      const outside = page.getByRole("button", { name: "Outside website control", exact: true });
      if (outcome === "malformed") await outside.focus();
      await f.complete(outcome);
      const reload = page.getByRole("button", { name: "Reload current state", exact: true });
      await expect(page.getByRole("alert").filter({ hasText: "The visitor form change could not be confirmed" }).first()).toBeVisible();
      if (outcome === "malformed") await expect(outside).toBeFocused(); else await expect(reload).toBeFocused();
      await expect(f.update).toBeDisabled(); await expect(f.inquiry).toHaveValue("catering");
      const publish = page.getByRole("button", { name: "Publish approved website", exact: true });
      if (await publish.count()) await expect(publish).toBeDisabled();
      await geometry(page, f.forms, width);
      if (width < 768) { const box = await reload.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44); }
      await page.screenshot({ path: info.outputPath("unconfirmed-forms.png"), fullPage: true });
      f.failRead(true); await reload.focus(); await page.keyboard.press("Enter");
      await expect(page.getByRole("alert").filter({ hasText: "The current saved website could not be loaded" }).first()).toBeVisible();
      await expect(reload).toBeFocused(); await expect(f.update).toBeDisabled(); await expect(f.inquiry).toHaveValue("catering");
      expect(f.posts).toHaveLength(1);
      f.failRead(false); await page.keyboard.press("Enter");
      await expect(reload).toHaveCount(0);
      await expect(page.getByRole("heading", { name: version === 2 ? "Ready for your review" : "Fictional bakery", exact: true }).first()).toBeFocused();
      expect(f.reads.length).toBeGreaterThanOrEqual(3);
      await expect(f.forms.getByRole("button", { name: "Choose forms", exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: version === 2 ? "Publish approved website" : "Prepare launch", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Approve this preview", exact: true })).toBeVisible();
      await f.forms.getByRole("button", { name: "Choose forms", exact: true }).click();
      await expect(f.inquiry).toHaveValue("catering");
      await geometry(page, f.forms, width);
      await page.screenshot({ path: info.outputPath("reconciled-forms.png"), fullPage: true });
      await scope(info, f.blocked, f.posts);
    });
  });
}

for (const version of [1, 2] as const) {
  test(`v${version} pending authority loss and regain cannot adopt its earlier acknowledgement`, async ({ page }, info) => {
    const f = await fixture(page, info, version, 390);
    await f.update.click(); await expect.poll(() => f.posts.length).toBe(1);
    await page.getByRole("button", { name: "Remove fictional editing access", exact: true }).click();
    await page.getByRole("button", { name: "Restore fictional editing access", exact: true }).click();
    const outside = page.getByRole("button", { name: "Outside website control", exact: true }); await outside.focus();
    await f.complete("valid");
    const reload = page.getByRole("button", { name: "Reload current state", exact: true });
    await expect(reload).toBeVisible(); await expect(outside).toBeFocused(); await expect(f.update).toBeDisabled();
    await reload.click(); await expect(reload).toHaveCount(0);
    await expect(f.forms.getByRole("button", { name: "Choose forms", exact: true })).toBeEnabled();
    await scope(info, f.blocked, f.posts);
  });
  for (const outsideFocus of [false, true]) test(`v${version} valid save ${outsideFocus ? "preserves outside focus" : "recovers keyboard focus to the current form heading"}`, async ({ page }, info) => {
    const f = await fixture(page, info, version, 1440);
    await f.update.focus(); await page.keyboard.press("Enter"); await expect.poll(() => f.posts.length).toBe(1);
    const outside = page.getByRole("button", { name: "Outside website control", exact: true });
    if (outsideFocus) await outside.focus();
    await f.complete("valid");
    await expect(f.forms.getByRole("button", { name: "Choose forms", exact: true })).toBeEnabled();
    await expect(outsideFocus ? outside : f.forms.getByRole("heading", { name: "Visitor forms", exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: "Reload current state", exact: true })).toHaveCount(0);
    await scope(info, f.blocked, f.posts);
  });
}
