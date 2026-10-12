import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import { assertReadableText } from "./support/assert-readable-text";
import type { WebsiteBrief } from "../src/products/websites/contracts";
import { legacyBrief, legacyBrowserRecord, legacyWorkspaceId, legacyWorkId } from "./support/legacy-website-browser-fixture";

const fields = [
  ["Business name", "businessName"], ["Contact email (optional)", "contactEmail"], ["What does the business do?", "description"],
  ["Who should the site serve? (optional)", "audience"], ["Primary customer goal (optional)", "primaryGoal"],
  ["Primary call to action", "primaryCallToAction"], ["Additional notes (optional)", "notes"],
] as const;
const submitted: WebsiteBrief = { businessName: "Fictional pickup bakery", description: "A fictional revised description kept for recovery.", audience: "Fictional neighborhood customers", primaryGoal: "Arrange a fictional pickup", primaryCallToAction: "Request a pickup time", contactEmail: "orders@example.test", notes: "All fictional entered notes stay available after a lost reply." };

function loopback(info: TestInfo) {
  const base = info.project.use.baseURL;
  if (!base) throw new Error("An explicit loopback baseURL is required.");
  const url = new URL(base);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("A credential-free HTTP loopback origin is required.");
  return url.origin;
}

async function readableBrief(page: Page, region: Locator, info: TestInfo, state: string) {
  await assertReadableText(region.getByRole("heading", { level: 1 }), info, `${state}-website-heading`);
  await assertReadableText(region.getByRole("textbox", { name: "Business name", exact: true }), info, `${state}-entered-business`);
  await assertReadableText(region.getByText("Describe the business in your own words. This stays attached to the saved work.", { exact: true }), info, `${state}-brief-description`);
  await assertReadableText(page.getByText("Fictional website recovery · no Auth, generation or publication proof", { exact: true }), info, `${state}-fixture-disclosure`);
}

async function fixture(page: Page, info: TestInfo, mode: "create" | "saved", width: number, enlarged: boolean) {
  const origin = loopback(info), endpoint = `/api/websites/${legacyWorkId}`;
  let current = legacyBrowserRecord(), failRead = false;
  const posts: string[] = [], reads: string[] = [], blocked: string[] = [], held: Route[] = [];
  await page.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { blocked.push(url.origin); return route.abort(); }
    if (request.method() === "POST" && url.pathname === (mode === "create" ? "/api/websites" : endpoint)) {
      posts.push(request.postData() ?? ""); held.push(route); return;
    }
    if (request.method() === "GET" && url.pathname === endpoint) {
      expect(url.searchParams.get("workspaceId")).toBe(legacyWorkspaceId); reads.push(url.pathname + url.search);
      return failRead ? route.fulfill({ status: 503, json: { error: "Fictional saved-state read unavailable." } }) : route.fulfill({ json: current });
    }
    if (request.method() === "GET" && url.pathname === `${endpoint}/preview`) return route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body><h1>Fictional private preview</h1><p>No generation or provider is invoked.</p></body></html>" });
    if (url.pathname.startsWith("/api/")) { blocked.push(url.pathname); return route.abort(); }
    return route.continue();
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/preview/strelva/legacy-website-recovery?mode=${mode}`);
  if (enlarged) await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const region = page.getByRole("region", { name: "Website setup", exact: true });
  await expect(region.getByRole("textbox", { name: "Business name", exact: true })).toBeEnabled();
  await readableBrief(page, region, info, "initial");
  return { region, posts, reads, blocked,
    failRead(value: boolean) { failRead = value; },
    async complete(index: number, outcome: "lost" | "artifact_failed" | "launch_failed") {
      await expect.poll(() => held.length).toBeGreaterThan(index);
      const input = JSON.parse(posts[index]!) as { brief?: WebsiteBrief };
      current = legacyBrowserRecord(input.brief ?? legacyBrief, mode === "saved" && outcome !== "launch_failed" ? 2 : 1, outcome === "lost" ? "preview_ready" : outcome);
      if (outcome === "lost") await held[index]!.abort("failed"); else await held[index]!.fulfill({ json: current });
    },
  };
}

async function fillBrief(region: Locator) {
  for (const [label, key] of fields) await region.getByRole("textbox", { name: label, exact: true }).fill(submitted[key]!);
}
async function frozenBrief(page: Page, region: Locator) {
  const controls = fields.map(([label]) => region.getByRole("textbox", { name: label, exact: true }));
  await controls[0]!.focus();
  for (let index = 0; index < fields.length; index++) {
    const control = controls[index]!;
    await expect(control).toBeFocused(); await expect(control).toBeEnabled(); await expect(control).not.toBeEditable();
    await expect(control).toHaveAttribute("readonly", "");
    await expect(control).toHaveValue(submitted[fields[index]![1]]!);
    await page.keyboard.type("cannot alter frozen words");
    await expect(control).toHaveValue(submitted[fields[index]![1]]!);
    if (index < fields.length - 1) await page.keyboard.press("Tab");
  }
}
async function geometry(page: Page, region: Locator, width: number) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width >= 768) return;
  // One layout snapshot avoids comparing viewport coordinates across focus-driven scrolling.
  const boxes = await region.locator("input:visible, textarea:visible, button:visible").evaluateAll(nodes => nodes.map(node => {
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

for (const [width, enlarged] of [[1440, false], [390, false], [320, true]] as const) test.describe(`legacy website recovery at ${width}px`, () => {
  test.use({ hasTouch: width < 768 });
  for (const mode of ["create", "saved"] as const) test(`${mode} loss preserves the full brief and explicit recovery${enlarged ? " with enlarged text" : ""}`, async ({ page }, info) => {
    const f = await fixture(page, info, mode, width, enlarged);
    await fillBrief(f.region); await geometry(page, f.region, width);
    const generate = f.region.getByRole("button", { name: mode === "create" ? "Generate a private preview" : "Generate a new preview", exact: true });
    await generate.focus();
    // Two valid DOM submissions in one batch must admit only one HTTP write.
    await generate.evaluate(node => { const form = (node as HTMLButtonElement).form!; form.requestSubmit(); form.requestSubmit(); });
    await expect.poll(() => f.posts.length).toBe(1);
    const captured = JSON.parse(f.posts[0]!);
    expect(captured.brief).toEqual(submitted); expect(captured.action).toBe(mode === "create" ? "create" : "revise");
    if (mode === "create") { expect(captured.workspaceId).toBe(legacyWorkspaceId); expect(typeof captured.requestId).toBe("string"); expect(captured.requestId.length).toBeGreaterThanOrEqual(8); }
    else expect(captured.expectedRevision).toBe(1);
    for (const [label] of fields) await expect(f.region.getByRole("textbox", { name: label, exact: true })).toBeDisabled();
    const outside = page.getByRole("button", { name: "Outside website control", exact: true });
    if (width === 390) await outside.focus();
    await f.complete(0, "lost");
    const recovery = f.region.getByRole("button", { name: mode === "create" ? "Check this website request" : "Reload current state", exact: true });
    await expect(recovery).toBeVisible();
    await expect(width === 390 ? outside : recovery).toBeFocused();
    await expect(generate).toBeDisabled(); await frozenBrief(page, f.region);
    await geometry(page, f.region, width);
    await readableBrief(page, f.region, info, "unknown-frozen");
    await page.screenshot({ path: info.outputPath("frozen-brief.png"), fullPage: true });
    if (mode === "create") {
      await recovery.focus(); await page.keyboard.press("Enter");
      await expect.poll(() => f.posts.length).toBe(2);
      expect(f.posts[1]).toBe(f.posts[0]);
      if (width === 390) await outside.focus();
      await f.complete(1, "artifact_failed");
      await expect(recovery).toHaveCount(0);
      await expect(f.region.getByRole("alert")).toContainText("Fictional preview generation failed after saving the brief.");
      await expect(f.region.getByText("We could not generate the preview. Your website draft is saved; try again.", { exact: false })).toBeVisible();
      await expect(f.region.getByRole("status").filter({ hasText: "Private website preview generated" })).toHaveCount(0);
      await expect(width === 390 ? outside : f.region.getByRole("heading", { name: submitted.businessName, exact: true })).toBeFocused();
      expect(f.reads).toHaveLength(0);
    } else {
      f.failRead(true); const previousReads = f.reads.length;
      await recovery.focus(); await page.keyboard.press("Enter");
      await expect(f.region.getByRole("alert")).toContainText("The current saved website could not be loaded");
      await expect(recovery).toBeFocused(); await expect(generate).toBeDisabled(); await frozenBrief(page, f.region);
      expect(f.posts).toHaveLength(1);
      await readableBrief(page, f.region, info, "failed-current-read");
      f.failRead(false); await recovery.focus(); await page.keyboard.press("Enter");
      await expect(recovery).toHaveCount(0); expect(f.reads).toHaveLength(previousReads + 2);
      await expect(f.region.getByRole("heading", { name: submitted.businessName, exact: true })).toBeFocused();
      for (const [label, key] of fields) { const field = f.region.getByRole("textbox", { name: label, exact: true }); await expect(field).toHaveValue(submitted[key]!); await expect(field).toBeEditable(); }
      await expect(f.region.getByRole("button", { name: "Prepare launch", exact: true })).toHaveCount(0);
      expect(f.posts).toHaveLength(1);
    }
    await readableBrief(page, f.region, info, "reconciled");
    await geometry(page, f.region, width); await page.screenshot({ path: info.outputPath("recovered-brief.png"), fullPage: true });
    expect(f.blocked).toEqual([]);
    await info.attach("fictional-ui-scope", { body: JSON.stringify({ width, enlarged, mode, observedHttpPosts: f.posts.length, nativeAuthQualified: false, providerGenerationCountQualified: false, publicationQualified: false }), contentType: "application/json" });
  });
});

test.describe("persisted launch failure", () => {
  test.use({ hasTouch: true });
  test("saved launch failure keeps the approved preview and reports failure without claiming a pending result", async ({ page }, info) => {
    const f = await fixture(page, info, "saved", 390, false);
    const launch = f.region.getByRole("button", { name: "Prepare launch", exact: true });
    await launch.focus(); await page.keyboard.press("Enter");
    await expect.poll(() => f.posts.length).toBe(1);
    expect(JSON.parse(f.posts[0]!)).toEqual({ action: "prepareLaunch", expectedRevision: 1, candidateRevision: 1, candidateContentHash: "a".repeat(64) });
    await f.complete(0, "launch_failed");
    await expect(f.region.getByRole("alert")).toContainText("Fictional launch preparation failed after saving.");
    await expect(f.region.getByText("We could not prepare launch. Your approved preview is saved; try launch preparation again.", { exact: false })).toBeVisible();
    await expect(f.region.getByRole("button", { name: "Retry launch preparation", exact: true })).toBeEnabled();
    await expect(f.region.getByRole("status").filter({ hasText: "Launch preparation is pending" })).toHaveCount(0);
    await expect(f.region.getByRole("heading", { name: legacyBrief.businessName, exact: true })).toBeFocused();
    await readableBrief(page, f.region, info, "retained-launch-failure");
    await geometry(page, f.region, 390); await page.screenshot({ path: info.outputPath("saved-launch-failure.png"), fullPage: true });
    expect(f.posts).toHaveLength(1); expect(f.blocked).toEqual([]);
    await info.attach("fictional-ui-scope", { body: JSON.stringify({ observedHttpPosts: 1, nativeAuthQualified: false, providerGenerationCountQualified: false, publicationQualified: false }), contentType: "application/json" });
  });
});
