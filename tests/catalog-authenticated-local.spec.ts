import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, seedLocalSuperAdmin, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1" || process.env.STRELVA_LOCAL_CATALOG_PROOF !== "1", "Requires isolated Auth and catalog provider fixtures.");
test.setTimeout(240_000);
async function post(request: APIRequestContext, path: string, body: unknown, status = 200) {
  const response = await request.post(path, { headers: { origin: localEnvironment().app }, data: body });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}
function localSql(sql: string): string {
  const url = process.env.STRELVA_LOCAL_DB_URL || "";
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Catalog fixtures require loopback Postgres.");
  return execFileSync("psql", [url, "--no-psqlrc", "-At", "--set=ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" }).trim();
}
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

test("a Strelva maker takes a sentence through Draft, rehearsal, Live, member submit and labeled staff use", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const operator = await signedInContext(browser, admin, "catalog-operator");
  const owner = await signedInContext(browser, admin, "catalog-owner");
  const staff = await signedInContext(browser, admin, "catalog-staff");
  const businessId = randomUUID();
  try {
    for (const person of [operator, owner, staff]) expect((await person.context.request.get("/api/workspace")).status()).toBe(200);
    seedLocalSuperAdmin(operator.userId, operator.email);
    expect((await admin.from("workspaces").insert({ id: businessId, kind: "customer", name: "Catalog bookkeeping fixture", created_by: operator.userId })).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert([
      { workspace_id: businessId, user_id: operator.userId, role: "owner", created_by: operator.userId },
      { workspace_id: businessId, user_id: owner.userId, role: "owner", created_by: operator.userId },
      { workspace_id: businessId, user_id: staff.userId, role: "member", created_by: operator.userId },
    ])).error).toBeNull();
    // These business tables intentionally deny direct service-role access.
    // Fixture setup uses the isolated cluster administrator, never app grants.
    localSql(`insert into public.business_records(workspace_id,created_by,updated_by) values(${literal(businessId)},${literal(operator.userId)},${literal(operator.userId)});
      insert into public.business_people(workspace_id,name,email,source,created_by,updated_by) values(${literal(businessId)},'Sam',${literal(staff.email)},'operator',${literal(operator.userId)},${literal(operator.userId)});
      insert into public.business_record_facts(workspace_id,fact_key,value,source,updated_by) values(${literal(businessId)},'owner_recipient',${literal(JSON.stringify({ email: owner.email }))}::jsonb,'operator',${literal(operator.userId)});`);
    const sentence = "Track each new bookkeeping client, which documents we have, and who on staff handles them.";
    await post(owner.context.request, "/api/work-plans", { workspaceId: businessId, userGoal: sentence }, 403);
    const budget = await post(operator.context.request, "/api/work-economics", { action: "create", workspaceId: businessId, productId: "work_plans", resourceKind: "plan", payerId: operator.userId, estimateCents: 0, maxAuthorizedCents: 0 });
    await post(operator.context.request, "/api/work-economics", { action: "accept", jobId: budget.ledger.id });
    const plan = await post(operator.context.request, "/api/work-plans", { workspaceId: businessId, userGoal: sentence,
      planningEconomics: { jobId: budget.ledger.id, executionKey: `catalog:${businessId}`, maximumCents: 0 } }, 201);
    expect(plan.plan.userGoal).toBe(sentence);
    expect(plan.plan.proposedOutputs[0].draft.fields.map((field: { type: string }) => field.type)).toContain("contact");
    const execution = await post(operator.context.request, "/api/work-plans/execute", { workspaceId: businessId, planWorkId: plan.work.id, outputId: "intake", expectedPlanRevision: 1 }, 201);
    const workId = execution.nativeWorkId;
    const opened = await operator.context.request.get(`/api/bounded-work?productId=applications&workId=${workId}`);
    let app = await opened.json();
    expect(app.payload).toMatchObject({ status: "draft", records: [], rehearsal: null });
    app = await post(operator.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId, command: { kind: "rehearse", expectedDesignRevision: app.payload.designRevision } });
    expect(app.payload.records).toEqual([]);
    expect(app.payload.rehearsal.checks.every((check: { passed: boolean }) => check.passed)).toBe(true);
    app = await post(operator.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId, command: { kind: "publish", expectedCandidateRevision: app.payload.designRevision, expectedReleaseVersion: null } });
    expect(app.payload.status).toBe("installed");
    // Membership submission uses a different atomic RPC from recipient use.
    // This owner's record must stay outside the staff recipient's own scope.
    app = await post(owner.context.request, "/api/bounded-work", { action: "command", productId: "applications", workId,
      command: { kind: "submit", expectedReleaseVersion: app.payload.release.version, expectedRecordsRevision: app.payload.recordsRevision,
        record: { id: randomUUID(), values: { business: "Member-only client", client: "member-only@example.test", handler: staff.email } } } });
    expect(app.payload.records).toHaveLength(1);
    expect(app.payload.records[0].values.client).toMatch(/^[0-9a-f-]{36}$/);
    expect(app.payload.records[0].values.handler).toMatch(/^[0-9a-f-]{36}$/);
    expect((await staff.context.request.get(`/api/apps/${workId}`)).status()).toBe(403);
    const grant = await post(operator.context.request, `/api/apps/${workId}/access`, { recipientEmail: staff.email, views: ["form", "list"], recordRead: "own", recordEdit: "own", recordSubmit: true, purpose: "Bookkeeping intake", expiresAt: new Date(Date.now() + 86_400_000).toISOString() }, 201);
    const page = await staff.context.newPage();
    for (const width of [1280, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/apps/${workId}`);
      await expect(page.getByRole("heading", { name: "Bookkeeping intake", exact: true })).toBeVisible();
      await page.getByLabel("Client business", { exact: true }).fill(`Acme ${width}`);
      await page.getByLabel("Client contact", { exact: true }).fill(`acme-${width}@example.test`);
      await page.getByLabel("Assigned person", { exact: true }).fill(staff.email);
      await page.getByRole("button", { name: "Submit record", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Record submitted.");
      const visibleRecord = page.getByRole("article").filter({ hasText: `Acme ${width}` });
      await expect(visibleRecord.getByText(`acme-${width}@example.test`, { exact: true })).toBeVisible();
      await expect(visibleRecord.getByText(`Sam · ${staff.email}`, { exact: true })).toBeVisible();
      await expect(page.getByText("Member-only client", { exact: true })).toHaveCount(0);
      const read = await staff.context.request.get(`/api/apps/${workId}`);
      expect(read.status()).toBe(200);
      const snapshot = await read.json();
      expect(snapshot.records).toHaveLength(width === 1280 ? 1 : 2);
      const record = snapshot.records.find((row: { values: { business: string } }) => row.values.business === `Acme ${width}`);
      expect(record.linkLabels).toEqual({ client: `acme-${width}@example.test`, handler: `Sam · ${staff.email}` });
      expect(record.values.client).toMatch(/^[0-9a-f-]{36}$/);
      expect(record.values.handler).toMatch(/^[0-9a-f-]{36}$/);
      await expect(visibleRecord).not.toContainText(record.values.client);
      await expect(visibleRecord).not.toContainText(record.values.handler);
      if (width === 360) {
        await visibleRecord.getByRole("button", { name: "Edit record", exact: true }).click();
        await expect(page.getByLabel("Client business", { exact: true })).toBeFocused();
        await expect(page.getByLabel("Client contact", { exact: true })).toHaveAttribute("placeholder", record.linkLabels.client);
        await expect(page.getByLabel("Assigned person", { exact: true })).toHaveAttribute("placeholder", record.linkLabels.handler);
        await page.getByLabel("Client business", { exact: true }).fill("Acme 360 corrected");
        await page.getByRole("button", { name: "Save correction", exact: true }).click();
        await expect(page.getByRole("status")).toContainText("Correction saved.");
        const corrected = await (await staff.context.request.get(`/api/apps/${workId}`)).json();
        expect(corrected.records.find((row: { id: string }) => row.id === record.id)).toMatchObject({
          values: { business: "Acme 360 corrected", client: record.values.client, handler: record.values.handler },
          linkLabels: record.linkLabels, revision: record.revision + 1,
        });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`catalog-staff-${width}.png`), fullPage: true });
      const contact = JSON.parse(localSql(`select json_build_object('id',id,'sources',sources) from public.business_contacts where workspace_id=${literal(businessId)} and email=${literal(`acme-${width}@example.test`)};`));
      expect(contact.sources).toContain("internal_app");
    }
    const notices = JSON.parse(localSql(`select json_agg(json_build_object('status',status,'providerMessageId',provider_message_id)) from public.internal_tool_notices where work_id=${literal(workId)};`));
    expect(notices).toHaveLength(3);
    expect(notices.every((notice: { status: string; providerMessageId: string | null }) => notice.status === "sent" && notice.providerMessageId)).toBe(true);
    const captured = readFileSync(process.env.STRELVA_LOCAL_PROVIDER_LOG!, "utf8").trim().split("\n").map(line => JSON.parse(line));
    const messages = captured.filter(message => message.subject.includes("Bookkeeping intake") && message.to.includes(staff.email));
    expect(messages).toHaveLength(3); expect(messages[0].text).toContain("Bank statements");
    expect(messages.every(message => !message.text.includes("acme-"))).toBe(true);
    const noticeTarget = `/workspace?workspaceId=${businessId}&view=applications&work=${workId}`;
    expect(messages.every(message => message.text.includes(`${env.app}/sign-in?next=${encodeURIComponent(noticeTarget)}`))).toBe(true);
    const revoked = await operator.context.request.delete(`/api/apps/${workId}/access?grantId=${grant.grant.id}`, { headers: { origin: env.app }, data: {} });
    expect(revoked.status(), await revoked.text()).toBe(200);
    expect((await staff.context.request.get(`/api/apps/${workId}`)).status()).toBe(403);
  } finally {
    await Promise.all([operator.context.close(), owner.context.close(), staff.context.close()]);
  }
});

test("owners file Requests and a failed maker plan files one pending Request without losing the sentence", async ({ browser }, testInfo) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const operator = await signedInContext(browser, admin, "catalog-failure-operator");
  const owner = await signedInContext(browser, admin, "catalog-request-owner");
  const workspaceId = randomUUID();
  try {
    for (const person of [operator, owner]) expect((await person.context.request.get("/api/workspace")).status()).toBe(200);
    seedLocalSuperAdmin(operator.userId, operator.email);
    expect((await admin.from("workspaces").insert({ id: workspaceId, kind: "customer", name: "Catalog Request fixture", created_by: operator.userId })).error).toBeNull();
    expect((await admin.from("workspace_memberships").insert([operator, owner].map(person => ({ workspace_id: workspaceId, user_id: person.userId, role: "owner", created_by: operator.userId })))).error).toBeNull();
    const ownerPage = await owner.context.newPage();
    await ownerPage.setViewportSize({ width: 360, height: 900 });
    await ownerPage.goto(`/workspace?workspaceId=${workspaceId}&view=plan`);
    await expect(ownerPage.getByText("Strelva or your authorized agency builds Systems.", { exact: false })).toBeVisible();
    await expect(ownerPage.getByRole("heading", { name: "Planning budget" })).toHaveCount(0);
    await expect(ownerPage.getByRole("button", { name: "Prepare a plan", exact: true })).toHaveCount(0);
    const ownerSentence = "Help staff track the documents each new client still owes us.";
    await ownerPage.getByLabel("The result you want", { exact: true }).fill(ownerSentence);
    await ownerPage.getByRole("button", { name: "Ask Strelva to build this", exact: true }).click();
    await expect(ownerPage).toHaveURL(/view=help/);
    await expect(ownerPage.getByRole("textbox").first()).toHaveValue(ownerSentence);
    await ownerPage.getByRole("button", { name: "Save request", exact: true }).click();
    await expect(ownerPage.getByText("Saved for review. This does not mean a provider accepted it or that work has started.", { exact: true })).toBeVisible();
    expect(await ownerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await ownerPage.screenshot({ path: testInfo.outputPath("catalog-owner-request-360.png"), fullPage: true });
    const budget = await post(operator.context.request, "/api/work-economics", { action: "create", workspaceId, productId: "work_plans", resourceKind: "plan", payerId: operator.userId, estimateCents: 0, maxAuthorizedCents: 0 });
    await post(operator.context.request, "/api/work-economics", { action: "accept", jobId: budget.ledger.id });
    const makerPage = await operator.context.newPage();
    await makerPage.setViewportSize({ width: 360, height: 900 });
    await makerPage.goto(`/workspace?workspaceId=${workspaceId}&view=plan`);
    const makerSentence = "local-catalog-fail: track client documents and staff responsibility.";
    await makerPage.getByLabel("The result you want", { exact: true }).fill(makerSentence);
    await makerPage.getByRole("button", { name: "Prepare a plan", exact: true }).click();
    await expect(makerPage.getByRole("region", { name: "Work plan" }).getByRole("alert")).toContainText("Your Request is filed for review", { timeout: 60_000 });
    await expect(makerPage.getByText("Your Request is in this business’s Requests for Strelva to review.", { exact: true })).toBeVisible();
    await expect(makerPage.getByRole("button", { name: "Ask Strelva to build this", exact: true })).toHaveCount(0);
    await expect(makerPage.getByLabel("The result you want", { exact: true })).toHaveValue(makerSentence);
    expect(await makerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await makerPage.screenshot({ path: testInfo.outputPath("catalog-failed-plan-request-360.png"), fullPage: true });
    const requests = JSON.parse(localSql(`select json_agg(json_build_object('status',status,'request',request_text)) from public.service_requests where business_workspace_id=${literal(workspaceId)} and created_by=${literal(operator.userId)};`));
    expect(requests).toEqual([{ status: "requested", request: makerSentence }]);
  } finally { await Promise.all([operator.context.close(), owner.context.close()]); }
});
