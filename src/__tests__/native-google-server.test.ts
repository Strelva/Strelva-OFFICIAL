import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountBindingWithSecretsSchema, type AccountBindingWithSecrets } from "@/platform/account-bindings/contracts";
import { possibilitySchema } from "@/platform/possibilities/contracts";
import { planFingerprint } from "@/platform/make-real/approvals";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), publishing: vi.fn(), channel: vi.fn(), proposal: vi.fn(), binding: vi.fn(), rpc: vi.fn(), scan: vi.fn(), revoke: vi.fn(), decrypt: vi.fn(), live: vi.fn(), provider: vi.fn() }));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: mocks.owner }));
vi.mock("@/products/publishing/server", () => ({ publishingEnabledForWorkspace: mocks.publishing }));
vi.mock("@/platform/make-real/live-server", () => ({ makeRealChannelEnabled: mocks.channel }));
vi.mock("@/platform/possibilities/supabase-repository", () => ({ createSupabasePossibilityRepository: () => ({ get: mocks.proposal }) }));
vi.mock("@/platform/account-bindings/store", () => ({ readGoogleBindingForTenant: mocks.binding, googleBindingsEnabled: () => true }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: () => { throw new Error("No ambient Auth calls allowed in this service test"); } }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({ scan: mocks.scan }) }));
vi.mock("@/platform/infra/provider-revocation", () => ({ revokeProviderAuthorization: mocks.revoke }));
vi.mock("@/platform/infra/crypto/secrets", () => ({ decryptSecret: mocks.decrypt }));
vi.mock("@/platform/workspaces/acting-provider", () => ({ assertActingProvider: mocks.provider }));
vi.mock("@/experience/systems/live-server", () => ({ liveMakeReal: { read: mocks.live, resume: mocks.live, reconcile: mocks.live, rollback: mocks.live }, googleMakeRealPorts: { inspect: mocks.provider, approve: mocks.provider, verify: mocks.provider, undo: mocks.provider } }));
import { commandNativeGoogle } from "@/products/google-listing/native/server";
import { nativeGoogleGrantGeneration, type NativeGooglePlan } from "@/products/google-listing/native/contracts";
import { workspaceHttpFailure } from "@/platform/workspaces/http";

const workspaceId = "b4000000-0000-4000-8000-000000000001", bindingId = "b4000000-0000-4000-8000-000000000002";
const mandateId = "b4000000-0000-4000-8000-000000000003", commandId = "b4000000-0000-4000-8000-000000000004";
const actor = { userId: "b4000000-0000-4000-8000-000000000005", verifiedEmail: "owner@example.test" };
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
    if (args.p_action === "read_grant") return { data: {}, error: null };
    if (args.p_action === "claim_disconnect") {
      const tokens = { id: commandId, refreshTokenCiphertext: binding.refreshTokenCiphertext, accessTokenCiphertext: binding.accessTokenCiphertext };
      binding = { ...binding, status: "revoked", refreshTokenCiphertext: null, accessTokenCiphertext: null };
      return { data: tokens, error: null };
    }
    if (args.p_action === "settle_disconnect") {
      const input = args.p_input as { outcome: string; errorCode: string | null };
      return { data: { id: commandId, bindingId, status: "settled", remoteOutcome: input.outcome, remoteErrorCode: input.errorCode, credentialsPurged: true, remoteRevoked: ["revoked", "already_revoked"].includes(input.outcome) }, error: null };
    }
    throw new Error("Unexpected fixture lifecycle action");
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
    expect(actions()).toEqual(["qualify", "claim_disconnect", "settle_disconnect"]);
    expect(mocks.rpc).toHaveBeenCalledWith("native_google_owner_lifecycle", expect.objectContaining({ p_action: "claim_disconnect", p_input: { commandId, bindingId, expectedUpdatedAt: at } }));
    expect(mocks.revoke).toHaveBeenCalledWith("google", "fixture-refresh"); noPlanOrProvider();
  });
  it.each(["failed", "partial_failure", "no_token"])("persists %s remote outcome without claiming remote revocation", async outcome => {
    mocks.revoke.mockResolvedValue({ outcome, errorCode: "fixture-failure" });
    expect(await disconnect()).toMatchObject({ credentialsPurged: true, remoteRevoked: false, remoteOutcome: outcome });
    expect(mocks.rpc).toHaveBeenLastCalledWith("native_google_owner_lifecycle", expect.objectContaining({ p_action: "settle_disconnect", p_input: { commandId, outcome, errorCode: "fixture-failure" } }));
    expect(binding.refreshTokenCiphertext).toBeNull(); expect(binding.accessTokenCiphertext).toBeNull(); noPlanOrProvider();
  });
  it("records network uncertainty after purge without retrying provider revocation", async () => {
    mocks.revoke.mockRejectedValue(new Error("fixture response lost"));
    expect(await disconnect()).toMatchObject({ credentialsPurged: true, remoteRevoked: false, remoteOutcome: "failed", remoteErrorCode: "request_failed" });
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
    expect(actions()).toEqual([]); expect(mocks.revoke).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("refuses retained legacy grants before claim or provider revoke", async () => {
    mocks.scan.mockResolvedValue(["0", ["connections:legacy:google"]]);
    await expect(disconnect()).rejects.toThrow("Legacy Google grants");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("never revokes if durable credential purge/claim fails", async () => {
    mocks.rpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => args.p_action === "qualify" ? { data: { isolated: true }, error: null } : { data: null, error: { message: "fixture claim failed" } });
    await expect(disconnect()).rejects.toThrow("lifecycle could not be confirmed");
    expect(mocks.revoke).not.toHaveBeenCalled(); expect(mocks.decrypt).not.toHaveBeenCalled(); noPlanOrProvider();
  });
  it("projects only native grant metadata, never ciphertext or decrypted credentials", async () => {
    const result = await call({ action: "read_grant", workspaceId, bindingId });
    expect(result).toEqual({ bindingId, status: "connected", credentialsPurged: false, grantGeneration: plan.grant.grantGeneration, subjectDigest:createHash("sha256").update(binding.subject!).digest("hex"), locations: [{ accountId: "accounts/exact", locationId: "exact" }] });
    expect(JSON.stringify(result)).not.toContain("enc:fixture"); expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.owner).toHaveBeenCalledTimes(2); noPlanOrProvider();
  });
  it("refuses metadata disclosure if owner authority ends during the binding read", async () => {
    mocks.owner.mockResolvedValueOnce({ access: "owner" }).mockResolvedValueOnce({ access: "provider_read" });
    await expect(call({ action: "read_grant", workspaceId, bindingId })).rejects.toThrow("current business owner");
    expect(mocks.binding).toHaveBeenCalledTimes(1); expect(mocks.decrypt).not.toHaveBeenCalled(); expect(mocks.revoke).not.toHaveBeenCalled(); noPlanOrProvider();
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
