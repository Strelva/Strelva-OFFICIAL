import { expect, test } from "@playwright/test";

test.skip(
  process.env.STRELVA_WORKSPACE_RELEASE !== "1",
  "Requires the local workspace release server; all application responses are isolated fixtures.",
);

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workId = "44444444-4444-4444-8444-444444444444";
const grantId = "99999999-9999-4999-8999-999999999999";
const at = "2026-09-12T12:00:00.000Z";

const initialSpec = {
  title: "Equipment requests",
  maintenanceOwner: "fixture-owner",
  fields: [{ id: "equipment", label: "Equipment needed", type: "text" as const, required: true }],
  components: [
    { kind: "form" as const, fields: ["equipment"] },
    { kind: "list" as const, fields: ["equipment"] },
  ],
};

function workspaceResponse() {
  return {
    actor: { email: "owner@example.com", localPreview: false },
    workspaceId,
    workspaces: [{ id: workspaceId, name: "Harbor Plumbing", kind: "customer", access: "member" }],
    work: [{ id: workId, workspaceId, title: initialSpec.title, productId: "applications", resourceKind: "application", payload: null, input: {}, createdAt: at }],
    handoffs: [],
    delegations: [],
    products: [{ id: "applications", name: "Applications", description: "Local proof", availability: "available" }],
  };
}

type ApplicationSpec = typeof initialSpec;
type Rehearsal = { specVersion: number; checks: Array<{ name: string; passed: boolean }> };
type ApplicationRecord = { id: string; values: Record<string, string | number | boolean> };
type ApplicationRelease = { version: number; spec: ApplicationSpec; publishedAt: string; publishedBy: string; provenance: "published" };
type FixturePayload = {
  version: 1;
  revision: number;
  title: string;
  createdBy: string;
  createdAt: string;
  history: Array<{ revision: number; kind: string; actorId: string; at: string }>;
  spec: ApplicationSpec;
  specVersion: number;
  status: "draft" | "installed";
  versions: Array<{ version: number; spec: ApplicationSpec }>;
  rehearsal: Rehearsal | null;
  records: ApplicationRecord[];
  recordsRevision: number;
  designRevision: number;
  candidate: { designRevision: number; specVersion: number; spec: ApplicationSpec; rehearsal: Rehearsal | null };
  release: ApplicationRelease | null;
  releases: ApplicationRelease[];
};

test("review fixture connects a prepared request result, owner use, employee use, release review, rollback, and revocation", async ({ page }, testInfo) => {
  const state = {
    // The prepared application is the handoff point from the existing request
    // journey. Keeping the model response outside this fixture makes the
    // lifecycle review deterministic and free of Auth or provider calls.
    payload: {
      version: 1,
      revision: 0,
      title: initialSpec.title,
      createdBy: "fixture-owner",
      createdAt: at,
      history: [],
      spec: initialSpec,
      specVersion: 1,
      status: "draft" as const,
      versions: [{ version: 1, spec: initialSpec }],
      rehearsal: null,
      records: [] as Array<{ id: string; values: Record<string, string | number | boolean> }>,
      recordsRevision: 0,
      designRevision: 0,
      candidate: { designRevision: 0, specVersion: 1, spec: initialSpec, rehearsal: null },
      release: null,
      releases: [] as Array<{ version: number; spec: typeof initialSpec; publishedAt: string; publishedBy: string; provenance: "published" }>,
    } as FixturePayload,
    grant: null as {
      id: string;
      workId: string;
      workspaceId: string;
      recipientEmail: string;
      views: Array<"form" | "list">;
      recordRead: "all";
      recordSubmit: true;
      purpose: string;
      expiresAt: string;
      status: "active" | "revoked";
      grantedBy: string;
      createdAt: string;
      revokedAt: string | null;
    } | null,
    revoked: false,
  };

  function useSnapshot() {
    const release = state.payload.release;
    if (!release || !state.grant) throw new Error("The fixture has no released application grant.");
    const fields = new Map(release.spec.fields.map(field => [field.id, field]));
    return {
      workId,
      title: release.spec.title,
      releaseVersion: release.version,
      views: release.spec.components.map(component => ({
        kind: component.kind,
        fields: component.fields.map(fieldId => fields.get(fieldId)).filter((field): field is (typeof release.spec.fields)[number] => Boolean(field)),
      })),
      records: state.payload.records.map(record => ({ id: record.id, values: { ...record.values } })),
      access: {
        views: state.grant.views,
        recordRead: state.grant.recordRead,
        recordSubmit: state.grant.recordSubmit,
        expiresAt: state.grant.expiresAt,
      },
    };
  }

  await page.route("**/api/workspace**", route => route.fulfill({ json: workspaceResponse() }));
  await page.route("**/api/offerings**", route => route.fulfill({ json: {
    businessId: workspaceId,
    permissions: { canRead: true, canManage: true, role: "owner" },
    definitions: [],
    installations: [],
    websiteBindings: [],
  } }));
  await page.route("**/api/bounded-work**", async route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { id: workId, workspaceId, payload: state.payload } });
    }

    const body = route.request().postDataJSON() as { command?: Record<string, unknown> };
    const command = body.command || {};
    const kind = command.kind;

    if (kind === "rehearse") {
      const rehearsal = {
        specVersion: state.payload.candidate.specVersion,
        checks: [
          { name: "Fixed components", passed: true },
          { name: "Existing records fit this version", passed: true },
        ],
      };
      state.payload.candidate.rehearsal = rehearsal;
      state.payload.rehearsal = rehearsal;
    } else if (kind === "publish") {
      const version = Math.max(0, ...state.payload.releases.map(release => release.version)) + 1;
      const release = {
        version,
        spec: state.payload.candidate.spec,
        publishedAt: at,
        publishedBy: "fixture-owner",
        provenance: "published" as const,
      };
      state.payload.releases.push(release);
      state.payload.release = release;
      state.payload.status = "installed";
      state.payload.spec = release.spec;
      state.payload.specVersion = state.payload.candidate.specVersion;
    } else if (kind === "revise") {
      const spec = command.spec as typeof initialSpec;
      const designRevision = state.payload.candidate.designRevision + 1;
      const specVersion = state.payload.candidate.specVersion + 1;
      state.payload.candidate = { designRevision, specVersion, spec, rehearsal: null };
      state.payload.designRevision = designRevision;
      state.payload.specVersion = specVersion;
      state.payload.spec = spec;
      state.payload.rehearsal = null;
      state.payload.versions.push({ version: specVersion, spec });
      state.payload.status = "draft";
    } else if (kind === "rollback_release") {
      const target = state.payload.releases.find(release => release.version === command.version);
      if (!target) return route.fulfill({ status: 409, json: { error: "That released application version is unavailable." } });
      const designRevision = state.payload.candidate.designRevision + 1;
      const specVersion = state.payload.candidate.specVersion + 1;
      state.payload.candidate = { designRevision, specVersion, spec: target.spec, rehearsal: null };
      state.payload.designRevision = designRevision;
      state.payload.specVersion = specVersion;
      state.payload.spec = target.spec;
      state.payload.rehearsal = null;
      state.payload.release = target;
      state.payload.status = "installed";
      state.payload.versions.push({ version: specVersion, spec: target.spec });
    } else if (kind === "submit") {
      const record = command.record as { id: string; values: Record<string, string | number | boolean> };
      state.payload.records.push(record);
      state.payload.recordsRevision += 1;
    }

    state.payload.revision += 1;
    return route.fulfill({ json: { id: workId, workspaceId, payload: state.payload } });
  });

  await page.route(`**/api/apps/${workId}/access**`, async route => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { grants: state.grant ? [state.grant] : [] } });
    }
    if (route.request().method() === "POST") {
      state.grant = {
        id: grantId,
        workId,
        workspaceId,
        recipientEmail: "employee@example.com",
        views: ["form", "list"],
        recordRead: "all",
        recordSubmit: true,
        purpose: "Submit equipment requests",
        expiresAt: "2027-01-01T00:00:00.000Z",
        status: "active",
        grantedBy: "fixture-owner",
        createdAt: at,
        revokedAt: null,
      };
      return route.fulfill({ json: { grant: state.grant, href: `/apps/${workId}` } });
    }
    state.revoked = true;
    if (state.grant) state.grant = { ...state.grant, status: "revoked", revokedAt: at };
    return route.fulfill({ json: { ok: true } });
  });

  await page.route(`**/api/apps/${workId}`, async route => {
    if (state.revoked) return route.fulfill({ status: 403, json: { error: "This application link is no longer available." } });
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { input?: { record?: { id: string; values: Record<string, string | number | boolean> } } };
      const record = body.input?.record;
      if (record) {
        state.payload.records.push(record);
        state.payload.recordsRevision += 1;
        state.payload.revision += 1;
      }
    }
    return route.fulfill({ json: useSnapshot() });
  });

  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await expect(page.getByRole("heading", { name: "Equipment requests", exact: true })).toBeVisible();

  const firstReview = page.locator("details").filter({ hasText: "Review changes" });
  await expect(firstReview).toBeVisible();
  await expect(firstReview.getByText("This is the first proposed version. Review it before publishing.", { exact: true })).toBeVisible();
  await firstReview.getByRole("button", { name: "Check proposed change", exact: true }).click();
  await expect(firstReview.getByText("Checks for proposed version 1", { exact: true })).toBeVisible();
  await firstReview.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Version 1 is live/)).toBeVisible();

  await page.getByLabel("Equipment needed", { exact: true }).fill("Pipe inspection camera");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByText("Pipe inspection camera", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Give someone a link", exact: true })).toBeVisible();
  await page.getByLabel("Recipient email", { exact: true }).fill("employee@example.com");
  await page.getByRole("button", { name: "Issue access link", exact: true }).click();
  await expect(page.getByText("Link for employee@example.com", { exact: true })).toBeVisible();

  await page.goto(`/apps/${workId}`);
  await expect(page.getByRole("heading", { name: "Equipment requests", exact: true })).toBeVisible();
  await page.getByLabel("Equipment needed", { exact: true }).fill("Replacement pipe cutter");
  await page.getByRole("button", { name: "Submit record", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Record submitted.");
  await expect(page.getByText("Pipe inspection camera", { exact: true })).toBeVisible();
  await expect(page.getByText("Replacement pipe cutter", { exact: true })).toBeVisible();

  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await page.getByText("Edit proposed app", { exact: true }).click();
  await page.getByLabel("Label for Equipment needed", { exact: true }).fill("Equipment and job");
  await page.getByRole("button", { name: "Save new draft", exact: true }).click();

  const secondReview = page.locator("details").filter({ hasText: "Review changes" });
  await expect(secondReview.getByText('Field changed: "Equipment and job"; label changes from "Equipment needed" to "Equipment and job".', { exact: true })).toBeVisible();
  await secondReview.getByRole("button", { name: "Check proposed change", exact: true }).click();
  await expect(secondReview.getByText("Passed: Existing records fit this version", { exact: true })).toBeVisible();
  await secondReview.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Version 2 is live/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("application-review-fixture.png"), fullPage: true });

  await page.goto(`/apps/${workId}`);
  await expect(page.getByLabel("Equipment and job", { exact: true })).toBeVisible();
  await expect(page.getByText("Pipe inspection camera", { exact: true })).toBeVisible();
  await expect(page.getByText("Replacement pipe cutter", { exact: true })).toBeVisible();

  const rollback = await page.evaluate(async id => {
    const response = await fetch("/api/bounded-work", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: "applications",
        action: "command",
        workId: id,
        command: { kind: "rollback_release", expectedDesignRevision: 1, expectedReleaseVersion: 2, version: 1 },
      }),
    });
    return { status: response.status, body: await response.json() };
  }, workId);
  expect(rollback.status).toBe(200);
  expect(rollback.body.payload.release.version).toBe(1);

  await page.goto(`/apps/${workId}`);
  await expect(page.getByLabel("Equipment needed", { exact: true })).toBeVisible();
  await expect(page.getByText("Pipe inspection camera", { exact: true })).toBeVisible();
  await expect(page.getByText("Replacement pipe cutter", { exact: true })).toBeVisible();

  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${workId}`);
  await expect(page.getByText(/Version 1 is live/)).toBeVisible();
  await page.getByRole("button", { name: "Revoke link", exact: true }).click();
  await expect(page.getByText("Access revoked for employee@example.com", { exact: true })).toBeVisible();

  await page.goto(`/apps/${workId}`);
  await expect(page.getByRole("heading", { name: "This application link is unavailable", exact: true })).toBeVisible();
  await expect(page.locator('p[role="alert"]')).toContainText("no longer available");

  expect(state.payload.records).toHaveLength(2);
  expect(state.payload.release?.version).toBe(1);
  expect(state.revoked).toBe(true);
});
