import { test, expect, type Page, type TestInfo } from "@playwright/test";
import type {} from "./fixtures/architecture-union-page";

// Measure the shared control under coarse-pointer geometry too.
test.use({ hasTouch: true });

const BUSINESS = "33333333-3333-4333-8333-333333333333";
const OTHER = "11111111-1111-4111-8111-111111111111";
const WORK = "55555555-5555-4555-8555-555555555555";
const notice = (version: number) => version === 1 ? "Saved preview 1 is approved. Prepare launch when you are ready." : "Fact confirmed in a new revision.";

async function open(page: Page, testInfo: TestInfo, version: number, width: number) {
  const errors: string[] = [];
  const outside: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(testInfo.project.use.baseURL as string).origin) { outside.push(url.origin); await route.abort(); return; }
    if (url.pathname === `/api/websites/${WORK}/preview`) {
      const mutations = await page.evaluate(() => window.architectureUnionProof?.counts().mutations || 0);
      const hash = version === 2 && mutations > 0 ? "b" : "a";
      await route.fulfill({ contentType: "text/html", body: `<!doctype html><meta name="strelva-site-hash" content="${hash.repeat(64)}"><p>Closed fictional website preview. No forms or live business.</p>` }); return;
    }
    if (url.pathname.startsWith("/api/")) { await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Outside this fictional proof."}' }); return; }
    await route.continue();
  });
  await page.goto(`/preview/strelva/architecture-union-proof?workspaceId=${BUSINESS}&view=websites&work=${WORK}&version=${version}`);
  const section = page.locator(`section[aria-label="${version === 1 ? "Website setup" : "Website rebuild"}"]`);
  await expect(section).toBeVisible();
  const firstAction = version === 1 ? section.getByRole("button", { name: "Approve this preview", exact: true }) : section.getByRole("button", { name: "Confirm", exact: true }).first();
  const baseline = await page.evaluate(() => window.architectureUnionProof!.counts());
  await firstAction.focus();
  await expect(firstAction).toBeFocused();
  expect(await firstAction.evaluate(node => getComputedStyle(node).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(section.getByText(notice(version), { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.architectureUnionProof!.counts().pending)).toBe(1);
  const identity = await section.elementHandle();
  expect(identity).not.toBeNull();
  return { section, identity: identity!, errors, outside, baseline };
}

async function release(page: Page, status: 200 | 403 | 500 | 503) {
  await page.evaluate(value => window.architectureUnionProof!.releaseWorkspace(value), status);
}

for (const width of [1440, 390, 320]) for (const version of [1, 2]) {
  test(`${width}px V${version} accepted save survives failed deferred retries and current save works after recovery`, async ({ page }, testInfo) => {
    const { section, identity, errors, outside, baseline } = await open(page, testInfo, version, width);
    const unchanged = async () => {
      expect(await section.evaluate((node, original) => node === original, identity)).toBe(true);
      await expect(section.getByText(notice(version), { exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("work")).toBe(WORK);
      expect(await page.evaluate(() => window.architectureUnionProof!.counts().websiteReads)).toBe(baseline.websiteReads);
      expect(await page.evaluate(() => window.architectureUnionProof!.counts().mutations)).toBe(1);
    };
    await unchanged();
    await release(page, 500);
    const retry = page.getByRole("button", { name: "Retry workspace refresh", exact: true });
    const warningFits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const element of [page.getByRole("alert").filter({ hasText: "Snapshot temporarily unavailable." }), retry]) {
        expect(await element.evaluate(node => {
          const bounds = node.getBoundingClientRect();
          const alert = node.closest('[role="alert"]')?.getBoundingClientRect();
          return bounds.left >= 0 && bounds.right <= innerWidth && (!alert || bounds.right <= alert.right);
        })).toBe(true);
      }
    };
    await expect(retry).toBeVisible();
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    expect(await retry.evaluate(node => { const bounds = node.getBoundingClientRect(); return bounds.width >= 44 && bounds.height >= 44; })).toBe(true);
    await warningFits();
    await unchanged();
    await retry.focus();
    await expect(retry).toBeFocused();
    expect(await retry.evaluate(node => getComputedStyle(node).outlineStyle)).toBe("solid");
    await page.keyboard.press("Enter");
    await expect(retry).toBeDisabled();
    await unchanged();
    await release(page, 503);
    await expect(retry).toBeEnabled();
    await warningFits();
    await unchanged();
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(retry).toBeDisabled();
    await release(page, 200);
    await expect(retry).toHaveCount(0);
    await unchanged();
    const currentAction = version === 1 ? section.getByRole("button", { name: "Prepare launch", exact: true }) : section.getByRole("button", { name: "Confirm", exact: true }).first();
    await currentAction.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.architectureUnionProof!.counts().workspaceReads)).toBe(baseline.workspaceReads + 4);
    expect(await page.evaluate(() => window.architectureUnionProof!.counts().mutations)).toBe(2);
    expect(await section.evaluate((node, original) => node === original, identity)).toBe(true);
    expect(new URL(page.url()).searchParams.get("work")).toBe(WORK);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(outside).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("union-recovery.png"), fullPage: false });
  });
}

for (const version of [1, 2]) {
  test(`V${version} retry403 removes retained tool access`, async ({ page }, testInfo) => {
    const { section, identity, errors, outside } = await open(page, testInfo, version, 390);
    await release(page, 503);
    await page.getByRole("button", { name: "Retry workspace refresh", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.architectureUnionProof!.counts().pending)).toBe(1);
    await release(page, 403);
    await expect(section).toHaveCount(0);
    expect(await identity.evaluate(node => node.isConnected)).toBe(false);
    await expect(page.getByRole("alert").filter({ hasText: "Current access refused." })).toBeVisible();
    expect(errors).toEqual([]); expect(outside).toEqual([]);
  });

  test(`V${version} business navigation refuses late workspace retry`, async ({ page }, testInfo) => {
    const { section, identity, errors, outside } = await open(page, testInfo, version, 1440);
    await release(page, 500);
    await page.getByRole("button", { name: "Retry workspace refresh", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.architectureUnionProof!.counts().pending)).toBe(1);
    // Browser Back may change business scope even while the chooser is busy.
    await page.evaluate(other => {
      const current = location.href;
      const previous = new URL(current);
      previous.searchParams.set("workspaceId", other);
      previous.searchParams.delete("work");
      previous.searchParams.delete("view");
      history.replaceState(null, "", previous);
      history.pushState(null, "", current);
    }, OTHER);
    await page.goBack();
    await expect(section).toHaveCount(0);
    await release(page, 200);
    await expect(section).toHaveCount(0);
    expect(await identity.evaluate(node => node.isConnected)).toBe(false);
    expect(new URL(page.url()).searchParams.get("workspaceId")).toBe(OTHER);
    expect(errors).toEqual([]); expect(outside).toEqual([]);
  });
}
