import { expect, test } from "@playwright/test";

// Replays the seven known values from the Oct 14 audit. Unknown production
// flags are deliberately not asserted; no credentials, email or provider run.
test.skip(process.env.STRELVA_BROWSER_CI_CONTEXT !== "recorded", "Requires the dated recorded-release context.");
const businessId = "11111111-1111-4111-8111-111111111111";

test("recorded open doors preserve sign-in destinations without granting access", async ({ page, request }) => {
  await page.goto("/sign-up");
  await expect(page.getByRole("heading", { name: "Create your account", exact: true })).toBeVisible();
  const doors = page.getByRole("navigation", { name: "Who this account is for", exact: true });
  await expect(doors.getByRole("link", { name: /^I run a business/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Already have an account? Sign in", exact: true })).toHaveAttribute("href", "/sign-in?next=%2Fworkspace%2Fbusiness%2Fnew");
  await doors.getByRole("link", { name: /^I build for clients/ }).click();
  await expect(page).toHaveURL(/\/sign-up\?as=agency$/);
  await expect(doors.getByRole("link", { name: /^I build for clients/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "Already have an account? Sign in", exact: true })).toHaveAttribute("href", "/sign-in?next=%2Fworkspace%2Fagency%2Fstart");
  const response = await request.get(`/workspace/getting-started?workspaceId=${businessId}`, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  const target = new URL(response.headers().location!, "http://localhost");
  expect(target.pathname).toBe("/sign-in");
  expect(target.searchParams.get("next")).toBe(`/workspace/getting-started?workspaceId=${businessId}`);
});

test("recorded agency and rebuild gates still require a confirmed actor", async ({ request }, info) => {
  // These return Auth errors, rather than release-off or invented successful data.
  for (const path of ["/api/agency-onboarding", `/api/websites/rebuild?workspaceId=${businessId}`, `/api/workspace-claims/${"a".repeat(64)}/review`]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(401);
    expect(await response.json(), path).toMatchObject({ error: expect.stringMatching(/sign in/i) });
  }
  const response = await request.post("/api/workspace/agency-clients", {
    headers: { origin: new URL(info.project.use.baseURL!).origin },
    data: { action: "add", agencyWorkspaceId: businessId },
  });
  expect(response.status()).toBe(401);
});

test("recorded Needs you stays dark and disposable previews stay hidden", async ({ request }) => {
  expect((await request.get("/workspace/version-review")).status()).toBe(404);
  for (const path of ["/preview/strelva/getting-started", "/preview/strelva/owner-decision", "/preview/strelva/architecture-union-proof"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
