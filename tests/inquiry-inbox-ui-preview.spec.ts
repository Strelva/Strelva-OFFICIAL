import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires isolated interface fixtures.");
const path = "/preview/strelva/places?place=leads&held=1&reply=1";

// Real components, fictional records and intercepted mutation responses only.
// Delivery, native authentication and SQL decisions need separate native proof.
function fixtureOrigin(info: TestInfo): string {
  const baseURL = info.project.use.baseURL;
  if (!baseURL) throw new Error("This fixture needs an explicit loopback baseURL.");
  const url = new URL(baseURL);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("This fixture needs a credential-free HTTP loopback origin.");
  return url.origin;
}

const scopes = new WeakMap<Page, { origin: string; blocked: string[] }>();
test.use({ trace: "on", serviceWorkers: "block" });
test.beforeEach(async ({ page }, info) => {
  const scope = { origin: fixtureOrigin(info), blocked: [] as string[] };
  scopes.set(page, scope);
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === scope.origin) return route.continue();
    scope.blocked.push(url.origin);
    return route.abort();
  });
});
test.afterEach(async ({ page }, info) => {
  const scope = scopes.get(page);
  await info.attach("fictional-inquiry-ui-scope", {
    body: JSON.stringify({ origin: scope?.origin, externalRequestsBlocked: scope?.blocked, viewport: page.viewportSize(), fictionalRecords: true, visibleFictionBanner: await page.getByRole("note").filter({ hasText: "Local rehearsal · fictional bakery records." }).isVisible().catch(() => false), deliveryQualified: false, nativeAuthQualified: false, sqlDecisionQualified: false }),
    contentType: "application/json",
  });
});

async function actionBox(control: Locator, coarse: boolean) {
  await expect(control).toBeVisible();
  if (!coarse) return;
  const box = await control.boundingBox();
  expect(box, "Owned action has a physical touch box").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function reflow(page: Page) {
  try {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    // Bounded measurements explain the actual rendered failure without relaxing
    // the reflow gate. This suite renders only its visibly fictional records.
    const measurement = await page.evaluate(() => {
      const geometry = (element: Element) => {
        const box = element.getBoundingClientRect(), style = getComputedStyle(element);
        return {
          tag: element.tagName, name: element.getAttribute("aria-label"),
          className: element.getAttribute("class"),
          left: box.left, right: box.right, width: box.width,
          scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
          scrollLeft: element.scrollLeft, scrollTop: element.scrollTop,
          display: style.display, position: style.position, fontSize: style.fontSize,
          flexShrink: style.flexShrink, minWidth: style.minWidth, maxWidth: style.maxWidth,
          whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap,
          overflowX: style.overflowX, transform: style.transform,
        };
      };
      const nodes: Element[] = Array.from(document.querySelectorAll("body *"));
      // Development chrome may use a shadow root. Measure it rather than
      // suppressing it or excluding its contribution to document scroll width.
      for (let index = 0; index < nodes.length && index < 1000; index++) {
        const shadow = nodes[index]?.shadowRoot;
        if (shadow) nodes.push(...Array.from(shadow.querySelectorAll("*")));
      }
      const details = nodes.slice(0, 1000)
        .filter(element => !["SCRIPT", "STYLE", "SVG", "PATH"].includes(element.tagName))
        .map(element => {
          const text = Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()).slice(0, 8).map(node => {
            const range = document.createRange(); range.selectNodeContents(node);
            return { text: node.textContent?.trim().slice(0, 120), boxes: Array.from(range.getClientRects()).slice(0, 8).map(box => ({ left: box.left, right: box.right, width: box.width })) };
          });
          const pseudo = ["::before", "::after"].map(name => {
            const style = getComputedStyle(element, name);
            return { name, content: style.content.slice(0, 120), display: style.display, position: style.position, width: style.width, left: style.left, right: style.right, transform: style.transform, overflowX: style.overflowX };
          }).filter(item => !["none", "normal"].includes(item.content) && item.display !== "none");
          return { ...geometry(element), text, pseudo };
        });
      return {
        viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
        rootFontSize: getComputedStyle(document.documentElement).fontSize,
        scrollX, scrollY, root: geometry(document.documentElement), body: geometry(document.body),
        scrollingElement: document.scrollingElement ? geometry(document.scrollingElement) : null,
        examined: Math.min(nodes.length, 1000),
        overflowing: details.filter(element => element.width > 0 && (element.right > innerWidth + 0.5 || element.left < -0.5)).sort((a, b) => b.right - a.right).slice(0, 40),
        intrinsicOverflow: details.filter(element => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1).slice(0, 40),
        textOverflow: details.filter(element => element.text.some(text => text.boxes.some(box => box.right > innerWidth + 0.5 || box.left < -0.5))).slice(0, 40),
        pseudoElements: details.filter(element => element.pseudo.length).slice(0, 40),
      };
    });
    await test.info().attach("fictional-inquiry-reflow", { body: JSON.stringify(measurement), contentType: "application/json" });
  }
}

async function openFixture(page: Page, width: number, enlarged: boolean) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(path);
  await expect(page.getByRole("note")).toHaveText("Local rehearsal · fictional bakery records. This page is not proof of email delivery or saved inquiry decisions.");
  await expect(page.getByRole("heading", { name: "Juniper Bakery", exact: true })).toBeVisible();
  await expect(page.getByText("Strelva kept these out of your inbox. If one is a real person, release it. Nobody is emailed either way.", { exact: true })).toBeVisible();
  if (enlarged) {
    const original = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(original * 2);
  }
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(width < 768);
  await reflow(page);
}

test("owner sees the exact recipient and message, then one truthful provider receipt", async ({ page }, info) => {
  const requests: Record<string, unknown>[] = [];
  await page.route(`${fixtureOrigin(info)}/api/workspace/inquiries/reply`, async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { outcome: { status: "accepted", providerMessageId: "fixture-provider-1", acceptedAt: "2026-10-07T12:00:00Z", retryable: false } } });
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Reply to Priya S." }).click();
  await expect(page.getByText("To priya@example.test", { exact: true })).toBeVisible();
  await page.getByLabel("Your reply to Priya S.").fill("We can prepare the cake for $80. Please confirm pickup.");
  await page.getByRole("button", { name: "Approve and send reply" }).click();
  await expect(page.getByRole("status")).toContainText("Sent. Delivery isn't confirmed yet.");
  await expect(page.getByText("Provider receipt: fixture-provider-1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve and send reply" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ rowId: "5e000000-0000-4000-8000-0000000000d4", body: "We can prepare the cake for $80. Please confirm pickup." });
  expect(requests[0]).not.toHaveProperty("to");
});

test("uncertain response retains the exact immutable draft and rechecks the same claim", async ({ page }, info) => {
  const requests: Record<string, unknown>[] = [];
  await page.route(`${fixtureOrigin(info)}/api/workspace/inquiries/reply`, async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill(requests.length === 1 ? { status: 503, json: { error: "Receipt unavailable" } }
      : { json: { outcome: { status: "unknown", providerMessageId: null, acceptedAt: null, retryable: false } } });
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Reply to Priya S." }).click();
  await page.getByLabel("Your reply to Priya S.").fill("Can you confirm your pickup time?");
  await page.getByRole("button", { name: "Approve and send reply" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Receipt unavailable");
  await expect(page.getByLabel("Your reply to Priya S.")).toBeDisabled();
  await page.getByRole("button", { name: "Check this reply" }).click();
  await expect(page.getByRole("status")).toContainText("send couldn't be confirmed");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
});

test("held review reports a refusal without removing evidence", async ({ page }, info) => {
  await page.route(`${fixtureOrigin(info)}/api/workspace/inquiries/held`, route => route.fulfill({ status: 409, json: { error: "This message changed. Reload it." } }));
  await page.goto(path);
  await page.getByRole("button", { name: "Release the message from Ana", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("changed");
  await expect(page.getByRole("article", { name: "Ana", exact: true })).toBeVisible();
});

for (const state of ["empty", "permission", "error"] as const) {
  test(`${state} does not offer a reply or invent a record`, async ({ page }) => {
    await page.goto(`${path}&state=${state}`);
    await expect(page.getByRole("button", { name: /Reply to/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Priya S." })).toHaveCount(0);
    await expect(page.getByRole("main")).toBeVisible();
  });
}

test("narrow inbox and keyboard reply stay inside the viewport", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  await page.getByRole("button", { name: "Reply to Priya S." }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Your reply to Priya S.").fill("Please confirm the details.");
  await expect(page.getByLabel("Your reply to Priya S.")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("w6-inquiry-reply-mobile.png"), fullPage: true });
});


for (const [width, enlarged] of [[1440, false], [390, false], [320, true]] as const) {
  test.describe(`fictional inquiry recovery at ${width}px${enlarged ? " with 200% text" : ""}`, () => {
    test.use({ hasTouch: width < 768 });

    test("keyboard reply keeps one exact attempt through lost and invalid receipts without stealing outside focus", async ({ page }, info) => {
      const requests: string[] = [];
      let releaseCheck = () => {};
      const pendingCheck = new Promise<void>(resolve => { releaseCheck = resolve; });
      await page.route(`${fixtureOrigin(info)}/api/workspace/inquiries/reply`, async route => {
        expect(route.request().method()).toBe("POST");
        requests.push(route.request().postData()!);
        if (requests.length === 1) return route.abort("failed");
        if (requests.length === 2) return route.fulfill({ json: { outcome: { status: "accepted" } } }); // Missing the existing acknowledgement fields.
        if (requests.length === 3) {
          await pendingCheck;
          return route.fulfill({ status: 503, json: { error: "Fixture receipt still unavailable" } });
        }
        return route.fulfill({ json: { outcome: { status: "unknown", providerMessageId: null, acceptedAt: null, retryable: false } } });
      });
      try {
        await openFixture(page, width, enlarged);
        const article = page.getByRole("article", { name: "Priya S.", exact: true });
        const opener = article.getByRole("button", { name: "Reply to Priya S.", exact: true });
        await actionBox(opener, width < 768);
        await opener.focus(); await page.keyboard.press("Enter");
        const subject = article.getByLabel("Subject", { exact: true });
        const body = article.getByLabel("Your reply to Priya S.", { exact: true });
        await expect(subject).toBeFocused();
        const words = "Can you confirm the pickup details? This is a fictional private draft.";
        await subject.fill("Fictional pickup inquiry");
        await page.keyboard.press("Tab"); await expect(body).toBeFocused();
        await body.fill(words);
        const send = article.getByRole("button", { name: "Approve and send reply", exact: true });
        await actionBox(send, width < 768);
        await actionBox(article.getByRole("button", { name: "Close draft", exact: true }), width < 768);
        await page.keyboard.press("Tab"); await expect(send).toBeFocused();
        await page.keyboard.press("Enter");
        const check = article.getByRole("button", { name: "Check this reply", exact: true });
        await expect(article.getByRole("alert")).toContainText("couldn't be confirmed");
        await expect(check).toBeFocused();
        await expect(subject).toBeDisabled(); await expect(body).toBeDisabled();
        await expect(subject).toHaveValue("Fictional pickup inquiry"); await expect(body).toHaveValue(words);
        await expect(article.getByRole("button", { name: "Close draft", exact: true })).toHaveCount(0);
        expect(requests).toHaveLength(1);
        const attempt = JSON.parse(requests[0]!);
        expect(attempt).toMatchObject({ workspaceId: "5e000000-0000-4000-8000-000000000010", rowId: "5e000000-0000-4000-8000-0000000000d4", subject: "Fictional pickup inquiry", body: words });
        expect(attempt.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(attempt).not.toHaveProperty("to");
        await actionBox(check, width < 768); await reflow(page);
        await page.screenshot({ path: info.outputPath("reply-lost-response.png"), fullPage: true });

        await page.keyboard.press("Enter");
        await expect.poll(() => requests.length).toBe(2);
        await expect(check).toBeEnabled(); await expect(check).toBeFocused();
        await expect(article.getByRole("status")).toHaveCount(0);
        expect(requests[1]).toBe(requests[0]);
        await reflow(page);
        await page.screenshot({ path: info.outputPath("reply-invalid-ack.png"), fullPage: true });

        await page.keyboard.press("Enter");
        await expect.poll(() => requests.length).toBe(3);
        await expect(check).toBeDisabled();
        const outside = page.getByRole("button", { name: "Release the message from Ana", exact: true });
        await outside.focus(); await page.keyboard.press("Tab");
        const outsideDestination = page.getByRole("button", { name: "Confirm the message from Ana is spam", exact: true });
        await expect(outsideDestination).toBeFocused();
        releaseCheck();
        await expect(article.getByRole("alert")).toContainText("Fixture receipt still unavailable");
        await expect(check).toBeEnabled(); await expect(outsideDestination).toBeFocused();
        await expect(subject).toHaveValue(attempt.subject); await expect(body).toHaveValue(attempt.body);
        expect(requests[2]).toBe(requests[0]);
        await page.screenshot({ path: info.outputPath("reply-outside-focus-preserved.png"), fullPage: true });

        await check.focus(); await page.keyboard.press("Enter");
        const receipt = article.getByRole("status");
        await expect(receipt).toContainText("send couldn't be confirmed"); await expect(receipt).toBeFocused();
        await expect(check).toHaveCount(0);
        expect(requests).toHaveLength(4);
        expect(requests.every(request => request === requests[0])).toBe(true);
        await reflow(page);
        await page.screenshot({ path: info.outputPath("reply-authoritative-unknown-receipt.png"), fullPage: true });
      } finally { releaseCheck(); }
    });

    test("unknown held decision freezes actions and reloads fresh fictional inquiries without another mutation", async ({ page }, info) => {
      const requests: string[] = [];
      let documents = 0;
      page.on("request", request => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame() && new URL(request.url()).pathname === "/preview/strelva/places") documents += 1;
      });
      await page.route(`${fixtureOrigin(info)}/api/workspace/inquiries/held`, async route => {
        expect(route.request().method()).toBe("POST");
        requests.push(route.request().postData()!);
        // Both lost transport and an incomplete successful acknowledgement remain unknown.
        if (width === 390) return route.fulfill({ json: { status: "decided" } });
        return route.abort("failed");
      });
      await openFixture(page, width, enlarged);
      const article = page.getByRole("article", { name: "Ana", exact: true });
      const release = article.getByRole("button", { name: "Release the message from Ana", exact: true });
      const spam = article.getByRole("button", { name: "Confirm the message from Ana is spam", exact: true });
      await actionBox(release, width < 768); await actionBox(spam, width < 768);
      await release.focus(); await page.keyboard.press("Enter");
      const reload = article.getByRole("button", { name: "Reload inquiries", exact: true });
      await expect(article.getByRole("alert")).toContainText("decision couldn't be confirmed");
      await expect(article.getByRole("alert")).not.toContainText("Nothing changed");
      await expect(reload).toBeFocused();
      await expect(release).toBeDisabled(); await expect(spam).toBeDisabled();
      await expect(article.getByRole("status")).toHaveCount(0);
      await expect(article.getByText("hi do u do gluten free", { exact: true })).toBeVisible();
      expect(requests).toHaveLength(1);
      expect(JSON.parse(requests[0]!)).toEqual({ workspaceId: "5e000000-0000-4000-8000-000000000010", rowId: "5e000000-0000-4000-8000-0000000000d2", decision: "release" });
      await actionBox(reload, width < 768); await reflow(page);
      await page.screenshot({ path: info.outputPath("held-unconfirmed.png"), fullPage: true });
      await Promise.all([page.waitForEvent("load"), page.keyboard.press("Enter")]);
      await expect.poll(() => documents).toBe(2);
      await expect(page.getByRole("note")).toContainText("fictional bakery records");
      await expect(release).toBeEnabled(); await expect(spam).toBeEnabled();
      await expect(reload).toHaveCount(0); await expect(article.getByRole("alert")).toHaveCount(0);
      // Reload obtains the unchanged fictional fixture, not a manufactured SQL decision receipt.
      await expect(article.getByText("hi do u do gluten free", { exact: true })).toBeVisible();
      expect(requests).toHaveLength(1);
      if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await reflow(page);
      await page.screenshot({ path: info.outputPath("held-fresh-fictional-readback.png"), fullPage: true });
    });
  });
}
