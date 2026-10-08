import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const ACTOR = "11111111-1111-4111-8111-111111111111";
const AGENCY = "22222222-2222-4222-8222-222222222222";
const OTHER_AGENCY = "33333333-3333-4333-8333-333333333333";
const CLIENT = "44444444-4444-4444-8444-444444444444";
const OTHER_CLIENT = "55555555-5555-4555-8555-555555555555";
const WORK = "66666666-6666-4666-8666-666666666666";
const OTHER_WORK = "77777777-7777-4777-8777-777777777777";
const actor = { userId: ACTOR, verifiedEmail: "agency@example.test" };
const fixture = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, calls: [] as Array<{ name: string; args: Row }>, malformed: false, revokedBeforeWrite: false }));

function query(table: string) {
  const predicates: Array<(row: Row) => boolean> = [];
  let joined = false;
  let counted = false;
  const related = (row: Row) => fixture.tables.workspaces!.find(workspace => workspace.id === (row.workspace_id ?? row.customer_workspace_id));
  const run = async () => {
    const rows = (fixture.tables[table] ?? []).filter(row => predicates.every(predicate => predicate(row)))
      .map(row => joined ? { ...row, workspaces: related(row) } : row);
    return { data: structuredClone(rows), error: null, count: counted ? rows.length : null };
  };
  const builder = {
    select(columns?: string, options?: { count?: string }) { joined = Boolean(columns?.includes("workspaces!")); counted = Boolean(options?.count); return builder; },
    eq(key: string, value: unknown) { predicates.push(row => (key === "workspaces.kind" ? related(row)?.kind : row[key]) === value); return builder; },
    in(key: string, values: unknown[]) { predicates.push(row => values.includes(row[key])); return builder; },
    order() { return builder; },
    limit() { return builder; },
    async maybeSingle() { const result = await run(); return { ...result, data: result.data[0] ?? null }; },
    then(resolve: (value: Awaited<ReturnType<typeof run>>) => unknown, reject?: (error: unknown) => unknown) { return run().then(resolve, reject); },
  };
  return builder;
}

vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ from: query, async rpc(name: string, args: Row) {
  fixture.calls.push({ name, args });
  if (name === "read_version_actor") {
    if (fixture.malformed) return { data: { userId: "another-user", memberships: [] }, error: null };
    const memberships = fixture.tables.workspace_memberships!.filter(row => row.user_id === args.p_user_id);
    const seats = fixture.tables.provider_seats!.filter(seat => seat.status === "active"
      && memberships.some(member => member.workspace_id === seat.agency_workspace_id)
      && fixture.tables.agency_client_staff!.some(staff => staff.agency_workspace_id === seat.agency_workspace_id
        && staff.customer_workspace_id === seat.customer_workspace_id && staff.user_id === args.p_user_id && staff.status === "active"));
    return { data: { userId: args.p_user_id, memberships: seats.map(seat => ({ businessId: seat.customer_workspace_id, role: "admin", via: "provider_seat" })) }, error: null };
  }
  if (name === "agency_can_read_assigned_work") return { data: false, error: null };
  if (name === "save_workspace_work") {
    if (fixture.revokedBeforeWrite) return { data: null, error: { message: "workspace_membership_required" } };
    return { data: [{ id: WORK, workspace_id: args.p_workspace_id, product_id: args.p_product_id, resource_kind: args.p_resource_kind, payload: args.p_payload, created_by: args.p_user_id }], error: null };
  }
  throw new Error(`Unexpected RPC ${name}`);
} }) }));

import { assertCanSaveWork, assertWorkspaceMember, getWork, listWork, listWorkspaces, saveWork } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";

beforeEach(() => {
  fixture.calls = [];
  fixture.malformed = false;
  fixture.revokedBeforeWrite = false;
  fixture.tables = {
    workspaces: [{ id: AGENCY, kind: "agency", name: "Agency" }, { id: OTHER_AGENCY, kind: "agency" }, { id: CLIENT, kind: "customer", name: "Client" }, { id: OTHER_CLIENT, kind: "customer" }],
    workspace_memberships: [{ workspace_id: AGENCY, user_id: ACTOR, role: "member" }],
    provider_seats: [{ agency_workspace_id: AGENCY, customer_workspace_id: CLIENT, status: "active" }, { agency_workspace_id: OTHER_AGENCY, customer_workspace_id: OTHER_CLIENT, status: "active" }],
    agency_client_staff: [{ agency_workspace_id: AGENCY, customer_workspace_id: CLIENT, user_id: ACTOR, status: "active" }, { agency_workspace_id: OTHER_AGENCY, customer_workspace_id: OTHER_CLIENT, user_id: ACTOR, status: "active" }],
    workspace_delegations: [],
    saved_product_work: [{ id: WORK, workspace_id: CLIENT, product_id: "websites", resource_kind: "website", payload: {} }, { id: OTHER_WORK, workspace_id: CLIENT, product_id: "tracker", resource_kind: "tracker", payload: {} }],
  };
});

describe("ordinary provider-seat workspace work", () => {
  it("opens a staffed client's websites without direct customer membership or private tracker access", async () => {
    expect(await listWorkspaces(actor)).toMatchObject([{ id: AGENCY, role: "member" }, { id: CLIENT, role: undefined, access: "provider_seat" }]);
    expect((await listWork(actor, CLIENT)).map(work => work.id)).toEqual([WORK]);
    await expect(getWork(actor, WORK)).resolves.toMatchObject({ workspaceId: CLIENT });
    await expect(getWork(actor, OTHER_WORK)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(assertWorkspaceMember(actor, CLIENT)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(assertCanSaveWork(actor, CLIENT)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(assertCanSaveWork(actor, CLIENT, { productId: "websites", resourceKind: "website" })).resolves.toBeUndefined();
    await expect(saveWork(actor, CLIENT, { productId: "tracker", resourceKind: "tracker", payload: {} })).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(saveWork(actor, CLIENT, { productId: "websites", resourceKind: "website", payload: {} })).resolves.toMatchObject({ workspaceId: CLIENT });
    expect(fixture.calls).toContainEqual({ name: "read_version_actor", args: { p_user_id: ACTOR, p_verified_email: actor.verifiedEmail } });
  });

  it("keeps a narrow delegated client read scoped to the named work", async () => {
    fixture.tables.provider_seats = [];
    fixture.tables.workspace_delegations = [{ customer_workspace_id: CLIENT, customer_work_id: WORK, agency_workspace_id: AGENCY, status: "active", workspaces: fixture.tables.workspaces![2] }];
    expect(await listWorkspaces(actor)).toMatchObject([{ id: AGENCY }, { id: CLIENT, access: "delegated_read" }]);
    expect((await listWork(actor, CLIENT)).map(work => work.id)).toEqual([WORK]);
    await expect(getWork(actor, OTHER_WORK)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(assertWorkspaceMember(actor, CLIENT)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(assertCanSaveWork(actor, CLIENT)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("cannot use another agency's seat even when a stale staff row names the actor", async () => {
    await expect(listWork(actor, OTHER_CLIENT)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(assertWorkspaceMember(actor, OTHER_CLIENT)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect((await listWorkspaces(actor)).some(workspace => workspace.id === OTHER_CLIENT)).toBe(false);
  });

  it.each(["seat", "staff", "membership"])("rechecks access after the %s ends without caching", async revoked => {
    await expect(getWork(actor, WORK)).resolves.toMatchObject({ id: WORK });
    await expect(assertCanSaveWork(actor, CLIENT, { productId: "websites", resourceKind: "website" })).resolves.toBeUndefined();
    if (revoked === "seat") fixture.tables.provider_seats![0]!.status = "ended";
    if (revoked === "staff") fixture.tables.agency_client_staff![0]!.status = "ended";
    if (revoked === "membership") fixture.tables.workspace_memberships = [];
    await expect(getWork(actor, WORK)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(listWork(actor, CLIENT)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(assertCanSaveWork(actor, CLIENT, { productId: "websites", resourceKind: "website" })).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect((await listWorkspaces(actor)).some(workspace => workspace.id === CLIENT)).toBe(false);
  });

  it("fails closed on an actor mismatch and on removal between admission and the SQL write", async () => {
    fixture.malformed = true;
    await expect(getWork(actor, WORK)).rejects.toBeInstanceOf(WorkspaceStoreError);
    fixture.malformed = false;
    fixture.revokedBeforeWrite = true;
    await expect(saveWork(actor, CLIENT, { productId: "websites", resourceKind: "website", payload: {} })).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("preserves the saved-work cap for a provider seat", async () => {
    fixture.tables.saved_product_work = Array.from({ length: 500 }, (_, index) => ({ id: `work-${index}`, workspace_id: CLIENT }));
    await expect(saveWork(actor, CLIENT, { productId: "websites", resourceKind: "website", payload: {} })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(fixture.calls.some(call => call.name === "save_workspace_work")).toBe(false);
  });

  it("keeps direct owner membership ahead of an overlapping provider seat", async () => {
    fixture.tables.workspace_memberships!.push({ workspace_id: CLIENT, user_id: ACTOR, role: "owner" });
    const clients = (await listWorkspaces(actor)).filter(workspace => workspace.id === CLIENT);
    expect(clients).toHaveLength(1);
    expect(clients[0]).toMatchObject({ role: "owner", access: "member" });
  });
});
