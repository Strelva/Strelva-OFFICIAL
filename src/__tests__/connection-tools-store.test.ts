import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => mocks.client }));
import { readGhlConnectionMetadata } from "@/products/agency-clients/gohighlevel/connection-source";
import { readConnectedSiteMetadata } from "@/products/connected-sites/connection-source";
import { supabaseGhlConnectionStore } from "@/products/agency-clients/gohighlevel/repository";

const workspace = "ab120000-0000-4000-8000-000000000001";
const id = "ab120000-0000-4000-8000-000000000002";
beforeEach(() => { mocks.client = null; });

describe("tools source persistence boundary", () => {
  it("reads only HighLevel display metadata scoped to the current agency", async () => {
    const eq = vi.fn();
    const select = vi.fn();
    const query = { eq, select, then: (resolve: (result: unknown) => unknown) => resolve({ data: [{ id, workspace_id: workspace, external_account_id: "NorthStudio", status: "connected", created_at: "2026-10-14" }], error: null }) };
    eq.mockReturnValue(query); select.mockReturnValue(query);
    const from = vi.fn(() => query); mocks.client = { from };
    expect(await readGhlConnectionMetadata(workspace)).toHaveLength(1);
    expect(from).toHaveBeenCalledExactlyOnceWith("agency_source_connections");
    expect(select).toHaveBeenCalledExactlyOnceWith("id,workspace_id,external_account_id,status,created_at");
    expect(eq.mock.calls).toEqual([["provider", "gohighlevel"], ["workspace_id", workspace]]);
  });

  it("uses the safe connected-site metadata RPC rather than reading protected keys", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null })); mocks.client = { rpc };
    expect(await readConnectedSiteMetadata(workspace)).toEqual([]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("read_connected_site_connection_metadata", { p_workspace_id: workspace });
  });

  it("doesn't turn an unavailable store into an empty successful source", async () => {
    await expect(readGhlConnectionMetadata(workspace)).rejects.toThrow("unavailable");
    await expect(readConnectedSiteMetadata(workspace)).rejects.toThrow("unavailable");
    mocks.client = { rpc: async () => ({ data: [], error: { message: "private-detail" } }) };
    await expect(readConnectedSiteMetadata(workspace)).rejects.toThrow("Website connections could not be read.");
  });
});

describe("HighLevel compensation under reconnect", () => {
  it.each([false, true])("clears only this failed save, preserving a newer reconnect (newer=%s)", async newer => {
    const previousSave = "2026-10-14T00:00:00.000001Z";
    const row: Record<string, unknown> = { id, updated_at: newer ? "2026-10-14T00:00:00.000002Z" : previousSave, status: "connected", access_token_ciphertext: "sealed-new-token" };
    let patch: Record<string, unknown> = {};
    const filters: Array<[string, unknown]> = [];
    const query = {
      update(values: Record<string, unknown>) { patch = values; return query; },
      eq(column: string, value: unknown) { filters.push([column, value]); return query; },
      then(resolve: (result: unknown) => unknown) {
        if (filters.every(([key, value]) => row[key] === value)) Object.assign(row, patch);
        return resolve({ data: null, error: null });
      },
    };
    const store = supabaseGhlConnectionStore({ from: () => query } as unknown as Parameters<typeof supabaseGhlConnectionStore>[0]);
    await store.revokeSaved!(id, previousSave);
    expect(row.status).toBe(newer ? "connected" : "revoked");
    expect(row.access_token_ciphertext).toBe(newer ? "sealed-new-token" : null);
  });
});
