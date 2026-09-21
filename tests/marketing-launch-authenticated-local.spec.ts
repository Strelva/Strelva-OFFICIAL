import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { businessStartHref, businessStartRequest, businessStartView } from "../src/lib/business-start";
import { localEnvironment, signedInContext } from "./support/local-auth";

const enabled = process.env.STRELVA_LOCAL_AUTH_PROOF === "1" && process.env.STRELVA_MARKETING_ENTRY_PROOF === "1";
test.skip(!enabled, "Requires the paired marketing candidate and isolated loopback Auth/Postgres.");
test.use({ trace: "off", video: "off" });
test.setTimeout(180_000);
// The paired app is a cold development server. Wait for route compilation,
// without retrying any test or treating this timeout as a production latency SLO.
const expectReady = expect.configure({ timeout: 30_000 });

function marketingOrigin(): string {
  const url = new URL(process.env.STRELVA_MARKETING_BASE_URL || "");
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.username || url.password) {
    throw new Error("Marketing entry proof only permits loopback services.");
  }
  return url.origin;
}

test.beforeAll(() => { localEnvironment(); marketingOrigin(); });
const entries = [
  { start: "applications", link: "Create a staff request app" },
  { start: "onboarding", link: "Organize onboarding" },
  { start: "website", link: "Have Strelva build my website" },
] as const;

for (const width of [1440, 390]) {
  for (const entry of entries) {
    test(`marketing ${entry.start} reaches one customer business at ${width}px`, async ({ browser }, testInfo) => {
      const env = localEnvironment();
      const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
      const owner = await signedInContext(browser, admin, `marketing-${entry.start}-${width}`);
      const page = await owner.context.newPage();
      page.setDefaultTimeout(30_000);
      await page.setViewportSize({ width, height: 900 });
      let businessId = "";
      try {
        // The identity comes from real local Auth. Removing then restoring its
        // cookies exercises the signed-out return without sending an email.
        const cookies = await owner.context.cookies();
        await owner.context.clearCookies();
        await page.goto(marketingOrigin());
        await page.getByRole("link", { name: entry.link, exact: true }).click();
        const destination = businessStartHref(entry.start);
        await expectReady(page).toHaveURL(url => url.origin === env.app && url.pathname === "/sign-in" && url.searchParams.get("next") === destination);
        await owner.context.addCookies(cookies);
        await page.reload();
        await expectReady(page).toHaveURL(`${env.app}${destination}`);
        await page.getByLabel("Business name", { exact: true }).fill(`Marketing ${entry.start} ${width}`);
        if (entry.start === "website") {
          await expectReady(page.getByLabel("Request for Strelva", { exact: true })).toHaveValue(businessStartRequest("website"));
        }
        const setupRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/workspace/businesses" && request.method() === "POST");
        await page.getByRole("button", { name: entry.start === "website" ? "Save business and request" : "Continue with this business", exact: true }).click();
        const command = (await setupRequest).postDataJSON();
        expect(command.initialRequest).toBe(entry.start === "website" ? businessStartRequest("website") : null);
        await expectReady(page).toHaveURL(url => entry.start === "website"
          ? /^\/workspace\/delivery\/[a-f0-9-]{36}$/.test(url.pathname)
          : url.pathname === "/workspace" && url.searchParams.get("view") === businessStartView(entry.start) && Boolean(url.searchParams.get("workspaceId")));
        const repeated = await owner.context.request.post("/api/workspace/businesses", { headers: { origin: env.app }, data: command });
        expect(repeated.status(), await repeated.text()).toBe(200);
        const saved = await repeated.json();
        businessId = saved.workspaceId;
        expect(saved.alreadyCreated).toBe(true);
        expect(businessId).toMatch(/^[a-f0-9-]{36}$/);
        if (entry.start === "website") {
          const request = await owner.context.request.get(`/api/service-requests/delivery?requestId=${saved.requestId}`);
          expect(request.status(), await request.text()).toBe(200);
          expect((await request.json()).request).toMatchObject({
            businessId, request: businessStartRequest("website"),
            providerAcceptance: { status: "pending" }, deliveryCommitment: null,
          });
          await expectReady(page.getByRole("main")).toContainText(businessStartRequest("website"));
        } else {
          expect(saved.requestId).toBeNull();
          if (entry.start === "onboarding") {
            await expectReady(page.getByRole("heading", { name: "Start an onboarding case", exact: true })).toBeVisible();
            await expectReady(page.getByRole("button", { name: "Create case", exact: true })).toBeEnabled();
          } else {
            await expectReady(page.getByLabel("Name", { exact: true })).toBeEditable();
            await expectReady(page.getByRole("button", { name: "Create private app", exact: true })).toBeVisible();
          }
        }
        const businesses = await owner.context.request.get("/api/workspace/businesses");
        expect(businesses.status()).toBe(200);
        expect((await businesses.json()).businesses.filter((item: { id: string }) => item.id === businessId)).toHaveLength(1);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`marketing-${entry.start}-${width}.png`), fullPage: true });
      } finally {
        await page.close();
        if (businessId) await admin.from("workspaces").delete().eq("id", businessId);
        await owner.context.close();
        await admin.auth.admin.deleteUser(owner.userId).catch(() => {});
      }
    });
  }
}
