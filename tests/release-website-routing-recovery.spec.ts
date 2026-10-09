import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import { domainReceipt, draftText, factText, routingOptions, routingRecord, undoReceipt, workId, workspaceId } from "./support/website-routing-browser-fixture";

function loopback(info: TestInfo) {
  const base = info.project.use.baseURL;
  if (!base) throw new Error("An explicit loopback baseURL is required.");
  const url = new URL(base);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("A credential-free HTTP loopback origin is required.");
  return url.origin;
}

async function fixture(page: Page, info: TestInfo, mode: "domain" | "undo", width: number, enlarged: boolean) {
  const origin = loopback(info), endpoint = `/api/websites/${workId}`, record = routingRecord();
  const writes: { path: string; body: string }[] = [], reads: string[] = [], blocked: string[] = [];
  let held: Route | undefined, failCurrentRead = false, failDomainRead = false, domainReadFailureStatus = 503, currentPublished = true;
  const currentQuery = (url: URL) => expect([...url.searchParams]).toEqual([["workspaceId", workspaceId]]);
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.origin !== origin) { blocked.push(url.origin); return route.abort(); }
    if (url.pathname === `${endpoint}/domain/request`) {
      if (method === "POST" && !url.search) { writes.push({ path: url.pathname, body: request.postData() ?? "" }); held = route; return; }
      if (method === "GET") {
        const command = JSON.parse(writes.find(item => item.path === url.pathname)!.body);
        expect([...url.searchParams]).toEqual([["requestId", command.requestId], ["workspaceId", workspaceId]]);
        reads.push(url.pathname + url.search);
        return failDomainRead ? route.fulfill({ status: domainReadFailureStatus, json: { error: "Fictional exact domain read unavailable." } }) : route.fulfill({ json: { request: domainReceipt(command.requestId, command.domain.toLowerCase(), currentPublished) } });
      }
    }
    if (url.pathname === `${endpoint}/cutover-undo` && method === "POST" && !url.search) {
      writes.push({ path: url.pathname, body: request.postData() ?? "" });
      if (writes.filter(item => item.path === url.pathname).length === 1) { held = route; return; }
      return route.fulfill({ json: { receipt: undoReceipt(JSON.parse(request.postData()!)) } });
    }
    if (method === "GET" && url.pathname === `${endpoint}/rebuild`) {
      currentQuery(url); reads.push(url.pathname + url.search);
      return failCurrentRead ? route.fulfill({ status: 503, json: { error: "Fictional saved state unavailable." } }) : route.fulfill({ json: routingRecord(currentPublished) });
    }
    if (method === "GET" && url.pathname === `${endpoint}/domain`) { currentQuery(url); return route.fulfill({ json: { domain: { hostname: "published.example.test", status: "verified", checkedAt: "2026-10-09T00:00:00Z", records: [] } } }); }
    if (method === "GET" && url.pathname === `${endpoint}/history`) { currentQuery(url); return route.fulfill({ json: { revisions: [{ revision: 2, contentHash: record.rebuild.candidate.contentHash, createdAt: "2026-10-09T00:00:00Z", published: true }] } }); }
    if (method === "GET" && url.pathname === `${endpoint}/connections` && !url.search) return route.fulfill({ json: routingOptions });
    if (method === "GET" && url.pathname === `${endpoint}/report`) {
      expect([...url.searchParams.keys()]).toEqual(["month"]);
      expect(url.searchParams.get("month")).toMatch(/^\d{4}-\d{2}$/);
      return route.fulfill({ json: { inquiries: { count: null }, bookings: { scheduledInPeriod: null, providerVerified: null }, visibility: { status: "unavailable", note: "Fictional interface has no provider measurements." }, readiness: { status: "unavailable" }, changes: [] } });
    }
    if (method === "GET" && url.pathname === `${endpoint}/preview` && !url.search) return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><meta name="strelva-site-hash" content="${record.rebuild.candidate.contentHash}"></head><body><h1>Fictional private website</h1><p>No routing or provider is invoked.</p></body></html>` });
    if (url.pathname.startsWith("/api/")) { blocked.push(`${method} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/preview/strelva/website-routing-recovery?mode=${mode}`);
  if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const parent = page.getByRole("region", { name: "Website rebuild", exact: true });
  await expect(parent.getByRole("heading", { name: "Fictional bakery", exact: true })).toBeVisible();
  await expect(page.locator("#rebuild-domain-heading")).toBeVisible();
  return { parent, writes, reads, blocked,
    failCurrentRead(value: boolean) { failCurrentRead = value; }, failDomainRead(value: boolean, status = 503) { failDomainRead = value; domainReadFailureStatus = status; }, removePublication() { currentPublished = false; },
    async complete(outcome: "lost" | "malformed" | "valid") {
      await expect.poll(() => Boolean(held)).toBe(true);
      const command = JSON.parse(writes.at(-1)!.body);
      if (outcome === "lost") return held!.abort("failed");
      if (mode === "domain") return held!.fulfill({ json: { ...domainReceipt(command.requestId, command.domain.toLowerCase()), ...(outcome === "malformed" ? { hostname: "different.example.test" } : {}) } });
      return held!.fulfill({ json: { receipt: { ...undoReceipt(command), ...(outcome === "malformed" ? { contentHash: "c".repeat(64) } : {}) } } });
    },
  };
}

async function geometry(page: Page, parent: Locator, width: number) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width >= 768) return;
  const boxes = await parent.locator("button:visible, select:visible, textarea:visible, input:not([type=checkbox]):visible, label:has(input[type=checkbox]):visible").evaluateAll(controls => controls.map(control => {
    const box = control.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) { expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44); }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    expect(a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5).toBe(true);
  }
}
async function scope(info: TestInfo, blocked: string[], writes: { path: string; body: string }[], expectedWrites: number) {
  expect(blocked).toEqual([]); expect(writes).toHaveLength(expectedWrites);
  await info.attach("fictional-routing-scope", { body: JSON.stringify({ blockedRequests: blocked, explicitHttpWrites: writes.length, nativeAuthQualified: false, DNSQualified: false, routingQualified: false, providerQualified: false, publicationQualified: false }), contentType: "application/json" });
}

for (const [width, enlarged] of [[1440, false], [390, false], [320, true]] as const) test.describe(`routing recovery at ${width}px`, () => {
  test.use({ hasTouch: width < 768 });
  for (const outcome of ["lost", "malformed"] as const) {
    test(`domain ${outcome} acknowledgement uses only exact GET recovery${enlarged ? " with enlarged text" : ""}`, async ({ page }, info) => {
      const f = await fixture(page, info, "domain", width, enlarged);
      const domain = page.getByRole("region", { name: "Owner domain request", exact: true }), input = domain.getByLabel("Domain to request", { exact: true });
      await input.fill("bakery.example.test"); await geometry(page, f.parent, width);
      const submit = domain.getByRole("button", { name: "Ask owner to approve domain", exact: true }); await submit.focus();
      await domain.locator("form").evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
      await expect.poll(() => f.writes.length).toBe(1); await expect(input).toBeDisabled();
      const command = JSON.parse(f.writes[0]!.body); expect(command.domain).toBe("bakery.example.test"); expect(command.requestId).toMatch(/^[0-9a-f-]{36}$/);
      const outside = page.getByRole("button", { name: "Outside website control", exact: true });
      if (outcome === "malformed") await outside.focus();
      await f.complete(outcome);
      const check = domain.getByRole("button", { name: "Check saved domain request", exact: true });
      await expect(check).toBeVisible(); await expect(input).toHaveValue(command.domain);
      await expect(input).toHaveAttribute("readonly", ""); await expect(submit).toBeDisabled();
      if (outcome === "malformed") await expect(outside).toBeFocused(); else await expect(check).toBeFocused();
      await input.focus(); await page.keyboard.type("-changed"); await expect(input).toHaveValue(command.domain);
      f.failDomainRead(true); const before = f.reads.length; await check.focus(); await page.keyboard.press("Enter");
      await expect(domain.getByRole("alert")).toContainText("exact saved request"); await expect(check).toBeFocused(); expect(f.reads).toHaveLength(before + 1); expect(f.writes).toHaveLength(1);
      await geometry(page, f.parent, width); await page.screenshot({ path: info.outputPath("domain-unconfirmed.png"), fullPage: true });
      f.failDomainRead(false); await page.keyboard.press("Enter");
      await expect(domain.getByRole("status")).toContainText("Domain setup waits for their approval"); await expect(domain.getByRole("status")).toBeFocused();
      await expect(domain.getByRole("button", { name: "Prepare another domain request", exact: true })).toBeEnabled(); expect(f.reads).toHaveLength(before + 2);
      await geometry(page, f.parent, width); await scope(info, f.blocked, f.writes, 1);
    });
    test(`cutover ${outcome} receipt requires exact POST check then fresh current read${enlarged ? " with enlarged text" : ""}`, async ({ page }, info) => {
      const f = await fixture(page, info, "undo", width, enlarged);
      await page.getByText("Edit website facts", { exact: true }).click();
      const fact = page.getByRole("article", { name: factText, exact: true }); await fact.getByRole("button", { name: "Edit fact", exact: true }).click();
      const draft = fact.getByLabel("Corrected fact", { exact: true }); await draft.fill(draftText);
      const forms = page.getByRole("region", { name: "Website visitor forms", exact: true }); await forms.getByRole("button", { name: "Choose forms", exact: true }).click();
      await forms.getByLabel("Inquiry form", { exact: true }).selectOption("catering");
      const update = forms.getByRole("button", { name: "Update website preview", exact: true }); await expect(update).toBeEnabled();
      const undo = page.getByRole("region", { name: "Return to the previous website", exact: true });
      for (const input of await undo.getByRole("checkbox").all()) await input.check();
      await geometry(page, f.parent, width); await undo.getByRole("button", { name: "Restore previous website", exact: true }).focus();
      await page.evaluate(() => {
        const undoForm = document.querySelector<HTMLFormElement>('section[aria-labelledby="cutover-undo-heading"] form')!;
        undoForm.requestSubmit(); undoForm.requestSubmit();
        document.querySelector<HTMLFormElement>('article form')!.requestSubmit();
        [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Update website preview")!.click();
      });
      await expect.poll(() => f.writes.length).toBe(1); await expect(draft).toBeDisabled(); await expect(update).toBeDisabled();
      const command = JSON.parse(f.writes[0]!.body); expect(command).toEqual({ workspaceId, tenantId: "fictional-bakery", candidateRevision: 2, candidateContentHash: routingRecord().rebuild.candidate.contentHash, commandId: expect.stringMatching(/^[0-9a-f-]{36}$/), domainRestored: true, fallbackVerified: true });
      const outside = page.getByRole("button", { name: "Outside website control", exact: true }); if (outcome === "malformed") await outside.focus();
      await f.complete(outcome);
      const check = undo.getByRole("button", { name: "Check this undo command", exact: true }); await expect(check).toBeVisible();
      if (outcome === "malformed") await expect(outside).toBeFocused(); else await expect(check).toBeFocused();
      await expect(undo).toContainText("Otherwise, it finishes the same routing undo; no new command is created. Strelva does not restore DNS here.");
      await expect(draft).toHaveValue(draftText); await expect(draft).toBeDisabled(); await expect(page.locator("#rebuild-domain-heading")).toHaveCount(0);
      const before = f.reads.length; await page.getByRole("button", { name: "Reload saved preview and history", exact: true }).click();
      expect(f.reads).toHaveLength(before + 1); await expect(draft).toBeDisabled(); await expect(check).toBeVisible();
      await expect(f.parent).toContainText("still needs its exact command receipt"); expect(f.writes).toHaveLength(1);
      await check.focus(); await page.keyboard.press("Enter");
      await expect(undo.getByRole("status")).toContainText("undo receipt for website version 2 is saved"); await expect(undo.getByRole("status")).toBeFocused();
      expect(f.writes).toHaveLength(2); expect(f.writes[1]).toEqual(f.writes[0]);
      const reload = page.getByRole("button", { name: "Reload current state", exact: true }); await expect(reload).toBeVisible(); await expect(draft).toBeDisabled();
      f.failCurrentRead(true); await reload.focus(); await page.keyboard.press("Enter");
      await expect(f.parent.getByRole("alert").filter({ hasText: "The current saved website could not be loaded" })).toBeVisible(); await expect(reload).toBeFocused();
      await expect(draft).toBeDisabled(); await expect(draft).toHaveValue(draftText); await expect(page.locator("#rebuild-domain-heading")).toHaveCount(0);
      await geometry(page, f.parent, width); await page.screenshot({ path: info.outputPath("undo-confirmed-read-unavailable.png"), fullPage: true });
      f.failCurrentRead(false); await page.keyboard.press("Enter");
      await expect(reload).toHaveCount(0); await expect(draft).toBeEnabled(); await expect(draft).toHaveValue(draftText);
      await expect(fact.getByRole("button", { name: "Save correction", exact: true })).toBeEnabled();
      await expect(f.parent).toContainText("their earlier publication receipt does not describe the current routing"); await expect(f.parent.getByRole("heading", { name: "Saved preview and publication history", exact: true })).toBeVisible(); await expect(f.parent).toContainText("Earlier publication receipt retained. The previous website is restored."); await expect(f.parent).not.toContainText("This revision has been published."); await expect(page.locator("#rebuild-domain-heading")).toHaveCount(0);
      await geometry(page, f.parent, width); await page.screenshot({ path: info.outputPath("undo-reconciled-draft.png"), fullPage: true }); await scope(info, f.blocked, f.writes, 2);
    });
  }
});

test.describe("reverse operator admission", () => {
  test.use({ hasTouch: true });
  test("pending domain command survives role loss and blocks a newly exposed undo until exact GET recovery", async ({ page }, info) => {
    const f = await fixture(page, info, "domain", 390, false);
    const domain = page.getByRole("region", { name: "Owner domain request", exact: true });
    await domain.getByLabel("Domain to request", { exact: true }).fill("bakery.example.test");
    await domain.getByRole("button", { name: "Ask owner to approve domain", exact: true }).click(); await expect.poll(() => f.writes.length).toBe(1);
    await page.getByRole("button", { name: "Remove fictional operator access", exact: true }).click();
    const undo = page.getByRole("region", { name: "Return to the previous website", exact: true }); await expect(undo).toBeVisible();
    for (const checkbox of await undo.getByRole("checkbox").all()) await expect(checkbox).toBeDisabled();
    await undo.locator("form").evaluate(form => (form as HTMLFormElement).requestSubmit());
    const outside = page.getByRole("button", { name: "Outside website control", exact: true }); await outside.focus();
    await f.complete("valid");
    const check = page.getByRole("button", { name: "Check saved domain request", exact: true }); await expect(check).toBeVisible(); await expect(outside).toBeFocused();
    expect(f.writes).toHaveLength(1); await expect(undo.getByRole("button", { name: "Restore previous website", exact: true })).toBeDisabled();
    f.removePublication(); const before = f.reads.length; await page.getByRole("button", { name: "Reload saved preview and history", exact: true }).click();
    expect(f.reads).toHaveLength(before + 1); await expect(check).toBeVisible();
    await expect(f.parent).toContainText("domain request still needs its exact saved request checked");
    await expect(undo).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve this preview", exact: true })).toBeDisabled(); expect(f.writes).toHaveLength(1);
    f.failDomainRead(true, 403); await check.focus(); await page.keyboard.press("Enter");
    await expect(domain.getByRole("alert")).toContainText("exact saved request"); await expect(check).toBeFocused();
    await expect(page.getByRole("button", { name: "Approve this preview", exact: true })).toBeDisabled(); expect(f.writes).toHaveLength(1);
    f.failDomainRead(false); await page.keyboard.press("Enter"); await expect(domain.getByRole("status")).toContainText("This request is no longer current");
    await page.getByRole("button", { name: "Restore fictional operator access", exact: true }).click();
    await expect(domain.getByLabel("Domain to request", { exact: true })).toHaveValue("bakery.example.test");
    await expect(domain.getByRole("button", { name: "Prepare another domain request", exact: true })).toBeDisabled();
    await geometry(page, f.parent, 390); await page.screenshot({ path: info.outputPath("domain-role-recovery.png"), fullPage: true }); await scope(info, f.blocked, f.writes, 1);
  });
});
