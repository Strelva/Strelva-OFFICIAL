import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { journeyProfile } from "../../scripts/full-model-journey-profile.mjs";
import { connectEnabled, onboardConnectedAccount, createDirectCheckout, stripeClient } from "@/platform/connect";
import { readBusinessMoney } from "@/platform/connect/requests";

const workspaceId = "27416000-0000-4000-8000-000000000001";
const actor = { userId: "27416000-0000-4000-8000-000000000002", verifiedEmail: "fictional-native-owner@example.test" };
const providerFields = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET",
  "STRIPE_CONNECT_THIN_WEBHOOK_SECRET", "STRELVA_CONNECT_PROFILE_VERSION", "STRELVA_CONNECT_FEES_COLLECTOR",
  "STRELVA_CONNECT_LOSSES_COLLECTOR"];

beforeEach(() => {
  // Actual closed profile; clean runner intentionally supplies none of these
  // provider fields. Never inherit a developer credential or liability choice.
  for (const [key, value] of Object.entries(journeyProfile("full-native").env)) vi.stubEnv(key, value);
  for (const key of providerFields) vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("closed full-native merchant prerequisite boundary", () => {
  it("permits the native actor-scoped money read without a provider credential or account", async () => {
    const money = { account: null, payments: [], events: [], splits: [], payouts: [] };
    const db = { rpc: vi.fn(async () => ({ data: money, error: null })) };
    expect(connectEnabled()).toBe(true);
    expect(await readBusinessMoney(actor, workspaceId, db)).toBe(money);
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("read_business_money", {
      p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    });
    expect(() => stripeClient()).toThrow("Payments provider is unavailable.");
  });

  it("rejects onboarding before reserving an account or accessing a provider", async () => {
    const db = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    const provider = vi.fn((): Stripe => { throw new Error("Provider accessed"); });
    await expect(onboardConnectedAccount(actor, { workspaceId, configurations: ["merchant"], origin: "http://localhost:50354" },
      { db, get stripe() { return provider(); } })).rejects.toThrow("approved liability decision");
    expect(db.rpc).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("a pending merchant cannot reserve payment state or call checkout", async () => {
    const pending = { workspace_id: workspaceId, stripe_account_id: null, configurations: [], profile_version: null,
      state: "pending", generation: 1, capabilities: {}, requirements: {} };
    const db = { rpc: vi.fn(async () => ({ data: pending, error: null })) };
    const provider = vi.fn((): Stripe => { throw new Error("Provider accessed"); });
    await expect(createDirectCheckout({ workspaceId, idempotencyKey: "fictional-native-checkout", purpose: "checkout",
      amountCents: 100, currency: "usd", successUrl: "http://localhost/paid", cancelUrl: "http://localhost/cancel" },
    { db, get stripe() { return provider(); } })).rejects.toThrow("merchant is not ready");
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("read_connected_account", { p_workspace_id: workspaceId });
    expect(provider).not.toHaveBeenCalled();
  });
});
