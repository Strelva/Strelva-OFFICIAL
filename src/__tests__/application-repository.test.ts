import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boundedStore, type BoundedStore } from "@/platform/bounded-work/repository";
import {
  WorkspaceAccessError,
  WorkspaceConflictError,
  WorkspaceStoreError,
  WORKSPACE_EXIT_RESOURCES_STOPPED_MESSAGE,
  WORKSPACE_EXIT_STOPPED_MESSAGE,
  type SavedWork,
} from "@/platform/workspaces/types";
import { createApplicationDraft } from "@/products/applications/server";
import { durableDb, durableRpc, load } from "@/products/applications/repository";

const database = vi.hoisted(() => ({ current: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getSupabase: database.current }));

const actor = { userId: "owner", verifiedEmail: "owner@example.com" };
const payload = createApplicationDraft({
  title: "Requests", maintenanceOwner: actor.userId,
  fields: [{ id: "subject", label: "Subject", type: "text", required: true }],
  components: [{ kind: "form", fields: ["subject"] }],
}, actor);
const work: SavedWork = {
  id: "application-1", workspaceId: "workspace-a", productId: "applications", resourceKind: "application",
  title: "Requests", createdBy: actor.userId, createdAt: "2026-09-22T12:00:00.000Z", updatedAt: "2026-09-22T12:00:00.000Z",
  payload: { ...payload, status: "installed" },
};

beforeEach(() => database.current.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("native application storage authority", () => {
  it("fails closed when canonical production storage is missing", async () => {
    database.current.mockReturnValue(null);
    const read = vi.spyOn(boundedStore, "read").mockResolvedValue(work);
    expect(() => durableDb(boundedStore)).toThrow(WorkspaceStoreError);
    await expect(load(boundedStore, actor, work.id)).rejects.toThrow("Application storage is unavailable");
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { code: "42P01", message: "relation application_states does not exist" } },
  ])("never falls back to a populated legacy payload when the canonical state is unavailable", async (result) => {
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result),
    };
    const db = { from: vi.fn().mockReturnValue(query), rpc: vi.fn() };
    database.current.mockReturnValue(db);
    vi.spyOn(boundedStore, "read").mockResolvedValue(work);
    await expect(load(boundedStore, actor, work.id)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(db.from).toHaveBeenCalledWith("application_states");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("uses legacy compatibility state only for an explicitly injected store", async () => {
    const store: BoundedStore = {
      member: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(work),
      create: vi.fn(),
      update: vi.fn(),
    };
    expect(durableDb(store)).toBeNull();
    const loaded = await load(store, actor, work.id);
    expect(loaded.state.releases).toEqual([{
      version: 1, spec: payload.spec, publishedAt: null, publishedBy: null, provenance: "legacy_migrated",
    }]);
    expect(database.current).not.toHaveBeenCalled();
  });

  it.each([
    ["access_denied", WorkspaceAccessError],
    ["agency_application_draft_edit_denied", WorkspaceAccessError],
    ["verified_identity_required", WorkspaceAccessError],
    ["revision_conflict", WorkspaceConflictError],
    ["release_conflict", WorkspaceConflictError],
    ["record_duplicate", WorkspaceConflictError],
    ["history_limit", WorkspaceConflictError],
    ["unexpected_database_failure", WorkspaceStoreError],
  ])("preserves native RPC failure classification: %s", async (message, errorType) => {
    const db = { from: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: null, error: { message } }) };
    await expect(durableRpc(db, "publish_application_candidate", {}, "Publication unavailable")).rejects.toBeInstanceOf(errorType);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["workspace_exit_future_work_blocked", WORKSPACE_EXIT_STOPPED_MESSAGE],
    ["workspace_exit_resource_stopped", WORKSPACE_EXIT_RESOURCES_STOPPED_MESSAGE],
  ])("preserves stopped-work messages: %s", async (message, expected) => {
    const db = { from: vi.fn(), rpc: vi.fn().mockResolvedValue({ data: null, error: { message } }) };
    await expect(durableRpc(db, "publish_application_candidate", {}, "Publication unavailable")).rejects.toThrow(expected);
  });
});
