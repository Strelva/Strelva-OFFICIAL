import { expect, test, type Page, type Route } from "@playwright/test";
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
const CUSTOMER_WORK_ID = "55555555-5555-4555-8555-555555555555";
const DELEGATION_ID = "66666666-6666-4666-8666-666666666666";
const HANDOFF_ID = "77777777-7777-4777-8777-777777777777";

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
}

test("renders the result-first workspace on desktop and mobile", async ({ page }) => {
  await mockWorkspace(page, (route) => fulfill(route, snapshot()));
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Good work starts here." })).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-home-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  await page.getByRole("button", { name: "Open Harbor Dental" }).click();
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();
  await expect(page.getByLabel("Grade B, 74 out of 100")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Workspace navigation" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/workspace-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Discuss", exact: true }).click();
  await expect(page.getByText("Discussion isn’t available for private assessments yet.", { exact: false })).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-discussion-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Close discussion" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByText("Do this first")).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Discuss", exact: true }).click();
  const discussionRail = page.locator("#workspace-discussion");
  await expect(discussionRail).toBeVisible();
  await expect(discussionRail).toHaveAttribute("role", "dialog");
  await expect(page.getByRole("button", { name: "Close discussion" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Discuss", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Back to my work" }).click();
  await page.screenshot({ path: "test-results/workspace-home-mobile.png", fullPage: true });
  const search = page.getByRole("searchbox", { name: "Search saved work" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  const mobileNavigation = page.getByRole("dialog", { name: "Workspace navigation" });
  await expect(mobileNavigation).toBeVisible();
  await mobileNavigation.getByRole("button", { name: "Search", exact: true }).click();
  await expect(search).toBeFocused();
  await search.fill("missing");
  await expect(page.getByText("No matching work")).toBeVisible();
});

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
  await expect(page.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/sign-in?next=%2Fworkspace");

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
  await page.getByRole("button", { name: "Check a business" }).click();
  await expect(page.getByRole("heading", { name: "See what AI can understand about this business." })).toBeVisible();
  await page.getByLabel("Business name").fill("Harbor Dental");
  await page.getByLabel("Website").fill("harbordental.example");
  await page.getByRole("button", { name: "Run assessment" }).click();
  await expect(page.getByText("Assessment saved privately to this workspace.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Open Harbor Dental" }).click();
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();
});

test("requires explicit confirmation before saving a public scorecard privately", async ({ page }) => {
  const privateCopy = work({ id: "88888888-8888-4888-8888-888888888888", title: "Harbor Dental public scorecard" });
  let saveRequests = 0;
  await mockWorkspace(page, async (route) => {
    if (route.request().method() === "GET") return fulfill(route, snapshot());
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
  const dialog = page.getByRole("dialog", { name: "Save a private copy of this public scorecard?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Workspace: My work");
  expect(saveRequests).toBe(0);
  await expect(dialog.getByRole("button", { name: "Back" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Save a copy" })).toBeFocused();

  await dialog.getByRole("button", { name: "Save a copy" }).click();
  await expect(page.getByText("Public scorecard saved privately to your workspace.")).toBeVisible();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: "Harbor Dental" })).toBeVisible();
  await expect(page.getByRole("banner")).toContainText("Harbor Dental public scorecard");
  expect(saveRequests).toBe(1);
});

test("preserves a public save destination when signed out", async ({ page }) => {
  await mockWorkspace(page, (route) => fulfill(route, { error: "Sign in with a confirmed email to open your work." }, 401));
  await page.goto("/workspace?save=scan_public123");
  await expect(page.getByRole("heading", { name: "Sign in to open your private work." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/sign-in?next=%2Fworkspace%3Fsave%3Dscan_public123");
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
  const dialog = page.getByRole("dialog", { name: "Save a private copy of this public scorecard?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Save a copy" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveText("That public scorecard is no longer available to save.");
  await expect(page).toHaveURL(/\/workspace\?save=scan_public123$/);
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
  await page.getByRole("button", { name: "Open Harbor Dental" }).click();
  await expect(page.getByText("The website was measured, but the live citation probe was unavailable.")).toBeVisible();
});

test("keeps product discovery descriptive and managed work scoped to authorized links", async ({ page }) => {
  // Product discovery is a browser fixture only. The managed destinations below
  // stand in for server-authorized tenant pointers; no tenant, auth provider, or
  // managed-site backend is contacted by this test.
  await mockWorkspace(page, (route) => fulfill(route, snapshot({
    managedWork: [
      {
        id: "tenant-harbor",
        title: "Harbor Dental website",
        // Mirrors getTenantDashboardFallbackUrl's browser-safe control-plane
        // destination; the real server currently emits an absolute app URL.
        href: "https://app.strelva.com/client/harbor/dashboard",
        productId: "managed_presence",
        relationship: "client",
      },
      {
        id: "tenant-northstar",
        title: "Northstar portfolio",
        href: "https://app.strelva.com/client/northstar/dashboard",
        productId: "managed_presence",
        relationship: "enterprise",
      },
    ],
    products: [
      { id: "ai_visibility", name: "AI Visibility", description: "See what AI can understand about a business.", availability: "available" },
      { id: "managed_presence", name: "Managed Websites", description: "Keep an existing client website current.", availability: "managed" },
      { id: "domain_monitoring", name: "Domain Monitoring", description: "Internal portfolio uptime checks.", availability: "managed" },
      { id: "homefinder", name: "Homefinder", description: "A separate external pilot.", availability: "not_enabled" },
    ],
  })));

  await page.goto("/workspace");
  await page.getByRole("button", { name: "Products", exact: true }).click();
  const shelf = page.locator("#workspace-products");
  await expect(shelf).toBeVisible();
  await expect(shelf.locator('[data-product-id="ai_visibility"]')).toContainText("AI Visibility");
  await expect(shelf.locator('[data-product-id="managed_presence"]')).toContainText("Managed Websites");
  await expect(shelf.getByRole("link", { name: /Harbor Dental website.*Client/ })).toHaveAttribute("href", "https://app.strelva.com/client/harbor/dashboard");
  await expect(shelf.getByRole("link", { name: /Northstar portfolio.*Enterprise/ })).toHaveAttribute("href", "https://app.strelva.com/client/northstar/dashboard");
  await expect(shelf.locator('[data-product-id="homefinder"]')).toContainText("Not enabled");
  // Internal monitoring must not become a consumer-facing product merely
  // because the server catalog contains an operator entry.
  await expect(shelf.locator('[data-product-id="domain_monitoring"]')).toHaveCount(0);
  await page.screenshot({ path: "test-results/workspace-products-desktop.png", fullPage: true });
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
  await page.getByRole("button", { name: "Products", exact: true }).click();
  const shelf = page.locator("#workspace-products");
  await expect(shelf).toContainText("Managed website destinations are temporarily unavailable. Nothing has changed.");
  await expect(shelf.getByRole("link")).toHaveCount(0);
});

test("returns from an empty agency view to My work", async ({ page }) => {
  await mockWorkspace(page, (route) => fulfill(route, snapshot({ work: [] })));
  await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Good work starts here." })).toBeVisible();
  await page.getByRole("button", { name: "Agency" }).click();
  await expect(page.getByRole("heading", { name: "Prepare useful work before the customer arrives." })).toBeVisible();
  await page.getByRole("button", { name: "Work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Good work starts here." })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Shared with me", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Shared with me", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Shared work starts here." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shared with me", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Customer-owned assessment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New", exact: true })).toBeDisabled();
  await expect(page.getByText("Customer-owned work shared with you", { exact: true })).toBeVisible();
  await expect(page.getByText("Private to this workspace", { exact: true })).toHaveCount(0);

  // Returning to My work must switch the selected workspace before rendering its
  // cards; delegated work must not leak into the owned collection.
  await page.getByRole("button", { name: "My work", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Good work starts here." })).toBeVisible();
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
    { id: CUSTOMER_ID, kind: "customer", name: "Harbor Dental" },
  ];
  const agencySnapshot = () => snapshot({ actor: { email: "agency@example.com", localPreview: false }, workspaces, workspaceId: AGENCY_ID, work: [agencyWork], handoffs });
  const customerSnapshot = () => snapshot({ workspaces, workspaceId: CUSTOMER_ID, work: [work({ id: CUSTOMER_WORK_ID, workspaceId: CUSTOMER_ID })], handoffs: [], delegations: delegationActive ? [{ id: DELEGATION_ID, workId: CUSTOMER_WORK_ID, agencyWorkspaceId: AGENCY_ID, status: "active", canRevoke: true }] : [] });
  const preview: WorkspaceHandoffPreview = { recipientEmail: "owner@example.com", agencyName: "Northstar Agency", work: agencyWork, expiresAt: "2026-09-12T14:00:00.000Z", accepted: false };

  await mockWorkspace(page, async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      const selected = new URL(request.url()).searchParams.get("workspaceId");
      return fulfill(route, selected === CUSTOMER_ID || customerAccepted ? customerSnapshot() : agencySnapshot());
    }
    const body = request.postDataJSON() as { action: string; allowAgencyAccess?: boolean };
    if (body.action === "handoff") {
      handoffs = [{ id: HANDOFF_ID, sourceWorkId: WORK_ID, recipientEmail: "owner@example.com", status: "pending", expiresAt: preview.expiresAt, createdAt: "2026-09-05T15:00:00.000Z" }];
      return fulfill(route, { token: "recipient-bound-secret" }, 201);
    }
    if (body.action === "inspect_handoff") return fulfill(route, preview);
    if (body.action === "accept_handoff") {
      expect(body.allowAgencyAccess).toBe(true);
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
  await page.getByRole("button", { name: "Agency" }).click();
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
  await consent.check();
  await page.getByRole("button", { name: "Accept into my workspace" }).click();
  await expect(page).toHaveURL(/\/workspace$/);

  await page.getByRole("button", { name: "Agency" }).click();
  await expect(page.getByRole("heading", { name: "You own this workspace." })).toBeVisible();
  await page.getByRole("button", { name: "Revoke access" }).click();
  await expect(page.getByText("Agency access was revoked. Your work remains here.")).toBeVisible();
  await expect(page.getByText("No agency can access this workspace.")).toBeVisible();
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
  await expect(page.getByRole("button", { name: "New" })).toBeDisabled();
  await page.getByRole("button", { name: "Open Harbor Dental" }).click();
  await expect(page.getByText("Read-only access granted by the customer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry assessment" })).toHaveCount(0);

  await page.getByRole("button", { name: "Access", exact: true }).click();
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
