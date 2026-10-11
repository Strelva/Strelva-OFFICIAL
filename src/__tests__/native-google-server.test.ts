import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountBindingWithSecretsSchema, type AccountBindingWithSecrets } from "@/platform/account-bindings/contracts";
import { possibilitySchema } from "@/platform/possibilities/contracts";
import { planFingerprint } from "@/platform/make-real/approvals";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), publishing: vi.fn(), channel: vi.fn(), proposal: vi.fn(), binding: vi.fn(), rpc: vi.fn(), scan: vi.fn(), revoke: vi.fn(), decrypt: vi.fn(), live: vi.fn(), provider: vi.fn() }));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: mocks.owner }));
vi.mock("@/products/publishing/server", () => ({ publishingEnabledForWorkspace: mocks.publishing }));
vi.mock("@/platform/make-real/live-server", () => ({ makeRealChannelEnabled: mocks.channel, createServerLiveMakeReal: () => ({ read: mocks.live, resume: mocks.live, reconcile: mocks.live, rollback: mocks.live }) }));
vi.mock("@/platform/possibilities/supabase-repository", () => ({ createSupabasePossibilityRepository: () => ({ get: mocks.proposal }) }));
vi.mock("@/platform/account-bindings/store", () => ({ readGoogleBindingForTenant: mocks.binding, googleBindingsEnabled: () => true }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: () => { throw new Error("No ambient Auth calls allowed in this service test"); } }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({ scan: mocks.scan }) }));
vi.mock("@/platform/infra/provider-revocation", () => ({ revokeProviderAuthorization: mocks.revoke }));
vi.mock("@/platform/infra/crypto/secrets", () => ({ decryptSecret: mocks.decrypt }));
vi.mock("@/platform/workspaces/acting-provider", () => ({ assertActingProvider: mocks.provider }));
vi.mock("@/products/google-listing/make-real", () => ({ googleMakeRealPorts: { inspect: mocks.provider, approve: mocks.provider, verify: mocks.provider, undo: mocks.provider } }));
import { commandNativeGoogle } from "@/products/google-listing/native/server";
import { nativeGoogleGrantGeneration, type NativeGooglePlan } from "@/products/google-listing/native/contracts";
import { workspaceHttpFailure } from "@/platform/workspaces/http";

const workspaceId = "b4000000-0000-4000-8000-000000000001", bindingId = "b4000000-0000-4000-8000-000000000002";
const mandateId = "b4000000-0000-4000-8000-000000000003", commandId = "b4000000-0000-4000-8000-000000000004";
const actor = { userId: "b4000000-0000-4000-8000-000000000005", verifiedEmail: "owner@example.test" };
const revocationLeaseId = "b4000000-0000-4000-8000-000000000010";
const at = "2026-10-09T00:00:00.000Z";
let binding: AccountBindingWithSecrets;
let mandate: { id: string; customerWorkspaceId: string; status: string; effect: string; resourceKind: string; resourceRef: string };
let plan: NativeGooglePlan;
const makeReal = vi.fn();
const call = (command: unknown) => commandNativeGoogle(actor, command, makeReal);
const end = () => call({ action: "end_mandate", workspaceId, locationId: "exact", mandateId });
const disconnect = () => call({ action: "disconnect", plan, commandId, confirmGrantRevocation: true });
const actions = () => mocks.rpc.mock.calls.map(([name, args]) => name === "native_google_owner_lifecycle" ? args.p_action : name);
function noPlanOrProvider() { expect(mocks.publishing).not.toHaveBeenCalled(); expect(mocks.channel).not.toHaveBeenCalled(); expect(mocks.proposal).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled(); expect(mocks.live).not.toHaveBeenCalled(); expect(makeReal).not.toHaveBeenCalled(); }

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STRELVA_NATIVE_GOOGLE_ONLY", "1");
  binding = accountBindingWithSecretsSchema.parse({ id: bindingId, workspaceId, provider: "google", subject: "exact-google-subject", originTenantId: null, originTenantStableId: null, scopes: ["https://www.googleapis.com/auth/business.manage"], tokenExpiresAt: at, status: "connected", lastCheckedAt: null, lastError: null, migratedFrom: "oauth", createdAt: at, updatedAt: at, locations: [{ accountId: "accounts/exact", locationId: "exact", title: null, isPrimary: true }], refreshTokenCiphertext: "enc:fixture-refresh", accessTokenCiphertext: "enc:fixture-access" });
  const grant = { bindingId, accountId: "accounts/exact", grantGeneration: nativeGoogleGrantGeneration(binding) };
  plan = { workspaceId, possibilityId: "completed-or-removed-proposal", candidateRevision: 1, planFingerprint: "a".repeat(64), effectId: "google", request: { tenantId: `workspace-${workspaceId}`, locationId: "exact", eventId: "approved-event", draftDigest: "b".repeat(64), nativeGrant: grant }, grant };
  mandate = { id: mandateId, customerWorkspaceId: workspaceId, status: "active", effect: "google", resourceKind: "google_location", resourceRef: "exact" };
  mocks.owner.mockResolvedValue({ access: "owner" }); mocks.publishing.mockResolvedValue(false); mocks.channel.mockResolvedValue(false); mocks.proposal.mockResolvedValue(null);
  mocks.binding.mockImplementation(async () => structuredClone(binding)); mocks.scan.mockResolvedValue(["0", []]);
  mocks.decrypt.mockImplementation((cipher: string | null) => cipher === "enc:fixture-refresh" ? "fixture-refresh" : cipher === "enc:fixture-access" ? "fixture-access" : null);
  mocks.revoke.mockImplementation(async () => { expect(binding.status).toBe("revoked"); expect(binding.refreshTokenCiphertext).toBeNull(); expect(binding.accessTokenCiphertext).toBeNull(); return { outcome: "revoked", errorCode: null }; });
  mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "read_client_resource_mandates") return { data: [structuredClone(mandate)], error: null };
    if (name === "end_client_resource_mandate") { mandate.status = "ended"; return { data: { status: "ended" }, error: null }; }
    if (name !== "native_google_owner_lifecycle") throw new Error("Unexpected fixture RPC");
    if (args.p_action === "qualify") return { data: { isolated: true }, error: null };
    if (args.p_action === "find_disconnect") return { data: null, error: null };
    if (args.p_action === "read_grant") return { data: { bindingId, status: binding.status, credentialsPurged: binding.refreshTokenCiphertext === null && binding.accessTokenCiphertext === null, bindingCredentialsPurged: binding.refreshTokenCiphertext === null && binding.accessTokenCiphertext === null, grantGeneration: nativeGoogleGrantGeneration(binding), subjectDigest: createHash("sha256").update(binding.subject!).digest("hex"), locations: binding.locations.map(({ accountId, locationId }) => ({ accountId, locationId })) }, error: null };
    if (args.p_action === "claim_disconnect") {
      const tokens = { dispatch: true, id: commandId, leaseId: revocationLeaseId, revocationTokenCiphertext: binding.refreshTokenCiphertext };
      binding = { ...binding, status: "revoked", refreshTokenCiphertext: null, accessTokenCiphertext: null };
      return { data: tokens, error: null };
    }
    if (args.p_action === "settle_disconnect") {
      const input = args.p_input as { outcome: string; errorCode: string | null };
      const remoteRevoked = ["revoked", "already_revoked"].includes(input.outcome);
      return { data: { id: commandId, bindingId, status: "settled", remoteOutcome: input.outcome, remoteErrorCode: input.errorCode, credentialsPurged: remoteRevoked, bindingCredentialsPurged: true, remoteRevoked, retryAvailable: !remoteRevoked, attempts: 1 }, error: null };
    }
    throw new Error("Unexpected fixture lifecycle action");
  });
});

describe("native Google durable revocation recovery", () => {
  const firstLease = "b4000000-0000-4000-8000-000000000010";
  const secondLease = "b4000000-0000-4000-8000-000000000011";
  type RecoveryReceipt = { id: string; bindingId: string; status: string; remoteOutcome: string; remoteErrorCode: string | null; credentialsPurged: boolean; bindingCredentialsPurged: boolean; remoteRevoked: boolean; retryAvailable: boolean; attempts: number };

  function recoveryFixture() {
    let retained: RecoveryReceipt | null = null;
    let escrow: string | null = null;
    let leaseActive = false;
    let leaseId: string | null = null;
    let settlementLost = false;
    const scope = structuredClone(plan);
    mocks.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name !== "native_google_owner_lifecycle") throw new Error("Unexpected recovery fixture RPC");
      const action = args.p_action;
      const input = args.p_input as Record<string, unknown>;
      expect(args.p_user_id).toBe(actor.userId);
      expect(args.p_verified_email).toBe(actor.verifiedEmail);
      expect(args.p_workspace_id).toBe(workspaceId);
      if (action === "find_disconnect") {
        if (retained && (input.bindingId !== scope.grant.bindingId || input.accountId !== scope.grant.accountId || input.locationId !== scope.request.locationId || input.grantGeneration !== scope.grant.grantGeneration)) return { data: null, error: { message: "native_google_disconnect_scope_changed" } };
        expect(input).toEqual({ commandId, bindingId: scope.grant.bindingId, accountId: scope.grant.accountId, locationId: scope.request.locationId, grantGeneration: scope.grant.grantGeneration });
        return { data: retained ? structuredClone(retained) : null, error: null };
      }
      if (action === "qualify") return { data: { isolated: true }, error: null };
      if (action === "claim_disconnect") {
        expect(input).toMatchObject({ commandId, bindingId: scope.grant.bindingId, accountId: scope.grant.accountId, locationId: scope.request.locationId, grantGeneration: scope.grant.grantGeneration });
        if (retained && (leaseActive || retained.remoteRevoked)) return { data: { dispatch: false, ...retained }, error: null };
        if (!retained) {
          escrow = binding.refreshTokenCiphertext;
          binding = { ...binding, status: "revoked", refreshTokenCiphertext: null, accessTokenCiphertext: null };
          retained = { id: commandId, bindingId, status: "claimed", remoteOutcome: "not_attempted", remoteErrorCode: null, credentialsPurged: false, bindingCredentialsPurged: true, remoteRevoked: false, retryAvailable: false, attempts: 0 };
        }
        retained.attempts++;
        retained.status = "claimed";
        retained.retryAvailable = false;
        leaseActive = true;
        leaseId = retained.attempts === 1 ? firstLease : secondLease;
        return { data: { dispatch: true, id: commandId, leaseId, revocationTokenCiphertext: escrow }, error: null };
      }
      if (action === "settle_disconnect") {
        expect(input.leaseId).toBe(leaseId);
        if (settlementLost) { settlementLost = false; return { data: null, error: { message: "fixture lost durable settlement" } }; }
        expect(retained).not.toBeNull();
        retained!.status = "settled";
        retained!.remoteOutcome = input.outcome as string;
        retained!.remoteErrorCode = input.errorCode as string | null;
        retained!.remoteRevoked = ["revoked", "already_revoked"].includes(retained!.remoteOutcome);
        if (retained!.remoteRevoked) escrow = null;
        retained!.credentialsPurged = escrow === null;
        retained!.retryAvailable = !retained!.remoteRevoked;
        leaseActive = false;
        return { data: structuredClone(retained), error: null };
      }
      throw new Error("Unexpected recovery fixture lifecycle action");
    });
    mocks.revoke.mockImplementation(async () => {
      expect(binding.status).toBe("revoked");
      expect(binding.refreshTokenCiphertext).toBeNull();
      expect(binding.accessTokenCiphertext).toBeNull();
      expect(escrow).toBe("enc:fixture-refresh");
      return { outcome: "revoked", errorCode: null };
    });
    return {
      get receipt() { return retained; }, get escrow() { return escrow; }, scope,
      expireLease() { leaseActive = false; if (retained) retained.retryAvailable = true; },
      loseSettlement() { settlementLost = true; },
    };
  }

  it("keeps revocation-only escrow after a failed outcome and recovers the same command after purge", async () => {
    const recovery = recoveryFixture();
    mocks.revoke.mockResolvedValueOnce({ outcome: "failed", errorCode: "request_failed" });
    const failed = await disconnect();
    expect(failed).toMatchObject({ remoteRevoked: false, credentialsPurged: false, bindingCredentialsPurged: true, retryAvailable: true, attempts: 1 });
    expect(recovery.escrow).toBe("enc:fixture-refresh");
    mocks.binding.mockClear(); mocks.scan.mockClear(); mocks.rpc.mockClear();
    const recovered = await disconnect();
    expect(recovered).toMatchObject({ remoteRevoked: true, credentialsPurged: true, bindingCredentialsPurged: true, retryAvailable: false, attempts: 2 });
    expect(recovery.escrow).toBeNull();
    expect(mocks.binding).not.toHaveBeenCalled();
    expect(actions()).toEqual(["find_disconnect", "claim_disconnect", "settle_disconnect"]);
    expect(mocks.revoke).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(failed)).not.toContain("enc:"); expect(JSON.stringify(recovered)).not.toContain("fixture-refresh");
    noPlanOrProvider();
  });

  it("survives a lost first settlement without reacquiring the revoked publishing grant", async () => {
    const recovery = recoveryFixture(); recovery.loseSettlement();
    await expect(disconnect()).rejects.toThrow("lifecycle could not be confirmed");
    expect(recovery.receipt).toMatchObject({ status: "claimed", credentialsPurged: false, bindingCredentialsPurged: true });
    expect(recovery.escrow).toBe("enc:fixture-refresh");
    recovery.expireLease(); mocks.binding.mockClear(); mocks.rpc.mockClear();
    expect(await disconnect()).toMatchObject({ remoteRevoked: true, credentialsPurged: true, attempts: 2 });
    expect(mocks.binding).not.toHaveBeenCalled();
    expect(actions()).toEqual(["find_disconnect", "claim_disconnect", "settle_disconnect"]);
    expect(mocks.revoke).toHaveBeenCalledTimes(2); noPlanOrProvider();
  });

  it("returns retained uncertainty while a revocation lease is active without another provider call", async () => {
    const recovery = recoveryFixture(); recovery.loseSettlement();
    await expect(disconnect()).rejects.toThrow();
    mocks.binding.mockClear(); mocks.rpc.mockClear(); mocks.decrypt.mockClear();
    expect(await disconnect()).toMatchObject({ remoteRevoked: false, credentialsPurged: false, bindingCredentialsPurged: true, retryAvailable: false, attempts: 1 });
    expect(mocks.revoke).toHaveBeenCalledOnce(); expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.binding).not.toHaveBeenCalled();
    expect(actions()).toEqual(["find_disconnect", "claim_disconnect"]); noPlanOrProvider();
  });

  it("reopens a confirmed command idempotently without escrow disclosure or provider dispatch", async () => {
    const recovery = recoveryFixture();
    const first = await disconnect();
    mocks.binding.mockClear(); mocks.rpc.mockClear(); mocks.decrypt.mockClear();
    expect(await disconnect()).toEqual(first);
    expect(recovery.escrow).toBeNull(); expect(mocks.revoke).toHaveBeenCalledOnce();
    expect(mocks.binding).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); noPlanOrProvider();
  });

  it("rechecks current owner before recovering retained revocation escrow", async () => {
    recoveryFixture(); mocks.revoke.mockResolvedValueOnce({ outcome: "failed", errorCode: "request_failed" });
    await disconnect();
    mocks.owner.mockResolvedValue({ access: "provider_read" });
    mocks.rpc.mockClear(); mocks.binding.mockClear(); mocks.decrypt.mockClear(); mocks.revoke.mockClear();
    await expect(disconnect()).rejects.toThrow("current business owner");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.binding).not.toHaveBeenCalled();
    expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled(); noPlanOrProvider();
  });

  it.each(["binding", "account", "place", "generation"])("refuses the wrong retained claim %s before decrypt or provider dispatch", async invalid => {
    recoveryFixture();
    mocks.revoke.mockResolvedValueOnce({ outcome: "failed", errorCode: "request_failed" });
    await disconnect();
    if (invalid === "binding") plan.grant.bindingId = "b4000000-0000-4000-8000-000000000099";
    if (invalid === "account") plan.grant.accountId = "accounts/foreign";
    if (invalid === "generation") plan.grant.grantGeneration = "c".repeat(64);
    if (invalid === "place") plan.request.locationId = "foreign";
    plan.request.nativeGrant = { ...plan.grant };
    mocks.binding.mockClear(); mocks.rpc.mockClear(); mocks.decrypt.mockClear(); mocks.revoke.mockClear();
    await expect(disconnect()).rejects.toThrow();
    expect(actions()).toEqual(["find_disconnect"]);
    expect(mocks.binding).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled();
    noPlanOrProvider();
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("native Google owner lifecycle service", () => {
  it("ends the exact mandate even when publishing, grant and proposal are unavailable", async () => {
    binding.status = "revoked"; binding.refreshTokenCiphertext = null;
    expect(await end()).toEqual({ mandateId, status: "ended", ownerGrantRevoked: false });
    expect(actions()).toEqual(["read_client_resource_mandates", "end_client_resource_mandate", "read_client_resource_mandates"]);
    expect(mocks.rpc).toHaveBeenCalledWith("end_client_resource_mandate", expect.objectContaining({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_workspace_id: workspaceId, p_mandate_id: mandateId }));
    expect(mocks.binding).not.toHaveBeenCalled(); expect(mocks.scan).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("reopens an already ended mandate idempotently without another mutation", async () => {
    mandate.status = "ended";
    expect(await end()).toEqual({ mandateId, status: "ended", ownerGrantRevoked: false });
    expect(actions()).toEqual(["read_client_resource_mandates"]); noPlanOrProvider();
  });
  it.each(["place", "workspace", "effect"])("refuses the wrong mandate %s without mutation or provider access", async invalid => {
    if (invalid === "place") mandate.resourceRef = "foreign-place";
    if (invalid === "workspace") mandate.customerWorkspaceId = "foreign-workspace";
    if (invalid === "effect") mandate.effect = "calendar";
    await expect(end()).rejects.toThrow("Exact active Google place mandate");
    expect(actions()).toEqual(["read_client_resource_mandates"]); expect(mocks.revoke).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it.each(["end_mandate", "disconnect", "read_grant"])("denies a foreign current owner before any RPC for %s", async action => {
    mocks.owner.mockResolvedValue({ access: "provider_read" });
    const command = action === "end_mandate" ? { action, workspaceId, locationId: "exact", mandateId } : action === "disconnect" ? { action, plan, commandId, confirmGrantRevocation: true } : { action, workspaceId, bindingId };
    await expect(call(command)).rejects.toThrow("current business owner");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.binding).not.toHaveBeenCalled(); expect(mocks.scan).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled(); noPlanOrProvider();
  });

  it("disconnects the exact native pin independently of a completed/removed plan, purging before revoke", async () => {
    expect(await disconnect()).toMatchObject({ credentialsPurged: true, remoteRevoked: true, remoteOutcome: "revoked" });
    expect(actions()).toEqual(["find_disconnect", "qualify", "claim_disconnect", "settle_disconnect"]);
    expect(mocks.rpc).toHaveBeenCalledWith("native_google_owner_lifecycle", expect.objectContaining({ p_action: "claim_disconnect", p_input: { commandId, bindingId, expectedUpdatedAt: at, accountId: plan.grant.accountId, locationId: plan.request.locationId, grantGeneration: plan.grant.grantGeneration } }));
    expect(mocks.revoke).toHaveBeenCalledWith("google", "fixture-refresh"); noPlanOrProvider();
  });
  it.each(["failed", "partial_failure", "no_token"])("persists %s remote outcome without claiming remote revocation", async outcome => {
    mocks.revoke.mockResolvedValue({ outcome, errorCode: "fixture-failure" });
    expect(await disconnect()).toMatchObject({ credentialsPurged: false, bindingCredentialsPurged: true, remoteRevoked: false, remoteOutcome: outcome });
    expect(mocks.rpc).toHaveBeenLastCalledWith("native_google_owner_lifecycle", expect.objectContaining({ p_action: "settle_disconnect", p_input: { commandId, leaseId: revocationLeaseId, outcome, errorCode: "fixture-failure" } }));
    expect(binding.refreshTokenCiphertext).toBeNull(); expect(binding.accessTokenCiphertext).toBeNull(); noPlanOrProvider();
  });
  it("records network uncertainty after purge without retrying provider revocation", async () => {
    mocks.revoke.mockRejectedValue(new Error("fixture response lost"));
    expect(await disconnect()).toMatchObject({ credentialsPurged: false, bindingCredentialsPurged: true, remoteRevoked: false, remoteOutcome: "failed", remoteErrorCode: "request_failed" });
    expect(mocks.revoke).toHaveBeenCalledTimes(1); noPlanOrProvider();
  });
  it.each(["generation", "account", "place", "binding", "tenant", "grant_pin"])("rejects stale/foreign %s before a disconnect claim or provider revoke", async invalid => {
    if (invalid === "generation") binding.refreshTokenCiphertext = "rotated";
    if (invalid === "account") binding.locations[0]!.accountId = "accounts/foreign";
    if (invalid === "place") binding.locations[0]!.locationId = "foreign";
    if (invalid === "binding") binding.id = "b4000000-0000-4000-8000-000000000099";
    if (invalid === "tenant") plan.request.tenantId = "legacy-tenant";
    if (invalid === "grant_pin") plan.request.nativeGrant = { ...plan.grant, grantGeneration: "c".repeat(64) };
    await expect(disconnect()).rejects.toThrow();
    expect(actions()).toEqual(["tenant", "grant_pin"].includes(invalid) ? [] : ["find_disconnect"]); expect(mocks.revoke).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("refuses retained legacy grants before claim or provider revoke", async () => {
    mocks.scan.mockResolvedValue(["0", ["connections:legacy:google"]]);
    await expect(disconnect()).rejects.toThrow("Legacy Google grants");
    expect(actions()).toEqual([]); expect(mocks.revoke).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("never revokes if durable credential purge/claim fails", async () => {
    mocks.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => args.p_action === "find_disconnect" ? { data: null, error: null } : args.p_action === "qualify" ? { data: { isolated: true }, error: null } : { data: null, error: { message: "fixture claim failed" } });
    await expect(disconnect()).rejects.toThrow("lifecycle could not be confirmed");
    expect(mocks.revoke).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("projects only native grant metadata, never ciphertext or decrypted credentials", async () => {
    const result = await call({ action: "read_grant", workspaceId, bindingId });
    expect(result).toEqual({ bindingId, status: "connected", credentialsPurged: false, bindingCredentialsPurged: false, grantGeneration: plan.grant.grantGeneration, subjectDigest:createHash("sha256").update(binding.subject!).digest("hex"), locations: [{ accountId: "accounts/exact", locationId: "exact" }] });
    expect(JSON.stringify(result)).not.toContain("enc:fixture"); expect(mocks.binding).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.owner).toHaveBeenCalledTimes(2); noPlanOrProvider();
  });
  it("reports total credentials retained while the binding is purged and revocation escrow remains", async () => {
    mocks.rpc.mockResolvedValue({ data: { bindingId, status: "revoked", credentialsPurged: false, bindingCredentialsPurged: true, grantGeneration: "c".repeat(64), subjectDigest: createHash("sha256").update(binding.subject!).digest("hex"), locations: [{ accountId: "accounts/exact", locationId: "exact" }] }, error: null });
    expect(await call({ action: "read_grant", workspaceId, bindingId })).toMatchObject({ status: "revoked", credentialsPurged: false, bindingCredentialsPurged: true });
    expect(mocks.binding).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("refuses an unexpected credential field in the safe metadata projection", async () => {
    const old = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation(async (...args) => { const result = await old(...args); return { ...result, data: { ...result.data, revocationTokenCiphertext: "enc:must-not-disclose" } }; });
    await expect(call({ action: "read_grant", workspaceId, bindingId })).rejects.toThrow();
    expect(mocks.binding).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("refuses metadata disclosure if owner authority ends during the metadata RPC", async () => {
    mocks.owner.mockResolvedValueOnce({ access: "owner" }).mockResolvedValueOnce({ access: "provider_read" });
    await expect(call({ action: "read_grant", workspaceId, bindingId })).rejects.toThrow("current business owner");
    expect(actions()).toEqual(["read_grant"]); expect(mocks.binding).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("classifies the stale pre-reconnect plan as a conflict before provider access", async () => {
    const proposal = possibilitySchema.parse({ version: 1, id: plan.possibilityId, businessId: workspaceId, title: "Exact native Google plan", intent: "One authorized Google update", status: "made_real", revision: 2, candidateRevision: 1, propagation: "new_outputs_only", changes: [], introduces: [], connections: [], effects: [{ id: plan.effectId, kind: "publish", channel: "google_listing", system: { introducedKey: "listing" }, description: "Exact Google change", request: plan.request, after: [] }], checks: [{ id: "provider-readback", description: "Exact Google readback" }], createdBy: actor.userId, createdAt: at, updatedAt: at, history: [] });
    plan.planFingerprint = planFingerprint(proposal);
    mocks.publishing.mockResolvedValue(true); mocks.channel.mockResolvedValue(true); mocks.proposal.mockResolvedValue(proposal);
    binding.refreshTokenCiphertext = "enc:fresh-reconnected-grant";
    let caught: unknown;
    try { await call({ action: "read", plan }); } catch (error) { caught = error; }
    expect(caught).toBeDefined();
    expect(workspaceHttpFailure(caught).status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.scan).not.toHaveBeenCalled(); expect(mocks.provider).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled();
  });
});
