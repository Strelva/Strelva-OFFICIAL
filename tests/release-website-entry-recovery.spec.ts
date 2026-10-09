import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import { entryPendingRecord, entryProgressRecord } from "./support/website-entry-browser-fixture";
import { at, draftText, factText, routingOptions, workId, workspaceId } from "./support/website-routing-browser-fixture";
import { reportBrowserFixture, reportBrowserOrigin } from "./support/website-report-browser-fixture";
import { assertReadableText } from "./support/assert-readable-text";

test.use({ hasTouch: true, trace: "on" });
async function fixture(page: Page, info: TestInfo, mode: "progress" | "pending", width: number) {
  const origin = reportBrowserOrigin(info.project.use.baseURL), endpoint = `/api/websites/${workId}`;
  const reads: string[] = [], writes: unknown[] = [], blocked: string[] = [], errors: string[] = [];
  let current = false, holdRead = false, failRead = false, heldRead: Route | undefined, heldWrite: Route | undefined;
  const record = () => mode === "progress" ? entryProgressRecord(current) : entryPendingRecord(current);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin !== origin) { blocked.push("foreign origin"); return route.abort(); }
    if (url.pathname === `${endpoint}/facts/ordinary` && mode === "pending" && method === "POST" && !url.search) {
      writes.push(JSON.parse(request.postData()!)); heldWrite = route; return;
    }
    if (method !== "GET") { blocked.push(`${method} ${url.pathname}`); return route.abort(); }
    if ([`${endpoint}/rebuild`, `${endpoint}/domain`, `${endpoint}/history`].includes(url.pathname)) {
      expect([...url.searchParams]).toEqual([["workspaceId", workspaceId]]);
      if (url.pathname.endsWith("/rebuild")) {
        reads.push(url.pathname + url.search);
        if (holdRead) { heldRead = route; return; }
        if (failRead) return route.fulfill({ status: 503, json: { error: "Fictional current read unavailable." } });
        return route.fulfill({ json: record() });
      }
      return route.fulfill({ json: url.pathname.endsWith("/domain") ? { domain: { hostname: "published.example.test", status: "pending", checkedAt: at, records: [] } } : { revisions: [] } });
    }
    if (url.pathname === `${endpoint}/connections` && !url.search) return route.fulfill({ json: routingOptions });
    if (url.pathname === `${endpoint}/report`) {
      expect([...url.searchParams.keys()]).toEqual(["month"]); const month = url.searchParams.get("month")!;
      expect(month).toMatch(/^\d{4}-\d{2}$/); return route.fulfill({ json: reportBrowserFixture(month) });
    }
    if (url.pathname === `${endpoint}/preview` && !url.search) {
      const value = record(); const candidate = value.rebuild.candidate;
      expect(candidate).not.toBeNull();
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="strelva-site-hash" content="${candidate!.contentHash}"></head><body><h1>${value.rebuild.title}</h1><p>Fictional private preview; no publication is invoked.</p></body></html>` });
    }
    if (url.pathname.startsWith("/api/")) { blocked.push(`GET ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  await page.clock.install({ time: new Date("2026-10-09T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-09T12:00:01Z"));
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/preview/strelva/website-entry?recovery=${mode}`);
  if (width === 320) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(page.getByText("Fictional saved-work recovery · no Auth, provider or publication proof", { exact: true })).toBeVisible();
  const parent = page.getByRole("region", { name: "Website rebuild", exact: true });
  await expect(parent.getByRole("heading", { name: "Fictional bakery", exact: true })).toBeVisible();
  return { parent, reads, writes, blocked, errors,
    current() { current = true; }, failRead(value: boolean) { failRead = value; }, holdRead() { holdRead = true; },
    async loseWrite() { await expect.poll(() => Boolean(heldWrite)).toBe(true); await heldWrite!.fulfill({ status: 503, json: { error: "Fictional acknowledgment unavailable." } }); heldWrite = undefined; },
    async finishRead() { await expect.poll(() => Boolean(heldRead)).toBe(true); await heldRead!.fulfill({ json: record() }); heldRead = undefined; holdRead = false; },
  };
}
async function coherent(page: Page, parent: Locator, title: string, status: string) {
  const select = page.getByLabel("Saved website work", { exact: true }); await expect(select).toHaveValue(workId);
  await expect.poll(() => select.evaluate(node => (node as HTMLSelectElement).selectedOptions[0]!.textContent)).toBe(`${title} · ${status}`);
  await expect(parent.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const helper = page.getByText(`Last known saved work: ${title} · ${status}`, { exact: true });
  await expect(helper).toBeVisible();
  const helperId = await helper.getAttribute("id"); expect(helperId).toBeTruthy();
  expect((await select.getAttribute("aria-describedby"))?.split(/\s+/)).toContain(helperId);
}
async function evidence(page: Page, parent: Locator, info: TestInfo, state: string) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = page.locator('main input:not([type="checkbox"]):visible, main textarea:visible, main select:visible, main button:visible');
  const boxes = await controls.evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, w: box.width, h: box.height }; }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) { expect(box.w).toBeGreaterThanOrEqual(44); expect(box.h).toBeGreaterThanOrEqual(44); }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!; expect(a.x + a.w <= b.x + .5 || b.x + b.w <= a.x + .5 || a.y + a.h <= b.y + .5 || b.y + b.h <= a.y + .5).toBe(true);
  }
  await assertReadableText(parent.locator("h1"), info, `entry-${state}-heading`);
  await assertReadableText(page.getByLabel("Saved website work", { exact: true }), info, `entry-${state}-selection`);
  const helper = page.getByText(/^Last known saved work: /);
  await expect(helper).toHaveCount(1); await expect(helper).toBeVisible();
  const helperBox = await helper.boundingBox(); expect(helperBox).not.toBeNull();
  expect(helperBox!.x).toBeGreaterThanOrEqual(0); expect(helperBox!.x + helperBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await helper.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await assertReadableText(helper, info, `entry-${state}-last-known-selection`);
  await assertReadableText(page.getByText("Fictional saved-work recovery · no Auth, provider or publication proof", { exact: true }), info, `entry-${state}-disclosure`);
  await page.screenshot({ path: info.outputPath(`entry-${state}.png`), fullPage: true });
}
async function scope(info: TestInfo, f: Awaited<ReturnType<typeof fixture>>, writes: number) {
  expect(f.blocked).toEqual([]); expect(f.errors).toEqual([]); expect(f.writes).toHaveLength(writes);
  await info.attach("fictional-entry-scope", { body: JSON.stringify({ exactCurrentReads: f.reads.map(() => "GET exact fictional work/workspace"), explicitHttpWrites: f.writes.length, blocked: f.blocked, pageErrors: f.errors, actualWrapper: true, nativeAuthQualified: false, providerQualified: false, publicationQualified: false, renderedQualificationOnly: true }), contentType: "application/json" });
}

test("saved website work tracks the current build and review at 390px", async ({ page }, info) => {
  const f = await fixture(page, info, "progress", 390), select = page.getByLabel("Saved website work", { exact: true });
  await coherent(page, f.parent, "Fictional bakery", "building"); await evidence(page, f.parent, info, "building");
  const address = page.url(); await select.focus(); f.current();
  const before = f.reads.length; await page.clock.runFor(2500); await expect.poll(() => f.reads.length).toBe(before + 1);
  await coherent(page, f.parent, "Fictional bakery review", "review"); await expect(select).toBeFocused(); expect(page.url()).toBe(address);
  await expect(f.parent.getByRole("region", { name: "Private website preview", exact: true })).toBeVisible();
  await expect(page.frameLocator('iframe[title="Private website preview for Fictional bakery review"]').getByRole("heading", { name: "Fictional bakery review", exact: true })).toBeVisible();
  expect(entryProgressRecord(true).rebuild.revision).toBe(4); expect(entryProgressRecord(true).rebuild.candidate!.revision).toBe(2);
  await evidence(page, f.parent, info, "review"); await scope(info, f, 0);
});

test("saved website work preserves pending and lost-save recovery at 320px with enlarged text", async ({ page }, info) => {
  const f = await fixture(page, info, "pending", 320); await coherent(page, f.parent, "Fictional bakery", "published");
  await expect(f.parent.getByText("This revision has been published.", { exact: true })).toBeVisible();
  await f.parent.getByText("Edit website facts", { exact: true }).click();
  const fact = f.parent.getByRole("article", { name: factText, exact: true }); await fact.getByRole("button", { name: "Edit fact", exact: true }).click();
  const draft = fact.getByLabel("Corrected fact", { exact: true }); await draft.fill(draftText);
  const save = fact.getByRole("button", { name: "Save correction", exact: true }); await save.focus();
  await fact.locator("form").evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect.poll(() => f.writes.length).toBe(1); await expect(draft).toBeDisabled();
  expect(f.writes[0]).toEqual({ expectedRevision: 3, candidateRevision: 2, candidateContentHash: entryPendingRecord(false).rebuild.candidate.contentHash, action: "edit", text: draftText });
  const outside = page.getByRole("button", { name: "Outside website control", exact: true }); await outside.focus(); const address = page.url();
  f.current(); const before = f.reads.length; await page.clock.runFor(60_000); await expect.poll(() => f.reads.length).toBe(before + 1);
  await coherent(page, f.parent, "Fictional bakery", "published"); await expect(draft).toHaveValue(draftText); await expect(outside).toBeFocused(); expect(page.url()).toBe(address);
  await f.loseWrite(); const reload = f.parent.getByRole("button", { name: "Reload current state", exact: true }); await expect(reload).toBeVisible();
  await expect(draft).toBeDisabled(); await expect(outside).toBeFocused(); await expect(f.parent.getByText("This exact preview is approved.", { exact: true })).toHaveCount(0);
  await expect(f.parent.getByText("This revision has been published.", { exact: true })).toHaveCount(0); await expect(f.parent.getByText("Check the current saved website before reviewing its approval or publication.", { exact: true })).toBeVisible();
  await expect(f.parent.getByRole("button", { name: "Publish approved website", exact: true })).toHaveCount(0);
  const after = f.reads.length; await page.clock.runFor(60_000); await expect.poll(() => f.reads.length).toBe(after + 1);
  await coherent(page, f.parent, "Fictional bakery", "published"); await expect(reload).toBeVisible(); await expect(draft).toHaveValue(draftText);
  await evidence(page, f.parent, info, "unconfirmed");
  f.failRead(true); const failed = f.reads.length; await reload.focus(); await page.keyboard.press("Enter");
  await expect(f.parent.getByRole("alert")).toContainText("current saved website could not be loaded"); await expect(reload).toBeFocused();
  expect(f.reads).toHaveLength(failed + 1); await expect(draft).toHaveValue(draftText); await expect(draft).toBeDisabled();
  f.failRead(false); f.holdRead(); const recovered = f.reads.length; await page.keyboard.press("Enter"); await expect.poll(() => f.reads.length).toBe(recovered + 1);
  await outside.focus(); await f.finishRead();
  await coherent(page, f.parent, "Fictional bakery current", "review"); await expect(outside).toBeFocused(); expect(page.url()).toBe(address);
  await expect(f.parent.getByText("Saved state refreshed. Review the current preview before continuing.", { exact: true })).toBeVisible();
  await expect(reload).toHaveCount(0); await expect(f.parent.getByText("This exact preview is approved.", { exact: true })).toHaveCount(0);
  await expect(page.frameLocator('iframe[title="Private website preview for Fictional bakery current"]').getByRole("heading", { name: "Fictional bakery current", exact: true })).toBeVisible();
  expect(entryPendingRecord(true).rebuild.revision).toBe(4); expect(entryPendingRecord(true).rebuild.candidate.revision).toBe(3); expect(entryPendingRecord(true).rebuild.approvedCandidateRevision).toBeNull();
  await evidence(page, f.parent, info, "reconciled"); await scope(info, f, 1);
});
