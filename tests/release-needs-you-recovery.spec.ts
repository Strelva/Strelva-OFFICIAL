import { expect, test, type Locator, type Page, type Request, type Route, type TestInfo } from "@playwright/test";
import { fictionalAsk, needsYouBrowserRead, workspaceId } from "./support/needs-you-browser-fixture";
import { reportBrowserOrigin } from "./support/website-report-browser-fixture";
import { assertReadableText } from "./support/assert-readable-text";
import { touchScreenshotCapture } from "./support/touch-screenshot-capture";

test.use({ hasTouch: true, trace: "on" });
async function fixture(page: Page, info: TestInfo, view: "home" | "needs-you", width: number) {
  const origin = reportBrowserOrigin(info.project.use.baseURL);
  const reads: string[] = [], requests: Request[] = [], writes: string[] = [], blocked: string[] = [], errors: string[] = [];
  let state: "partial" | "known" | "complete" = "partial", fail = false, hold = false, held: Route | undefined;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin !== origin) { blocked.push("foreign origin"); return route.abort(); }
    if (method !== "GET") { writes.push(`${method} ${url.pathname}`); return route.abort(); }
    if (url.pathname === "/api/workspace/needs-you") {
      expect([...url.searchParams]).toEqual([["workspaceId", workspaceId]]);
      expect(request.headers()["authorization"]).toBeUndefined(); expect(request.headers()["cookie"]).toBeUndefined();
      reads.push(url.pathname + url.search); requests.push(request);
      if (hold) { held = route; return; }
      return route.fulfill(fail ? { status: 503, json: { error: "Fictional discovery unavailable." } } : { json: needsYouBrowserRead(state) });
    }
    const ancillary: Record<string, string> = { "/api/workspace/site-summary": "workspaceId", "/api/workspace/owner-brand": "workspaceId", "/api/work-allowances": "workspaceId", "/api/service-requests": "businessId" };
    const query = ancillary[url.pathname];
    if (query) {
      expect([...url.searchParams]).toEqual([[query, workspaceId]]);
      return route.fulfill({ status: 503, json: { error: "Unrelated fictional read unavailable." } });
    }
    if (url.pathname.startsWith("/api/")) { blocked.push(`GET ${url.pathname}`); return route.abort(); }
    if (url.pathname.startsWith("/_next/") || url.pathname === "/favicon.ico" || url.pathname === "/preview/strelva/needs-you-recovery") return route.continue();
    blocked.push(`GET ${url.pathname}`); return route.abort();
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/preview/strelva/needs-you-recovery?view=${view}`);
  if (width === 320) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(page.getByText("Fictional decision recovery · no Auth, provider delivery or native proof", { exact: true })).toBeVisible();
  const queue = page.locator('section[aria-labelledby="home-attention"]');
  await expect(queue.getByText("Some decisions could not be checked.", { exact: false })).toBeVisible();
  // Development effect replay may abort exactly one initial read; phase stays partial until explicit intent.
  const initialReads = reads.length;
  expect(initialReads).toBeGreaterThanOrEqual(1); expect(initialReads).toBeLessThanOrEqual(2);
  expect(reads).toEqual(Array(initialReads).fill(`/api/workspace/needs-you?workspaceId=${workspaceId}`));
  await expect.poll(() => requests.map(request => request.failure()?.errorText ?? null)).toEqual(initialReads === 2 ? ["net::ERR_ABORTED", null] : [null]);
  return { queue, reads, requests, initialReads, writes, blocked, errors,
    fail(value: boolean) { fail = value; }, state(value: typeof state) { state = value; },
    hold() { hold = true; }, async finish() { await expect.poll(() => Boolean(held)).toBe(true); await held!.fulfill({ json: needsYouBrowserRead(state) }); held = undefined; hold = false; },
  };
}
async function notClear(page: Page) {
  await expect(page.getByText(/Nothing needs you|Nothing is waiting on you/)).toHaveCount(0);
  const nav = page.locator('a[href*="view=needs-you"]'); await expect(nav).toHaveCount(1); expect(await nav.getAttribute("aria-label")).toBeNull();
}
async function settledPaint(target: Locator) {
  await expect.poll(() => target.evaluate(node => {
    for (let parent: Element | null = node; parent; parent = parent.parentElement) if (Number(getComputedStyle(parent).opacity) !== 1) return false;
    return true;
  })).toBe(true);
}
async function evidence(page: Page, queue: Locator, info: TestInfo, label: string, view: "home" | "needs-you", screenshots: Awaited<ReturnType<typeof touchScreenshotCapture>>) {
  await settledPaint(queue);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const viewport = await page.evaluate(() => innerWidth);
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
  const owned = queue.locator("button:visible").or(page.getByRole("button", { name: "Outside decision control", exact: true }));
  const boxes = await owned.evaluateAll(nodes => nodes.map(node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }));
  for (const b of boxes) { expect(b.w).toBeGreaterThanOrEqual(44); expect(b.h).toBeGreaterThanOrEqual(44); expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(viewport + .5); }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!; expect(a.x + a.w <= b.x + .5 || b.x + b.w <= a.x + .5 || a.y + a.h <= b.y + .5 || b.y + b.h <= a.y + .5).toBe(true);
  }
  await assertReadableText(page.getByText("Fictional decision recovery · no Auth, provider delivery or native proof", { exact: true }), info, `${label}-fictional-boundary`);
  const status = queue.getByRole("status");
  if (await status.count()) await assertReadableText(status.first(), info, `${label}-discovery-message`);
  const heading = view === "home" ? queue.getByRole("heading", { name: /^Needs you/ }) : page.getByRole("heading", { level: 1, name: "Needs you", exact: true });
  await settledPaint(heading);
  await assertReadableText(heading, info, `${label}-heading`);
  await info.attach(`${label}-geometry`, { body: JSON.stringify({ boxes, viewportWidth: await page.evaluate(() => innerWidth), enlargedRootText: await page.evaluate(() => getComputedStyle(document.documentElement).fontSize) }), contentType: "application/json" });
  await queue.scrollIntoViewIfNeeded(); const path = info.outputPath(`${label}.png`); const capture = await screenshots.capture(path); await info.attach(`${label}-capture-device`, { body: JSON.stringify(capture), contentType: "application/json" }); await info.attach(label, { path, contentType: "image/png" });
}
for (const [view, width] of [["home", 390], ["needs-you", 320]] as const) {
  test(`real decision discovery recovers truthful ${view} at ${width}px${width === 320 ? " with enlarged text" : ""}`, async ({ page }, info) => {
    const f = await fixture(page, info, view, width), address = page.url();
    const screenshots = await touchScreenshotCapture(page);
    const retry = () => f.queue.getByRole("button", { name: "Check again", exact: true });
    const outside = page.getByRole("button", { name: "Outside decision control", exact: true });
    await notClear(page);
    if (view === "home") await expect(page.getByText("What Strelva did this week could not be loaded. Nothing about it changed.", { exact: true })).toBeVisible();
    await evidence(page, f.queue, info, "partial-empty", view, screenshots);
    f.fail(true); await retry().focus(); await page.keyboard.press("Enter");
    await expect(f.queue.getByRole("status")).toContainText("Your decisions could not be checked. Nothing about them changed.");
    await expect(retry()).toBeFocused(); expect(f.reads).toHaveLength(f.initialReads + 1); await notClear(page);
    await evidence(page, f.queue, info, "failed-retry", view, screenshots);
    f.fail(false); f.state("known"); f.hold(); await page.keyboard.press("Enter"); await expect.poll(() => f.reads.length).toBe(f.initialReads + 2);
    await outside.focus(); await f.finish();
    await expect(f.queue.getByText(fictionalAsk.title, { exact: true })).toBeVisible();
    await expect(f.queue.getByText("Complete fictional reply.", { exact: true })).toBeVisible();
    await expect(f.queue.getByRole("button", { name: `Approve: ${fictionalAsk.title}`, exact: true })).toBeEnabled();
    await expect(outside).toBeFocused(); await notClear(page);
    if (view === "home") await expect(page.getByText(/Nothing this week\. When Strelva changes/)).toBeVisible();
    await evidence(page, f.queue, info, "known-partial", view, screenshots);
    f.state("complete"); await retry().focus(); await page.keyboard.press("Enter");
    await expect(page.getByText(view === "home" ? "Nothing needs you right now." : "Nothing needs you.", { exact: true })).toBeVisible();
    const target = view === "home" ? f.queue.getByRole("heading", { name: "Needs you", exact: true }) : page.getByRole("heading", { level: 1, name: "Needs you", exact: true });
    await expect(target).toBeFocused(); await expect(retry()).toHaveCount(0); expect(f.reads).toHaveLength(f.initialReads + 3);
    if (view === "needs-you") await expect(page.getByText("Nothing is waiting on you.", { exact: true })).toBeVisible();
    await assertReadableText(page.getByText(view === "home" ? "Nothing needs you right now." : "Nothing needs you.", { exact: true }), info, "complete-empty-result");
    await evidence(page, f.queue, info, "complete-empty", view, screenshots);
    expect(f.requests.slice(f.initialReads).map(request => request.failure())).toEqual([null, null, null]);
    expect(page.url()).toBe(address); expect(f.writes).toEqual([]); expect(f.blocked).toEqual([]); expect(f.errors).toEqual([]);
    await info.attach("fictional-qualification", { body: JSON.stringify({ source: "actual BusinessHome/useNeedsYou default HTTP", exactWorkspaceGets: f.reads.length, initialDevelopmentReadFailures: f.requests.slice(0, f.initialReads).map(request => request.failure()?.errorText ?? null), httpWrites: f.writes.length, noForcedNavigation: page.url() === address, nativeQualified: false, deliveryQualified: false, providerQualified: false }), contentType: "application/json" });
  });
}
