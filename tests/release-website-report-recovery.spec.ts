import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import { at, routingOptions, routingRecord, workId, workspaceId } from "./support/website-routing-browser-fixture";
import { reportBrowserFixture, reportBrowserOrigin } from "./support/website-report-browser-fixture";

test.use({ hasTouch: true, trace: "on" });

async function fixture(page: Page, info: TestInfo, width: number, enlarged: boolean) {
  const origin = reportBrowserOrigin(info.project.use.baseURL), endpoint = `/api/websites/${workId}`, record = routingRecord();
  const reads: string[] = [], blocked: string[] = [], errors: string[] = [];
  let response: "wrong-period" | "malformed" | "valid" = "wrong-period", pending: Route | undefined, hold = false;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin || request.method() !== "GET") { blocked.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
    const currentQuery = () => expect([...url.searchParams]).toEqual([["workspaceId", workspaceId]]);
    if (url.pathname === `${endpoint}/report`) {
      expect([...url.searchParams.keys()]).toEqual(["month"]);
      const month = url.searchParams.get("month")!; expect(month).toMatch(/^\d{4}-\d{2}$/); reads.push(url.pathname + url.search);
      if (hold) { pending = route; return; }
      const value = reportBrowserFixture(month);
      return route.fulfill({ json: response === "wrong-period" ? { ...value, month: "1900-01", inquiries: { ...value.inquiries, count: 999 } } : response === "malformed" ? { ...value, inquiries: { ...value.inquiries, count: { invalid: true } } } : value });
    }
    if (url.pathname === `${endpoint}/rebuild`) { currentQuery(); return route.fulfill({ json: record }); }
    if (url.pathname === `${endpoint}/history`) { currentQuery(); return route.fulfill({ json: { revisions: [] } }); }
    if (url.pathname === `${endpoint}/domain`) { currentQuery(); return route.fulfill({ json: { domain: { hostname: "published.example.test", status: "verified", checkedAt: at, records: [] } } }); }
    if (url.pathname === `${endpoint}/connections` && !url.search) return route.fulfill({ json: routingOptions });
    if (url.pathname === `${endpoint}/preview` && !url.search) return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="strelva-site-hash" content="${record.rebuild.candidate.contentHash}"></head><body><h1>Fictional private website</h1><p>No provider or publication is invoked.</p></body></html>` });
    if (url.pathname.startsWith("/api/")) { blocked.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/preview/strelva/website-routing-recovery?mode=domain");
  if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(page.getByText("Fictional routing recovery · no DNS, Auth, provider or publication proof", { exact: true })).toBeVisible();
  const report = page.getByRole("region", { name: "Monthly website report", exact: true });
  return { report, reads, blocked, errors,
    respond(value: typeof response, deferred = false) { response = value; hold = deferred; },
    async complete(month: string) { await expect.poll(() => Boolean(pending)).toBe(true); await pending!.fulfill({ json: reportBrowserFixture(month) }); pending = undefined; hold = false; },
  };
}

async function geometry(page: Page, report: Locator) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const box of await report.locator("input:visible, button:visible").evaluateAll(controls => controls.map(control => {
    const rect = control.getBoundingClientRect(); return { width: rect.width, height: rect.height };
  }))) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
}

for (const [width, enlarged] of [[390, false], [320, true]] as const) test.describe(`report recovery at ${width}px`, () => {
  test(`rejects wrong-period and malformed reports, then reads the selected month${enlarged ? " with enlarged text" : ""}`, async ({ page }, info) => {
    const f = await fixture(page, info, width, enlarged), input = f.report.getByLabel("Reporting month", { exact: true }), heading = f.report.getByRole("heading", { name: "Monthly website report", exact: true });
    const firstMonth = await input.inputValue();
    const assertPeriod = async (month: string) => {
      const helper = f.report.getByText(`Selected month: ${month}`, { exact: true });
      await expect(helper).toBeVisible(); expect(await input.getAttribute("aria-describedby")).toBe(await helper.getAttribute("id")); await expect(input).toHaveValue(month); await expect(input).toHaveAttribute("type", "month");
      const box = await helper.evaluate(element => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, viewport: innerWidth, scroll: element.scrollWidth, client: element.clientWidth, font: parseFloat(getComputedStyle(element).fontSize) }; });
      expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(box.viewport + 0.5); expect(box.scroll).toBeLessThanOrEqual(box.client);
      if (enlarged) expect(box.font).toBeGreaterThanOrEqual(24);
    };
    const refused = async () => {
      await expect(f.report.getByRole("alert")).toContainText("The monthly report could not be confirmed for this website and month. Try loading it again.");
      await expect(f.report.locator("dl")).toHaveCount(0); await expect(f.report).not.toContainText("999"); expect(f.errors).toEqual([]); await geometry(page, f.report);
    };
    await assertPeriod(firstMonth); await refused();
    await page.screenshot({ path: info.outputPath("report-wrong-period.png"), fullPage: true });
    f.respond("valid", true);
    const retry = f.report.getByRole("button", { name: "Try loading report again", exact: true }); await retry.focus(); await page.keyboard.press("Enter");
    await expect(heading).toBeFocused(); await expect(f.report.getByRole("status")).toContainText("Loading recorded website activity");
    await f.complete(firstMonth); await expect(heading).toBeFocused(); await expect(f.report.locator("dt").filter({ hasText: /^Inquiries$/ }).locator("..").locator("dd")).toHaveText("17");
    expect(f.reads).toHaveLength(2); expect(f.reads[1]).toBe(f.reads[0]);
    const changedMonth = firstMonth === "2026-09" ? "2026-08" : "2026-09";
    f.respond("malformed"); await input.focus(); await input.fill(changedMonth); await refused(); await expect(input).toBeFocused(); await assertPeriod(changedMonth);
    await page.screenshot({ path: info.outputPath("report-malformed-fields.png"), fullPage: true });
    f.respond("valid", true); await retry.focus(); await page.keyboard.press("Enter"); await expect(heading).toBeFocused();
    const outside = page.getByRole("button", { name: "Outside website control", exact: true }); await outside.focus();
    await f.complete(changedMonth); await expect(outside).toBeFocused(); await expect(f.report.getByRole("alert")).toHaveCount(0);
    await expect(f.report.locator("dt").filter({ hasText: /^Inquiries$/ }).locator("..").locator("dd")).toHaveText("17"); await assertPeriod(changedMonth); await geometry(page, f.report);
    expect(f.reads).toHaveLength(4); expect(f.reads[3]).toBe(f.reads[2]); expect(new URL(f.reads[2]!, "http://localhost").searchParams.get("month")).toBe(changedMonth);
    expect(f.blocked).toEqual([]); expect(f.errors).toEqual([]);
    await page.screenshot({ path: info.outputPath("report-selected-month-recovered.png"), fullPage: true });
    await info.attach("fictional-report-scope", { body: JSON.stringify({ width, enlarged, exactSelectedMonthReads: f.reads, blockedRequests: f.blocked, uncaughtPageErrors: f.errors, httpMutations: 0, nativeAuthQualified: false, providerQualified: false, reportMeasurementsQualified: false, publicationQualified: false }), contentType: "application/json" });
  });
});
