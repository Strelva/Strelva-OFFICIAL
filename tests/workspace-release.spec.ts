import { expect, test, type Page, type Route } from "@playwright/test";
import { createPreviewInquiryAdapter } from "../src/experience/inquiries/preview-fixture";
import { createTracker, previewTrackerImport } from "../src/products/tracker";
import type { WorkspaceHandoffPreview, WorkspaceSnapshot, WorkspaceWork } from "../src/experience/workspace/contracts";

test.skip(process.env.STRELVA_WORKSPACE_RELEASE !== "1", "Workspace browser checks require the opt-in workspace release server.");

/**
 * Release-one browser fixtures. Every workspace API response is intercepted in
 * the browser: these tests exercise the real /workspace UI without auth, the
 * database, provider calls, or a live AI Visibility assessment.
 */

const PERSONAL_ID = "11111111-1111-4111-8111-111111111111";
const AGENCY_ID = "22222222-2222-4222-8222-222222222222";
const CUSTOMER_ID = "33333333-3333-4333-8333-333333333333";
const WORK_ID = "44444444-4444-4444-8444-444444444444";
const SECOND_WORK_ID = "45454545-4545-4454-8454-454545454545";
const CUSTOMER_WORK_ID = "55555555-5555-4555-8555-555555555555";
const TRACKER_WORK_ID = "56565656-5656-4565-8565-565656565656";
const DELEGATION_ID = "66666666-6666-4666-8666-666666666666";
const HANDOFF_ID = "77777777-7777-4777-8777-777777777777";

const trackerSnapshot = {
  id: "tracker-record",
  title: "Shared backlog",
  source: { sourceId: "source-1", originalFileName: "backlog.csv", format: "csv", mediaType: "text/csv", sizeBytes: 38 },
  originalSource: "Name,Status\nExample,Open\nSecond,Closed",
  columns: [{ id: "name", sourceColumn: 1, sourceColumnIndex: 0, sourceHeader: "Name", fieldKey: "name", label: "Name", kind: "text" }],
  rows: [
    { id: "row-1", cells: { name: { value: "Example", originalValue: "Example", lineage: null } }, lineage: null, state: "active", createdAt: "2026-09-05T14:00:00.000Z", updatedAt: "2026-09-05T14:00:00.000Z" },
    { id: "row-2", cells: { name: { value: "Second", originalValue: "Second", lineage: null } }, lineage: null, state: "active", createdAt: "2026-09-05T14:00:00.000Z", updatedAt: "2026-09-05T14:00:00.000Z" },
  ],
  history: [], revision: 0, createdAt: "2026-09-05T14:00:00.000Z", updatedAt: "2026-09-05T14:00:00.000Z",
};

const trackerPreview = {
  id: trackerSnapshot.id,
  title: trackerSnapshot.title,
  source: { fileName: trackerSnapshot.source.originalFileName, sizeBytes: trackerSnapshot.source.sizeBytes },
  revision: trackerSnapshot.revision,
  rowCount: trackerSnapshot.rows.length,
  historyCount: trackerSnapshot.history.length,
  columns: [{ id: "name", sourceColumn: 1, label: "Name", kind: "text" as const }],
  rows: trackerSnapshot.rows.map((row) => ({ id: row.id, sourceRow: null, state: row.state as "active" | "deleted", cells: { name: row.cells.name.value } })),
  updatedAt: trackerSnapshot.updatedAt,
};

function work(overrides: Partial<WorkspaceWork> = {}): WorkspaceWork {
  return {
    id: WORK_ID,
    workspaceId: PERSONAL_ID,
    title: "Harbor Dental",
    productId: "ai_visibility",
    resourceKind: "ai_visibility_assessment",
    input: { category: "Dentist", location: "Buffalo, NY" },
    createdAt: "2026-09-05T14:00:00.000Z",
    payload: {
      business: "Harbor Dental",
      url: "https://harbordental.example",
      score: 74,
      grade: "B",
      verdict: "AI systems can read the core business facts, but the service evidence is incomplete.",
      signals: [
        { id: "identity", label: "Business identity", pass: true, detail: "Name and location are stated clearly.", weight: 25 },
        { id: "services", label: "Service evidence", pass: false, detail: "Service pages need more specific treatment details.", weight: 20 },
      ],
      citation: { probed: true, mentioned: true, recommended: false, note: "The business was mentioned but not recommended in the sampled answer." },
      topFix: "Add a focused page for each primary treatment with location and practitioner evidence.",
      measurementStatus: "measured",
      measurementNote: "Website and live citation evidence measured.",
      readinessMeasured: true,
    },
    ...overrides,
  };
}

function trackerWork(overrides: Partial<WorkspaceWork> = {}): WorkspaceWork {
  return {
    id: TRACKER_WORK_ID,
    workspaceId: AGENCY_ID,
    title: "Shared backlog",
    productId: "tracker",
    resourceKind: "tracker",
    input: {},
    createdAt: "2026-09-05T14:00:00.000Z",
    payload: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    actor: { email: "owner@example.com", localPreview: false },
    workspaces: [{ id: PERSONAL_ID, kind: "personal", name: "My work" }],
    workspaceId: PERSONAL_ID,
    work: [work()],
    handoffs: [],
    delegations: [],
    products: [{ id: "ai_visibility", name: "AI Visibility", description: "See what AI can understand about a business.", availability: "available" }],
    ...overrides,
  };
}

function fulfill(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockWorkspace(page: Page, handler: (route: Route) => Promise<void>) {
  await page.route("**/api/workspace**", handler);
  await page.route("**/api/offerings*", (route) => fulfill(route, {
    businessId: new URL(route.request().url()).searchParams.get("businessId") || CUSTOMER_ID,
    permissions: { canRead: true, canManage: true, role: "owner" },
    definitions: [],
    installations: [],
    websiteBindings: [],
  }));
  await page.route("**/api/work-allowances*", (route) => fulfill(route, {
    allowances: [],
    policy: {
      stripeSynchronized: false,
      pricesDefined: false,
      customerUsageSource: "trusted_execution_receipts",
      retriesConsumeCustomerAllowance: false,
      spendingCapMeaning: "operational_cost_limit_not_invoice_price",
      contributionPayouts: false,
    },
    currentActorId: "preview-actor",
  }));
}

async function expectBusinessHome(page: Page) {
  await expect(page.getByRole("heading", { name: "What would you like to do?", exact: true })).toBeVisible();
}

async function openWorkspaceHelp(page: Page) {
  await page.getByRole("complementary", { name: "Strelva navigation", exact: true })
    .getByRole("link", { name: "Help", exact: true })
    .click();
}

test("keeps one navigation around saved work on desktop and mobile", async ({ page }) => {
  await mockWorkspace(page, (route) => fulfill(route, snapshot()));
  await page.goto("/workspace");
  await expectBusinessHome(page);
  const navigation = page.getByLabel("Strelva navigation", { exact: true });
  await expect(navigation).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-home-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Open Harbor Dental", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(page.getByLabel("Grade B, 74 out of 100")).toBeVisible();
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Strelva home", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Discuss", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/workspace-desktop.png", fullPage: true });
  // The saved resource can be resumed directly without losing its navigation.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();
  await expect(navigation).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText("Do this first")).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const mobileNavigation = page.getByRole("dialog", { name: "Strelva workspace navigation" });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Strelva home" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(mobileNavigation.getByRole("button", { name: "Sign out" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await mobileNavigation.getByRole("button", { name: "Search", exact: true }).click();
  await expect(mobileNavigation).toHaveCount(0);
  const searchDialog = page.getByRole("dialog", { name: "My work", exact: true });
  await expect(searchDialog).toBeVisible();
  const search = searchDialog.getByRole("combobox", { name: "Search My work" });
  await search.fill("missing");
  await expect(page.getByText("No matching work")).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-home-mobile.png", fullPage: true });
});

async function pendingWorkspaceSwitchSurvives(page: Page, section: "work" | "settings" | "products") {
  let targetReady = false;
  const releaseTarget: Array<() => void> = [];
  const workspaces = [
    { id: PERSONAL_ID, kind: "personal" as const, name: "My work" },
    { id: CUSTOMER_ID, kind: "customer" as const, name: "Customer business", role: "owner" as const },
  ];
  await mockWorkspace(page, async (route) => {
    if (route.request().method() !== "GET") return fulfill(route, { error: "Unexpected mocked action." }, 400);
    const requested = new URL(route.request().url()).searchParams.get("workspaceId");
    if (requested === CUSTOMER_ID && !targetReady) await new Promise<void>((resolve) => releaseTarget.push(resolve));
    return fulfill(route, requested === CUSTOMER_ID
      ? snapshot({ workspaceId: CUSTOMER_ID, workspaces, work: [work({ workspaceId: CUSTOMER_ID, id: "customer-result", title: "Customer result" })] })
      : snapshot({ workspaceId: PERSONAL_ID, workspaces }));
  });

  await page.goto(`/workspace?workspaceId=${PERSONAL_ID}&view=work`);
  const workspace = page.getByRole("combobox", { name: "Current workspace" });
  await expect(workspace).toHaveValue(PERSONAL_ID);
  await workspace.selectOption(CUSTOMER_ID);
  await expect.poll(() => releaseTarget.length).toBeGreaterThan(0);

  await page.getByRole("complementary", { name: "Strelva navigation", exact: true })
    .getByRole("link", { name: section === "products" ? "Apps & templates" : section === "settings" ? "Settings" : "Work", exact: true })
    .click();

  targetReady = true;
  for (const resolve of releaseTarget.splice(0)) resolve();
  await expect(workspace).toHaveValue(CUSTOMER_ID);
  await expect(page).toHaveURL(new RegExp(`workspaceId=${CUSTOMER_ID}.*view=${section}`));
}

for (const section of ["work", "settings", "products"] as const) {
  test(`keeps a pending business switch through stale ${section} navigation`, async ({ page }) => {
    await pendingWorkspaceSwitchSurvives(page, section);
  });
}

test("workspace sign-in and failed callback retain the workspace destination", async ({ page }) => {
  await page.goto("/sign-in?next=%2Fworkspace");
  await expect(page.getByRole("heading", { name: "Your work starts here." })).toBeVisible();
  await expect(page.getByText(/You do not need a managed website/)).toBeVisible();
  await page.goto("/auth/callback?next=%2Fworkspace");
  await expect(page).toHaveURL(/next=%2Fworkspace/);
  await expect(page.getByRole("heading", { name: "Your work starts here." })).toBeVisible();
});

test("separates signed-out recovery from a temporary workspace failure", async ({ page }) => {
  let phase: "signed-out" | "unavailable" | "ready" = "signed-out";
  await mockWorkspace(page, async (route) => {
    if (phase === "signed-out") return fulfill(route, { error: "Sign in with a confirmed email to open your work." }, 401);
    if (phase === "unavailable") return fulfill(route, { error: "Saved work is unavailable right now. Nothing has been confirmed. Please try again." }, 503);
    return fulfill(route, snapshot());
  });

  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Sign in to open your private work." })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/sign-in?next=%2Fworkspace");

  phase = "unavailable";
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your workspace didn’t open." })).toBeVisible();
  phase = "ready";
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("button", { name: "Open Harbor Dental" }).click();
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();
});

test("creates a private assessment and restores it after reload", async ({ page }) => {
  let saved: WorkspaceWork[] = [];
  await mockWorkspace(page, async (route) => {
    if (route.request().method() === "GET") return fulfill(route, snapshot({ work: saved }));
    const action = route.request().postDataJSON() as { action: string; business?: string };
    if (action.action === "assess") {
      const created = work({ title: action.business || "Harbor Dental", payload: { ...work().payload!, business: action.business || "Harbor Dental" } });
      saved = [created];
      return fulfill(route, { work: created }, 201);
    }
    return fulfill(route, { error: "Unexpected mocked action." }, 400);
  });

  await page.goto("/workspace");
  await page.getByRole("link", { name: "Apps & templates", exact: true }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI Visibility", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check a business" }).click();
  await expect(page.getByRole("heading", { name: "See what AI can understand about this business." })).toBeVisible();
  await page.getByLabel("Business name").fill("Harbor Dental");
  await page.getByLabel("Website").fill("harbordental.example");
  await page.getByRole("button", { name: "Run assessment" }).click();
  await expect(page.getByText("Assessment saved privately to this workspace.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();
});

test("requires explicit confirmation before saving a public scorecard privately", async ({ page }) => {
  const privateCopy = work({ id: "88888888-8888-4888-8888-888888888888", title: "Harbor Dental public scorecard" });
  let saveRequests = 0;
  await mockWorkspace(page, async (route) => {
    if (route.request().method() === "GET") return fulfill(route, snapshot({ work: saveRequests ? [privateCopy] : [work()] }));
    const body = route.request().postDataJSON() as { action: string; workspaceId?: string; resultId?: string };
    if (body.action === "save_public_result") {
      saveRequests += 1;
      expect(body.workspaceId).toBe(PERSONAL_ID);
      expect(body.resultId).toBe("scan_public123");
      return fulfill(route, { work: privateCopy }, 201);
    }
    return fulfill(route, { error: "Unexpected mocked action." }, 400);
  });

  await page.goto("/workspace?save=scan_public123");
  const dialog = page.getByRole("dialog", { name: "Save a private copy of this result?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Workspace: My work");
  expect(saveRequests).toBe(0);
  await expect(dialog.getByRole("button", { name: "Back" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Save a copy" })).toBeFocused();

  await dialog.getByRole("button", { name: "Save a copy" }).click();
  await expect(page.getByText("Result saved privately to your workspace.")).toBeVisible();
  expect(new URL(page.url()).searchParams.has("save")).toBe(false);
  await expect(page).toHaveURL(url => Boolean(url.searchParams.get("work")));
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await expectBusinessHome(page);
  await expect(page.getByRole("button", { name: "Open Harbor Dental public scorecard", exact: true })).toBeVisible();
  expect(saveRequests).toBe(1);
});

test("preserves a public save destination when signed out", async ({ page }) => {
  await mockWorkspace(page, (route) => fulfill(route, { error: "Sign in with a confirmed email to open your work." }, 401));
  await page.goto("/workspace?save=scan_public123");
  await expect(page.getByRole("heading", { name: "Sign in to open your private work." })).toBeVisible();
  const signInLinks = page.getByRole("link", { name: "Sign in", exact: true });
  await expect(signInLinks).toHaveCount(2);
  for (const link of await signInLinks.all()) {
    await expect(link).toHaveAttribute("href", "/sign-in?next=%2Fworkspace%3Fsave%3Dscan_public123");
  }
});

test("keeps public-save confirmation open after a rejected save", async ({ page }) => {
  let saveRequests = 0;
  await mockWorkspace(page, async (route) => {
    if (route.request().method() === "GET") return fulfill(route, snapshot());
    const body = route.request().postDataJSON() as { action: string };
    if (body.action === "save_public_result") {
      saveRequests += 1;
      return fulfill(route, { error: "That public scorecard is no longer available to save." }, 403);
    }
    return fulfill(route, { error: "Unexpected mocked action." }, 400);
  });

  await page.goto("/workspace?save=scan_public123");
  const dialog = page.getByRole("dialog", { name: "Save a private copy of this result?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save a copy" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("That public scorecard is no longer available to save.");
  expect(new URL(page.url()).searchParams.get("save")).toBe("scan_public123");
  expect(saveRequests).toBe(1);
});

test("never presents unavailable measurement as a failing grade and labels partial evidence", async ({ page }) => {
  const unavailable = work({ payload: { ...work().payload!, score: 0, grade: "F", measurementStatus: "unavailable", readinessMeasured: false, measurementNote: "The website could not be reached, so readiness was not scored." } });
  await mockWorkspace(page, (route) => fulfill(route, snapshot({ work: [unavailable] })));
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Open Harbor Dental" }).click();

  await expect(page.getByText("Not measured", { exact: true })).toBeVisible();
  await expect(page.getByText("The website could not be reached, so readiness was not scored.")).toBeVisible();
  await expect(page.getByLabel(/Grade F/)).toHaveCount(0);
  await page.getByRole("button", { name: "Retry assessment" }).click();
  await expect(page.getByRole("heading", { name: "See what AI can understand about this business." })).toBeVisible();

  const partial = work({ payload: { ...work().payload!, measurementStatus: "partial", measurementNote: "The website was measured, but the live citation probe was unavailable." } });
  await page.unroute("**/api/workspace**");
  await mockWorkspace(page, (route) => fulfill(route, snapshot({ work: [partial] })));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();
  await expect(page.getByText("The website was measured, but the live citation probe was unavailable.")).toBeVisible();
});

test("keeps product discovery coherent and managed work scoped to authorized links", async ({ page }) => {
  // Product discovery is a browser fixture only. The managed destinations below
  // stand in for server-authorized tenant pointers; no tenant, auth provider, or
  // managed-site backend is contacted by this test.
  const inquirySnapshot = createPreviewInquiryAdapter("business").getSnapshot();
  await page.route("**/api/inquiry-workspace*", (route) => fulfill(route, { snapshot: inquirySnapshot }));
  const products = [
    { id: "ai_visibility", name: "AI Visibility", description: "See what AI can understand about a business.", availability: "available" as const },
    { id: "managed_presence", name: "Managed Websites", description: "Keep an existing client website current.", availability: "managed" as const },
    { id: "inquiries", name: "Inquiry work", description: "Keep customer requests moving with a clear, inspectable thread.", availability: "available" as const },
    { id: "tracker", name: "Spreadsheet tracker", description: "Turn a CSV into working data with a saved history.", availability: "available" as const },
    { id: "documents", name: "Documents", description: "Write procedures, proposals, and notes with a saved history.", availability: "available" as const },
    { id: "applications", name: "Internal applications", description: "Collect and use business records in a private form and working list.", availability: "release_gated" as const },
    { id: "scheduling", name: "Scheduling", description: "Reserve available time and keep conflicting requests out of the schedule.", availability: "release_gated" as const },
    { id: "investigations", name: "Ongoing checks", description: "Compare two permitted records and notice when they disagree.", availability: "release_gated" as const },
    { id: "operations", name: "Delegated work", description: "Approve a bounded result and keep its progress, decisions, and evidence together.", availability: "release_gated" as const },
    { id: "domain_monitoring", name: "Domain Monitoring", description: "Internal portfolio uptime checks.", availability: "managed" as const },
    { id: "homefinder", name: "Home Finder", description: "A separate external pilot.", availability: "not_enabled" as const, previewHref: "http://127.0.0.1:3213/embed/agency-preview" },
  ];
  const managedWork = [
    {
      id: "tenant-harbor",
      title: "Harbor Dental website",
      // Mirrors getTenantDashboardFallbackUrl's browser-safe control-plane
      // destination; the real server currently emits an absolute app URL.
      href: "https://app.strelva.com/client/harbor/dashboard",
      productId: "managed_presence" as const,
      relationship: "client" as const,
    },
    {
      id: "tenant-northstar",
      title: "Northstar portfolio",
      href: "https://app.strelva.com/client/northstar/dashboard",
      productId: "managed_presence" as const,
      relationship: "enterprise" as const,
    },
  ];
  const personalSnapshot = snapshot({
    managedWork,
    products,
  });
  const businessSnapshot = snapshot({
    managedWork,
    products,
    workspaceId: CUSTOMER_ID,
    workspaces: [
      { id: PERSONAL_ID, kind: "personal", name: "My work" },
      { id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", role: "owner" },
    ],
    work: [work({ workspaceId: CUSTOMER_ID })],
  });
  await mockWorkspace(page, (route) => {
    const workspaceId = new URL(route.request().url()).searchParams.get("workspaceId");
    return fulfill(route, workspaceId === CUSTOMER_ID ? businessSnapshot : personalSnapshot);
  });

  await page.goto("/workspace");
  const home = page.getByRole("main");
  await expect(home.getByRole("link", { name: /Harbor Dental website/ })).toHaveAttribute("href", "https://app.strelva.com/client/harbor/dashboard");
  await expect(home.getByRole("link", { name: /Northstar portfolio/ })).toHaveAttribute("href", "https://app.strelva.com/client/northstar/dashboard");
  await page.goto(`/workspace?workspaceId=${CUSTOMER_ID}&view=products`);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Useful outcomes for this business.", exact: true })).toBeVisible();
  const outcome = (name: string) => main.locator('[class*="discoveryRow"]').filter({ hasText: name }).first();
  await expect(outcome("AI Visibility")).toContainText("Start");
  await expect(outcome("Inquiry work")).toContainText("Start");
  await expect(outcome("Spreadsheet tracker")).toContainText("Start");
  await expect(outcome("Documents")).toContainText("Start");
  await expect(outcome("Managed Websites")).toContainText("Request setup");
  await expect(outcome("Internal applications")).toContainText("Request setup");
  await expect(outcome("Scheduling")).toContainText("Request setup");
  await expect(outcome("Ongoing checks")).toContainText("Request setup");
  await expect(outcome("Delegated work")).toContainText("Request setup");
  await expect(outcome("Home Finder")).toContainText("Explore example");
  // Operator-only catalog entries stay out of customer discovery.
  await expect(main.getByText("Domain Monitoring", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/workspace-products-desktop.png", fullPage: true });

  await outcome("Internal applications").getByRole("button", { name: "Request setup" }).click();
  await expect(page.getByRole("heading", { name: "What do you need?", exact: true })).toBeVisible();
  await expect(page.getByLabel("What are you trying to do?")).toHaveValue(/Internal applications/);

  await page.goto(`/workspace?workspaceId=${CUSTOMER_ID}&view=products`);
  const refreshedMain = page.getByRole("main");
  const refreshedOutcome = (name: string) => refreshedMain.locator('[class*="discoveryRow"]').filter({ hasText: name }).first();
  await refreshedOutcome("Inquiry work").getByRole("button", { name: "Start" }).click();
  await expect(refreshedMain.getByRole("heading", { name: "Inquiry work", exact: true })).toBeVisible();
  await refreshedMain.getByRole("button", { name: "Open Harbor Dental" }).click();
  await expect(refreshedMain.getByRole("heading", { name: "What should Strelva handle?", exact: true })).toBeVisible();

  await page.goto(`/workspace?workspaceId=${CUSTOMER_ID}&view=products`);
  const finalMain = page.getByRole("main");
  const finalOutcome = finalMain.locator('[class*="discoveryRow"]').filter({ hasText: "Home Finder" }).first();
  await finalOutcome.getByRole("button", { name: "Explore example" }).click();
  await expect(finalMain.getByRole("heading", { name: "Home Finder", exact: true })).toBeVisible();
  await expect(finalMain.getByRole("link", { name: /Try Home Finder/ })).toHaveAttribute("href", "http://127.0.0.1:3213/embed/agency-preview");
  await expect(finalMain).toContainText("A live installation needs brokerage approval");
  await finalMain.getByRole("button", { name: "Ask about early access" }).click();
  await expect(page.getByLabel("What are you trying to do?")).toHaveValue(/enabling a live brokerage installation/);
});

test("keeps managed discovery honest when tenant links are temporarily unavailable", async ({ page }) => {
  await mockWorkspace(page, (route) => fulfill(route, snapshot({
    managedWork: [],
    managedWorkUnavailable: true,
    products: [
      { id: "managed_presence", name: "Managed Websites", description: "Keep an existing client website current.", availability: "managed" },
    ],
  })));

  await page.goto("/workspace");
  await expect(page.getByRole("status")).toContainText("Some websites could not be loaded.");
  await expect(page.getByRole("link", { name: "Check website access" })).toHaveAttribute("href", "/workspace/account");
  await expect(page.getByRole("button", { name: "Open Harbor Dental" })).toBeVisible();
});

test("returns from an empty agency view to My work", async ({ page }) => {
  await mockWorkspace(page, (route) => fulfill(route, snapshot({ work: [] })));
  await page.goto("/workspace");
  await expectBusinessHome(page);
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await openWorkspaceHelp(page);
  await page.getByRole("main").getByRole("button", { name: "Sharing & agency access" }).click();
  await expect(page.getByRole("heading", { name: "Prepare useful work before the customer arrives." })).toBeVisible();
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await expectBusinessHome(page);
});

test("keeps My work and Shared with me context-local and read-only", async ({ page }) => {
  const sharedWork = work({
    id: CUSTOMER_WORK_ID,
    workspaceId: CUSTOMER_ID,
    title: "Customer-owned assessment",
  });
  const workspaces: WorkspaceSnapshot["workspaces"] = [
    { id: PERSONAL_ID, kind: "personal", name: "My work", access: "member" },
    { id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", access: "delegated_read" },
  ];
  await mockWorkspace(page, (route) => {
    const selected = new URL(route.request().url()).searchParams.get("workspaceId");
    return fulfill(route, selected === CUSTOMER_ID
      ? snapshot({ workspaces, workspaceId: CUSTOMER_ID, work: [sharedWork], managedWork: [] })
      : snapshot({ workspaces, workspaceId: PERSONAL_ID, work: [work()], managedWork: [] }));
  });

  await page.goto("/workspace");
  await page.getByLabel("Current workspace").selectOption(CUSTOMER_ID);
  await expect(page.getByRole("heading", { name: "Your shared work.", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your apps and work", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Customer-owned assessment" })).toBeVisible();
  await page.getByRole("link", { name: /^Apps & templates/ }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check a business", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "New", exact: true })).toBeDisabled();

  // Returning to owned work changes context before rendering its collection.
  await page.getByLabel("Current workspace").selectOption(PERSONAL_ID);
  await expectBusinessHome(page);
  await expect(page.getByRole("button", { name: "Open Harbor Dental" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Customer-owned assessment" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/workspace-my-work-restored.png", fullPage: true });
});

test("hands work to the named customer with optional access unchecked, then revokes it", async ({ page }) => {
  const agencyWork = work({ workspaceId: AGENCY_ID });
  let customerAccepted = false;
  let delegationActive = true;
  let handoffs: WorkspaceSnapshot["handoffs"] = [];
  const workspaces: WorkspaceSnapshot["workspaces"] = [
    { id: PERSONAL_ID, kind: "personal", name: "My work" },
    { id: AGENCY_ID, kind: "agency", name: "Northstar Agency" },
    { id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", role: "owner" },
  ];
  const agencySnapshot = () => snapshot({ actor: { email: "agency@example.com", localPreview: false }, workspaces, workspaceId: AGENCY_ID, work: [agencyWork], handoffs });
  const customerSnapshot = () => snapshot({ workspaces, workspaceId: CUSTOMER_ID, work: [work({ id: CUSTOMER_WORK_ID, workspaceId: CUSTOMER_ID })], handoffs: [], delegations: delegationActive ? [{ id: DELEGATION_ID, workId: CUSTOMER_WORK_ID, agencyWorkspaceId: AGENCY_ID, status: "active", canRevoke: true }] : [] });
  const preview: WorkspaceHandoffPreview = { recipientEmail: "owner@example.com", agencyName: "Northstar Agency", work: agencyWork, expiresAt: "2026-09-12T14:00:00.000Z", destinations: [{ id: CUSTOMER_ID, name: "Harbor Dental" }], accepted: false };

  await mockWorkspace(page, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      const selected = new URL(request.url()).searchParams.get("workspaceId");
      return fulfill(route, selected === CUSTOMER_ID || customerAccepted ? customerSnapshot() : agencySnapshot());
    }
    const body = request.postDataJSON() as { action: string; allowAgencyAccess?: boolean; destination?: { kind?: string; workspaceId?: string; name?: string } };
    if (body.action === "handoff") {
      handoffs = [{ id: HANDOFF_ID, sourceWorkId: WORK_ID, recipientEmail: "owner@example.com", status: "pending", expiresAt: preview.expiresAt, createdAt: "2026-09-05T15:00:00.000Z" }];
      return fulfill(route, { token: "recipient-bound-secret" }, 201);
    }
    if (body.action === "inspect_handoff") return fulfill(route, preview);
    if (body.action === "accept_handoff") {
      expect(body.allowAgencyAccess).toBe(true);
      expect(body.destination).toEqual({ kind: "existing", workspaceId: CUSTOMER_ID });
      customerAccepted = true;
      return fulfill(route, { workspaceId: CUSTOMER_ID, workId: CUSTOMER_WORK_ID });
    }
    if (body.action === "revoke_delegation") {
      delegationActive = false;
      return fulfill(route, { ok: true });
    }
    return fulfill(route, { error: "Unexpected mocked action." }, 400);
  });

  await page.goto("/workspace?ignored=public#handoff=");
  await expect(page.getByRole("heading", { name: "Client work", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await openWorkspaceHelp(page);
  await page.getByRole("main").getByRole("button", { name: "Sharing & agency access" }).click();
  await page.getByLabel("Customer email").fill("owner@example.com");
  await page.getByRole("button", { name: "Create private handoff" }).click();
  await expect(page.getByText(/\/workspace#handoff=recipient-bound-secret/)).toBeVisible();
  await expect(page.getByText(/workspace\?handoff=/)).toHaveCount(0);

  await page.goto("/workspace#handoff=recipient-bound-secret");
  await expect(page.getByRole("heading", { name: "Northstar Agency prepared this for you." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to workspace" })).toBeFocused();
  const consent = page.getByLabel("Allow Northstar Agency read-only access");
  await expect(consent).not.toBeChecked();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Accept into my workspace" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Back to workspace" })).toBeFocused();
  await page.getByLabel("Business", { exact: true }).selectOption(CUSTOMER_ID);
  await consent.check();
  await page.getByRole("button", { name: "Accept into my workspace" }).click();
  expect(new URL(page.url()).searchParams.has("save")).toBe(false);
  await expect(page).toHaveURL(url => Boolean(url.searchParams.get("work")));
  await expect(page.getByRole("heading", { name: "Harbor Dental", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await openWorkspaceHelp(page);
  await page.getByRole("main").getByRole("button", { name: "Sharing & agency access" }).click();
  await expect(page.getByRole("heading", { name: "You own this workspace." })).toBeVisible();
  await page.getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByText("Agency access was revoked. Your work remains here.")).toBeVisible();
  await expect(page.getByText("No agency can access this workspace.")).toBeVisible();
});

test("hands a tracker to the named customer and keeps optional agency access read-only", async ({ page }) => {
  const agencyWork = trackerWork();
  const customerWork = trackerWork({ id: CUSTOMER_WORK_ID, workspaceId: CUSTOMER_ID });
  let phase: "agency" | "customer" | "agency-reader" = "agency";
  let handoffs: WorkspaceSnapshot["handoffs"] = [];
  const agencyWorkspaces: WorkspaceSnapshot["workspaces"] = [
    { id: AGENCY_ID, kind: "agency", name: "Northstar Agency", access: "member" },
  ];
  const customerWorkspaces: WorkspaceSnapshot["workspaces"] = [
    { id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", access: "member", role: "owner" },
  ];
  const agencyReaderWorkspaces: WorkspaceSnapshot["workspaces"] = [
    { id: AGENCY_ID, kind: "agency", name: "Northstar Agency", access: "member" },
    { id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", access: "delegated_read" },
  ];
  const agencySnapshot = () => snapshot({ actor: { email: "agency@example.com", localPreview: false }, workspaces: agencyWorkspaces, workspaceId: AGENCY_ID, work: [agencyWork], handoffs });
  const customerSnapshot = () => snapshot({ actor: { email: "owner@example.com", localPreview: false }, workspaces: customerWorkspaces, workspaceId: CUSTOMER_ID, work: [customerWork], handoffs: [], delegations: [{ id: DELEGATION_ID, workId: CUSTOMER_WORK_ID, agencyWorkspaceId: AGENCY_ID, status: "active", canRevoke: true }] });
  const agencyReaderSnapshot = () => snapshot({ actor: { email: "agency@example.com", localPreview: false }, workspaces: agencyReaderWorkspaces, workspaceId: CUSTOMER_ID, work: [customerWork], handoffs: [], delegations: [{ id: DELEGATION_ID, workId: CUSTOMER_WORK_ID, agencyWorkspaceId: AGENCY_ID, status: "active", canRevoke: false }] });
  const preview: WorkspaceHandoffPreview = { recipientEmail: "owner@example.com", agencyName: "Northstar Agency", work: { ...agencyWork, tracker: trackerPreview }, expiresAt: "2026-09-12T14:00:00.000Z", destinations: [{ id: CUSTOMER_ID, name: "Harbor Dental" }], accepted: false };

  await mockWorkspace(page, async (route) => {
    if (route.request().method() === "GET") {
      return fulfill(route, phase === "agency" ? agencySnapshot() : phase === "customer" ? customerSnapshot() : agencyReaderSnapshot());
    }
    const body = route.request().postDataJSON() as { action: string; allowAgencyAccess?: boolean; destination?: { kind?: string; workspaceId?: string; name?: string } };
    if (body.action === "handoff") {
      handoffs = [{ id: HANDOFF_ID, sourceWorkId: TRACKER_WORK_ID, recipientEmail: "owner@example.com", status: "pending", expiresAt: preview.expiresAt, createdAt: "2026-09-05T15:00:00.000Z" }];
      return fulfill(route, { token: "tracker-recipient-secret" }, 201);
    }
    if (body.action === "inspect_handoff") return fulfill(route, preview);
    if (body.action === "accept_handoff") {
      expect(body.allowAgencyAccess).toBe(true);
      expect(body.destination).toEqual({ kind: "existing", workspaceId: CUSTOMER_ID });
      phase = "customer";
      return fulfill(route, { workspaceId: CUSTOMER_ID, workId: CUSTOMER_WORK_ID });
    }
    return fulfill(route, { error: "Unexpected mocked action." }, 400);
  });
  await page.route("**/api/tracker*", (route) => fulfill(route, { workId: CUSTOMER_WORK_ID, workspaceId: CUSTOMER_ID, tracker: trackerSnapshot }));

  await page.goto(`/workspace?workspaceId=${AGENCY_ID}&view=work&work=${TRACKER_WORK_ID}`);
  await page.getByRole("button", { name: "Sharing & access", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Put finished work in the customer’s hands." })).toBeVisible();
  await page.getByLabel("Customer email").fill("owner@example.com");
  await page.getByRole("button", { name: "Create private handoff" }).click();

  await page.goto("/workspace#handoff=tracker-recipient-secret");
  await expect(page.getByRole("heading", { name: "Northstar Agency prepared this for you." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared backlog", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Example" })).toBeVisible();
  const consent = page.getByLabel("Allow Northstar Agency read-only access");
  await expect(consent).not.toBeChecked();
  await page.getByLabel("Business", { exact: true }).selectOption(CUSTOMER_ID);
  await consent.check();
  await page.getByRole("button", { name: "Accept into my workspace" }).click();
  await expect(page.getByRole("heading", { name: "Shared backlog", exact: true })).toBeVisible();

  phase = "agency-reader";
  await page.goto(`/workspace?workspaceId=${CUSTOMER_ID}&view=tracker&work=${CUSTOMER_WORK_ID}`);
  await expect(page.getByText("You can review this work. Editing requires workspace membership.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared backlog", exact: true })).toBeVisible();
});

test("resets a created handoff link when the selected work changes", async ({ page }) => {
  const first = work({
    workspaceId: AGENCY_ID,
    title: "First assessment",
    payload: { ...work().payload!, business: "First assessment" },
  });
  const second = work({
    id: SECOND_WORK_ID,
    workspaceId: AGENCY_ID,
    title: "Second assessment",
    payload: { ...work().payload!, business: "Second assessment" },
  });
  const workspaces: WorkspaceSnapshot["workspaces"] = [
    { id: AGENCY_ID, kind: "agency", name: "Northstar Agency" },
  ];
  let handoffs: WorkspaceSnapshot["handoffs"] = [];
  await mockWorkspace(page, async (route) => {
    if (route.request().method() === "GET") return fulfill(route, snapshot({ actor: { email: "agency@example.com", localPreview: false }, workspaces, workspaceId: AGENCY_ID, work: [first, second], handoffs }));
    const body = route.request().postDataJSON() as { action: string };
    if (body.action === "handoff") {
      handoffs = [{ id: HANDOFF_ID, sourceWorkId: WORK_ID, recipientEmail: "owner@example.com", status: "pending", expiresAt: "2026-09-12T14:00:00.000Z", createdAt: "2026-09-05T15:00:00.000Z" }];
      return fulfill(route, { token: "recipient-bound-secret" }, 201);
    }
    return fulfill(route, { error: "Unexpected mocked action." }, 400);
  });

  await page.goto("/workspace");
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await openWorkspaceHelp(page);
  await page.getByRole("main").getByRole("button", { name: "Sharing & agency access" }).click();
  await page.getByLabel("Customer email").fill("owner@example.com");
  await page.getByRole("button", { name: "Create private handoff" }).click();
  await expect(page.getByText(/recipient-bound-secret/)).toBeVisible();

  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await page.getByRole("button", { name: /Second assessment/ }).click();
  await page.getByRole("button", { name: "Sharing & access", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create private handoff" })).toBeVisible();
  await expect(page.getByText(/recipient-bound-secret/)).toHaveCount(0);
  await expect(page.getByLabel("Customer email")).toHaveValue("");
});

test("drops a late handoff completion after the work context changes", async ({ page }) => {
  const first = work({
    workspaceId: AGENCY_ID,
    title: "First assessment",
    payload: { ...work().payload!, business: "First assessment" },
  });
  const second = work({
    id: SECOND_WORK_ID,
    workspaceId: AGENCY_ID,
    title: "Second assessment",
    payload: { ...work().payload!, business: "Second assessment" },
  });
  const workspaces: WorkspaceSnapshot["workspaces"] = [
    { id: AGENCY_ID, kind: "agency", name: "Northstar Agency" },
  ];
  let handoffStarted = false;
  await mockWorkspace(page, async (route) => {
    if (route.request().method() === "GET") return fulfill(route, snapshot({ actor: { email: "agency@example.com", localPreview: false }, workspaces, workspaceId: AGENCY_ID, work: [first, second] }));
    const body = route.request().postDataJSON() as { action: string };
    if (body.action === "handoff") {
      handoffStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 350));
      return fulfill(route, { token: "late-recipient-secret" }, 201);
    }
    return fulfill(route, { error: "Unexpected mocked action." }, 400);
  });

  await page.goto("/workspace");
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await openWorkspaceHelp(page);
  await page.getByRole("main").getByRole("button", { name: "Sharing & agency access" }).click();
  await page.getByLabel("Customer email").fill("owner@example.com");
  await page.getByRole("button", { name: "Create private handoff" }).click();
  await expect.poll(() => handoffStarted).toBe(true);
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await page.getByRole("button", { name: /Second assessment/ }).click();
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "Sharing & access", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create private handoff" })).toBeVisible();
  await expect(page.getByText(/late-recipient-secret/)).toHaveCount(0);
});

test("keeps delegated customer work read-only while customer-owned work retains controls", async ({ page }) => {
  const delegated = work({
    id: CUSTOMER_WORK_ID,
    workspaceId: CUSTOMER_ID,
    payload: {
      ...work().payload!,
      score: 0,
      grade: "F",
      readinessMeasured: false,
      measurementStatus: "unavailable",
      measurementNote: "The customer has not rerun this assessment.",
    },
  });
  await mockWorkspace(page, (route) => fulfill(route, snapshot({
    workspaceId: CUSTOMER_ID,
    workspaces: [
      { id: AGENCY_ID, kind: "agency", name: "Northstar Agency", access: "member" },
      { id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", access: "delegated_read" },
    ],
    work: [delegated],
    delegations: [{ id: DELEGATION_ID, workId: CUSTOMER_WORK_ID, agencyWorkspaceId: AGENCY_ID, status: "active", canRevoke: false }],
  })));

  await page.goto("/workspace");
  await page.getByRole("button", { name: "Open Harbor Dental" }).click();
  await expect(page.getByText("Read-only access granted by the customer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry assessment" })).toHaveCount(0);

  await page.getByRole("button", { name: "Sharing & access", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Customer work shared read-only." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create private handoff" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Revoke/ })).toHaveCount(0);
  await expect(page.getByText("You own this workspace.")).toHaveCount(0);
});

test("ignores a stale workspace response after a newer account switch", async ({ page }) => {
  const workspaces: WorkspaceSnapshot["workspaces"] = [
    { id: PERSONAL_ID, kind: "personal", name: "My work" },
    { id: AGENCY_ID, kind: "agency", name: "Slow agency" },
    { id: CUSTOMER_ID, kind: "customer", name: "Current customer" },
  ];
  await mockWorkspace(page, async (route) => {
    const selected = new URL(route.request().url()).searchParams.get("workspaceId");
    if (selected === AGENCY_ID) await new Promise((resolve) => setTimeout(resolve, 300));
    if (selected === CUSTOMER_ID) await new Promise((resolve) => setTimeout(resolve, 10));
    return fulfill(route, snapshot({ workspaces, workspaceId: selected || PERSONAL_ID, work: selected === CUSTOMER_ID ? [work({ workspaceId: CUSTOMER_ID, title: "Current customer result", payload: { ...work().payload!, business: "Current customer result" } })] : [] }));
  });

  await page.goto("/workspace");
  const selector = page.getByLabel("Current workspace");
  await selector.selectOption(AGENCY_ID);
  await selector.evaluate((element) => element.removeAttribute("disabled"));
  await selector.selectOption(CUSTOMER_ID);
  await expect(page.getByRole("button", { name: "Open Current customer result" })).toBeVisible();
  await page.waitForTimeout(350);
  await expect(selector).toHaveValue(CUSTOMER_ID);
});


test("lets someone prepare a capability request without claiming it was submitted", async ({ page }) => {
  let mutations = 0;
  await mockWorkspace(page, (route) => {
    if (route.request().method() !== "GET") mutations += 1;
    return fulfill(route, snapshot());
  });
  await page.goto("/workspace");
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await openWorkspaceHelp(page);
  await expect(page.getByRole("heading", { name: "What do you need?" })).toBeVisible();
  const request = page.getByLabel("What are you trying to do?");
  await request.fill("I use WordPress and need a way to review changes before publishing.");
  const email = page.getByRole("link", { name: "Open email", exact: true });
  const href = await email.getAttribute("href");
  expect(href).toMatch(/^mailto:hello@strelva\.com\?/);
  expect(decodeURIComponent(href!)).toContain("I use WordPress and need a way to review changes before publishing.");
  await expect(page.getByText("Opens your email app. Nothing is sent until you send it; requests are not delivery commitments.")).toBeVisible();
  expect(mutations).toBe(0);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(request).toBeVisible();
});

test("does not add a completed assessment to a workspace selected while it was running", async ({ page }) => {
  const workspaces: WorkspaceSnapshot["workspaces"] = [
    { id: PERSONAL_ID, kind: "personal", name: "My work" },
    { id: AGENCY_ID, kind: "agency", name: "Northstar Agency" },
  ];
  const completed = work({ title: "Original workspace assessment", payload: { ...work().payload!, business: "Original workspace assessment" } });
  const agencyWork = work({ id: CUSTOMER_WORK_ID, workspaceId: AGENCY_ID, title: "Agency assessment" });
  let saved: WorkspaceWork[] = [];
  let pendingAssessment: Route | undefined;
  await mockWorkspace(page, async (route) => {
    if (route.request().method() === "GET") {
      const selected = new URL(route.request().url()).searchParams.get("workspaceId") || PERSONAL_ID;
      return fulfill(route, snapshot({ workspaces, workspaceId: selected, work: selected === AGENCY_ID ? [agencyWork] : saved }));
    }
    const action = route.request().postDataJSON() as { action: string; workspaceId: string };
    expect(action.action).toBe("assess");
    expect(action.workspaceId).toBe(PERSONAL_ID);
    pendingAssessment = route;
  });

  await page.goto("/workspace");
  await page.getByRole("link", { name: "Apps & templates", exact: true }).click();
  await page.getByText("More tools and managed services", { exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI Visibility", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check a business", exact: true }).click();
  await page.getByLabel("Business name").fill("Original workspace assessment");
  await page.getByRole("button", { name: "Run assessment" }).click();
  await expect.poll(() => Boolean(pendingAssessment)).toBe(true);

  await page.getByLabel("Current workspace").selectOption(AGENCY_ID);
  await expect(page.getByRole("button", { name: /Agency assessment/ })).toBeVisible();
  const response = page.waitForResponse((item) => item.url().endsWith("/api/workspace") && item.request().method() === "POST");
  saved = [completed];
  await fulfill(pendingAssessment!, { work: completed }, 201);
  await (await response).finished();
  // Allow the resolved form promise and React's subsequent render to settle.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  await expect(page.getByLabel("Current workspace")).toHaveValue(AGENCY_ID);
  expect(new URL(page.url()).searchParams.get("workspaceId")).toBe(AGENCY_ID);
  expect(new URL(page.url()).searchParams.get("work")).toBeNull();
  await expect(page.getByRole("button", { name: /Agency assessment/ })).toBeVisible();
  await expect(page.getByText("Original workspace assessment", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Assessment saved privately to this workspace.")).toHaveCount(0);
  // The completed work remains available from its actual owning workspace.
  await page.getByLabel("Current workspace").selectOption(PERSONAL_ID);
  await expect(page.getByRole("button", { name: "Open Original workspace assessment" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Agency assessment/ })).toHaveCount(0);
});

test("drops a late tracker save after the workspace changes", async ({ page }) => {
  const workspaces: WorkspaceSnapshot["workspaces"] = [
    { id: PERSONAL_ID, kind: "personal", name: "My work" },
    { id: AGENCY_ID, kind: "agency", name: "Northstar Agency" },
  ];
  const agencyWork = work({ id: SECOND_WORK_ID, workspaceId: AGENCY_ID, title: "Agency result" });
  const preview = previewTrackerImport({ sourceId: "late-tracker-source", fileName: "tasks.csv", mimeType: "text/csv", content: "Task,Status\nReview,Open" });
  const savedTracker = createTracker(preview, { trackerId: "late-tracker", actorId: "owner", title: "Late tracker" });
  let pendingCreate: Route | undefined;
  await mockWorkspace(page, async (route) => {
    if (route.request().method() !== "GET") return fulfill(route, { error: "Unexpected mocked workspace action." }, 400);
    const selected = new URL(route.request().url()).searchParams.get("workspaceId") || PERSONAL_ID;
    return fulfill(route, snapshot({
      workspaces,
      workspaceId: selected,
      work: selected === AGENCY_ID ? [agencyWork] : [],
      products: [...snapshot().products, { id: "tracker", name: "Spreadsheet tracker", description: "Turn a CSV into working data.", availability: "available" }],
    }));
  });
  await page.route("**/api/tracker**", async (route) => {
    if (route.request().method() !== "POST") return fulfill(route, { error: "Unexpected tracker read." }, 400);
    const body = route.request().postDataJSON() as { action?: string };
    if (body.action === "preview") return fulfill(route, { preview });
    if (body.action === "create") {
      pendingCreate = route;
      return;
    }
    return fulfill(route, { error: "Unexpected tracker action." }, 400);
  });

  await page.goto(`/workspace?workspaceId=${PERSONAL_ID}&view=tracker`);
  await page.getByRole("button", { name: "Task list", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preview imported rows", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create tracker", exact: true }).click();
  await expect.poll(() => Boolean(pendingCreate)).toBe(true);

  await page.getByLabel("Current workspace").selectOption(AGENCY_ID);
  await expect(page.getByRole("heading", { name: "Client work", exact: true })).toBeVisible();
  await fulfill(pendingCreate!, { workId: "late-tracker", workspaceId: PERSONAL_ID, tracker: savedTracker }, 201);
  await page.waitForTimeout(250);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  const url = new URL(page.url());
  expect(url.searchParams.get("workspaceId")).toBe(AGENCY_ID);
  expect(url.searchParams.get("work")).toBeNull();
  await expect(page.getByRole("heading", { name: "Client work", exact: true })).toBeVisible();
  await expect(page.getByText("Late tracker", { exact: true })).toHaveCount(0);
});

test("restores the exact agency result across reload and browser history", async ({ page }) => {
  const agencyWork = work({ id: CUSTOMER_WORK_ID, workspaceId: AGENCY_ID, title: "Agency result", payload: { ...work().payload!, business: "Agency result" } });
  const workspaces: WorkspaceSnapshot["workspaces"] = [{ id: PERSONAL_ID, kind: "personal", name: "Personal" }, { id: AGENCY_ID, kind: "agency", name: "Agency" }];
  await mockWorkspace(page, route => {
    const selected = new URL(route.request().url()).searchParams.get("workspaceId") || PERSONAL_ID;
    return fulfill(route, snapshot({ workspaces, workspaceId: selected, work: selected === AGENCY_ID ? [agencyWork] : [work()] }));
  });
  await page.goto(`/workspace?workspaceId=${AGENCY_ID}&work=${CUSTOMER_WORK_ID}`);
  await expect(page.getByRole("heading", { name: "Agency result", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Agency result", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Strelva home", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Client work", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Agency result", exact: true })).toBeVisible();
  await expect(page.getByLabel("Current workspace")).toHaveValue(AGENCY_ID);
});

test("never substitutes another result for an unavailable deep link", async ({ page }) => {
  await mockWorkspace(page, route => fulfill(route, snapshot()));
  await page.goto(`/workspace?workspaceId=${PERSONAL_ID}&work=missing`);
  await expect(page.getByRole("heading", { name: "This saved result is unavailable." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Harbor Dental", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Back to work", exact: true }).click();
  await page.getByRole("button", { name: "Open Harbor Dental", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Harbor Dental", exact: true })).toBeVisible();
});

test("preserves a private result through signed-out and failed callback recovery", async ({ page }) => {
  const target = `/workspace?workspaceId=${AGENCY_ID}&work=${CUSTOMER_WORK_ID}`;
  await mockWorkspace(page, route => fulfill(route, { error: "Sign in to continue." }, 401));
  await page.goto(target);
  await expect(page.getByRole("link", { name: "Sign in", exact: true }).first()).toHaveAttribute("href", `/sign-in?next=${encodeURIComponent(target)}`);
  await page.goto(`/auth/callback?next=${encodeURIComponent(target)}`);
  expect(new URL(page.url()).searchParams.get("next")).toBe(target);
  await expect(page.getByRole("heading", { name: "Your work starts here." })).toBeVisible();
});

test("a retry retains the business inputs of an unmeasured assessment", async ({ page }) => {
  await mockWorkspace(page, route => fulfill(route, snapshot({ work: [work({ payload: { ...work().payload!, measurementStatus: "unavailable", readinessMeasured: false } })] })));
  await page.goto(`/workspace?work=${WORK_ID}`);
  await page.getByRole("button", { name: "Retry assessment" }).click();
  await expect(page.getByLabel("Business name")).toHaveValue("Harbor Dental");
  await expect(page.getByLabel("Website", { exact: true })).toHaveValue("https://harbordental.example");
  await expect(page.getByLabel("Location")).toHaveValue("Buffalo, NY");
});

test("saves and reopens a website audit without trusting a browser payload", async ({ page }) => {
  const audit = work({ productId: "website_audit", resourceKind: "website_audit_report", title: "https://bakery.example/", payload: null,
    auditPayload: { url: "https://bakery.example/", scannedAt: "2026-09-08T12:00:00Z", overallScore: 80, grade: "B", categories: [{ name: "SEO", slug: "seo", weight: 1, score: 80, checks: [{ name: "Fictional title evidence", status: "pass", score: 80, message: "This is a browser fixture." }] }] } });
  let saved=false;
  await mockWorkspace(page, async route => {
    if (route.request().method()==="GET") return fulfill(route,snapshot({work:saved?[audit]:[]}));
    const body=route.request().postDataJSON();
    expect(body).toEqual({action:"save_website_audit",workspaceId:PERSONAL_ID,resultId:`audit_${"a".repeat(32)}`});
    saved=true; return fulfill(route,{work:audit});
  });
  await page.goto(`/workspace?save=audit_${"a".repeat(32)}`);
  await page.getByRole("button",{name:"Save a copy"}).click();
  await expect(page.getByRole("heading",{name:"Site Health Report"})).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`work=${WORK_ID}`));
  await page.reload();
  await page.getByRole("button",{name:/SEO/}).click();
  await expect(page.getByText("Fictional title evidence")).toBeVisible();
  await expect(page.getByText("Saved privately to this workspace.")).toBeVisible();
  await page.setViewportSize({width:360,height:800});
  expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Save as PDF"}).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button",{name:"Save as PDF"})).toBeVisible();
});

test("recovers the same assessment after a lost response and reload", async ({ page }) => {
  let requestId="";
  let completed=false;
  await mockWorkspace(page, async route => {
    if(route.request().method()==="GET") return fulfill(route,snapshot({work:completed?[work()]:[]}));
    const body=route.request().postDataJSON();
    if(body.action==="assess") { requestId=body.requestId; completed=true; return route.abort("failed"); }
    expect(body).toEqual({action:"recover_assessment",workspaceId:PERSONAL_ID,requestId});
    return fulfill(route,{work:work()});
  });
  await page.goto("/workspace");
  await page.getByRole("button",{name:"Explore offerings", exact:true}).click();
  await page.getByRole("button",{name:"Start", exact:true}).click();
  await expect(page.getByRole("heading",{name:"AI Visibility", exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Check a business", exact:true}).click();
  await page.getByRole("textbox",{name:"Business name"}).fill("Harbor Dental");
  await page.getByRole("button",{name:"Run assessment"}).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  await page.reload();
  await page.getByRole("button",{name:"Recover assessment"}).click();
  await expect(page.getByRole("heading",{name:"Harbor Dental"})).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`work=${WORK_ID}`));
  await expect(page.getByRole("button",{name:"Recover assessment"})).toHaveCount(0);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
test(`agency queue pages through all clients and reports unavailable work at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  const customers: WorkspaceSnapshot["workspaces"] = Array.from({ length: 10 }, (_, index) => ({
    id: `90000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    kind: "customer", name: `Page Client ${index + 1}`, access: "delegated_read",
  }));
  const workspaces: WorkspaceSnapshot["workspaces"] = [{ id: AGENCY_ID, kind: "agency", name: "North Studio", access: "member" }, ...customers];
  const delegations: WorkspaceSnapshot["delegations"] = customers.map((customer, index) => ({
    id: `delegation-${index}`, workId: `shared-${index}`, customerWorkspaceId: customer.id,
    agencyWorkspaceId: AGENCY_ID, status: "active", canRevoke: false,
  }));
  await mockWorkspace(page, route => {
    const selected = new URL(route.request().url()).searchParams.get("workspaceId") || AGENCY_ID;
    if (selected === customers[9]!.id) return fulfill(route, { error: "Temporarily unavailable" }, 503);
    const index = customers.findIndex(customer => customer.id === selected);
    return fulfill(route, snapshot({ workspaceId: selected, workspaces, delegations,
      work: index < 0 ? [] : [work({ id: `shared-${index}`, workspaceId: selected, title: `Review client ${index + 1}`, operation: { status: "needs_attention" } })],
    }));
  });
  await page.goto(`/workspace?workspaceId=${AGENCY_ID}`);
  await expect(page.getByText("Clients 1–8 of 10", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next clients", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Clients 9–10 of 10", { exact: true })).toBeVisible();
  await expect(page.getByText("Review client 9", { exact: true })).toBeVisible();
  await expect(page.getByText("Shared-work check unavailable", { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/strelva-agency-page-${viewport.width}.png`, fullPage: true });
  await expect(page.getByRole("button", { name: "Next clients", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Previous clients", exact: true }).click();
  await expect(page.getByText("Clients 1–8 of 10", { exact: true })).toBeVisible();
  await expect(page.getByText("Review client 1", { exact: true })).toBeVisible();
});
}

test("unavailable payer history does not claim that no payer exists", async ({ page }) => {
  await mockWorkspace(page, route => fulfill(route, snapshot({ workspaceId: CUSTOMER_ID,
    workspaces: [{ id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", access: "member", role: "owner" }], work: [],
  })));
  await page.route("**/api/work-economics/payer-transition**", route => fulfill(route, { error: "Payer history could not be loaded." }, 503));
  await page.route("**/api/work-allowances?**", route => fulfill(route, { error: "Allowance unavailable." }, 503));
  await page.goto(`/workspace?workspaceId=${CUSTOMER_ID}&view=settings`);
  await expect(page.getByText("Payer history could not be loaded.", { exact: true })).toBeVisible();
  await expect(page.getByText("No successor payer has been accepted for future jobs.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry payer history", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Retry payer history", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/strelva-billing-unavailable-mobile.png" });
});

test("empty allowance records explain billing status without implying access", async ({ page }) => {
  await mockWorkspace(page, route => fulfill(route, snapshot({ workspaceId: CUSTOMER_ID,
    workspaces: [{ id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", access: "member", role: "owner" }], work: [],
  })));
  await page.route("**/api/work-allowances?**", route => fulfill(route, { allowances: [], currentActorId: "owner", policy: { stripeSynchronized: false }, subscription: {
    subscriptionId: "sub_past_due",
    customerId: "cus_harbor",
    configKey: "included-standard",
    status: "past_due",
    periodStart: "2026-09-01T00:00:00.000Z",
    periodEnd: "2026-10-01T00:00:00.000Z",
    lastEventCreated: 1_800_000_000,
    synchronizedAt: "2026-09-20T12:00:00.000Z",
  } }));
  await page.goto(`/workspace?workspaceId=${CUSTOMER_ID}&view=settings`);
  await expect(page.getByText("No work allowance is recorded for this business.", { exact: true })).toBeVisible();
  await expect(page.getByText("Payment needs attention. No new included work is added while billing is past due.", { exact: true })).toBeVisible();
  await expect(page.getByText("Only recorded allowances can be used for work.", { exact: true })).toBeVisible();
});

test("switching businesses clears the previous payer while the next history loads", async ({ page }) => {
  const nextId = "98989898-9898-4989-8989-989898989898";
  const workspaces: WorkspaceSnapshot["workspaces"] = [
    { id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", access: "member", role: "owner" },
    { id: nextId, kind: "customer", name: "Lake Bakery", access: "member", role: "owner" },
  ];
  await mockWorkspace(page, route => fulfill(route, snapshot({ workspaceId: new URL(route.request().url()).searchParams.get("workspaceId") || CUSTOMER_ID, workspaces, work: [] })));
  let pending: Route | undefined;
  await page.route("**/api/work-economics/payer-transition**", route => {
    if (new URL(route.request().url()).searchParams.get("workspaceId") === nextId) { pending = route; return; }
    return fulfill(route, { currentActorId: "owner", transitions: [], pending: null, current: { id: "accepted", successorEmail: "harbor-payer@example.test", status: "accepted", acceptedAt: "2026-09-20T12:00:00Z" } });
  });
  await page.goto(`/workspace?workspaceId=${CUSTOMER_ID}&view=settings`);
  await expect(page.getByText("harbor-payer@example.test", { exact: false })).toBeVisible();
  await page.getByLabel("Current workspace").selectOption(nextId);
  await expect(page).toHaveURL(new RegExp(nextId));
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await expect(page.getByText("harbor-payer@example.test", { exact: false })).toHaveCount(0);
  await fulfill(pending!, { currentActorId: "owner", transitions: [], pending: null, current: null });
  await expect(page.getByText("No successor payer has been accepted for future jobs.", { exact: true })).toBeVisible();
});

test("onboarding opens inside the shared workspace navigation", async ({ page }) => {
  await mockWorkspace(page, route => fulfill(route, snapshot({ workspaceId: CUSTOMER_ID,
    workspaces: [{ id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", access: "member", role: "owner" }], work: [],
  })));
  await page.route("**/api/onboarding?**", route => fulfill(route, { cases: [] }));
  await page.goto(`/workspace?workspaceId=${CUSTOMER_ID}&view=onboarding`);
  await expect(page.getByRole("heading", { name: "Collect the right records.", exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Strelva navigation", exact: true })).toBeVisible();
  await expect(page.getByLabel("Case title", { exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
});

for (const width of [1440, 390]) {
test(`saved custom applications reopen in the shared workspace and expose unavailable records at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await mockWorkspace(page, route => fulfill(route, snapshot({ workspaceId: CUSTOMER_ID,
    workspaces: [{ id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental", access: "member", role: "owner" }],
    work: [work({ id: CUSTOMER_WORK_ID, workspaceId: CUSTOMER_ID, productId: "custom-applications", resourceKind: "custom-application", title: "Appointment estimator", payload: null })],
  })));
  let retryStarted = false;
  await page.route(`**/api/custom-applications/${CUSTOMER_WORK_ID}/manage`, route => fulfill(route, { error: retryStarted ? "The build record is still unavailable. Your saved application remains." : "Custom build records are temporarily unavailable." }, 503));
  await page.goto(`/workspace?workspaceId=${CUSTOMER_ID}&work=${CUSTOMER_WORK_ID}`);
  await expect(page.getByText("Custom build records are temporarily unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading custom application…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).focus();
  retryStarted = true;
  await page.keyboard.press("Enter");
  await expect(page.getByText("The build record is still unavailable. Your saved application remains.", { exact: true })).toBeVisible();
  if (width > 768) await expect(page.getByRole("complementary", { name: "Strelva navigation", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await page.screenshot({ path: `/tmp/strelva-custom-shell-${width}.png`, fullPage: true });
});
}
