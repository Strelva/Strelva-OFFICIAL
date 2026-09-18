import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase stack.");
test.setTimeout(120_000);

test("accepting a model-free plan fixture creates one native application draft with server-owned maintenance", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "plan-app-owner");
  const stranger = await signedInContext(browser, admin, "plan-app-stranger");
  try {
    const snapshotResponse = await owner.context.request.get("/api/workspace");
    expect(snapshotResponse.status()).toBe(200);
    const { workspaceId } = await snapshotResponse.json();
    expect((await stranger.context.request.get("/api/workspace")).status()).toBe(200);
    const draft = { kind: "application", title: "Repair requests", fields: [{ id: "problem", label: "Problem", type: "text", required: true }], components: [{ kind: "form", fields: ["problem"] }, { kind: "list", fields: ["problem"] }] };
    // Explicit synthetic saved plan. This proof does not invoke or assess a planning model.
    const fixture = await admin.from("saved_product_work").insert({ workspace_id: workspaceId, product_id: "work_plans", resource_kind: "plan", title: "Prepare repair intake", created_by: owner.userId, payload: { version: 1, status: "ready", userGoal: "Let staff report repairs and review requests", summary: "Prepare a private repair request form and list", proposedOutputs: [{ id: "repair-app", title: "Repair requests", description: "A private form and list for repair requests", outcome: "capability", nativeOperationIds: ["create_application"], draft }], steps: [], neededInputs: [], supportedNativeOperations: [{ id: "create_application", productId: "applications", resourceKind: "application", label: "Create a private application", effect: "create_resource", support: "release_gated", description: "Create an application from approved components" }], estimatedCost: null, requiredDecisions: [], context: { version: 1, sources: [] }, metadata: { revision: 1, actorId: owner.userId, createdBy: owner.userId, workspaceId, createdAt: new Date().toISOString() } } }).select("id").single();
    expect(fixture.error).toBeNull();
    const input = { workspaceId, planWorkId: fixture.data!.id, outputId: "repair-app", expectedPlanRevision: 1 };
    const denied = await stranger.context.request.post("/api/work-plans/execute", { headers: { origin: env.app }, data: input });
    expect(denied.status()).toBe(403);
    const accepted = await owner.context.request.post("/api/work-plans/execute", { headers: { origin: env.app }, data: input });
    expect(accepted.status(), await accepted.text()).toBe(201);
    const execution = await accepted.json();
    const opened = await owner.context.request.get(`/api/bounded-work?productId=applications&workId=${execution.nativeWorkId}`);
    expect(opened.status()).toBe(200);
    expect((await opened.json()).payload).toMatchObject({ status: "draft", revision: 0, records: [], rehearsal: null, spec: { title: "Repair requests", maintenanceOwner: owner.userId } });
    const replayed = await owner.context.request.post("/api/work-plans/execute", { headers: { origin: env.app }, data: input });
    expect(replayed.status()).toBe(200);
    expect(await replayed.json()).toMatchObject({ status: "already_completed", nativeWorkId: execution.nativeWorkId });
  } finally { await owner.context.close(); await stranger.context.close(); }
});
