import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(process.env.STRELVA_WORKSPACE_RELEASE !== "1", "Requires the local workspace release server; every API response is an isolated fixture.");

const workspaceId = "11111111-1111-4111-8111-111111111111";
const firstWorkId = "22222222-2222-4222-8222-222222222222";
const secondWorkId = "33333333-3333-4333-8333-333333333333";
const tokenId = "44444444-4444-4444-8444-444444444444";
const grantId = "55555555-5555-4555-8555-555555555555";
const fakeToken = `sta_${"fixture".repeat(7)}x`;
const at = "2026-09-15T12:00:00.000Z";

function fulfill(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function application(workId: string, title: string) {
  const spec = { title, maintenanceOwner: "fixture-owner", fields: [{ id: "name", label: "Name", type: "text", required: true }], components: [{ kind: "form", fields: ["name"] }, { kind: "list", fields: ["name"] }] };
  return { id: workId, workspaceId, payload: { version: 1, revision: 0, title, createdBy: "fixture-owner", createdAt: at, history: [], spec, specVersion: 1, status: "installed", versions: [{ version: 1, spec }], rehearsal: { specVersion: 1, checks: [{ name: "Fixed components", passed: true }] }, records: [] } };
}

async function installFixture(page: Page) {
  const participationRevision = new Map([[firstWorkId, 0], [secondWorkId, 0]]);
  const integrations = new Map<string, Array<Record<string, unknown>>>([[firstWorkId, []], [secondWorkId, []]]);
  const agentCommands: Array<Record<string, unknown>> = [];
  const applications = new Map([[firstWorkId, application(firstWorkId, "Team intake")], [secondWorkId, application(secondWorkId, "Visitor log")]]);

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { (window as typeof window & { __copiedToken?: string }).__copiedToken = value; } },
    });
  });
  await page.route("**/api/workspace**", route => fulfill(route, {
    actor: { email: "owner@example.com", localPreview: false },
    workspaceId,
    workspaces: [{ id: workspaceId, name: "My business", kind: "organization", access: "member", role: "owner" }],
    work: [...applications.values()].map(item => ({ id: item.id, workspaceId, title: item.payload.title, productId: "applications", resourceKind: "application", payload: null, input: {}, createdAt: at })),
    handoffs: [], delegations: [], products: [{ id: "applications", name: "Applications", description: "Local proof", availability: "available" }],
  }));
  await page.route("**/api/bounded-work**", route => {
    const id = new URL(route.request().url()).searchParams.get("workId") || firstWorkId;
    return fulfill(route, applications.get(id));
  });
  await page.route("**/api/work-context**", route => fulfill(route, { version: 1, revision: 0, grants: [], facts: [], preferences: [], history: [] }));
  await page.route("**/api/work-participation**", route => {
    const id = new URL(route.request().url()).searchParams.get("workId") || firstWorkId;
    const records = integrations.get(id) || [];
    return fulfill(route, {
      version: 1,
      revision: participationRevision.get(id) || 0,
      grants: records.filter(record => !record.revokedAt).map(record => ({ id: record.grantId, participantEmail: "owner@example.com", participantKind: "agent", scope: record.scopes, purpose: "Review the intake", expiresAt: record.expiresAt, budgetMinor: 0, currency: "USD", sponsorId: "fixture-owner", createdAt: at, status: "active" })),
      contributions: [], history: [], currentActorEmail: "owner@example.com", workRevision: "1", canManage: true,
    });
  });
  await page.route("**/api/agent-access?**", route => {
    const id = new URL(route.request().url()).searchParams.get("workId") || firstWorkId;
    return fulfill(route, integrations.get(id) || []);
  });
  await page.route("**/api/agent-access", route => {
    const command = route.request().postDataJSON() as Record<string, unknown>;
    agentCommands.push(command);
    const id = String(command.workId);
    if (command.kind === "issue") {
      const integration = { id: tokenId, workId: id, grantId, tokenPrefix: fakeToken.slice(0, 12), agentLabel: command.agentLabel, scopes: command.scopes, expiresAt: command.expiresAt, createdAt: at, revokedAt: null, authority: "issuing_user" };
      integrations.set(id, [integration]);
      participationRevision.set(id, (participationRevision.get(id) || 0) + 1);
      return fulfill(route, { token: fakeToken, integration });
    }
    const current = integrations.get(id)![0]!;
    const revokedAt = "2026-09-15T12:05:00.000Z";
    current.revokedAt = revokedAt;
    participationRevision.set(id, (participationRevision.get(id) || 0) + 1);
    return fulfill(route, { integration: { id: current.id, workId: id, grantId, agentLabel: current.agentLabel, authority: "issuing_user", revokedAt } });
  });
  return agentCommands;
}

test("an owner issues, copies, switches away from, and revokes exact-work AI access", async ({ page }) => {
  const commands = await installFixture(page);
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${firstWorkId}`);
  await expect(page.getByRole("heading", { name: "Team intake", exact: true }).first()).toBeVisible();
  await page.getByText("Sources and collaborators", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use this work from your own AI" })).toBeVisible();
  await page.getByText("Create personal AI access", { exact: true }).click();
  await expect(page.getByLabel("Access scope")).toHaveValue("read_propose");
  await expect(page.getByLabel("Expires after")).toHaveValue("7");
  await expect(page.getByLabel("Maximum reported proposal cost, USD")).toHaveValue("0");
  await page.getByLabel("AI or tool name").fill("Research assistant");
  await page.getByLabel("What should it help with?").fill("Review the intake and suggest clearer questions");
  const issuedAt = Date.now();
  await page.getByRole("button", { name: "Create access token" }).click();

  await expect(page.getByRole("heading", { name: "Copy this token now" })).toBeFocused();
  await expect(page.getByTestId("issued-agent-token")).toHaveText(fakeToken);
  await expect(page.getByText(`${new URL(page.url()).origin}/api/agent-access/work/${firstWorkId}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copy token" }).click();
  await expect(page.getByText("Token copied.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as typeof window & { __copiedToken?: string }).__copiedToken)).toBe(fakeToken);
  await page.screenshot({ path: "/tmp/strelva-personal-ai-access-desktop.png", fullPage: true });
  expect(commands[0]).toMatchObject({ kind: "issue", workId: firstWorkId, expectedRevision: 0, scopes: ["read", "propose"], budgetMinor: 0, currency: "USD" });
  expect(Date.parse(String(commands[0]!.expiresAt)) - issuedAt).toBeGreaterThan(6.9 * 86_400_000);
  expect(Date.parse(String(commands[0]!.expiresAt)) - issuedAt).toBeLessThan(7.1 * 86_400_000);

  await page.getByRole("button", { name: "Back to work" }).click();
  await page.getByRole("button", { name: "Open Visitor log" }).click();
  await page.getByText("Sources and collaborators", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Use this work from your own AI" })).toBeVisible();
  await expect(page.getByTestId("issued-agent-token")).toHaveCount(0);
  await expect(page.getByText("No personal AI access has been created for this work.")).toBeVisible();

  await page.getByRole("button", { name: "Back to work" }).click();
  await page.getByRole("button", { name: "Open Team intake" }).click();
  await page.getByText("Sources and collaborators", { exact: true }).click();
  await expect(page.getByText("Research assistant", { exact: true })).toBeVisible();
  await expect(page.getByTestId("issued-agent-token")).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("AI access revoked. That token can no longer open this work.")).toBeVisible();
  expect(commands[1]).toMatchObject({ kind: "revoke", workId: firstWorkId, expectedRevision: 1, tokenId });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("heading", { name: "Use this work from your own AI" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/strelva-personal-ai-access-mobile.png", fullPage: true });
});

test("an unavailable token list blocks issuance and offers recovery", async ({ page }) => {
  await installFixture(page);
  await page.route("**/api/agent-access?**", route => fulfill(route, { error: "Personal AI access is unavailable right now." }, 503));
  await page.goto(`/workspace?workspaceId=${workspaceId}&work=${firstWorkId}`);
  await page.getByText("Sources and collaborators", { exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Personal AI access is unavailable right now." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload personal AI access" })).toBeVisible();
  await page.getByText("Create personal AI access", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Create access token" })).toBeDisabled();
});
