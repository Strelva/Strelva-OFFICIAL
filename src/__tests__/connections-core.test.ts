import { afterEach, describe, expect, it, vi } from "vitest";
import { readProviderAccess } from "@/platform/connections/access";
import { providerEligibility } from "@/platform/connections/eligibility";
import { composeWorkspaceConnections } from "@/platform/connections/read-model";
import { registerConnectionSource, listConnectionSources } from "@/platform/connections/sources";
import { recordConnectionHolder, readConnectionHolders, type ConnectionHolders } from "@/platform/connections/holders";
import { setConnectionsDb } from "@/platform/connections/db";
import { agencyHoldsArea } from "@/platform/connections/area";
import { connectionEligibilityFor, listWorkspaceConnections } from "@/platform/connections/server";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError } from "@/platform/workspaces/types";
import type { ConnectionSource, WorkspaceConnection } from "@/platform/connections/contracts";

const business = "a1000000-0000-4000-8000-000000000001";
const agency = "a1000000-0000-4000-8000-000000000002";
const other = "a1000000-0000-4000-8000-000000000003";
const actor = { userId: "a1000000-0000-4000-8000-000000000004", verifiedEmail: "owner@example.test" };
const commandId = "a1000000-0000-4000-8000-000000000005";
const holders = { accountHolder: { kind: "business" as const, workspaceId: business }, accessThrough: { kind: "platform" as const } };
const row: WorkspaceConnection = { ref: "google_calendar:calendar-1", provider: "google_calendar", workspaceId: business,
  accountLabel: "Harbor Dental", ...holders, state: "connected", unavailableReason: null, connectedAt: null, systemIds: [] };
const source: ConnectionSource = { provider: row.provider, list: async () => [row] };
afterEach(() => { setConnectionsDb(null); vi.unstubAllEnvs(); });

describe("connection access configuration and neutral eligibility", () => {
  it("keeps GBP unavailable by default and retains other providers' defaults", () => {
    expect(readProviderAccess("google_business_profile", {})).toMatchObject({ through: { kind: "unknown" }, approval: "none" });
    expect(readProviderAccess("calendly", {})).toMatchObject({ through: { kind: "platform" }, approval: "not_required" });
  });
  it.each(["", "agency:no", "agency:", "business:" + business, "Platform", "none"])("fails closed for malformed/disabled access %s", raw => {
    expect(readProviderAccess("calendly", { STRELVA_CONNECTION_ACCESS_CALENDLY: raw }).through.kind).toBe("unknown");
  });
  it("does not silently accept invalid approval or a named-agency environment shortcut", () => {
    expect(readProviderAccess("calendly", { STRELVA_CONNECTION_APPROVAL_CALENDLY: "typo" }).approval).toBe("none");
    expect(readProviderAccess("google_business_profile", { STRELVA_AGENCY_WORKSPACE_ID: agency }).through.kind).toBe("unknown");
  });
  it("requires the configured acting agency and its area; errors deny", async () => {
    const access = readProviderAccess("google_business_profile", { STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE: `agency:${agency}`, STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE: "approved" });
    const grant = vi.fn(async () => true);
    const input = { access, businessWorkspaceId: business, actingAgencyWorkspaceId: agency, agencyHoldsArea: grant };
    expect((await providerEligibility(input)).eligible).toBe(true);
    expect(grant).toHaveBeenCalledWith(agency, business, "google");
    expect((await providerEligibility({ ...input, actingAgencyWorkspaceId: other })).eligible).toBe(false);
    expect((await providerEligibility({ ...input, actingAgencyWorkspaceId: null })).eligible).toBe(false);
    expect((await providerEligibility({ ...input, agencyHoldsArea: async () => { throw Error("offline"); } }))).toMatchObject({ eligible: false, reason: "area_not_granted" });
    expect((await providerEligibility({ ...input, access: { ...access, approval: "pending" } }))).toMatchObject({ eligible: false, reason: "approval_pending" });
  });
});

describe("composed read model", () => {
  const compose = (sources: ConnectionSource[], recorded: Map<string, ConnectionHolders> = new Map([[row.ref, holders]])) => composeWorkspaceConnections({ workspaceId: business, sources, holders: recorded, accessFor: p => readProviderAccess(p, {}) });
  it("overlays recorded holders; never trusts a source's guessed ownership", async () => {
    expect((await compose([source])).connections[0]).toMatchObject({ ...holders, state: "connected" });
    expect((await compose([source], new Map())).connections[0]).toMatchObject({ accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" }, state: "stale" });
  });
  it("isolates a failing or malformed source, keeping healthy rows", async () => {
    const fail: ConnectionSource = { provider: "calendly", list: async () => { throw Error("no tokens in errors"); } };
    expect(await compose([source, fail])).toMatchObject({ connections: [row], sourceErrors: ["calendly"] });
    expect(await compose([{ ...source, list: async () => [{ ...row, workspaceId: other }] }])).toEqual({ connections: [], sourceErrors: [row.provider] });
    expect(await compose([{ ...source, list: async () => [{ ...row, provider: "calendly" }] }])).toEqual({ connections: [], sourceErrors: [row.provider] });
    expect(await compose([{ ...source, list: async () => [{ ...row, ref: "calendar:legacy" }] }])).toEqual({ connections: [], sourceErrors: [row.provider] });
  });
  it("marks unavailable rows and changed access honestly", async () => {
    const unavailable = await composeWorkspaceConnections({ workspaceId: business, sources: [source], holders: new Map([[row.ref, holders]]), accessFor: p => readProviderAccess(p, {}),
      eligibilityFor: async () => ({ eligible: false, reason: "area_not_granted", message: "Grant bookings" }) });
    expect(unavailable.connections[0]).toMatchObject({ state: "unavailable", unavailableReason: "area_not_granted" });
    expect((await compose([source], new Map([[row.ref, { ...holders, accessThrough: { kind: "agency", workspaceId: agency } }]]))).connections[0]?.state).toBe("stale");
  });
  it("keeps the synthetic platform sending service governed by its source policy", async () => {
    const service: WorkspaceConnection = { ...row, ref: `resend:${business}`, provider: "resend", accountHolder: { kind: "platform" }, accessThrough: { kind: "platform" } };
    const sending: ConnectionSource = { provider: "resend", list: async () => [service] };
    expect((await compose([sending], new Map())).connections[0]).toMatchObject({ state: "connected", accountHolder: { kind: "platform" } });
    expect((await compose([{ ...sending, list: async () => [{ ...service, state: "disconnected" }] }], new Map())).connections[0]).toMatchObject({ state: "disconnected" });
    expect((await compose([{ ...sending, list: async () => [{ ...service, ref: "resend:legacy-account" }] }], new Map())).connections[0]).toMatchObject({ state: "stale", accountHolder: { kind: "unknown" } });
  });
  it("explicit registration is idempotent by source identity and disposable", () => {
    const before = listConnectionSources();
    const remove = registerConnectionSource(source); registerConnectionSource(source);
    expect(listConnectionSources()).toEqual([...before, source]);
    remove(); expect(listConnectionSources()).toEqual(before);
  });
});

describe("holder persistence and actor boundary", () => {
  it("records normalized actor, stable digest and command id without credentials", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null })); setConnectionsDb({ rpc });
    const input = { ...holders, ref: row.ref, provider: row.provider, workspaceId: business, actor: { ...actor, verifiedEmail: " Owner@Example.test " }, commandId };
    await recordConnectionHolder(input); await recordConnectionHolder(input);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc).toHaveBeenCalledWith("record_connection_holder", expect.objectContaining({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_command_id: commandId, p_command_digest: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  });
  it("reads only the workspace's holder records", async () => {
    const rpc = vi.fn(async () => ({ data: [{ ref: row.ref, ...holders }], error: null })); setConnectionsDb({ rpc });
    expect((await readConnectionHolders(business)).get(row.ref)).toEqual(holders);
    expect(rpc).toHaveBeenCalledWith("read_connection_holders", { p_workspace_id: business });
  });
  it("maps refused access/conflicts, malformed responses, and grant outages", async () => {
    setConnectionsDb({ rpc: async () => ({ data: null, error: { message: "connection_access_denied" } }) });
    await expect(listWorkspaceConnections(actor, business)).rejects.toBeInstanceOf(WorkspaceAccessError);
    expect(await agencyHoldsArea(agency, business, "google")).toBe(false);
    setConnectionsDb({ rpc: async () => ({ data: null, error: { message: "connection_command_conflict" } }) });
    await expect(recordConnectionHolder({ ...holders, ref: row.ref, provider: row.provider, workspaceId: business, actor, commandId })).rejects.toBeInstanceOf(WorkspaceConflictError);
    setConnectionsDb({ rpc: async () => ({ data: "not a map", error: null }) });
    await expect(readConnectionHolders(business)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(await agencyHoldsArea(agency, business, "google")).toBe(false);
  });
  it("resolves agency solely from the verified database scope", async () => {
    vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE", `agency:${agency}`);
    vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE", "approved");
    const rpc = vi.fn(async (name: string) => ({ data: name === "read_connection_actor_scope" ? { actingAgencyWorkspaceId: agency } : true, error: null }));
    setConnectionsDb({ rpc });
    expect((await connectionEligibilityFor(actor, { provider: "google_business_profile", businessWorkspaceId: business })).eligible).toBe(true);
    expect(rpc).toHaveBeenCalledWith("connection_agency_holds_area", expect.objectContaining({ p_agency_workspace_id: agency, p_workspace_id: business, p_area: "google" }));
    setConnectionsDb({ rpc: async () => ({ data: { actingAgencyWorkspaceId: null }, error: null }) });
    expect((await connectionEligibilityFor(actor, { provider: "google_business_profile", businessWorkspaceId: business })).eligible).toBe(false);
  });
  it("selects configured access from all verified agency seats, without UUID ordering", async () => {
    vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE", `agency:${agency}`);
    vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE", "approved");
    setConnectionsDb({ rpc: async name => ({ data: name === "read_connection_actor_scope" ? { actingAgencyWorkspaceId: null, actingAgencyWorkspaceIds: [other, agency] } : true, error: null }) });
    expect((await connectionEligibilityFor(actor, { provider: "google_business_profile", businessWorkspaceId: business })).eligible).toBe(true);
    setConnectionsDb({ rpc: async name => ({ data: name === "read_connection_actor_scope" ? { actingAgencyWorkspaceId: null, actingAgencyWorkspaceIds: [other] } : true, error: null }) });
    expect((await connectionEligibilityFor(actor, { provider: "google_business_profile", businessWorkspaceId: business })).eligible).toBe(false);
  });
  it("does not let a business actor borrow its agency's account over platform access", async () => {
    vi.stubEnv("STRELVA_CONNECTION_ACCESS_GOOGLE_BUSINESS_PROFILE", "platform");
    vi.stubEnv("STRELVA_CONNECTION_APPROVAL_GOOGLE_BUSINESS_PROFILE", "approved");
    const agencyRow: WorkspaceConnection = { ...row, provider: "google_business_profile", ref: "google_business_profile:fictional" };
    const remove = registerConnectionSource({ provider: agencyRow.provider, list: async () => [agencyRow] });
    let serving = false;
    setConnectionsDb({ rpc: async name => ({ data: name === "read_connection_actor_scope" ? { actingAgencyWorkspaceId: serving ? agency : null, actingAgencyWorkspaceIds: serving ? [agency] : [] } : name === "connection_agency_holds_area" ? true : [{ ref: agencyRow.ref, accountHolder: { kind: "agency", workspaceId: agency }, accessThrough: { kind: "platform" } }], error: null }) });
    try {
      expect((await listWorkspaceConnections(actor, business)).connections[0]).toMatchObject({ state: "unavailable", unavailableReason: "not_your_agency" });
      serving = true;
      expect((await listWorkspaceConnections(actor, business)).connections[0]).toMatchObject({ state: "connected" });
    } finally { remove(); }
  });
  it("does not load sources before actor authorization, and composes authorized reads", async () => {
    const list = vi.fn(async () => [row]); const remove = registerConnectionSource({ ...source, list });
    try {
      setConnectionsDb({ rpc: async () => ({ data: null, error: { message: "connection_access_denied" } }) });
      await expect(listWorkspaceConnections(actor, business)).rejects.toBeInstanceOf(WorkspaceAccessError);
      expect(list).not.toHaveBeenCalled();
      setConnectionsDb({ rpc: async name => ({ data: name === "read_connection_actor_scope" ? { actingAgencyWorkspaceId: null } : [{ ref: row.ref, ...holders }], error: null }) });
      expect(await listWorkspaceConnections(actor, business)).toMatchObject({ connections: [row], sourceErrors: [] });
    } finally { remove(); }
  });
});
