import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { localEnvironment, signedInContext } from "./support/local-auth";

test.skip(process.env.STRELVA_LOCAL_AUTH_PROOF !== "1", "Requires an isolated local Supabase stack.");
test.setTimeout(150_000);
async function post(request: APIRequestContext, body: unknown, status = 200) {
  const response = await request.post("/api/tracker", { headers: { origin: localEnvironment().app }, data: body });
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}

test("record assignment and relationships survive reload and undo preserves a later cell edit", async ({ browser }) => {
  const env = localEnvironment();
  const admin = createClient(env.url, env.service, { auth: { persistSession: false, autoRefreshToken: false } });
  const owner = await signedInContext(browser, admin, "coordination-owner");
  const teammate = await signedInContext(browser, admin, "coordination-member");
  const stranger = await signedInContext(browser, admin, "coordination-stranger");
  try {
    const snapshotResponse = await owner.context.request.get("/api/workspace");
    expect(snapshotResponse.status()).toBe(200);
    const { workspaceId } = await snapshotResponse.json();
    expect((await teammate.context.request.get("/api/workspace")).status()).toBe(200);
    expect((await stranger.context.request.get("/api/workspace")).status()).toBe(200);
    // Local identity fixture only. This does not claim a customer membership-invitation flow.
    const membership = await admin.from("workspace_memberships").insert({ workspace_id: workspaceId, user_id: teammate.userId, role: "member", created_by: owner.userId });
    expect(membership.error).toBeNull();
    const create = (title: string) => post(owner.context.request, { action: "create", workspaceId, title, input: { fileName: "requests.csv", content: "Name,Status\nRoof,Open\nPorch,Open", mimeType: "text/csv" } });
    const tasks = await create("Local service tasks"), projects = await create("Local projects");
    const rowId = tasks.tracker.rows[0].id, columnId = tasks.tracker.columns[0].id;
    const link = { workId: projects.workId, rowId: projects.tracker.rows[0].id, linkedRevision: 0 };
    const command = { kind: "coordinate_records", commandId: "assign-project", baseRevision: 0, rowIds: [rowId], assigneeId: teammate.userId, link };
    await post(stranger.context.request, { action: "command", workId: tasks.workId, command }, 403);
    await post(owner.context.request, { action: "command", workId: tasks.workId, command: { ...command, commandId: "invalid-member", assigneeId: stranger.userId } }, 403);
    await post(owner.context.request, { action: "command", workId: tasks.workId, command: { ...command, commandId: "stale-link", link: { ...link, linkedRevision: 9 } } }, 409);
    const assigned = await post(owner.context.request, { action: "command", workId: tasks.workId, command });
    expect(assigned.tracker.rows[0].coordination).toEqual({ assigneeId: teammate.userId, links: [link] });
    const reopened = await teammate.context.request.get(`/api/tracker?workId=${tasks.workId}&coordination=1`);
    expect(reopened.status()).toBe(200);
    expect((await reopened.json()).tracker.rows[0].coordination.assigneeId).toBe(teammate.userId);
    await post(owner.context.request, { action: "command", workId: tasks.workId, command: { kind: "update_cell", commandId: "rename-task", baseRevision: 1, rowId, columnId, value: "Roof repair" } });
    const undone = await post(owner.context.request, { action: "command", workId: tasks.workId, command: { kind: "undo_change", commandId: "undo-coordination", baseRevision: 2, targetCommandId: "assign-project" } });
    expect(undone.tracker.rows[0].coordination).toEqual({ assigneeId: null, links: [] });
    expect(undone.tracker.rows[0].cells[columnId].value).toBe("Roof repair");
    expect(undone.tracker.rows[1].cells[columnId].value).toBe("Porch");
    const after = await owner.context.request.get(`/api/tracker?workId=${tasks.workId}`);
    expect((await after.json()).tracker.revision).toBe(3);
  } finally { await owner.context.close(); await teammate.context.close(); await stranger.context.close(); }
});
