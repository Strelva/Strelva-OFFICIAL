import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceActor } from "@/platform/workspaces/types";

const business = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const agency = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const websiteId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const privateId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({ seats: [] as string[], claims: null as unknown, rpcError: null as { message: string } | null,
  memberships: [] as Row[], delegations: [] as Row[], work: [] as Row[], calls: [] as { name: string; args: Row }[],
  writeError: null as { message: string } | null }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({
  from(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let count = false, single = false;
    const builder = {
      select(_columns: string, options?: { head?: boolean }) { count = Boolean(options?.head); return builder; },
      eq(key: string, value: unknown) { filters.push(row => key === "workspaces.kind" ? (row.workspaces as Row)?.kind === value : row[key] === value); return builder; },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return builder; },
      or(expression: string) { filters.push(row => (row.product_id === "websites" && row.resource_kind === "website") || expression.includes(String(row.id))); return builder; },
      order() { return builder; }, limit() { return builder; }, maybeSingle() { single = true; return builder; },
      then(resolve: (value: unknown) => unknown) {
        const rows: Row[] = table === "workspace_memberships" ? state.memberships : table === "workspace_delegations" ? state.delegations
          : table === "saved_product_work" ? state.work : [{ id: business, kind: "customer", name: "Seat client" }];
        const found = rows.filter(row => filters.every(filter => filter(row)));
        return Promise.resolve(resolve({ data: single ? found[0] ?? null : found, count: count ? found.length : null, error: null }));
      },
    };
    return builder;
  },
  async rpc(name: string, args: Row) {
    state.calls.push({ name, args });
    if (name === "read_version_actor") return { data: state.claims ?? { userId: args.p_user_id, memberships: state.seats.map(businessId => ({ businessId, role: "admin", via: "provider_seat" })) }, error: state.rpcError };
    if (name === "agency_can_read_assigned_work") return { data: false, error: null };
    if (name === "save_workspace_work") return { data: [{ id: websiteId, workspace_id: args.p_workspace_id, product_id: args.p_product_id, resource_kind: args.p_resource_kind }], error: state.writeError };
    return { data: null, error: null };
  },
}) }));
import { assertWorkspaceMember, assertWorkspaceWebsiteAccess, getWork, listWork, listWorkspaces, providerSeatWorkspaceAccess, saveWork } from "@/platform/workspaces/repository";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { websiteWorkspaceStore } from "@/products/websites/workspace-store";
import { boundedStore } from "@/platform/bounded-work/repository";
const actor: WorkspaceActor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: " Staff@Agency.Example " };
beforeEach(() => {
  state.seats = [business]; state.claims = null; state.rpcError = null; state.writeError = null; state.calls = [];
  state.memberships = [{ user_id: actor.userId, workspace_id: agency, role: "member", workspaces: { id: agency, kind: "agency", name: "Agency" } }];
  state.delegations = [];
  state.work = [{ id: websiteId, workspace_id: business, product_id: "websites", resource_kind: "website", payload: { version: 2 } },
    { id: privateId, workspace_id: business, product_id: "tracker", resource_kind: "tracker", payload: { contacts: ["private"] } }];
});
describe("verified provider-seat website access", () => {
  it("lists the client without claiming direct membership or its admin role", async () => {
    const clients = await listWorkspaces(actor);
    expect(clients.find(row => row.id === business)).toMatchObject({ access: "provider_seat", role: undefined });
    expect(state.memberships).toHaveLength(1);
    expect(state.calls).toContainEqual({ name: "read_version_actor", args: { p_user_id: actor.userId, p_verified_email: "staff@agency.example" } });
  });
  it("keeps a direct business membership ahead of the provider claim", async () => {
    state.memberships.push({ user_id: actor.userId, workspace_id: business, role: "owner", workspaces: { id: business, kind: "customer" } });
    const clients = await listWorkspaces(actor);
    expect(clients.filter(row => row.id === business)).toHaveLength(1);
    expect(clients.find(row => row.id === business)).toMatchObject({ access: "member", role: "owner" });
  });
  it("lists and opens website work while refusing arbitrary private saved payloads", async () => {
    expect((await listWork(actor, business)).map(row => row.id)).toEqual([websiteId]);
    expect(await getWork(actor, websiteId)).toMatchObject({ id: websiteId });
    await expect(getWork(actor, privateId)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
  it("preserves an existing exact-work delegation alongside the website seat", async () => {
    state.delegations = [{ agency_workspace_id: agency, customer_workspace_id: business, customer_work_id: privateId, status: "active" }];
    expect((await listWork(actor, business)).map(row => row.id)).toEqual([websiteId, privateId]);
    expect(await getWork(actor, privateId)).toMatchObject({ id: privateId });
  });
  it.each(["ended seat", "removed staff", "removed agency member", "cross-agency", "wrong verified email"])("refuses access when SQL omits the claim: %s", async () => {
    state.seats = [];
    expect(await providerSeatWorkspaceAccess(actor, business)).toBe(false);
    expect((await listWorkspaces(actor)).some(row => row.id === business)).toBe(false);
    await expect(listWork(actor, business)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(getWork(actor, websiteId)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(assertWorkspaceWebsiteAccess(actor, business)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
  it.each([{ userId: "different", memberships: [] }, { userId: actor.userId, memberships: [{ businessId: business, role: "admin", via: "unknown" }] }, []])("fails closed on malformed or mismatched authority claims", async claims => {
    state.claims = claims;
    await expect(providerSeatWorkspaceAccess(actor, business)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("preserves SQL availability failure", async () => {
    state.rpcError = { message: "database unavailable" };
    await expect(listWorkspaces(actor)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
  it("permits only website writes and keeps the generic member port direct", async () => {
    await websiteWorkspaceStore.member(actor, business);
    await expect(assertWorkspaceMember(actor, business)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(boundedStore.member(actor, business)).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(saveWork(actor, business, { productId: "tracker", resourceKind: "tracker", payload: {} })).rejects.toBeInstanceOf(WorkspaceAccessError);
    await expect(saveWork(actor, business, { productId: "websites", resourceKind: "website", payload: {} })).resolves.toMatchObject({ id: websiteId });
  });
  it("rechecks the seat on later reads and maps removal during SQL write to denied access", async () => {
    await websiteWorkspaceStore.member(actor, business);
    state.seats = [];
    await expect(websiteWorkspaceStore.member(actor, business)).rejects.toBeInstanceOf(WorkspaceAccessError);
    state.seats = [business]; state.writeError = { message: "workspace_membership_required" };
    await expect(saveWork(actor, business, { productId: "websites", resourceKind: "website", payload: {} })).rejects.toBeInstanceOf(WorkspaceAccessError);
  });
});
