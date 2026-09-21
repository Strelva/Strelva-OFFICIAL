import { createServer } from "node:http";
import { expect, test } from "@playwright/test";

test.skip(process.env.STRELVA_UI_PREVIEW !== "1", "Requires explicit local UI preview.");

for (const width of [1440, 390]) {
  test(`custom application recipient can retry an unavailable read at ${width}px`, async ({ page }) => {
    const workId = "11111111-1111-4111-8111-111111111111";
    let recovered = false;
    await page.setViewportSize({ width, height: 900 });
    await page.route(`**/api/custom-applications/${workId}`, route => route.fulfill({
      status: recovered ? 200 : 503,
      contentType: "application/json",
      body: JSON.stringify(recovered ? {
        workId,
        title: "Shift coverage",
        releaseVersion: 1,
        artifactDigest: "fixture-digest",
        html: "<h1>Shift coverage</h1><p>Two people are scheduled for Tuesday.</p>",
        grant: { expiresAt: "2026-09-25T12:00:00Z" },
      } : { error: "Application storage is temporarily unavailable." }),
    }));
    await page.goto(`/custom-applications/${workId}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("storage is temporarily unavailable");
    await expect(page.getByText("Opening application…")).toHaveCount(0);
    recovered = true;
    await page.getByRole("button", { name: "Try again", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Shift coverage", exact: true })).toBeVisible();
    await expect(page.frameLocator("iframe").getByText("Two people are scheduled for Tuesday.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/strelva-custom-use-retry-${width}.png`, fullPage: true });
  });
}

test("custom application parent blocks direct and meta-refresh frame navigation", async ({ page }) => {
  const workId = "22222222-2222-4222-8222-222222222222";
  const targetRequests: string[] = [];
  const targetServer = createServer((request, response) => {
    if (request.url) targetRequests.push(request.url);
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<main>Unexpected navigation target</main>");
  });
  await new Promise<void>((resolve, reject) => {
    targetServer.once("error", reject);
    targetServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = targetServer.address();
  if (!address || typeof address === "string") throw new Error("Navigation proof server did not expose a port");
  const target = `http://127.0.0.1:${address.port}`;
  await page.route(`**/api/custom-applications/${workId}`, route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      workId,
      title: "Navigation policy proof",
      releaseVersion: 1,
      artifactDigest: "fixture-digest",
      html: "<main><button type=\"button\">Local interaction</button><p>Reviewed artifact</p></main>",
      grant: { expiresAt: "2026-09-25T12:00:00Z" },
    }),
  }));

  try {
    await page.goto(`/custom-applications/${workId}`);
    const frame = page.frameLocator('iframe[title="Navigation policy proof released application"]');
    await expect(frame.getByRole("button", { name: "Local interaction", exact: true })).toBeVisible();

    const directTarget = `${target}/direct-location`;
    await frame.locator("body").evaluate((body, url) => {
      const view = body.ownerDocument.defaultView;
      if (view) view.location.href = url;
    }, directTarget);
    await page.waitForTimeout(300);
    expect(targetRequests).toEqual([]);
    expect(page.url()).toContain(`/custom-applications/${workId}`);
    expect(page.frames().find(candidate => candidate !== page.mainFrame())?.url()).not.toBe(directTarget);

    await page.reload();
    const freshFrame = page.frameLocator('iframe[title="Navigation policy proof released application"]');
    await expect(freshFrame.getByText("Reviewed artifact", { exact: true })).toBeVisible();
    const refreshTarget = `${target}/meta-refresh`;
    await freshFrame.locator("head").evaluate((head, url) => {
      const refresh = head.ownerDocument.createElement("meta");
      refresh.httpEquiv = "refresh";
      refresh.content = `0;url=${url}`;
      head.append(refresh);
    }, refreshTarget);
    await page.waitForTimeout(300);
    expect(targetRequests).toEqual([]);
    expect(page.url()).toContain(`/custom-applications/${workId}`);
    expect(page.frames().find(candidate => candidate !== page.mainFrame())?.url()).not.toBe(refreshTarget);
  } finally {
    await page.unroute(`**/api/custom-applications/${workId}`);
    await new Promise<void>((resolve, reject) => targetServer.close(error => error ? reject(error) : resolve()));
  }
});
