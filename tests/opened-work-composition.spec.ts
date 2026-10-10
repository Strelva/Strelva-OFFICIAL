import { test, expect } from "@playwright/test";

// This route is copied in only for the isolated local proof; see the stream handoff.
const BUSINESS = "33333333-3333-4333-8333-333333333333";
const WORK = "61000000-0000-4000-8000-000000000001";
const SYSTEM = "61000000-0000-4000-8000-000000000002";
for (const width of [1440, 390]) for (const entrance of ["workspace", "system"] as const) for (const mode of ["ready", "loading", "error", "permission", "read-only", "empty"]) {
  test(`${width}px ${entrance} ${mode}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const errors: string[] = [];
    const outside: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(testInfo.project.use.baseURL as string).origin) { outside.push(url.origin); await route.abort(); return; }
      // Iframes use a real URL rather than fetch. Keep this preview local and fictional too.
      if (url.pathname === `/api/websites/${WORK}/preview`) { await route.fulfill({ contentType: "text/html", body: '<!doctype html><meta name="strelva-site-hash" content="' + "a".repeat(64) + '"><p>Closed fictional preview. No forms or live website.</p>' }); return; }
      // Application requests are answered in memory. Any unowned native API traffic is refused.
      if (url.pathname.startsWith("/api/")) { await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Outside this fictional browser proof."}' }); return; }
      await route.continue();
    });
    const location = mode === "empty" ? "view=custom-applications" : entrance === "workspace" ? `view=websites&work=${WORK}` : `view=system&system=${SYSTEM}`;
    await page.goto(`/preview/strelva/opened-work-proof?workspaceId=${BUSINESS}&${location}&mode=${mode}`);
    if (mode === "ready" || mode === "read-only") {
      await expect(page.getByText("2 decisions need you", { exact: true })).toBeVisible();
      const confirm = page.getByRole("button", { name: "Confirm", exact: true }).first();
      if (mode === "read-only") await expect(confirm).toBeDisabled();
      else {
        await confirm.focus();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("button", { name: "Edit", exact: true }).first()).toBeFocused();
        expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe("solid");
        await confirm.focus(); await page.keyboard.press("Enter");
        // System retains its notice; workspace refresh may reread the acknowledged saved state.
        if (entrance === "system") await expect(page.getByText("Fact confirmed in a new revision.", { exact: true })).toBeVisible();
        await expect(page.getByText("1 decision needs you", { exact: true })).toBeVisible();
        expect(new URL(page.url()).searchParams.get(entrance === "system" ? "system" : "work")).toBe(entrance === "system" ? SYSTEM : WORK);
      }
    } else if (mode === "loading") await expect(page.getByText("Opening the saved website…", { exact: true })).toBeVisible();
    else if (mode === "empty") await expect(page.getByText("Select a saved custom application to review its delivery.", { exact: true })).toBeVisible();
    else await expect(page.getByRole("alert").filter({ hasText: mode === "permission" ? "Fictional permission refused." : "Fictional current read failed." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]); expect(outside).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("opened-work.png"), fullPage: false });
  });
}
