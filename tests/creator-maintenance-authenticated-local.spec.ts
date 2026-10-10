import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { creatorMaintenanceGraphSchema } from "@/platform/connect/creator-maintenance";
import { localEnvironment, signedInContext } from "./support/local-auth";
import { localSql, noHorizontalOverflow } from "./support/journeys";
import { moneyPost, nativeWorkspace } from "./support/money-agent-native";
import { creatorMaintenanceFixture, creatorMaintenanceSnapshot } from "./support/creator-maintenance-native";
import admission from "./support/creator-maintenance-admission.cjs";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires the isolated creator-maintenance supplemental Auth window; no providers.");
test.setTimeout(300_000);
test.beforeAll(() => admission.creatorMaintenancePreflight(process.env));
const localDate = async (page: Page, utc: string) => page.evaluate(value => { const d = new Date(value); const pad = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }, utc);


/** Execute the original browser request exactly once, then lose only its response.
 * A real 200/native receipt is required before abort; no HTTP result is invented. */
async function loseCommittedResponse(page: Page, command: Record<string, unknown>, actorId: string, afterCommit?: () => void) {
 const pattern = "**/api/workspace/creator-maintenance";
 let dispatches = 0;
 let resolveReceipt!: (receipt: { id: string; listing_id: string; recorded_by: string; maintainer_state: string; agreement_version: string | null; rate_reference: string | null; effective_from: string; recorded_at: string }) => void;
 let rejectReceipt!: (error: unknown) => void;
 const committed = new Promise<Parameters<typeof resolveReceipt>[0]>((resolve, reject) => { resolveReceipt = resolve; rejectReceipt = reject; });
 // Observe immediately while click is pending; callers still await the original
 // rejecting promise, so an actual route/assertion failure cannot become success.
 void committed.catch(() => undefined);
 const handler: Parameters<Page["route"]>[1] = async route => {
  if (route.request().method() !== "POST") { await route.continue(); return; }
  dispatches++;
  try {
   expect(dispatches).toBe(1); expect(route.request().postDataJSON()).toEqual(command);
   const response = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
   expect(response.status(), await response.text()).toBe(200);
   const receipt = await response.json();
   expect(receipt).toMatchObject({ listing_id: command.listingId, recorded_by: actorId, maintainer_state: command.state, agreement_version: command.agreementVersion ?? null, rate_reference: command.rateReference ?? null });
   expect(Date.parse(receipt.effective_from)).toBe(Date.parse(String(command.effectiveFrom))); expect(receipt.id).toMatch(/^[0-9a-f-]{36}$/);
   afterCommit?.();
   // Fetch has returned the actual committed receipt; only now interrupt the UI.
   await route.abort("failed"); resolveReceipt(receipt);
  } catch (error) { rejectReceipt(error); await route.abort("failed").catch(() => undefined); }
 };
 await page.route(pattern, handler);
 let removed = false;
 return { committed, dispatches: () => dispatches, remove: async () => { if (!removed) { await page.unroute(pattern, handler); removed = true; } } };
}

test(admission.creatorMaintenanceCase, async ({ browser }, info) => {
 const env = localEnvironment();
 const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
 const owner = await signedInContext(browser, admin, "maintenance-owner");
 const manager = await signedInContext(browser, admin, "maintenance-admin");
 const stranger = await signedInContext(browser, admin, "maintenance-stranger");
 const anonymous = await browser.newContext({ baseURL: env.app });
 const responseLossCleanups: Array<() => Promise<void>> = [];
 try {
  const businessId = await nativeWorkspace(owner.context.request);
  await nativeWorkspace(manager.context.request); await nativeWorkspace(stranger.context.request);
  const agency = await moneyPost(owner.context.request, "/api/workspace", { action: "create_agency", name: "Fictional maintenance creator" }, 201);
  const fixture = creatorMaintenanceFixture(owner, manager, businessId, agency.workspaceId);
  const path = `/api/workspace/creator-maintenance?workspaceId=${fixture.workspaceId}`;
  const read = async (request = owner.context.request) => { const response = await request.get(path); expect(response.status(), await response.text()).toBe(200); expect(response.headers()["cache-control"]).toBe("private, no-store"); return creatorMaintenanceGraphSchema.parse(await response.json()); };
  const original = creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id);
  const graph = await read();
  expect(graph).toMatchObject({ workspaceId: fixture.workspaceId, canMaintain: true });
  expect(graph.listings.find(l => l.id === fixture.listing.id)).toMatchObject({ sourceRevisionId: fixture.listing.source_revision_id });
  expect(graph.agreements).toContainEqual(expect.objectContaining({ version: fixture.agreementVersion, rateReference: fixture.rateReference, rateBps: 137 }));
  expect(await read(manager.context.request)).toEqual(graph);
  expect((await anonymous.request.get(path)).status()).toBe(401);
  expect((await stranger.context.request.get(path)).status()).toBe(403);
  // Actual supplied-actor reader under READ ONLY service-role authority.
  const readonly = localSql(`begin read only; set local role service_role; select public.read_creator_maintenance_operations(:'v1'::uuid,:'v2'::uuid,:'v3'); rollback;`, fixture.workspaceId, owner.userId, owner.email);
  expect(readonly).toEqual(graph);
  expect(creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id)).toEqual(original);
  const page = await owner.context.newPage(); page.setDefaultNavigationTimeout(60_000); await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/workspace/creator-maintenance?workspaceId=${fixture.workspaceId}`);
  await expect(page.getByRole("heading", { name: "Creator maintenance", exact: true })).toBeVisible();
  await expect(page.getByText(`Source revision: ${fixture.listing.source_revision_id}`, { exact: true })).toBeVisible();
  await noHorizontalOverflow(page); await page.screenshot({ path: info.outputPath("creator-maintenance-desktop.png"), fullPage: true });
  const starts = new Date(Date.now() + 5*86400_000); starts.setUTCSeconds(0,0);
  const takeover = starts.toISOString(); const correction = new Date(starts.getTime()+86400_000).toISOString();
  await page.getByLabel("Listing", { exact: true }).selectOption(fixture.listing.id);
  await page.getByLabel("Listing", { exact: true }).focus(); await page.keyboard.press("Tab"); await expect(page.getByLabel("Maintenance state", { exact: true })).toBeFocused();
  await page.getByLabel("Maintenance state", { exact: true }).selectOption("takeover");
  await page.getByLabel("Effective date and time", { exact: true }).fill(await localDate(page, takeover));
  await page.getByLabel("Effective date and time", { exact: true }).focus();
  const save = page.getByRole("button", { name: "Record maintenance terms", exact: true }); await save.focus(); await expect(save).toBeFocused();
  const submitted = page.waitForResponse(r => new URL(r.url()).pathname === "/api/workspace/creator-maintenance" && r.request().method() === "POST");
  await page.keyboard.press("Enter"); const result = await submitted; expect(result.status(), await result.text()).toBe(200);
  const receipt = await result.json(); expect(receipt).toMatchObject({ listing_id: fixture.listing.id, recorded_by: owner.userId, maintainer_state: "takeover", agreement_version: null, rate_reference: null }); expect(Date.parse(receipt.effective_from)).toBe(Date.parse(takeover)); expect(receipt.id).toMatch(/^[0-9a-f-]{36}$/);
  const command = { workspaceId: fixture.workspaceId, listingId: fixture.listing.id, sourceRevisionId: fixture.listing.source_revision_id, state: "takeover", effectiveFrom: takeover };
  expect(await moneyPost(owner.context.request, "/api/workspace/creator-maintenance", command)).toEqual(receipt);
  await expect(page.getByRole("status").filter({ hasText: "Maintenance terms recorded" })).toContainText("No payment or provider change was made.");
  await page.reload(); await expect(page.getByRole("list", { name: "Maintenance history for private_staff_requests", exact: true })).toContainText("takeover");
  // A later correction adds history; it cannot rewrite the original instant.
  const changed = { ...command, state: "tapered", agreementVersion: fixture.agreementVersion, rateReference: fixture.rateReference, effectiveFrom: correction };
  const managerPage = await manager.context.newPage(); managerPage.setDefaultNavigationTimeout(60_000); await managerPage.setViewportSize({ width: 390, height: 844 }); await managerPage.goto(`/workspace/creator-maintenance?workspaceId=${fixture.workspaceId}`);
  await managerPage.getByLabel("Listing", { exact: true }).selectOption(fixture.listing.id); await managerPage.getByLabel("Maintenance state", { exact: true }).selectOption("tapered");
  const managerGraph = await read(manager.context.request); const agreementIndex = managerGraph.agreements.findIndex(a => a.version === fixture.agreementVersion); expect(agreementIndex).toBeGreaterThanOrEqual(0);
  await managerPage.getByLabel("Recorded agreement", { exact: true }).selectOption(String(agreementIndex)); await managerPage.getByLabel("Effective date and time", { exact: true }).fill(await localDate(managerPage, correction));
  await noHorizontalOverflow(managerPage); await managerPage.screenshot({ path: info.outputPath("creator-maintenance-mobile-form.png"), fullPage: true });
  const correcting = managerPage.waitForResponse(r => new URL(r.url()).pathname === "/api/workspace/creator-maintenance" && r.request().method() === "POST"); await managerPage.getByRole("button", { name: "Record maintenance terms", exact: true }).click(); const corrected = await correcting; expect(corrected.status(), await corrected.text()).toBe(200); const correctedReceipt = await corrected.json();
  expect(correctedReceipt).toMatchObject({ listing_id: fixture.listing.id, recorded_by: manager.userId, maintainer_state: "tapered", agreement_version: fixture.agreementVersion, rate_reference: fixture.rateReference }); expect(Date.parse(correctedReceipt.effective_from)).toBe(Date.parse(correction)); expect(correctedReceipt.id).not.toBe(receipt.id);
  // Real owner commit followed by a lost browser response. The original draft
  // stays immutable until explicit history reload confirms that exact receipt.
  const recoveredCommand = { ...changed, state: "creator", effectiveFrom: new Date(starts.getTime()+2*86400_000).toISOString() };
  await page.getByLabel("Listing", { exact: true }).selectOption(fixture.listing.id); await page.getByLabel("Maintenance state", { exact: true }).selectOption("creator");
  await page.getByLabel("Recorded agreement", { exact: true }).selectOption(String(agreementIndex)); await page.getByLabel("Effective date and time", { exact: true }).fill(await localDate(page, recoveredCommand.effectiveFrom));
  const beforeLoss = creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id);
  const loss = await loseCommittedResponse(page, recoveredCommand, owner.userId); responseLossCleanups.push(loss.remove);
  await page.getByRole("button", { name: "Record maintenance terms", exact: true }).click(); const recoveredReceipt = await loss.committed;
  await expect(page.getByRole("alert")).toContainText("Reload its history before recording different terms.");
  for (const label of ["Listing", "Maintenance state", "Recorded agreement", "Effective date and time"]) await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Listing", { exact: true })).toHaveValue(fixture.listing.id); await expect(page.getByLabel("Maintenance state", { exact: true })).toHaveValue("creator"); await expect(page.getByLabel("Effective date and time", { exact: true })).toHaveValue(await localDate(page, recoveredCommand.effectiveFrom));
  await expect(page.getByRole("button", { name: "Record maintenance terms", exact: true })).toBeDisabled();
  const historyReload = page.getByRole("button", { name: "Reload maintenance history", exact: true }); await expect(historyReload).toBeFocused();
  const afterLoss = creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id); expect(afterLoss.terms).toHaveLength(beforeLoss.terms.length+1); expect(afterLoss.terms).toContainEqual(recoveredReceipt); expect(afterLoss.listing).toEqual(original.listing); expect(afterLoss.installation).toEqual(original.installation);
  await page.screenshot({ path: info.outputPath("creator-maintenance-lost-response-desktop.png"), fullPage: true });
  const loadingHistory = page.waitForEvent("load"); await page.keyboard.press("Enter"); await loadingHistory;
  await expect(page.getByRole("button", { name: "Reload maintenance history", exact: true })).toHaveCount(0); await expect(page.getByRole("button", { name: "Record maintenance terms", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Listing", { exact: true })).toHaveValue(""); await expect(page.getByRole("list", { name: "Maintenance history for private_staff_requests", exact: true })).toContainText(recoveredReceipt.effective_from);
  expect((await read()).listings.find(l=>l.id===fixture.listing.id)?.history).toEqual(afterLoss.terms); expect(creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id)).toEqual(afterLoss); expect(loss.dispatches()).toBe(1); await loss.remove();
  let saved = creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id); expect(saved.listing).toEqual(original.listing); expect(saved.installation).toEqual(original.installation); expect(saved.terms).toContainEqual(receipt); expect(saved.terms).toContainEqual(correctedReceipt); expect(saved.terms).toContainEqual(recoveredReceipt); expect(saved.terms).toHaveLength(original.terms.length+3);
  // A genuine server conflict is rendered by the form; no response is mocked.
  await page.getByLabel("Listing", { exact: true }).selectOption(fixture.listing.id); await page.getByLabel("Maintenance state", { exact: true }).selectOption("tapered");
  await page.getByLabel("Recorded agreement", { exact: true }).selectOption(String(agreementIndex)); await page.getByLabel("Effective date and time", { exact: true }).fill(await localDate(page, takeover));
  const conflict = page.waitForResponse(r => new URL(r.url()).pathname === "/api/workspace/creator-maintenance" && r.request().method() === "POST"); await page.getByRole("button", { name: "Record maintenance terms", exact: true }).click(); expect((await conflict).status()).toBe(409);
  await expect(page.getByRole("alert")).toContainText("Reload before continuing."); await expect(page.getByRole("button", { name: "Record maintenance terms", exact: true })).toBeEnabled(); await page.screenshot({ path: info.outputPath("creator-maintenance-conflict-desktop.png"), fullPage: true });
  expect((await anonymous.request.post("/api/workspace/creator-maintenance", { headers: { origin: env.app }, data: command })).status()).toBe(401);
  expect((await owner.context.request.post("/api/workspace/creator-maintenance", { headers: { origin: "https://foreign.example.test" }, data: command })).status()).toBe(403);
  await moneyPost(owner.context.request, "/api/workspace/creator-maintenance", { ...command, sourceRevisionId: randomUUID() }, 403);
  await moneyPost(owner.context.request, "/api/workspace/creator-maintenance", { ...command, workspaceId: businessId }, 403);
  await moneyPost(stranger.context.request, "/api/workspace/creator-maintenance", command, 403);
  await moneyPost(owner.context.request, "/api/workspace/creator-maintenance", { ...changed, effectiveFrom: new Date(starts.getTime()+40*86400_000).toISOString() }, 409);
  expect(creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id)).toEqual(saved);
  // A second actual commit loses its response after this admin's seat is
  // withdrawn. History reload must reauthorize, never reuse the old UI graph.
  const withdrawnCommand = { ...changed, effectiveFrom: new Date(starts.getTime()+3*86400_000).toISOString() };
  await managerPage.getByLabel("Effective date and time", { exact: true }).fill(await localDate(managerPage, withdrawnCommand.effectiveFrom));
  const withdrawnLoss = await loseCommittedResponse(managerPage, withdrawnCommand, manager.userId, () => { localSql("delete from public.workspace_memberships where workspace_id=:'v1'::uuid and user_id=:'v2'::uuid;", fixture.workspaceId, manager.userId); });
  responseLossCleanups.push(withdrawnLoss.remove);
  await managerPage.getByRole("button", { name: "Record maintenance terms", exact: true }).click(); const withdrawnReceipt = await withdrawnLoss.committed;
  await expect(managerPage.getByRole("alert")).toContainText("Reload its history before recording different terms."); await expect(managerPage.getByRole("button", { name: "Record maintenance terms", exact: true })).toBeDisabled();
  const beforeWithdrawnReload = creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id); expect(beforeWithdrawnReload.terms).toHaveLength(saved.terms.length+1); expect(beforeWithdrawnReload.terms).toContainEqual(withdrawnReceipt); expect(beforeWithdrawnReload.listing).toEqual(original.listing); expect(beforeWithdrawnReload.installation).toEqual(original.installation);
  await managerPage.screenshot({ path: info.outputPath("creator-maintenance-lost-response-withdrawn-mobile.png"), fullPage: true });
  const reauthorizing = managerPage.waitForEvent("load"); await managerPage.getByRole("button", { name: "Reload maintenance history", exact: true }).click(); await reauthorizing;
  await expect(managerPage.getByRole("alert")).toContainText("Maintenance records could not be loaded"); await expect(managerPage.getByRole("button", { name: "Record maintenance terms", exact: true })).toHaveCount(0);
  expect(creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id)).toEqual(beforeWithdrawnReload); expect(withdrawnLoss.dispatches()).toBe(1); await withdrawnLoss.remove();
  saved = beforeWithdrawnReload;
  expect((await manager.context.request.get(path)).status()).toBe(403); await moneyPost(manager.context.request, "/api/workspace/creator-maintenance", changed, 403);
  await managerPage.reload(); await expect(managerPage.getByRole("alert")).toContainText("Maintenance records could not be loaded"); await expect(managerPage.getByRole("button", { name: "Record maintenance terms", exact: true })).toHaveCount(0);
  const exited = await moneyPost(owner.context.request, "/api/workspace-exit", { workspaceId: fixture.workspaceId, futureWork: "cancel", providerParticipation: "revoke", maintainedResources: { kind: "stop" }, notes: "Fictional local creator maintenance exit", idempotencyKey: randomUUID() }); expect(exited.state.status).toBe("completed");
  const retained = await read(); expect(retained.canMaintain).toBe(false); expect(retained.listings.find(l=>l.id===fixture.listing.id)?.history).toEqual(saved.terms);
  await moneyPost(owner.context.request, "/api/workspace/creator-maintenance", { ...changed, effectiveFrom: new Date(starts.getTime()+2*86400_000).toISOString() }, 403);
  expect(creatorMaintenanceSnapshot(fixture.listing.id, fixture.installation.id)).toEqual(saved);
  await page.reload(); await expect(page.getByRole("status")).toContainText("Recorded history remains available."); await expect(page.getByRole("button", { name: "Record maintenance terms", exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 }); await noHorizontalOverflow(page); await page.screenshot({ path: info.outputPath("creator-maintenance-exited-mobile.png"), fullPage: true });
 } finally {
  // Keep route cleanup inside the live contexts even when click/receipt/history
  // assertions fail; successful early removals are safely idempotent.
  try { await Promise.all(responseLossCleanups.map(remove => remove())); }
  finally { await Promise.all([owner.context.close(), manager.context.close(), stranger.context.close(), anonymous.close()]); }
 }
});
