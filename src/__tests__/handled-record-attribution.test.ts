import { afterEach, describe, expect, it, vi } from "vitest";
import { PostgresNeedsYouStore, setNeedsYouDb } from "@/platform/needs-you/repository";
import { handledFromStore } from "@/platform/needs-you/handled";
import { handledReceiptSchema } from "@/platform/needs-you/contracts";

const workspaceId = "aaaaaaaa-0000-4000-8000-000000000001";
const actor = { userId: "aaaaaaaa-0000-4000-8000-000000000002", verifiedEmail: "owner@example.test" };
const at = "2026-10-09T12:00:00Z";
const since = "2026-10-02T12:00:00Z";
const revision = {
  sequence: 3, revision: 3, actorId: "aaaaaaaa-0000-4000-8000-000000000003", actorKind: "agency",
  source: "agency", undoOf: null, undoneBy: null, createdAt: at,
  changes: [{ entity: "fact", id: "hours", before: { value: "old" }, after: { value: "new" } }],
};
const row = { store: "business_record_revisions", id: "3", at, changes: ["fact:hours"], undo: "undo", source: "agent" };

function database(rows: unknown[], history: unknown[]) {
  const rpc = vi.fn(async (name: string) => ({ data: name === "read_strelva_handled" ? rows : history, error: null }));
  setNeedsYouDb({ rpc });
  return rpc;
}

afterEach(() => setNeedsYouDb(null));

describe("What changed recorded revision actors", () => {
  it("keeps the name recorded at action time and never looks up a current name", async () => {
    const rpc = database([row], [{ ...revision, actor: { kind: "agency", displayName: "Former Agency Name" } }]);
    const rows = await PostgresNeedsYouStore.handled(actor, workspaceId, since);
    expect(rows).toHaveLength(1);
    expect(handledReceiptSchema.parse(handledFromStore(rows[0]!))).toMatchObject({
      actorKind: "agency", actorId: revision.actorId,
      actor: { kind: "agency", displayName: "Former Agency Name" }, sentence: "Former Agency Name updated your hours in your business record",
    });
    expect(rpc.mock.calls.map(call => call[0])).toEqual(["read_strelva_handled", "read_business_record_history"]);
    expect(rpc).toHaveBeenLastCalledWith("read_business_record_history", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_limit: 200 });
  });

  it("carries ID-only agency writes omitted by the old source filter without inventing a name", async () => {
    database([], [revision]);
    const rows = await PostgresNeedsYouStore.handled(actor, workspaceId, since);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changes).toEqual(["fact:hours"]);
    const receipt = handledReceiptSchema.parse(handledFromStore(rows[0]!));
    expect(receipt).toMatchObject({ actorKind: "agency", actorId: revision.actorId, sentence: "Updated your hours in your business record", undo: { state: "undo" } });
    expect(receipt.actor).toBeUndefined();
    expect(JSON.stringify(rows)).not.toContain('"value"');
  });

  it("keeps a receipt snapshot over another read and preserves original undo state", async () => {
    database([{ ...row, actor: { kind: "agency", displayName: "Strelva Agency" }, undo: "undone" }], [revision]);
    const rows = await PostgresNeedsYouStore.handled(actor, workspaceId, since);
    expect(handledFromStore(rows[0]!)).toMatchObject({ sentence: "Strelva Agency updated your hours in your business record", undo: { state: "undone" } });
  });

  it("uses recorded executor kind ahead of source and never substitutes a decider", async () => {
    database([{ ...row, source: "operator", decidedByKind: "operator" }], [revision]);
    const rows = await PostgresNeedsYouStore.handled(actor, workspaceId, since);
    expect(handledFromStore(rows[0]!)?.sentence).toBe("Updated your hours in your business record");
  });

  it("excludes old revisions and conservatively preserves undo, undone and undo-of states", async () => {
    database([], [
      revision,
      { ...revision, sequence: 2, undoneBy: 3 },
      { ...revision, sequence: 1 },
      { ...revision, sequence: 4, undoOf: 2 },
      { ...revision, sequence: 5, createdAt: "2026-09-01T12:00:00Z" },
    ]);
    const rows = await PostgresNeedsYouStore.handled(actor, workspaceId, since);
    expect(rows.map(row => [row.id, row.undo])).toEqual([["3", "undo_needs_review"], ["2", "undone"], ["1", "undo_needs_review"], ["4", "not_undoable"]]);
  });

  it("does not attempt an attribution read when the feed denies access", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "owner_decision_access_denied" } }));
    setNeedsYouDb({ rpc });
    await expect(PostgresNeedsYouStore.handled(actor, workspaceId, since)).rejects.toThrow("access");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("reports an unavailable history read rather than silently claiming complete attribution", async () => {
    setNeedsYouDb({ rpc: vi.fn(async name => name === "read_strelva_handled" ? { data: [row], error: null } : { data: null, error: { message: "unavailable" } }) });
    await expect(PostgresNeedsYouStore.handled(actor, workspaceId, since)).rejects.toThrow("could not be loaded");
  });
});
