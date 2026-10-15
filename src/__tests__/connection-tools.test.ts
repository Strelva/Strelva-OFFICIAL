import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionProvider, ProviderAccess } from "@/platform/connections/contracts";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { providerEligibility } from "@/platform/connections/eligibility";
import { readProviderAccess } from "@/platform/connections/access";
import { createGhlConnectionSource } from "@/products/agency-clients/gohighlevel/connection-source";
import { createConnectedSiteConnectionSource } from "@/products/connected-sites/connection-source";
import { connectGhlAgency, type GhlServiceDeps } from "@/products/agency-clients/gohighlevel/service";
import { connectSite } from "@/products/connected-sites/server";
import type { GhlConnectionStore } from "@/products/agency-clients/gohighlevel/repository";
import type { ConnectedSitesStore } from "@/products/connected-sites/store";
import { ghlCompanyTokenResponse, jsonResponse } from "./fixtures/gohighlevel";

const AGENCY = "aa000000-0000-4000-8000-000000000001";
const BUSINESS = "aa000000-0000-4000-8000-000000000002";
const OTHER = "aa000000-0000-4000-8000-000000000003";
const ID = "aa000000-0000-4000-8000-000000000004";
const actor = { userId: "aa000000-0000-4000-8000-000000000005", verifiedEmail: "admin@north.example.test" };
const createdAt = "2026-10-14T00:00:00.000Z";
const access: ProviderAccess = { provider: "highlevel", through: { kind: "platform" }, approval: "not_required" };

afterEach(() => vi.unstubAllEnvs());

describe("tools connection metadata", () => {
  it("keeps HighLevel agency accounts isolated, legacy holders unknown, and revoked/reauth state honest", async () => {
    const row = { id: ID, workspace_id: AGENCY, external_account_id: "NorthStudio", created_at: createdAt };
    const source = createGhlConnectionSource(async () => [
      { ...row, status: "connected" }, { ...row, id: OTHER, status: "needs_reauth" },
      { ...row, id: BUSINESS, status: "revoked" }, { ...row, workspace_id: OTHER, status: "connected" },
    ]);
    const rows = await source.list({ workspaceId: AGENCY, access });
    expect(rows.map(row => row.state)).toEqual(["connected", "stale", "disconnected"]);
    expect(rows[0]).toMatchObject({ ref: `highlevel:${ID}`, accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" } });
    expect(JSON.stringify(rows)).not.toMatch(/accessToken|refreshToken|ciphertext/);
  });

  it("shows unverified website scripts as stale and links each row to its website System", async () => {
    const row = { id: ID, business_workspace_id: BUSINESS, label: "Harbor Dental", status: "active" as const, created_at: createdAt, verified_at: null };
    const source = createConnectedSiteConnectionSource(async () => [row, { ...row, id: OTHER, verified_at: createdAt }, { ...row, id: AGENCY, status: "revoked" }, { ...row, business_workspace_id: OTHER }]);
    const rows = await source.list({ workspaceId: BUSINESS, access: { ...access, provider: "connected_site" } });
    expect(rows.map(row => row.state)).toEqual(["stale", "connected", "disconnected"]);
    expect(rows[0]?.systemIds).toHaveLength(1);
    expect(rows[0]?.accountHolder.kind).toBe("unknown");
    expect(JSON.stringify(rows)).not.toMatch(/publicKey|verificationToken/);
  });

  it("propagates store failure so the shared read model can name the failed source", async () => {
    const source = createGhlConnectionSource(async () => { throw new Error("store unavailable"); });
    await expect(source.list({ workspaceId: AGENCY, access })).rejects.toThrow("store unavailable");
  });
});

function ghlDeps(): GhlServiceDeps {
  return {
    store: {
      save: vi.fn(async () => ({ id: ID, workspaceId: AGENCY, updatedAt: createdAt })),
      markStatus: vi.fn(async () => undefined),
      revokeSaved: vi.fn(async () => undefined),
    } as unknown as GhlConnectionStore,
    fetcher: vi.fn(async () => jsonResponse(ghlCompanyTokenResponse)), now: () => Date.parse(createdAt), agencyRole: async () => "owner",
    eligibility: async (_actor: WorkspaceActor, input: { provider: ConnectionProvider; businessWorkspaceId: string }) => providerEligibility({ access: readProviderAccess(input.provider), businessWorkspaceId: input.businessWorkspaceId,
      actingAgencyWorkspaceId: AGENCY, agencyHoldsArea: async () => false }),
    recordHolder: vi.fn(async () => undefined),
  };
}

describe("HighLevel connect provenance and access", () => {
  it.each(["none", `agency:${OTHER}`])("refuses %s before token exchange, without a special Strelva agency bypass", async setting => {
    vi.stubEnv("STRELVA_CONNECTION_ACCESS_HIGHLEVEL", setting);
    vi.stubEnv("STRELVA_AGENCY_WORKSPACE_ID", AGENCY);
    const deps = ghlDeps();
    await expect(connectGhlAgency(actor, AGENCY, "code", "https://example.test/callback", deps)).rejects.toMatchObject({ status: 503 });
    expect(deps.fetcher).not.toHaveBeenCalled();
    expect(deps.store.save).not.toHaveBeenCalled();
  });

  it.each(["platform", `agency:${AGENCY}`])("records the agency's account through %s", async setting => {
    vi.stubEnv("STRELVA_CONNECTION_ACCESS_HIGHLEVEL", setting);
    vi.stubEnv("HIGHLEVEL_CLIENT_ID", "fictional");
    vi.stubEnv("HIGHLEVEL_CLIENT_SECRET", "fictional");
    const deps = ghlDeps();
    await connectGhlAgency(actor, AGENCY, "code", "https://example.test/callback", deps);
    expect(deps.recordHolder).toHaveBeenCalledWith(expect.objectContaining({ ref: `highlevel:${ID}`, workspaceId: AGENCY,
      accountHolder: { kind: "agency", workspaceId: AGENCY }, accessThrough: setting === "platform" ? { kind: "platform" } : { kind: "agency", workspaceId: AGENCY }, actor }));
  });

  it("clears newly saved credentials if recording the holder fails", async () => {
    vi.stubEnv("HIGHLEVEL_CLIENT_ID", "fictional"); vi.stubEnv("HIGHLEVEL_CLIENT_SECRET", "fictional");
    const deps = ghlDeps(); deps.recordHolder = vi.fn(async () => { throw new Error("receipt unavailable"); });
    await expect(connectGhlAgency(actor, AGENCY, "code", "https://example.test/callback", deps)).rejects.toMatchObject({ code: "connection_holder_unavailable" });
    expect(deps.store.revokeSaved).toHaveBeenCalledWith(ID, createdAt);
    expect(deps.store.markStatus).not.toHaveBeenCalled();
  });
});

describe("website script install provenance and access", () => {
  const input = { businessId: BUSINESS, siteUrl: "harbor.example.test" };
  function setup() {
    return {
      store: { create: vi.fn(async () => ({ id: ID })), revoke: vi.fn(async () => ({})) } as unknown as ConnectedSitesStore,
      deps: { eligible: vi.fn(async () => ({ eligible: true as const, through: { kind: "platform" as const } })),
        installer: vi.fn(async () => ({ kind: "business" as const, workspaceId: BUSINESS })), recordHolder: vi.fn(async () => undefined) },
    };
  }

  it("refuses ineligible access before creating a site or revealing an install key", async () => {
    const { store, deps } = setup();
    await expect(connectSite(actor, input, store, { ...deps, eligible: async () => ({ eligible: false, reason: "not_configured", message: "Website script is coming soon." }) })).rejects.toThrow("coming soon");
    expect(store.create).not.toHaveBeenCalled(); expect(deps.installer).not.toHaveBeenCalled();
  });

  it.each(["business", "agency"] as const)("records the actual %s installer without accepting a browser-supplied holder", async kind => {
    const { store, deps } = setup();
    const accountHolder = { kind, workspaceId: kind === "agency" ? AGENCY : BUSINESS };
    await connectSite(actor, input, store, { ...deps, installer: async () => accountHolder });
    expect(store.create).toHaveBeenCalledWith(actor, BUSINESS, expect.objectContaining({ installerHolder: accountHolder }));
    expect(deps.recordHolder).toHaveBeenCalledWith(expect.objectContaining({ ref: `connected_site:${ID}`, accountHolder, accessThrough: { kind: "platform" } }));
    await expect(connectSite(actor, { ...input, accountHolder }, store, deps)).rejects.toThrow();
  });

  it("doesn't create the site when installer authority fails, and revokes it if provenance recording fails", async () => {
    const { store, deps } = setup();
    await expect(connectSite(actor, input, store, { ...deps, installer: async () => { throw new Error("website area missing"); } })).rejects.toThrow("website area missing");
    expect(store.create).not.toHaveBeenCalled();
    await expect(connectSite(actor, input, store, { ...deps, recordHolder: async () => { throw new Error("receipt down"); } })).rejects.toThrow("Connect again");
    expect(store.revoke).toHaveBeenCalledWith(actor, BUSINESS, ID);
  });
});
