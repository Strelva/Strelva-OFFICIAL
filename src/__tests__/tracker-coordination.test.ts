import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const boundary = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => boundary.database }));
import { saveNewTracker, editSavedTracker, readSavedTracker } from "@/products/tracker/server";
const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.com" };
const assigneeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherWorkspaceId = "22222222-2222-4222-8222-222222222222";
type Row = Record<string, unknown>;
function databaseBoundary() {
  const tables: Record<string, Row[]> = { workspace_memberships: [{ workspace_id: workspaceId, user_id: actor.userId, role: "owner" },{ workspace_id: workspaceId, user_id: assigneeId, role: "member" }, { workspace_id: otherWorkspaceId, user_id: actor.userId, role: "owner" }], saved_product_work: [], workspace_delegations: [] };
  function from(table: string) {
    const filters: Array<(row: Row) => boolean> = []; let insertion: Row | undefined;
    const query = { select() { return query; }, eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; }, in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; }, insert(value: Row) { insertion = value; return query; }, async maybeSingle() { const result = await execute(); return { ...result, data: result.data[0] ?? null }; }, async single() { return query.maybeSingle(); }, then(resolve: (value: Awaited<ReturnType<typeof execute>>) => unknown, reject?: (error: unknown) => unknown) { return execute().then(resolve, reject); } };
    async function execute() {
      if (!tables[table]) throw new Error(`Unexpected table ${table}`);
      if (insertion) { const row = { ...structuredClone(insertion), id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; tables[table].push(row); insertion = undefined; return { data: [row], count: 1, error: null }; }
      const rows = tables[table].filter(row => filters.every(filter => filter(row))); return { data: structuredClone(rows), count: rows.length, error: null };
    }
    return query;
  }
  return { from, async rpc(name: string, args: Row) {
    if (name !== "update_tracker_work") throw new Error(`Unexpected RPC ${name}`);
    const work = tables.saved_product_work!.find(row => row.id === args.p_work_id)!;
    work.payload = structuredClone(args.p_payload); return { data: [structuredClone(work)], error: null };
  } };
}
async function create(title: string, workspace = workspaceId) { return saveNewTracker(actor, { workspaceId: workspace, title, input: { fileName: "requests.csv", content: "Name,Status\nRoof,Open\nPorch,Open", mimeType: "text/csv" } }); }
beforeEach(() => { boundary.database = databaseBoundary(); });
describe("native tracker record coordination", () => {
  it("assigns and relates a record, then undoes only coordination while preserving later cell edits", async () => {
    const tasks = await create("Tasks"), projects = await create("Projects");
    const rowId = tasks.tracker.rows[0]!.id;
    const link = { workId: projects.workId, rowId: projects.tracker.rows[0]!.id, linkedRevision: 0 };
    const assigned = await editSavedTracker(actor, tasks.workId, { kind: "coordinate_records", commandId: "assign-related", baseRevision: 0, rowIds: [rowId], assigneeId, link });
    expect(assigned.tracker.rows[0]!.coordination).toEqual({ assigneeId, links: [link] });
    const columnId = tasks.tracker.columns[0]!.id;
    await editSavedTracker(actor, tasks.workId, { kind: "update_cell", commandId: "rename", baseRevision: 1, rowId, columnId, value: "Roof repair" });
    const undone = await editSavedTracker(actor, tasks.workId, { kind: "undo_change", commandId: "undo-assignment", baseRevision: 2, targetCommandId: "assign-related" });
    expect(undone.tracker.rows[0]!.coordination).toEqual({ assigneeId: null, links: [] });
    expect(undone.tracker.rows[0]!.cells[columnId]!.value).toBe("Roof repair");
    expect(undone.tracker.rows[1]!.cells[columnId]!.value).toBe("Porch");
  });
  it("rejects outsiders, foreign-workspace links and stale related records before saving any metadata", async () => {
    const tasks = await create("Tasks"), projects = await create("Projects"), foreign = await create("Foreign", otherWorkspaceId);
    const base = { kind: "coordinate_records", commandId: "invalid", baseRevision: 0, rowIds: [tasks.tracker.rows[0]!.id] };
    await expect(editSavedTracker(actor, tasks.workId, { ...base, assigneeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })).rejects.toThrow(/member|denied/i);
    await expect(editSavedTracker(actor, tasks.workId, { ...base, link: { workId: foreign.workId, rowId: foreign.tracker.rows[0]!.id, linkedRevision: 0 } })).rejects.toThrow(/workspace|denied/i);
    await expect(editSavedTracker(actor, tasks.workId, { ...base, link: { workId: projects.workId, rowId: projects.tracker.rows[0]!.id, linkedRevision: 9 } })).rejects.toThrow(/changed|revision/i);
    await editSavedTracker(actor, projects.workId, { kind: "delete_row", commandId: "remove-project", baseRevision: 0, rowId: projects.tracker.rows[0]!.id });
    await expect(editSavedTracker(actor, tasks.workId, { ...base, link: { workId: projects.workId, rowId: projects.tracker.rows[0]!.id, linkedRevision: 1 } })).rejects.toThrow(/no longer available/i);
    expect((await readSavedTracker(actor, tasks.workId)).tracker.revision).toBe(0);
  });

  it("does not undo over a newer assignment and rejects stale source revisions", async () => {
    const tasks = await create("Tasks"); const rowId = tasks.tracker.rows[0]!.id;
    await editSavedTracker(actor, tasks.workId, { kind: "coordinate_records", commandId: "assign", baseRevision: 0, rowIds: [rowId], assigneeId });
    await expect(editSavedTracker(actor, tasks.workId, { kind: "coordinate_records", commandId: "stale", baseRevision: 0, rowIds: [rowId], assigneeId: actor.userId })).rejects.toThrow(/changed/i);
    await editSavedTracker(actor, tasks.workId, { kind: "coordinate_records", commandId: "reassign", baseRevision: 1, rowIds: [rowId], assigneeId: actor.userId });
    await expect(editSavedTracker(actor, tasks.workId, { kind: "undo_change", commandId: "unsafe-undo", baseRevision: 2, targetCommandId: "assign" })).rejects.toThrow(/changed|newer/i);
    expect((await readSavedTracker(actor, tasks.workId)).tracker.rows[0]!.coordination?.assigneeId).toBe(actor.userId);
  });

});
