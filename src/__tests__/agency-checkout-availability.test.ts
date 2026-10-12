import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readCheckoutAvailability } from "@/platform/connect/checkout-availability";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const account = { workspace_id: workspaceId, stripe_account_id: "acct_Fictional", configurations: ["merchant"], profile_version: "fictional-v1", state: "ready", generation: 1, capabilities: {}, requirements: {} };
beforeEach(() => { vi.stubEnv("STRELVA_CONNECT", "1"); vi.stubEnv("STRIPE_SECRET_KEY", "fictional-provider-key"); });
afterEach(() => vi.unstubAllEnvs());

it("shows Coming soon without reading money storage while Connect is off", async () => {
  vi.stubEnv("STRELVA_CONNECT", "0");
  const db = { rpc: vi.fn() };
  expect(await readCheckoutAvailability(workspaceId, db)).toEqual({ status: "coming_soon" });
  expect(db.rpc).not.toHaveBeenCalled();
});
it.each([null, { ...account, state: "pending" }, { ...account, state: "restricted" }, { ...account, state: "disconnected" }, { ...account, configurations: ["recipient"] }, { ...account, stripe_account_id: null }])("requires a ready merchant, not merely an existing account: %j", async data => {
  const db = { rpc: vi.fn(async () => ({ data, error: null })) };
  expect(await readCheckoutAvailability(workspaceId, db)).toEqual({ status: "setup_required" });
});
it("recognizes a ready merchant in the exact authorized agency", async () => {
  const db = { rpc: vi.fn(async () => ({ data: account, error: null })) };
  expect(await readCheckoutAvailability(workspaceId, db)).toEqual({ status: "ready" });
  expect(db.rpc).toHaveBeenCalledWith("read_connected_account", { p_workspace_id: workspaceId });
});
it.each([{ data: { ...account, workspace_id: "33333333-3333-4333-8333-333333333333" }, error: null }, { data: {}, error: null }, { data: null, error: { message: "offline" } }])("fails closed on unconfirmed merchant reads: %j", async result => {
  const db = { rpc: vi.fn(async () => result) };
  expect(await readCheckoutAvailability(workspaceId, db)).toEqual({ status: "unavailable" });
});
it("withholds checkout when the provider is unconfigured or storage throws", async () => {
  const db = { rpc: vi.fn(async () => { throw new Error("offline"); }) };
  expect(await readCheckoutAvailability(workspaceId, db)).toEqual({ status: "unavailable" });
  db.rpc.mockClear(); vi.stubEnv("STRIPE_SECRET_KEY", "");
  expect(await readCheckoutAvailability(workspaceId, db)).toEqual({ status: "unavailable" });
  expect(db.rpc).not.toHaveBeenCalled();
});
