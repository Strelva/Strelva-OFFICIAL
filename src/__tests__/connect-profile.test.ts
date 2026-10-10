import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { connectProfile, onboardConnectedAccount } from "@/platform/connect";

const workspaceId = "a2830000-0000-4000-8000-000000000010";
const actor = { userId: "a2830000-0000-4000-8000-000000000011", verifiedEmail: "owner@example.test" };
const input = { workspaceId, configurations: ["merchant" as const], origin: "https://app.example.test" };
const reserved = { workspace_id: workspaceId, stripe_account_id: null, configurations: [], profile_version: null, state: "pending", generation: 3, capabilities: {}, requirements: {} };

function onboardingFixture(existing?: { profile_version: string; configurations: string[] }) {
  const providerAccount = { id: "acct_Fictional", configuration: { merchant: { capabilities: { card_payments: { status: "active" } } } }, requirements: {} };
  const db = { rpc: vi.fn(async (name: string, args: Record<string, unknown>) => ({
    data: name === "manage_connected_account" ? { ...reserved, ...(existing ? { ...existing, stripe_account_id: providerAccount.id } : {}) }
      : name === "record_connected_account" ? { ...reserved, stripe_account_id: providerAccount.id, profile_version: args.p_profile_version, configurations: existing?.configurations ?? ["merchant"], state: "ready" } : null,
    error: null,
  })) };
  const create = vi.fn(async () => providerAccount);
  const retrieve = vi.fn(async () => providerAccount);
  const update = vi.fn();
  const createLink = vi.fn(async () => ({ url: "https://connect.stripe.com/fictional" }));
  const stripe = { v2: { core: { accounts: { create, retrieve, update }, accountLinks: { create: createLink } } } } as unknown as Stripe;
  return { db, stripe, create, retrieve, update, createLink };
}

beforeEach(() => {
  vi.stubEnv("STRELVA_CONNECT", "1");
  vi.stubEnv("STRELVA_CONNECT_PROFILE_VERSION", "fictional-v1");
  vi.stubEnv("STRELVA_CONNECT_FEES_COLLECTOR", "application");
  vi.stubEnv("STRELVA_CONNECT_LOSSES_COLLECTOR", "application");
});
afterEach(() => vi.unstubAllEnvs());

describe("Connect full Dashboard profile boundary", () => {
  it.each(["application", "stripe"])("rejects platform losses with %s fees before account reservation or provider access", async fees => {
    vi.stubEnv("STRELVA_CONNECT_FEES_COLLECTOR", fees);
    const db = { rpc: vi.fn(async () => ({ data: null, error: null })) };
    const provider = vi.fn(() => { throw new Error("Provider accessed"); });
    await expect(onboardConnectedAccount(actor, input, { db, get stripe(): Stripe { return provider(); } }))
      .rejects.toThrow(fees === "application" ? /full Stripe Dashboard/ : /liability/);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("also rejects platform-loss recipient-only onboarding before reservation", async () => {
    const fixture = onboardingFixture();
    await expect(onboardConnectedAccount(actor, { ...input, configurations: ["recipient"] }, fixture)).rejects.toThrow(/full Stripe Dashboard/);
    expect(fixture.db.rpc).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.retrieve).not.toHaveBeenCalled();
    expect(fixture.createLink).not.toHaveBeenCalled();
  });

  it.each(["stripe", "application"])("passes explicitly supplied Stripe-loss/%s-fee full-Dashboard parameters", async fees => {
    vi.stubEnv("STRELVA_CONNECT_FEES_COLLECTOR", fees);
    vi.stubEnv("STRELVA_CONNECT_LOSSES_COLLECTOR", "stripe");
    const fixture = onboardingFixture();
    await expect(onboardConnectedAccount(actor, input, fixture)).resolves.toEqual({ accountId: "acct_Fictional", url: "https://connect.stripe.com/fictional" });
    expect(fixture.db.rpc.mock.calls[0]).toEqual(["manage_connected_account", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_action: "reserve" }]);
    expect(fixture.create).toHaveBeenCalledWith({
      contact_email: actor.verifiedEmail, dashboard: "full", metadata: { workspaceId },
      defaults: { responsibilities: { fees_collector: fees, losses_collector: "stripe" } },
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    }, { idempotencyKey: `connect:${workspaceId}:3:fictional-v1` });
    expect(fixture.update).not.toHaveBeenCalled();
  });

  it.each(["STRELVA_CONNECT_PROFILE_VERSION", "STRELVA_CONNECT_FEES_COLLECTOR", "STRELVA_CONNECT_LOSSES_COLLECTOR"])("has no implicit default when %s is missing", async field => {
    vi.stubEnv(field, undefined);
    const fixture = onboardingFixture();
    await expect(onboardConnectedAccount(actor, input, fixture)).rejects.toThrow(/liability/);
    expect(fixture.db.rpc).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it.each(["STRELVA_CONNECT_FEES_COLLECTOR", "STRELVA_CONNECT_LOSSES_COLLECTOR"])("rejects invalid %s before reservation", async field => {
    vi.stubEnv(field, "unknown");
    const fixture = onboardingFixture();
    await expect(onboardConnectedAccount(actor, input, fixture)).rejects.toThrow(/liability/);
    expect(fixture.db.rpc).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("flag-off blocks before profile, reservation and provider access", async () => {
    vi.stubEnv("STRELVA_CONNECT", "0");
    const fixture = onboardingFixture();
    await expect(onboardConnectedAccount(actor, input, fixture)).rejects.toThrow("Connect is not enabled.");
    expect(fixture.db.rpc).not.toHaveBeenCalled();
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("reuses an existing account without changing its immutable responsibilities", async () => {
    vi.stubEnv("STRELVA_CONNECT_LOSSES_COLLECTOR", "stripe");
    const fixture = onboardingFixture({ profile_version: "fictional-v1", configurations: ["merchant"] });
    await onboardConnectedAccount(actor, input, fixture);
    expect(fixture.retrieve).toHaveBeenCalledWith("acct_Fictional", { include: ["configuration.merchant", "configuration.recipient", "configuration.customer", "requirements"] });
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.createLink).toHaveBeenCalledOnce();
  });

  it("refuses configuration upgrades with a different immutable profile version", async () => {
    vi.stubEnv("STRELVA_CONNECT_LOSSES_COLLECTOR", "stripe");
    const fixture = onboardingFixture({ profile_version: "fictional-older", configurations: ["merchant"] });
    await expect(onboardConnectedAccount(actor, { ...input, configurations: ["merchant", "recipient"] }, fixture)).rejects.toThrow(/immutable liability profile/);
    expect(fixture.create).not.toHaveBeenCalled();
    expect(fixture.update).not.toHaveBeenCalled();
    expect(fixture.createLink).not.toHaveBeenCalled();
  });

  it("leaves generic profile parsing available to the separate platform-collection rail", () => {
    expect(connectProfile()).toEqual({ version: "fictional-v1", feesCollector: "application", lossesCollector: "application" });
  });
});
