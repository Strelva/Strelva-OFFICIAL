import { expect, test, type Page, type Route } from "@playwright/test";
import type { InquirySurfaceSnapshot } from "@/products/inquiries/contracts";

test.skip(
  process.env.STRELVA_INQUIRIES_RELEASE !== "1" || process.env.REB_DEV_UNGATED_ACCESS !== "1",
  "Requires the released inquiry route with the local development access bypass.",
);

const SETUP_FIELDS = [
  { id: "website", label: "Website" },
  { id: "business", label: "Business name" },
  { id: "type", label: "Business type" },
  { id: "location", label: "Location" },
  { id: "hours", label: "Opening hours" },
  { id: "staff", label: "Staff listed on the website" },
  { id: "mls", label: "MLS" },
] as const;

function onboardingFacts(website: string | null): InquirySurfaceSnapshot["onboarding"] {
  return {
    website,
    statements: SETUP_FIELDS.map(({ id, label }) => ({
      id,
      label,
      value: id === "website" ? website : null,
      provenance: "Synthetic API fixture",
      editable: true,
      confirmed: false,
    })),
    checks: [{
      id: "website",
      label: "Website evidence",
      status: "unknown",
      detail: "No synthetic website read has run.",
    }],
  };
}

function initialSnapshot(): InquirySurfaceSnapshot {
  return {
    revision: 1,
    business: {
      id: "gldf",
      name: "Synthetic Business",
      domain: "https://synthetic.example",
      role: "owner",
      description: "Synthetic API fixture",
    },
    state: {
      stateVersion: 1,
      requests: [],
      capabilities: [],
      changes: [],
      actionReceipts: [],
      rehearsalScenarios: [],
      rehearsalRuns: [],
      inquiries: [],
      timeline: [],
      responsibilities: [],
      responsibilityReceipts: [],
    },
    capabilities: [],
    connections: ([
      "google",
      "email",
      "calendar",
      "stripe",
      "mls",
    ] as const).map((id) => ({
      id,
      label: id === "google" ? "Google" : id[0]!.toUpperCase() + id.slice(1),
      status: "not_configured" as const,
      canSee: [],
      canDo: [],
      lastCheckedAt: null,
      consentRequired: true as const,
      manageHref: null,
    })),
    onboarding: onboardingFacts(null),
    audience: "business",
    available: true,
    recordsAvailable: true,
    readOnly: false,
    rehearsal: false,
    permissions: {
      canStart: true,
      canEdit: true,
      canPublish: true,
      canManageRecords: true,
      canCorrectOnboarding: true,
      canManageResponsibility: true,
      canManageConnections: true,
    },
  };
}

async function fulfill(route: Route, value: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
}

async function mockInquiryWorkspace(page: Page) {
  let current = initialSnapshot();
  const actions: string[] = [];

  await page.route("**/api/inquiry-workspace**", async (route) => {
    if (route.request().method() === "GET") {
      await fulfill(route, { snapshot: current });
      return;
    }

    const body = route.request().postDataJSON() as {
      action?: { kind?: string; website?: string; statementId?: string; value?: string };
    };
    const action = body.action;
    if (!action?.kind) {
      await fulfill(route, { error: "The synthetic API fixture needs an action." }, 400);
      return;
    }
    actions.push(action.kind);

    if (action.kind === "scan-onboarding") {
      current = {
        ...current,
        revision: (current.revision ?? 0) + 1,
        onboarding: {
          ...current.onboarding,
          website: action.website || current.onboarding.website,
          checks: [{
            id: "website",
            label: "Website evidence",
            status: "failed",
            detail: "The synthetic website read failed. Enter the facts yourself.",
          }],
        },
      };
      await fulfill(route, { snapshot: current, message: "The synthetic website read failed. Review all facts and correct them." });
      return;
    }

    if (action.kind === "correct-onboarding" && action.statementId && typeof action.value === "string") {
      current = {
        ...current,
        revision: (current.revision ?? 0) + 1,
        onboarding: {
          ...current.onboarding,
          statements: current.onboarding.statements.map((statement) => statement.id === action.statementId
            ? {
              ...statement,
              value: action.value!,
              confirmed: true,
              provenance: "Confirmed in synthetic API fixture",
            }
            : statement),
        },
      };
      await fulfill(route, { snapshot: current, message: "Correction saved in the synthetic API fixture." });
      return;
    }

    await fulfill(route, { error: `Unexpected synthetic action: ${action.kind}` }, 400);
  });

  return { actions };
}

test("failed API scan keeps all seven editable facts and a correction survives reload", async ({ page }) => {
  const { actions } = await mockInquiryWorkspace(page);

  await page.goto("/business/gldf", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "What should Strelva handle?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check business details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start with what the website can show.", exact: true })).toBeVisible();

  await page.getByLabel("Read website").fill("https://synthetic.example");
  await page.getByRole("button", { name: "Read website", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("synthetic website read failed");
  await expect(page.locator('[data-status="failed"]')).toContainText("synthetic website read failed");

  for (const { label } of SETUP_FIELDS) {
    await expect(page.getByLabel(label, { exact: true })).toBeEditable();
  }
  await expect(page.getByRole("button", { name: "Save correction", exact: true })).toHaveCount(7);

  await page.getByLabel("Business name", { exact: true }).fill("Corrected Synthetic Business");
  await page.getByRole("button", { name: "Save correction", exact: true }).nth(1).click();
  await expect(page.getByRole("status")).toContainText("Correction saved in the synthetic API fixture.");

  await page.reload();
  await page.getByRole("button", { name: "Check business details", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start with what the website can show.", exact: true })).toBeVisible();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue("Corrected Synthetic Business");
  await expect(page.getByText("Confirmed in synthetic API fixture", { exact: true })).toBeVisible();
  await expect.poll(() => actions).toEqual(["scan-onboarding", "correct-onboarding"]);
});
