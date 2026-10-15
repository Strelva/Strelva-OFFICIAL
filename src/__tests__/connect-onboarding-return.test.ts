import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { onboardConnectedAccount, refreshConnectedAccountForActor } from "@/platform/connect";

const holders = vi.hoisted(() => ({ record: vi.fn(), prepare: vi.fn() }));
vi.mock("@/platform/connect/connection-holder", () => ({ prepareStripeConnectionHolder: holders.prepare }));

const workspaceId = "a2830000-0000-4000-8000-000000000010";
const actor = { userId: "a2830000-0000-4000-8000-000000000011", verifiedEmail: "owner@example.test" };
const input = { workspaceId, configurations: ["merchant" as const], origin: "https://app.example" };
const account = { id: "acct_Fictional", configuration: { merchant: { capabilities: { card_payments: { status: "active" } } } }, requirements: {} };
const row = { workspace_id: workspaceId, stripe_account_id: "acct_Fictional", configurations: ["merchant"], profile_version: "fictional-v1", state: "ready", generation: 1, capabilities: {}, requirements: {} };

function fixture(managed: unknown = row) {
  const db = { rpc: vi.fn(async (name: string) => ({ data: name === "manage_connected_account" ? managed : name === "record_connected_account" ? row : null, error: null })) };
  const retrieve = vi.fn(async () => account);
  const createLink = vi.fn(async () => ({ url: "https://connect.stripe.com/fictional" }));
  const stripe = { v2: { core: { accounts: { create: vi.fn(async () => account), retrieve, update: vi.fn() }, accountLinks: { create: createLink } } } } as unknown as Stripe;
  return { db, stripe, retrieve, createLink };
}

beforeEach(() => {
  holders.record.mockReset().mockResolvedValue(undefined);
  holders.prepare.mockReset().mockResolvedValue(holders.record);
  vi.stubEnv("STRELVA_CONNECT", "1");
  vi.stubEnv("STRELVA_CONNECT_PROFILE_VERSION", "fictional-v1");
  vi.stubEnv("STRELVA_CONNECT_FEES_COLLECTOR", "stripe");
  vi.stubEnv("STRELVA_CONNECT_LOSSES_COLLECTOR", "stripe");
});
afterEach(() => vi.unstubAllEnvs());

describe("Connect onboarding return", () => {
  it("sends people back to the page that started setup, with the workspace", async () => {
    const links = fixture();
    await onboardConnectedAccount(actor, { ...input, returnTo: "payment-links" }, links);
    expect(links.createLink).toHaveBeenCalledWith({ account: "acct_Fictional", use_case: { type: "account_onboarding", account_onboarding: { configurations: ["merchant"], refresh_url: `https://app.example/workspace/payment-links?workspaceId=${workspaceId}&connect=refresh`, return_url: `https://app.example/workspace/payment-links?workspaceId=${workspaceId}&connect=return` } } });
    const payments = fixture();
    await onboardConnectedAccount(actor, input, payments);
    expect(payments.createLink).toHaveBeenCalledWith(expect.objectContaining({ use_case: expect.objectContaining({ account_onboarding: expect.objectContaining({ return_url: `https://app.example/workspace/payments?workspaceId=${workspaceId}&connect=return` }) }) }));
  });
});

describe("refreshConnectedAccountForActor", () => {
  it("authorizes a manager read before asking Stripe", async () => {
    const f = fixture();
    await refreshConnectedAccountForActor(actor, workspaceId, f);
    expect(f.db.rpc.mock.calls[0]).toEqual(["manage_connected_account", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_action: "read" }]);
    expect(f.retrieve).toHaveBeenCalledTimes(1);
    expect(f.db.rpc.mock.calls.map(call => call[0])).toContain("record_connected_account");
  });

  it.each([null, { ...row, stripe_account_id: null }, { ...row, state: "disconnected" }])("makes no provider call without a live account (%#)", async managed => {
    const f = fixture(managed);
    await expect(refreshConnectedAccountForActor(actor, workspaceId, f)).resolves.toEqual(managed);
    expect(f.retrieve).not.toHaveBeenCalled();
  });

  it("refuses when Connect is off", async () => {
    vi.stubEnv("STRELVA_CONNECT", "");
    const f = fixture();
    await expect(refreshConnectedAccountForActor(actor, workspaceId, f)).rejects.toThrow("Connect is not enabled.");
    expect(f.db.rpc).not.toHaveBeenCalled();
  });

  it("the route answers 503 when Connect is off", async () => {
    vi.stubEnv("STRELVA_CONNECT", "");
    const { POST } = await import("@/app/api/billing/connect/route");
    const response = await POST(new Request("https://app.example/api/billing/connect", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
  });
});
